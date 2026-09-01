"""
Phase 5 (§8 tool registry) and Phase 6 (§9 agentic controller) conformance.

These assert the contracts that make R7/R9/R11 checkable rather than claimed.
No network calls.
"""

import asyncio

import pytest

from tools.base import ToolResult


def run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# §8.1/§8.2 - every registered tool honours the Tool contract
# ---------------------------------------------------------------------------
def test_every_tool_declares_the_full_spec():
    from tools.base import Tool, ToolParams
    from tools.registry import REGISTRY

    assert REGISTRY, "registry is empty"
    for name, t in REGISTRY.items():
        assert isinstance(t, Tool), name
        assert t.name == name
        assert t.description and len(t.description) > 40, (
            f"{name} needs a planner-readable description")
        assert t.accepts, name
        assert issubclass(t.params_model, ToolParams), name
        assert t.produces, name
        assert isinstance(t.offline_capable, bool), name


def test_every_params_model_forbids_unknown_keys():
    """§8.4 layer 1: a planner that invents a parameter gets a ValidationError."""
    from pydantic import ValidationError
    from tools.registry import REGISTRY

    for name, t in REGISTRY.items():
        assert t.params_model.model_config.get("extra") == "forbid", name
        with pytest.raises(ValidationError):
            t.params_model(definitely_not_a_real_parameter=1)


def test_registry_manifest_is_json_serialisable_for_the_planner():
    import json
    from tools.registry import registry_manifest

    manifest = registry_manifest()
    json.dumps(manifest)
    for entry in manifest:
        assert {"name", "description", "accepts", "produces",
                "params_schema", "offline_capable"} <= set(entry)


# ---------------------------------------------------------------------------
# §8.4 - parameter whitelisting actually rejects
# ---------------------------------------------------------------------------
def test_bind_params_drops_non_permitted_keys_and_warns():
    from tools.bind_params import bind_params
    from tools.registry import REGISTRY

    tool = REGISTRY["spectral_index"]
    params, warns = bind_params(tool, {"index": "NDVI", "sneaky_extra": 99})
    assert not hasattr(params, "sneaky_extra")
    assert warns and "sneaky_extra" in warns[0]


# ---------------------------------------------------------------------------
# §9.4 - the planner only ever emits registered tools
# ---------------------------------------------------------------------------
def test_planner_only_emits_registered_tools_for_every_task(all_backends_available):
    from agent.planner import make_plan
    from agent.task_classifier import TaskClassification, TaskType
    from tools.registry import REGISTRY

    configs = {
        TaskType.SINGLE_VQA: "SINGLE",
        TaskType.SINGLE_CAPTION: "SINGLE",
        TaskType.SINGLE_GROUNDING: "SINGLE",
        TaskType.CHANGE_DESCRIPTION: "BI_TEMPORAL",
        TaskType.CHANGE_VQA: "BI_TEMPORAL",
        TaskType.CHANGE_MAP: "BI_TEMPORAL",
        TaskType.CROSS_MODAL_ANALYSIS: "CROSS_MODAL",
        TaskType.LAND_COVER_ANALYSIS: "SINGLE",
    }
    for task, config in configs.items():
        class S:
            input_config = config
            modalities = ["MULTISPECTRAL", "SAR"]
            coreg_shift_px = 1.0
            images = []

        tc = TaskClassification(task=task, confidence=0.9, evidence=[])
        plan = run(make_plan(tc, "locate the water body and measure its area", S()))
        assert plan.steps, task
        for st in plan.steps:
            assert st.tool in REGISTRY, (
                f"{task.value} planned unregistered tool {st.tool}")

        # Artifact references must point at an earlier step (§9.4 validator).
        seen = set()
        for st in plan.steps:
            for ref in st.inputs.values():
                assert ref.split(".")[0] in seen, (
                    f"{st.id} references unproduced artifact {ref}")
            seen.add(st.id)


# ---------------------------------------------------------------------------
# §9.6 - the numeric grounding check and its provenance reporting
# ---------------------------------------------------------------------------
def _cd(fraction):
    return ToolResult(tool="change_detect", model_id="G2", confidence=0.6,
                      confidence_basis="ndvi", facts={"changed_fraction": fraction})


def _vlm(text):
    return ToolResult(tool="change_describe", model_id="V1", confidence=0.6,
                      confidence_basis="heuristic", text=text)


def test_grounding_check_rejects_a_number_no_tool_produced():
    from agent.fusion import verify_grounded

    ok, unsupported = verify_grounded(
        "About 88.8% of the area changed.", {"s1": _cd(0.1234)})
    assert ok is False
    assert "88.8" in unsupported


def test_grounding_check_accepts_a_measured_number():
    from agent.fusion import verify_grounded

    ok, unsupported = verify_grounded(
        "About 12.3% of the area changed.", {"s1": _cd(0.1234)})
    assert ok is True and unsupported == []


def test_fusion_result_carries_the_real_grounding_outcome():
    """
    The trace previously hardcoded grounding_check="PASS".  The outcome now
    travels with the answer, and a FAIL must always name the offending numbers.
    """
    from agent.fusion import fuse
    from agent.task_classifier import TaskType

    class TC:
        task = TaskType.SINGLE_VQA

    results = {"s1": ToolResult(tool="rs_vqa", model_id="V1", confidence=0.7,
                                confidence_basis="heuristic",
                                text="The reservoir covers the north.")}
    res = run(fuse("q", TC(), results, None))
    assert res.grounding_check in ("PASS", "FAIL")
    assert res.mode in ("template", "fallback_concat")
    if res.grounding_check == "FAIL":
        assert res.unsupported_numbers
        assert res.mode == "fallback_concat"


def test_unverified_numbers_isolates_vlm_stated_figures():
    """
    §9.6 whitelists any tool's text, so a VLM-invented figure passes the check.
    It must still be distinguishable from a measured one in the trace.
    """
    from agent.fusion import unverified_numbers

    results = {"s1": _cd(0.1234), "s2": _vlm("Roughly 47.9% became built-up.")}
    flagged = unverified_numbers(
        "About 12.3% changed. Roughly 47.9% became built-up.", results)
    assert flagged == ["47.9"], flagged
    assert "12.3" not in flagged, "a measured figure must never be flagged unverified"


def test_unverified_numbers_ignores_deterministic_tool_text():
    from agent.fusion import unverified_numbers

    det = ToolResult(tool="geo_stats", model_id=None, confidence=1.0,
                     confidence_basis="exact", text="Area: 412.5 ha.")
    assert unverified_numbers("Area: 412.5 ha.", {"s1": det}) == []


# ---------------------------------------------------------------------------
# §9.7 - confidence aggregation and abstention
# ---------------------------------------------------------------------------
def test_confidence_is_zero_when_no_tool_succeeded():
    from agent.confidence import aggregate_confidence, should_abstain
    from agent.plan_schema import ExecutionPlan, PlanStep

    plan = ExecutionPlan(
        task="SINGLE_IMAGE_VQA",
        steps=[PlanStep(id="s1", tool="rs_vqa", reason="x")],
        backend="rules")
    failed = {"s1": ToolResult(tool="rs_vqa", confidence=0.0,
                               confidence_basis="backend unavailable")}
    conf = aggregate_confidence(failed, plan)
    assert conf.value == 0.0 and conf.band == "LOW"
    assert should_abstain(conf) is True


def test_misregistration_warning_caps_confidence():
    from agent.confidence import aggregate_confidence
    from agent.plan_schema import ExecutionPlan, PlanStep

    plan = ExecutionPlan(
        task="CHANGE_MAP_GENERATION",
        steps=[PlanStep(id="s1", tool="change_detect", reason="x")],
        backend="rules")
    r = ToolResult(tool="change_detect", confidence=0.95, confidence_basis="x",
                   warnings=["misregistration of 6.0 px"])
    assert aggregate_confidence({"s1": r}, plan).value <= 0.5


# ---------------------------------------------------------------------------
# §9.8 - the trace records what actually ran
# ---------------------------------------------------------------------------
def test_trace_records_steps_and_finishes():
    from agent.plan_schema import PlanStep
    from agent.trace import ExecutionTrace

    tr = ExecutionTrace.start(scene_id="s", query="q")
    step = PlanStep(id="s1", tool="geo_stats", reason="measure")
    tr.add_step(step, status="OK",
                params_requested={"units": "ha"},
                params_applied={"units": "ha"},
                result=ToolResult(tool="geo_stats", confidence=1.0,
                                  confidence_basis="exact", text="12 ha"))
    tr.finish(status="COMPLETE")
    dumped = tr.model_dump()
    assert dumped["steps"][0]["tool"] == "geo_stats"
    assert dumped["status"] == "COMPLETE"


# ---------------------------------------------------------------------------
# Renderer/plan coherence.
#
# The bug this prevents: RENDERERS[CHANGE_VQA] looked for a tool named `rs_vqa`,
# but the CHANGE_VQA plan runs `change_vqa`. The lookup always missed, so a
# perfectly good answer was silently replaced by a fallback string that read as
# an abstention. Nothing detected it because each half was individually correct.
# ---------------------------------------------------------------------------
TASK_CONFIGS = {
    "SINGLE_VQA": "SINGLE",
    "SINGLE_CAPTION": "SINGLE",
    "SINGLE_GROUNDING": "SINGLE",
    "CHANGE_DESCRIPTION": "BI_TEMPORAL",
    "CHANGE_VQA": "BI_TEMPORAL",
    "CHANGE_MAP": "BI_TEMPORAL",
    "CROSS_MODAL_ANALYSIS": "CROSS_MODAL",
    "LAND_COVER_ANALYSIS": "SINGLE",
}


def _scene_for(config):
    class S:
        input_config = config
        modalities = ["MULTISPECTRAL", "SAR"]
        coreg_shift_px = 1.0
        images = []
    return S()


@pytest.mark.parametrize("task_name,config", sorted(TASK_CONFIGS.items()))
def test_renderer_consumes_its_own_plan_output(task_name, config, all_backends_available):
    """
    Feed each task's renderer a plausible successful result from every tool its
    own planner schedules. The renderer must produce a real answer, never the
    "no output" fallback.
    """
    from agent.fusion import fuse
    from agent.planner import make_plan
    from agent.task_classifier import TaskClassification, TaskType

    task = TaskType[task_name]
    tc = TaskClassification(task=task, confidence=0.9, evidence=[])
    plan = run(make_plan(tc, "has the built-up area increased or decreased?",
                         _scene_for(config)))

    # Every planned step succeeded and said something.
    results = {
        st.id: ToolResult(
            tool=st.tool,
            model_id="V1" if st.tool.startswith(("rs_", "change_")) else None,
            confidence=0.7,
            confidence_basis="stubbed success",
            text=f"{st.tool} produced a finding.",
        )
        for st in plan.steps
    }

    res = run(fuse("has the built-up area increased or decreased?", tc, results, None))

    assert not res.answer.startswith("No answer was produced"), (
        f"{task_name}: renderer reads tools its plan never runs.\n"
        f"  planned : {[st.tool for st in plan.steps]}\n"
        f"  answer  : {res.answer}"
    )
    assert res.answer.strip()


def test_change_vqa_answer_reaches_the_user_with_its_measurement():
    """The exact regression: change_vqa's answer must survive fusion."""
    from agent.fusion import fuse
    from agent.task_classifier import TaskClassification, TaskType

    tc = TaskClassification(task=TaskType.CHANGE_VQA, confidence=0.9, evidence=[])
    results = {
        "s1": ToolResult(tool="change_detect", model_id="G2", confidence=0.6,
                         confidence_basis="ndvi differencing",
                         facts={"changed_fraction": 0.0812, "changed_area_ha": 412.5}),
        "s2": ToolResult(tool="change_vqa", model_id="V1", confidence=0.72,
                         confidence_basis="heuristic",
                         text="Yes, the built-up area increased along the southern edge."),
    }
    res = run(fuse("has built-up increased?", tc, results, None))

    assert "built-up area increased" in res.answer
    assert "8.12%" in res.answer, "measured change must anchor the narrative"
    assert "412.5 ha" in res.answer
    assert res.grounding_check == "PASS"


def test_no_output_fallback_names_the_missing_tool():
    """A renderer/plan mismatch must be legible, not look like low confidence."""
    from agent.fusion import _no_output

    msg = _no_output(["change_vqa"], {
        "s1": ToolResult(tool="change_detect", confidence=0.6, confidence_basis="x"),
    })
    assert "change_vqa" in msg
    assert "change_detect" in msg
    assert "confident" not in msg.lower(), (
        "must not imply an abstention when a step simply produced nothing")


def test_change_vqa_reports_honestly_when_nothing_ran():
    from agent.fusion import fuse
    from agent.task_classifier import TaskClassification, TaskType

    tc = TaskClassification(task=TaskType.CHANGE_VQA, confidence=0.9, evidence=[])
    res = run(fuse("has built-up increased?", tc, {}, None))
    assert res.answer.startswith("No answer was produced")
    assert "change_vqa" in res.answer


# ---------------------------------------------------------------------------
# §9.8 / R11 - the trace must reach the client and survive the request.
#
# The SSE result previously carried only `trace_id`, and no endpoint served the
# trace, so the execution drawer had nothing to render. Nothing was persisted
# either, so /api/stats reported zero queries forever.
# ---------------------------------------------------------------------------
def _fake_db_with_scene(scene_doc):
    store = {"scenes": {scene_doc["id"]: scene_doc}, "queries": {}, "traces": {}}

    class FakeDB:
        def get_document(self, coll, key):
            return store.get(coll, {}).get(key)

        def set_document(self, coll, key, value):
            store.setdefault(coll, {})[key] = value

        def list_documents(self, coll, filters=None):
            return list(store.get(coll, {}).values())

    return FakeDB(), store


def _single_scene_doc():
    return {
        "id": "sc_trace", "workspace_id": "ws_demo", "name": "t",
        "input_config": "SINGLE", "benchmark_mode": False,
        "modalities": ["OPTICAL"], "created_at": "2026-08-28T00:00:00Z",
        "compatibility": {"verdict": "PASS", "checks": []},
        "images": [{
            "role": "single", "original_filename": "a.tif", "object_path": "a.tif",
            "metadata": {"driver": "GTiff", "width": 8, "height": 8,
                         "band_count": 3, "dtypes": ["uint8"]},
            "modality": {"modality": "OPTICAL", "confidence": 0.9},
        }],
    }


def test_sse_result_carries_the_trace_and_persists_it(monkeypatch):
    """The drawer needs the trace itself, not just an id it cannot resolve."""
    import json as _json

    from fastapi.testclient import TestClient

    from core.db import get_db
    from main import app

    db, store = _fake_db_with_scene(_single_scene_doc())
    app.dependency_overrides[get_db] = lambda: db
    try:
        c = TestClient(app)
        with c.stream("POST", "/api/scenes/sc_trace/query",
                      json={"query": "what is visible?", "verify": False}) as r:
            assert r.status_code == 200
            events = [_json.loads(line[6:]) for line in r.iter_lines()
                      if line.startswith("data: ")]

        result = next(e for e in events if e["type"] == "result")
        trace = result["data"].get("trace")
        assert trace is not None, "SSE result must include the trace, not only trace_id"
        assert trace["trace_id"] == result["data"]["trace_id"]
        assert "steps" in trace and "fusion" in trace

        # Persisted for later inspection.
        assert store["traces"], "trace was not stored"
        assert store["queries"], "query was not stored"
    finally:
        app.dependency_overrides.clear()


def test_traces_endpoint_serves_a_stored_trace():
    from fastapi.testclient import TestClient

    from core.db import get_db
    from main import app

    db, store = _fake_db_with_scene(_single_scene_doc())
    store["traces"]["trc_x"] = {"trace_id": "trc_x", "status": "COMPLETE", "steps": []}
    app.dependency_overrides[get_db] = lambda: db
    try:
        c = TestClient(app)
        assert c.get("/api/traces/trc_x").json()["trace_id"] == "trc_x"
        assert c.get("/api/traces/nope").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_stats_counts_persisted_queries():
    from fastapi.testclient import TestClient

    from core.db import get_db
    from main import app

    db, store = _fake_db_with_scene(_single_scene_doc())
    store["queries"]["q1"] = {"workspace_id": "ws_demo", "abstained": False,
                              "confidence": {"value": 0.8}}
    store["queries"]["q2"] = {"workspace_id": "ws_demo", "abstained": True,
                              "confidence": {"value": 0.2}}
    app.dependency_overrides[get_db] = lambda: db
    try:
        c = TestClient(app)
        s = c.get("/api/stats").json()
        assert s["queries_answered"] == 2
        assert s["average_confidence"] == 0.5
        assert s["abstention_rate"] == 0.5
    finally:
        app.dependency_overrides.clear()
