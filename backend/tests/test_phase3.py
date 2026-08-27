"""
Tests for the deterministic tools: spectral_index, sar_water_mask, geo_stats, coreg_check.
Tests for the agent pipeline: task_classifier, input_gate, planner, confidence.
"""

import asyncio
import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


class MockStorage:
    """Minimal storage mock."""
    def local_path(self, path):
        return path

    def public_url(self, path):
        return f"http://localhost/{path}"


class MockScene:
    """Minimal scene mock for tool and agent tests."""
    def __init__(
        self,
        input_config="SINGLE",
        modalities=None,
        images=None,
        georeferenced=True,
        gsd_m=10.0,
        compatibility_verdict="PASS",
        coreg_shift_px=1.0,
    ):
        self.id = "test_scene_001"
        self.workspace_id = "ws_test"
        self.name = "Test Scene"
        self.input_config = input_config
        self.modalities = modalities or ["OPTICAL"]
        self.images = images or []
        self.benchmark_mode = not georeferenced
        self.coreg_shift_px = coreg_shift_px
        self.warnings = []
        self.compatibility = MockCompatibility(compatibility_verdict)
        self._georeferenced = georeferenced
        self._gsd_m = gsd_m


class MockCompatibility:
    def __init__(self, verdict="PASS"):
        self.verdict = verdict
        self.checks = []


class MockExecutionContext:
    """Minimal execution context that provides test arrays."""
    def __init__(self, optical_arr=None, sar_arr=None, georeferenced=True, gsd_m=10.0):
        self.results = {}
        self._artifacts = {}
        self._optical = optical_arr
        self._sar = sar_arr
        self._georeferenced = georeferenced
        self._gsd_m = gsd_m
        self.vlm_backend = "gemini"

    def get_optical_array(self):
        return self._optical

    def get_sar_array(self):
        return self._sar

    def get_image_array(self, which):
        if which == "a":
            return self._optical
        elif which == "b":
            return self._sar
        return None

    def store_artifact(self, key, data):
        self._artifacts[key] = data

    def get_artifact(self, ref):
        return self._artifacts.get(ref)

    def scene_georeferenced(self):
        return self._georeferenced

    def scene_gsd_x_m(self):
        return self._gsd_m if self._georeferenced else None

    def scene_gsd_y_m(self):
        return self._gsd_m if self._georeferenced else None

    def scene_overlap_fraction(self):
        return 0.95

    def prior(self, tool_name):
        for r in self.results.values():
            if hasattr(r, "tool") and r.tool == tool_name:
                return r
        return None


# ---------------------------------------------------------------------------
# Test: Tool Registration
# ---------------------------------------------------------------------------


def test_registry_populated():
    """All 4 deterministic tools should be registered."""
    from tools.registry import REGISTRY

    expected = {"spectral_index", "sar_water_mask", "geo_stats", "coreg_check"}
    assert expected.issubset(set(REGISTRY.keys())), f"Missing tools: {expected - set(REGISTRY.keys())}"


def test_registry_manifest_shape():
    """Manifest should have the right fields."""
    from tools.registry import registry_manifest

    manifest = registry_manifest()
    assert len(manifest) >= 4
    for item in manifest:
        assert "name" in item
        assert "description" in item
        assert "accepts" in item
        assert "produces" in item
        assert "params_schema" in item
        assert "offline_capable" in item


# ---------------------------------------------------------------------------
# Test: spectral_index
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_spectral_index_ndvi_4band():
    """NDVI on a 4-band image (R,G,B,NIR)."""
    from tools.spectral_index import SpectralIndexTool, SpectralIndexParams

    # Create a synthetic 4-band image (R, G, B, NIR)
    h, w = 100, 100
    arr = np.random.rand(4, h, w).astype("float32") * 0.5
    # Make NIR high and RED low -> positive NDVI
    arr[3] = 0.8  # NIR
    arr[0] = 0.2  # RED

    ctx = MockExecutionContext(optical_arr=arr)
    tool = SpectralIndexTool()
    params = SpectralIndexParams(index="NDVI", threshold=0.0)
    result = await tool.run(ctx, params)

    assert result.confidence == 1.0
    assert result.facts["index"] == "NDVI"
    assert result.facts["positive_fraction"] > 0.9  # should be mostly positive
    assert "ndvi_mask" in ctx._artifacts


@pytest.mark.asyncio
async def test_spectral_index_ndvi_with_otsu():
    """NDVI with Otsu auto-threshold."""
    from tools.spectral_index import SpectralIndexTool, SpectralIndexParams

    arr = np.random.rand(4, 100, 100).astype("float32") * 0.5
    arr[3, :50, :] = 0.9  # upper half: high NIR (vegetation)
    arr[3, 50:, :] = 0.1  # lower half: low NIR (bare)
    arr[0] = 0.3  # RED constant

    ctx = MockExecutionContext(optical_arr=arr)
    tool = SpectralIndexTool()
    params = SpectralIndexParams(index="NDVI")  # Otsu threshold
    result = await tool.run(ctx, params)

    assert result.confidence == 1.0
    assert result.facts["threshold"] is not None
    assert 0.0 < result.facts["positive_fraction"] < 1.0


@pytest.mark.asyncio
async def test_spectral_index_insufficient_bands():
    """Requesting NDBI on a 3-band RGB image should fail gracefully."""
    from tools.spectral_index import SpectralIndexTool, SpectralIndexParams

    arr = np.random.rand(3, 100, 100).astype("float32")
    ctx = MockExecutionContext(optical_arr=arr)
    tool = SpectralIndexTool()
    params = SpectralIndexParams(index="NDBI")
    result = await tool.run(ctx, params)

    assert result.confidence == 0.0
    assert len(result.warnings) > 0


# ---------------------------------------------------------------------------
# Test: sar_water_mask
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sar_water_mask_otsu():
    """Water mask on synthetic SAR data with clear bimodal distribution."""
    from tools.sar_water_mask import SARWaterMaskTool, SARWaterMaskParams

    h, w = 100, 100
    arr = np.ones((1, h, w), dtype="float32")
    arr[:, :30, :] = 0.001   # water (very low backscatter)
    arr[:, 30:, :] = 100.0   # land (high backscatter)

    ctx = MockExecutionContext(sar_arr=arr)
    tool = SARWaterMaskTool()
    params = SARWaterMaskParams()
    result = await tool.run(ctx, params)

    assert result.confidence == 1.0
    assert 0.2 < result.facts["water_fraction"] < 0.4  # ~30% water
    assert "water_mask" in ctx._artifacts


@pytest.mark.asyncio
async def test_sar_water_mask_manual_threshold():
    """Water mask with a user-specified dB threshold."""
    from tools.sar_water_mask import SARWaterMaskTool, SARWaterMaskParams

    arr = np.ones((1, 100, 100), dtype="float32") * 10.0
    arr[:, :50, :] = 0.01  # half water

    ctx = MockExecutionContext(sar_arr=arr)
    tool = SARWaterMaskTool()
    params = SARWaterMaskParams(threshold_db=-10.0)
    result = await tool.run(ctx, params)

    assert result.confidence == 1.0
    assert result.facts["threshold_db"] == -10.0


# ---------------------------------------------------------------------------
# Test: geo_stats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_geo_stats_with_gsd():
    """Area computation with known GSD."""
    from tools.geo_stats import GeoStatsTool, GeoStatsParams

    mask = np.zeros((100, 100), dtype=bool)
    mask[:50, :] = True  # 50% of pixels

    ctx = MockExecutionContext(georeferenced=True, gsd_m=10.0)
    ctx.store_artifact("test_mask", mask)
    tool = GeoStatsTool()
    params = GeoStatsParams(mask_ref="test_mask", units="ha")
    result = await tool.run(ctx, params)

    assert result.confidence == 1.0
    # 5000 pixels × 10m × 10m = 500,000 m² = 50 ha
    assert abs(result.facts["area_ha"] - 50.0) < 0.1


@pytest.mark.asyncio
async def test_geo_stats_percent_only_for_benchmark():
    """Non-georeferenced scene should report percentage only."""
    from tools.geo_stats import GeoStatsTool, GeoStatsParams

    mask = np.ones((100, 100), dtype=bool)
    ctx = MockExecutionContext(georeferenced=False)
    ctx.store_artifact("test_mask", mask)
    tool = GeoStatsTool()
    params = GeoStatsParams(mask_ref="test_mask", units="ha")
    result = await tool.run(ctx, params)

    assert result.confidence == 1.0
    assert len(result.warnings) > 0  # warned about non-georeferenced
    assert result.facts["percent"] == 100.0


@pytest.mark.asyncio
async def test_geo_stats_missing_artifact():
    """Missing artifact reference should return confidence 0."""
    from tools.geo_stats import GeoStatsTool, GeoStatsParams

    ctx = MockExecutionContext()
    tool = GeoStatsTool()
    params = GeoStatsParams(mask_ref="nonexistent")
    result = await tool.run(ctx, params)

    assert result.confidence == 0.0


# ---------------------------------------------------------------------------
# Test: coreg_check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_coreg_check_well_aligned():
    """Two identical images should report near-zero shift."""
    from tools.coreg_check import CoregCheckTool, CoregCheckParams

    arr = np.random.rand(3, 200, 200).astype("float32")
    ctx = MockExecutionContext(optical_arr=arr, sar_arr=arr)
    tool = CoregCheckTool()
    params = CoregCheckParams()
    result = await tool.run(ctx, params)

    assert result.confidence > 0.5
    assert result.facts["shift_px"] < 3.0
    assert result.facts["status"] in ("PASS", "WARN")


# ---------------------------------------------------------------------------
# Test: bind_params (R9)
# ---------------------------------------------------------------------------


def test_bind_params_valid():
    """Valid parameters should pass through."""
    from tools.spectral_index import SpectralIndexTool, SpectralIndexParams
    from tools.bind_params import bind_params

    tool = SpectralIndexTool()
    params, warnings = bind_params(tool, {"index": "NDVI", "threshold": 0.3})
    assert isinstance(params, SpectralIndexParams)
    assert params.index == "NDVI"
    assert params.threshold == 0.3
    assert len(warnings) == 0


def test_bind_params_rejects_unknown():
    """Unknown parameters should be rejected with a warning."""
    from tools.spectral_index import SpectralIndexTool
    from tools.bind_params import bind_params

    tool = SpectralIndexTool()
    params, warnings = bind_params(tool, {"index": "NDVI", "invented_param": 42})
    assert params.index == "NDVI"
    assert len(warnings) > 0
    assert "invented_param" in warnings[0]


# ---------------------------------------------------------------------------
# Test: Task Classifier
# ---------------------------------------------------------------------------


def test_classify_single_vqa():
    from agent.task_classifier import classify_task, TaskType
    scene = MockScene(input_config="SINGLE")
    result = classify_task("How many buildings are there?", scene)
    assert result.task == TaskType.SINGLE_VQA


def test_classify_single_caption():
    from agent.task_classifier import classify_task, TaskType
    scene = MockScene(input_config="SINGLE")
    result = classify_task("Describe this image", scene)
    assert result.task == TaskType.SINGLE_CAPTION


def test_classify_single_grounding():
    from agent.task_classifier import classify_task, TaskType
    scene = MockScene(input_config="SINGLE")
    result = classify_task("Where is the water body in this image?", scene)
    assert result.task == TaskType.SINGLE_GROUNDING


def test_classify_bitemporal_change():
    from agent.task_classifier import classify_task, TaskType
    scene = MockScene(input_config="BI_TEMPORAL")
    result = classify_task("Show me what changed between these images", scene)
    assert result.task in (TaskType.CHANGE_DESCRIPTION, TaskType.CHANGE_MAP)


def test_classify_cross_modal():
    from agent.task_classifier import classify_task, TaskType
    scene = MockScene(input_config="CROSS_MODAL", modalities=["OPTICAL", "SAR"])
    result = classify_task("Use both optical and SAR together to identify water", scene)
    assert result.task == TaskType.CROSS_MODAL_ANALYSIS


# ---------------------------------------------------------------------------
# Test: Input Gate
# ---------------------------------------------------------------------------


def test_gate_passes_valid_single(all_backends_available):
    from agent.task_classifier import TaskClassification, TaskType
    from agent.input_gate import input_gate

    tc = TaskClassification(task=TaskType.SINGLE_VQA, confidence=0.9, evidence=[])
    scene = MockScene(input_config="SINGLE")
    result = input_gate(tc, scene)
    assert result.ok is True


def test_gate_refuses_wrong_config():
    from agent.task_classifier import TaskClassification, TaskType
    from agent.input_gate import input_gate

    tc = TaskClassification(task=TaskType.CHANGE_DESCRIPTION, confidence=0.9, evidence=[])
    scene = MockScene(input_config="SINGLE")
    result = input_gate(tc, scene)
    assert result.ok is False
    assert any(p.code == "WRONG_INPUT_CONFIG" for p in result.problems)


def test_gate_refuses_missing_modality():
    from agent.task_classifier import TaskClassification, TaskType
    from agent.input_gate import input_gate

    tc = TaskClassification(task=TaskType.CROSS_MODAL_ANALYSIS, confidence=0.9, evidence=[])
    scene = MockScene(input_config="CROSS_MODAL", modalities=["OPTICAL"])
    result = input_gate(tc, scene)
    assert result.ok is False
    assert any(p.code == "MISSING_MODALITY" for p in result.problems)


def test_gate_refuses_poor_coreg():
    from agent.task_classifier import TaskClassification, TaskType
    from agent.input_gate import input_gate

    tc = TaskClassification(task=TaskType.CHANGE_MAP, confidence=0.9, evidence=[])
    scene = MockScene(input_config="BI_TEMPORAL", coreg_shift_px=15.0)
    result = input_gate(tc, scene)
    assert result.ok is False
    assert any(p.code == "POOR_CO_REGISTRATION" for p in result.problems)


# ---------------------------------------------------------------------------
# Test: Planner
# ---------------------------------------------------------------------------


def test_planner_single_vqa():
    from agent.task_classifier import TaskType
    from agent.planner import plan_rules

    plan = plan_rules(TaskType.SINGLE_VQA, "How many trees?", MockScene())
    assert plan.backend == "rules"
    assert len(plan.steps) >= 1
    assert plan.steps[0].tool == "rs_vqa"


def test_planner_cross_modal():
    from agent.task_classifier import TaskType
    from agent.planner import plan_rules

    scene = MockScene(input_config="CROSS_MODAL", modalities=["OPTICAL", "SAR"])
    plan = plan_rules(
        TaskType.CROSS_MODAL_ANALYSIS,
        "Use both together to find water",
        scene,
    )
    tool_names = [s.tool for s in plan.steps]
    assert "coreg_check" in tool_names
    assert "sar_optical_fuse" in tool_names


def test_planner_change_description():
    from agent.task_classifier import TaskType
    from agent.planner import plan_rules

    scene = MockScene(input_config="BI_TEMPORAL")
    plan = plan_rules(TaskType.CHANGE_DESCRIPTION, "Describe the change", scene)
    tool_names = [s.tool for s in plan.steps]
    assert "coreg_check" in tool_names
    assert "change_detect" in tool_names
    assert "geo_stats" in tool_names
    assert "change_describe" in tool_names


# ---------------------------------------------------------------------------
# Test: Confidence
# ---------------------------------------------------------------------------


def test_confidence_aggregation():
    from agent.confidence import aggregate_confidence
    from agent.plan_schema import ExecutionPlan, PlanStep
    from agent.task_classifier import TaskType
    from tools.base import ToolResult

    results = {
        "s1": ToolResult(tool="spectral_index", confidence=1.0,
                         confidence_basis="deterministic"),
        "s2": ToolResult(tool="geo_stats", confidence=1.0,
                         confidence_basis="deterministic"),
    }
    plan = ExecutionPlan(
        task=TaskType.SINGLE_VQA,
        steps=[
            PlanStep(id="s1", tool="spectral_index", params={"index": "NDVI"}, reason="test"),
            PlanStep(id="s2", tool="geo_stats", params={"mask_ref": "s1.artifacts.mask"}, reason="test",
                     inputs={"mask_ref": "s1.artifacts.mask"}),
        ],
    )
    conf = aggregate_confidence(results, plan)
    assert conf.value > 0.7
    assert conf.band in ("HIGH", "MEDIUM")


# ---------------------------------------------------------------------------
# Test: Fusion grounding check
# ---------------------------------------------------------------------------


def test_grounding_check_passes():
    from agent.fusion import verify_grounded
    from tools.base import ToolResult

    results = {
        "s1": ToolResult(tool="geo_stats", confidence=1.0,
                         confidence_basis="deterministic",
                         facts={"area_ha": 50.0, "percent": 12.5}),
    }
    ok, unsupported = verify_grounded("The area is 50.0 ha (12.5%).", results)
    assert ok is True


def test_grounding_check_catches_invented_number():
    from agent.fusion import verify_grounded
    from tools.base import ToolResult

    results = {
        "s1": ToolResult(tool="geo_stats", confidence=1.0,
                         confidence_basis="deterministic",
                         facts={"area_ha": 50.0}),
    }
    ok, unsupported = verify_grounded("The area is 999.9 ha.", results)
    assert ok is False
    assert "999.9" in unsupported
