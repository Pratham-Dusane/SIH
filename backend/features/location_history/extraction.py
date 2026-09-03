"""
Timeline extraction from retrieved documents — Feature F12.

The model's job here is narrow and checkable: read documents that were actually
fetched, and pull out dated events, each tagged with the `src_N` it came from.
It is not asked what it knows about the district — only what these documents say.

Every event the model returns is then validated in Python before it reaches the
report:

* the year must parse, and must fall inside the requested window;
* every `source_id` must reference a document that was really retrieved;
* an event citing nothing is dropped.

That last rule is the one that matters. Without it the feature degrades back
into what it replaced — plausible prose about a district, with citations bolted
on afterwards.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from features.location_history.models import (
    HistoricalDevelopment,
    HistoricalTimelineItem,
    RelevantHistoricalContext,
    SourceItem,
)
from features.location_history.retrieval import render_documents

log = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "natural_disasters", "urban_development", "infrastructure", "agriculture",
    "environmental", "government_projects", "industry_mining", "general",
}

VALID_RELEVANCE = {"direct_aoi", "district_wide", "regional"}

SYSTEM = """You are a research assistant extracting a factual timeline from source documents.

You are given numbered documents ([src_1], [src_2], ...) retrieved for a specific
district, and a time window. Extract dated events that actually appear in those
documents.

Return STRICT JSON only - no markdown fence, no commentary - of this shape:

{
  "timeline": [
    {
      "year": 2019,
      "date_str": "2019-09-25",
      "title": "short event title",
      "category": "natural_disasters",
      "description": "one or two sentences, drawn from the documents",
      "spatial_relevance": "district_wide",
      "source_ids": ["src_1"]
    }
  ],
  "development_summary": {
    "urban_expansion": "...",
    "infrastructure_evolution": "...",
    "environmental_record": "...",
    "agricultural_transition": "..."
  },
  "context_analysis": {
    "summary": "...",
    "interpretation_notes": "how an analyst should read satellite indices for this AOI given these events"
  }
}

Rules, in order of importance:
1. Every event MUST cite at least one src_N that genuinely supports it. An event
   you cannot cite must be omitted entirely. Do not cite a document that does
   not mention the event.
2. Never invent a year, a project name, or a figure. If a document gives no
   year for something, omit it rather than estimating.
3. `category` must be one of: natural_disasters, urban_development,
   infrastructure, agriculture, environmental, government_projects,
   industry_mining, general.
4. `spatial_relevance` must be one of: direct_aoi, district_wide, regional.
5. `date_str` is YYYY-MM-DD when the documents give a full date, otherwise
   YYYY-01-01.
6. For the narrative fields, describe only what the documents support. Where
   they are silent, say so plainly - an empty-but-honest field beats a fluent
   invention. Never write a narrative field about events you omitted.
7. Return at most 12 events, most significant first by their impact on land
   cover or the built environment.
"""

_JSON_BLOCK = re.compile(r"\{.*\}", re.DOTALL)


def _loads(text: str) -> Optional[Dict[str, Any]]:
    """Parse the model's JSON, tolerating a stray markdown fence."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.DOTALL)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    m = _JSON_BLOCK.search(cleaned)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            log.warning("location-context extraction returned unparseable JSON")
    return None


def build_prompt(district: str, state: str, period: str, topics: List[str],
                 docs: List[Dict[str, Any]]) -> str:
    return (
        f"DISTRICT: {district}, {state}, India\n"
        f"TIME WINDOW: {period}\n"
        f"TOPICS OF INTEREST: {', '.join(topics) if topics else 'general development'}\n\n"
        f"DOCUMENTS\n{render_documents(docs)}\n\n"
        "Extract the timeline now, as JSON."
    )


def validate_events(
    raw: List[Dict[str, Any]],
    docs: List[Dict[str, Any]],
    lo: Optional[int],
    hi: Optional[int],
) -> Tuple[List[HistoricalTimelineItem], List[str]]:
    """
    Keep only events that survive every grounding rule.

    Returns (events, rejections) — rejections are logged rather than silently
    dropped, so a report that comes back thin can be explained.
    """
    valid_ids = {f"src_{i}" for i in range(1, len(docs) + 1)}
    events: List[HistoricalTimelineItem] = []
    rejected: List[str] = []

    for i, item in enumerate(raw or []):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            rejected.append(f"#{i}: no title")
            continue

        try:
            year = int(item.get("year"))
        except (TypeError, ValueError):
            rejected.append(f"{title!r}: unparseable year {item.get('year')!r}")
            continue

        if not (1800 <= year <= 2200):
            rejected.append(f"{title!r}: implausible year {year}")
            continue
        if (lo is not None and year < lo) or (hi is not None and year > hi):
            rejected.append(f"{title!r}: {year} outside requested window")
            continue

        # The grounding rule: cite a real retrieved document, or be dropped.
        cited = [s for s in (item.get("source_ids") or []) if s in valid_ids]
        if not cited:
            rejected.append(f"{title!r}: cites nothing retrievable")
            continue

        category = str(item.get("category") or "general")
        if category not in VALID_CATEGORIES:
            category = "general"
        relevance = str(item.get("spatial_relevance") or "district_wide")
        if relevance not in VALID_RELEVANCE:
            relevance = "district_wide"

        date_str = str(item.get("date_str") or f"{year}-01-01")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_str):
            date_str = f"{year}-01-01"

        events.append(HistoricalTimelineItem(
            id=f"evt_{year}_{len(events)}",
            year=year,
            date_str=date_str,
            title=title[:200],
            category=category,
            description=str(item.get("description") or "")[:800],
            spatial_relevance=relevance,
            source_ids=cited,
        ))

    events.sort(key=lambda e: e.year)
    if rejected:
        log.info("location-context extraction rejected %d event(s): %s",
                 len(rejected), "; ".join(rejected[:6]))
    return events, rejected


def docs_to_sources(docs: List[Dict[str, Any]]) -> List[SourceItem]:
    """Retrieved documents as citable sources. Ids line up with the prompt."""
    return [
        SourceItem(
            id=f"src_{i}",
            title=str(d.get("title") or "Untitled")[:300],
            publisher=str(d.get("publisher") or "Unknown"),
            # No date is asserted: the retrieval APIs do not reliably return
            # one, and guessing a publication date is exactly the kind of
            # detail that makes a fabricated citation look real.
            date=None,
            url=d.get("url"),
            excerpt=str(d.get("excerpt") or "")[:600],
            source_type=d.get("source_type") or "institutional",
        )
        for i, d in enumerate(docs, start=1)
    ]


def build_narratives(
    data: Dict[str, Any], district: str, state: str,
) -> Tuple[HistoricalDevelopment, RelevantHistoricalContext]:
    """Narrative sections from the model, with honest placeholders when silent."""
    dev = data.get("development_summary") or {}
    ctx = data.get("context_analysis") or {}

    def _field(source: Dict[str, Any], key: str) -> str:
        value = str(source.get(key) or "").strip()
        return value or "The retrieved sources do not cover this topic for this district."

    return (
        HistoricalDevelopment(
            urban_expansion=_field(dev, "urban_expansion"),
            infrastructure_evolution=_field(dev, "infrastructure_evolution"),
            environmental_record=_field(dev, "environmental_record"),
            agricultural_transition=_field(dev, "agricultural_transition"),
        ),
        RelevantHistoricalContext(
            summary=_field(ctx, "summary"),
            interpretation_notes=_field(ctx, "interpretation_notes"),
        ),
    )


async def extract_timeline(
    district: str, state: str, period: str, topics: List[str],
    docs: List[Dict[str, Any]], lo: Optional[int], hi: Optional[int],
    vlm_backend: Optional[str] = None,
) -> Tuple[Optional[Dict[str, Any]], str]:
    """
    Run the extraction.

    Returns `(result, reason)`. `result` is None on failure and `reason` says
    which failure it was — missing credentials, a provider error, a rate limit,
    or output that would not parse. An earlier version reported all four as
    "no language model was available", which sent users looking for a
    configuration problem when the real cause was a 429.
    """
    from services.inference.vlm_gateway import (
        VLMProviderError, VLMRateLimited, VLMUnavailable,
        llm_text_call, vlm_available,
    )

    ok, reason = vlm_available(vlm_backend)
    if not ok:
        log.info("location-context extraction skipped - no VLM: %s", reason)
        return None, f"no language model is configured ({reason})"

    prompt = build_prompt(district, state, period, topics, docs)
    try:
        out = await llm_text_call(prompt, SYSTEM, backend=vlm_backend or "vertex")
    except VLMRateLimited as e:
        log.warning("location-context extraction rate limited: %r", e)
        return None, "the language model is rate limited right now - try again shortly"
    except (VLMUnavailable, VLMProviderError) as e:
        log.warning("location-context extraction unavailable: %r", e)
        return None, f"the language model rejected the request ({e})"
    except Exception as e:  # noqa: BLE001
        log.warning("location-context extraction call failed: %r", e)
        return None, f"the language model call failed ({type(e).__name__})"

    if out.get("blocked"):
        return None, "the provider's safety filters blocked this response"
    if out.get("truncated"):
        return None, ("the model's reply hit the output-token ceiling before it "
                      "finished - raise VLM_MAX_TOKENS if this recurs")

    data = _loads(out.get("text") or "")
    if not data:
        return None, "the model's reply could not be parsed as JSON"

    events, rejected = validate_events(data.get("timeline") or [], docs, lo, hi)
    development, context = build_narratives(data, district, state)
    return {
        "timeline": events,
        "development_summary": development,
        "context_analysis": context,
        "rejected": rejected,
        "model": f"{out.get('backend')}:{out.get('model')}",
    }, ""
