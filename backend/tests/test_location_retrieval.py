"""
Location context retrieval + extraction — Feature F12.

The contract under test is that a report can never present unsourced prose as
research: every timeline event must cite a document that was really retrieved,
and when nothing was retrieved the report must say so rather than fall through
to the template silently.

No network is touched — providers and the model are stubbed.
"""
import asyncio

import pytest

from features.location_history import extraction, service


DOCS = [
    {"title": "2019 Pune flood", "url": "https://en.wikipedia.org/wiki/2019_Pune_flood",
     "excerpt": "Between 25-28 September 2019 Pune received heavy rainfall.",
     "publisher": "Wikipedia", "source_type": "institutional"},
    {"title": "Mumbai-Pune Expressway", "url": "https://en.wikipedia.org/wiki/Mumbai_Pune_Expressway",
     "excerpt": "India's first six-lane expressway, fully operational in 2002.",
     "publisher": "Wikipedia", "source_type": "institutional"},
]


# ---------------------------------------------------------------------------
# Query construction
# ---------------------------------------------------------------------------
def test_queries_do_not_embed_the_date_range():
    """Appending "2000-2026" to every query measurably hurt recall."""
    qs = service.generate_search_queries("Pune", "Maharashtra", "2000-2026", "flooding")
    assert all("2000-2026" not in q for q in qs)
    assert any("flood" in q.lower() for q in qs)


def test_topics_reach_the_search_queries():
    """Changing the topics must change what is searched, not only what is echoed."""
    qs = service.generate_search_queries("Pune", "Maharashtra", "2000-2026", "mining, quarrying")
    joined = " ".join(qs).lower()
    assert "mining" in joined and "quarrying" in joined


# ---------------------------------------------------------------------------
# Event validation — the grounding rule
# ---------------------------------------------------------------------------
def test_event_citing_nothing_is_dropped():
    events, rejected = extraction.validate_events(
        [{"year": 2019, "title": "Flood", "description": "d", "source_ids": []}],
        DOCS, None, None,
    )
    assert events == []
    assert "cites nothing retrievable" in rejected[0]


def test_event_citing_a_nonexistent_source_is_dropped():
    """The model inventing `src_9` must not smuggle an event through."""
    events, _ = extraction.validate_events(
        [{"year": 2019, "title": "Flood", "description": "d", "source_ids": ["src_9"]}],
        DOCS, None, None,
    )
    assert events == []


def test_valid_event_survives_and_keeps_only_real_citations():
    events, _ = extraction.validate_events(
        [{"year": 2019, "date_str": "2019-09-25", "title": "Pune flood",
          "category": "natural_disasters", "description": "Heavy rainfall.",
          "spatial_relevance": "district_wide", "source_ids": ["src_1", "src_7"]}],
        DOCS, None, None,
    )
    assert len(events) == 1
    # src_7 does not exist and is stripped; src_1 does and is kept.
    assert events[0].source_ids == ["src_1"]
    assert events[0].year == 2019


def test_events_outside_the_window_are_dropped():
    raw = [
        {"year": 2002, "title": "Expressway", "description": "d", "source_ids": ["src_2"]},
        {"year": 2019, "title": "Flood", "description": "d", "source_ids": ["src_1"]},
    ]
    events, _ = extraction.validate_events(raw, DOCS, 2015, 2026)
    assert [e.year for e in events] == [2019]


def test_unparseable_and_implausible_years_are_dropped():
    raw = [
        {"year": "recently", "title": "A", "description": "d", "source_ids": ["src_1"]},
        {"year": 1200, "title": "B", "description": "d", "source_ids": ["src_1"]},
    ]
    events, rejected = extraction.validate_events(raw, DOCS, None, None)
    assert events == []
    assert len(rejected) == 2


def test_bad_category_falls_back_rather_than_raising():
    events, _ = extraction.validate_events(
        [{"year": 2019, "title": "X", "description": "d",
          "category": "alien_invasion", "spatial_relevance": "galactic",
          "source_ids": ["src_1"]}],
        DOCS, None, None,
    )
    assert events[0].category == "general"
    assert events[0].spatial_relevance == "district_wide"


def test_events_are_sorted_by_year():
    raw = [
        {"year": 2019, "title": "B", "description": "d", "source_ids": ["src_1"]},
        {"year": 2002, "title": "A", "description": "d", "source_ids": ["src_2"]},
    ]
    events, _ = extraction.validate_events(raw, DOCS, None, None)
    assert [e.year for e in events] == [2002, 2019]


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------
def test_sources_carry_real_urls_and_assert_no_date():
    """
    The template this replaced invented publication dates alongside invented
    URLs. Retrieval gives us neither reliably, so no date is asserted.
    """
    sources = extraction.docs_to_sources(DOCS)
    assert [s.id for s in sources] == ["src_1", "src_2"]
    assert all(s.url and s.url.startswith("https://") for s in sources)
    assert all(s.date is None for s in sources)


def test_json_parsing_tolerates_a_markdown_fence():
    assert extraction._loads('```json\n{"timeline": []}\n```') == {"timeline": []}
    assert extraction._loads('here you go {"timeline": []} cheers') == {"timeline": []}
    assert extraction._loads("not json at all") is None


# ---------------------------------------------------------------------------
# Orchestration + fallback labelling
# ---------------------------------------------------------------------------
def test_no_sources_falls_back_to_the_template(monkeypatch):
    async def _none(queries, per_query=4):
        return []

    monkeypatch.setattr(
        "features.location_history.retrieval.search_many", _none)
    service._HISTORY_CACHE.clear()

    rep = asyncio.run(service.research_location_history(location="Pune"))
    # The template still renders, but the response must remain honest about
    # what it is - `provenance` is the only signal left, since the UI no
    # longer shows a banner.
    assert rep.provenance == "synthesized"
    assert "No sources could be retrieved" in rep.provenance_note
    assert rep.timeline, "the template fallback should still populate the panel"


@pytest.mark.parametrize("why", [
    "the language model is rate limited right now - try again shortly",
    "the model's reply could not be parsed as JSON",
    "no language model is configured (OFFLINE_MODE=true)",
])
def test_extraction_failure_reports_the_actual_reason(monkeypatch, why):
    """
    All three used to surface as "no language model was available", which sent
    a reader hunting for a config problem when the cause was a 429.
    """
    async def _docs(queries, per_query=4):
        return DOCS

    async def _fails(**kwargs):
        return None, why

    monkeypatch.setattr("features.location_history.retrieval.search_many", _docs)
    monkeypatch.setattr("features.location_history.extraction.extract_timeline", _fails)
    service._HISTORY_CACHE.clear()

    rep = asyncio.run(service.research_location_history(location="Pune"))
    assert rep.provenance == "synthesized"
    assert why in rep.provenance_note
    assert "2 sources were retrieved" in rep.provenance_note


def test_a_failed_report_is_not_cached(monkeypatch):
    """Otherwise a single 429 poisons the district until the process restarts."""
    calls = {"n": 0}

    async def _docs(queries, per_query=4):
        calls["n"] += 1
        return []

    monkeypatch.setattr("features.location_history.retrieval.search_many", _docs)
    service._HISTORY_CACHE.clear()

    asyncio.run(service.research_location_history(location="Pune"))
    asyncio.run(service.research_location_history(location="Pune"))
    assert calls["n"] == 2


def test_retrieved_report_is_labelled_and_cites_only_used_sources(monkeypatch):
    async def _docs(queries, per_query=4):
        return DOCS

    async def _extract(**kwargs):
        events, _rej = extraction.validate_events(
            [{"year": 2019, "title": "Pune flood", "category": "natural_disasters",
              "description": "Heavy rainfall.", "source_ids": ["src_1"]}],
            DOCS, kwargs["lo"], kwargs["hi"],
        )
        dev, ctx = extraction.build_narratives({}, "Pune", "Maharashtra")
        return ({"timeline": events, "development_summary": dev,
                 "context_analysis": ctx, "rejected": [], "model": "vertex:test"}, "")

    monkeypatch.setattr("features.location_history.retrieval.search_many", _docs)
    monkeypatch.setattr("features.location_history.extraction.extract_timeline", _extract)
    service._HISTORY_CACHE.clear()

    rep = asyncio.run(service.research_location_history(location="Pune"))
    assert rep.provenance == "retrieved"
    assert "vertex:test" in rep.provenance_note
    assert len(rep.timeline) == 1
    # src_2 contributed nothing, so it is not padded into the source list.
    assert [s.id for s in rep.sources] == ["src_1"]
    assert rep.sources[0].url.startswith("https://en.wikipedia.org/")


def test_categories_omit_empty_groups(monkeypatch):
    events, _ = extraction.validate_events(
        [{"year": 2019, "title": "Flood", "category": "natural_disasters",
          "description": "d", "source_ids": ["src_1"]}],
        DOCS, None, None,
    )
    groups = service._categorise(events)
    assert [g.category for g in groups] == ["natural_disasters"]


def test_narratives_say_so_when_sources_are_silent():
    dev, ctx = extraction.build_narratives({}, "Pune", "Maharashtra")
    assert "do not cover this topic" in dev.urban_expansion
    assert "do not cover this topic" in ctx.summary
