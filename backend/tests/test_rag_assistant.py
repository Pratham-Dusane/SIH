"""
Cross-scene retrieval assistant - Extensions PRD §8 (F5).

The contract under test is the grounding one: aggregates are computed from
stored rows rather than generated, retrieval never drops the workspace out of
view, and a missing language model degrades to real records instead of silence.
"""
import asyncio

import pytest

from features.historical import rag


class FakeDB:
    """Minimal stand-in for the document store - read paths only."""

    def __init__(self, scenes, queries):
        self._data = {"scenes": scenes, "queries": queries}

    def list_documents(self, collection):
        return list(self._data.get(collection, []))


def _scene(sid, name, config, bounds=None, created="2026-01-01T00:00:00Z",
           acquired=None):
    meta = {"bounds_wgs84": bounds} if bounds else {}
    return {
        "id": sid,
        "name": name,
        "input_config": config,
        "modalities": ["OPTICAL"],
        "created_at": created,
        "images": [{"metadata": meta, "acquired_at": acquired}],
    }


def _query(sid, q, a, conf=None):
    row = {"scene_id": sid, "query": q, "answer": a}
    if conf is not None:
        row["confidence"] = {"value": conf}
    return row


@pytest.fixture
def db():
    scenes = [
        _scene("s1", "Pune floodplain", "BI_TEMPORAL",
               [73.84, 18.44, 73.86, 18.47], "2026-01-03T00:00:00Z", "2020-01-01"),
        _scene("s2", "Mumbai coast", "CROSS_MODAL",
               [72.80, 18.90, 72.90, 19.00], "2026-01-02T00:00:00Z"),
        _scene("s3", "Benchmark tile", "SINGLE", None, "2026-01-01T00:00:00Z"),
    ]
    queries = [
        _query("s1", "Has the built-up area increased?", "Built-up rose 2.4%.", 0.61),
        _query("s1", "Where is the water?", "Along the southern edge.", 0.55),
        _query("s2", "Any ships visible?", "Two bright returns offshore.", 0.40),
    ]
    return FakeDB(scenes, queries)


# ---------------------------------------------------------------------------
# Corpus + aggregates
# ---------------------------------------------------------------------------
def test_corpus_joins_queries_onto_scenes(db):
    corpus = rag.build_corpus(db)
    assert len(corpus) == 3
    by_id = {d["scene_id"]: d for d in corpus}
    assert by_id["s1"]["query_count"] == 2
    assert by_id["s2"]["query_count"] == 1
    assert by_id["s3"]["query_count"] == 0
    # A scene without bounds must not acquire an invented footprint.
    assert by_id["s3"]["bounds_wgs84"] is None


def test_aggregates_are_computed_not_generated(db):
    agg = rag.compute_aggregates(rag.build_corpus(db))
    assert agg["scene_count"] == 3
    assert agg["query_count"] == 3
    assert agg["georeferenced_scenes"] == 2
    assert agg["by_input_config"] == {
        "BI_TEMPORAL": 1, "CROSS_MODAL": 1, "SINGLE": 1,
    }
    # mean of 0.61, 0.55, 0.40
    assert agg["mean_confidence"] == pytest.approx(0.52, abs=1e-3)


def test_aggregates_survive_an_empty_workspace():
    agg = rag.compute_aggregates(rag.build_corpus(FakeDB([], [])))
    assert agg["scene_count"] == 0
    assert agg["mean_confidence"] is None


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------
def test_retrieval_ranks_by_overlap(db):
    corpus = rag.build_corpus(db)
    assert rag.retrieve(corpus, "what did I find on the Mumbai coast?", k=1)[0]["scene_id"] == "s2"
    assert rag.retrieve(corpus, "the Pune floodplain built-up area", k=1)[0]["scene_id"] == "s1"


def test_retrieval_backfills_to_k(db):
    """A broad question matches almost nothing lexically; it must still see the
    workspace rather than the one or two scenes that happened to share a word."""
    corpus = rag.build_corpus(db)
    hits = rag.retrieve(corpus, "summarise everything", k=3)
    assert len(hits) == 3
    assert {h["scene_id"] for h in hits} == {"s1", "s2", "s3"}


def test_retrieval_falls_back_to_recency_for_a_stopword_question(db):
    hits = rag.retrieve(rag.build_corpus(db), "what about all of it?", k=2)
    assert [h["scene_id"] for h in hits] == ["s1", "s2"]  # newest first


# ---------------------------------------------------------------------------
# Context rendering
# ---------------------------------------------------------------------------
def test_context_lists_every_scene_not_just_the_hits(db):
    corpus = rag.build_corpus(db)
    ctx = rag.render_context(rag.retrieve(corpus, "Mumbai", k=1),
                             rag.compute_aggregates(corpus), corpus)
    for sid in ("s1", "s2", "s3"):
        assert sid in ctx, f"{sid} missing from the roster"
    assert "scenes: 3" in ctx


def test_context_marks_a_non_georeferenced_scene_as_such(db):
    corpus = rag.build_corpus(db)
    ctx = rag.render_context([d for d in corpus if d["scene_id"] == "s3"],
                             rag.compute_aggregates(corpus), corpus)
    assert "not georeferenced" in ctx


# ---------------------------------------------------------------------------
# Answering
# ---------------------------------------------------------------------------
def test_empty_workspace_says_so_without_calling_a_model(monkeypatch):
    def _boom(*a, **k):
        raise AssertionError("no model call is warranted with zero scenes")

    monkeypatch.setattr(
        "services.inference.vlm_gateway.llm_text_call", _boom, raising=False)
    out = asyncio.run(rag.answer_question(FakeDB([], []), "what have I done?"))
    assert out["citations"] == []
    assert out["aggregates"]["scene_count"] == 0
    assert "no scenes yet" in out["answer"]


def test_unavailable_model_degrades_to_real_records(db, monkeypatch):
    monkeypatch.setattr(
        "services.inference.vlm_gateway.vlm_available",
        lambda backend=None: (False, "OFFLINE_MODE=true"))

    out = asyncio.run(rag.answer_question(db, "which places have I inspected?"))
    assert out["degraded"] is True
    assert "OFFLINE_MODE=true" in out["reason"]
    # The fallback still reports the real totals and cites the real scenes.
    assert "3 scenes" in out["answer"]
    assert set(out["citations"]) <= {"s1", "s2", "s3"}
    assert out["citations"]


def test_provider_failure_degrades_rather_than_raising(db, monkeypatch):
    async def _fail(*a, **k):
        raise RuntimeError("502 upstream")

    monkeypatch.setattr(
        "services.inference.vlm_gateway.vlm_available", lambda backend=None: (True, ""))
    monkeypatch.setattr("services.inference.vlm_gateway.llm_text_call", _fail)

    out = asyncio.run(rag.answer_question(db, "anything"))
    assert out["degraded"] is True
    assert "502 upstream" in out["reason"]


def test_answer_carries_citations_and_aggregates(db, monkeypatch):
    seen = {}

    async def _echo(prompt, system, backend="vertex"):
        seen["prompt"] = prompt
        seen["system"] = system
        return {"text": "Two districts: Pune [s1] and Mumbai [s2].",
                "backend": "vertex", "model": "gemini-3.5-flash"}

    monkeypatch.setattr(
        "services.inference.vlm_gateway.vlm_available", lambda backend=None: (True, ""))
    monkeypatch.setattr("services.inference.vlm_gateway.llm_text_call", _echo)

    out = asyncio.run(rag.answer_question(db, "which districts?", k=2))
    assert out["model"] == "vertex:gemini-3.5-flash"
    assert len(out["citations"]) == 2
    assert out["aggregates"]["scene_count"] == 3
    assert not out.get("degraded")

    # The model is told to answer only from the context, and is given one.
    assert "CONTEXT" in seen["prompt"] and "QUESTION" in seen["prompt"]
    assert "Answer ONLY from the CONTEXT" in seen["system"]


def test_the_assistant_never_writes(db, monkeypatch):
    """§8.2: read-only over scenes/queries/traces."""
    monkeypatch.setattr(
        "services.inference.vlm_gateway.vlm_available",
        lambda backend=None: (False, "offline"))

    def _no_writes(*a, **k):
        raise AssertionError("the assistant must not write to the store")

    db.set_document = _no_writes
    db.delete_document = _no_writes
    asyncio.run(rag.answer_question(db, "anything at all"))
