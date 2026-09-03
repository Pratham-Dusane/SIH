"""
Web retrieval for location context — Feature F12.

Replaces the hand-written source template that used to back this feature. That
template invented publishers, dates, excerpts and **URLs** (`pune.nic.in/...`)
for documents nobody had read. A fabricated citation is worse than no citation:
it survives a reader's spot-check right up until they click it.

Everything here comes back with a URL that was actually returned by a public
API, so a reader can open it.

Two keyless providers, queried together and merged:

* **Wikipedia** (`api.wikipedia.org`) — the substantive one. One `generator=search`
  call returns matching articles with intro extracts, so we get prose worth
  passing to an extraction model rather than a title list.
* **DuckDuckGo Instant Answer** (`api.duckduckgo.com`) — abstracts and related
  topics. Thin by design (it is not a web-results API), but it surfaces official
  and news pages Wikipedia misses.

Neither needs a key, which keeps this consistent with Design Rule 3: the feature
degrades to "no sources found" offline instead of failing the request.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

from core.config import settings

log = logging.getLogger(__name__)

# Wikipedia rejects requests (403) whose User-Agent carries no contact.  The
# contact is a project URL by default and is configurable - see the note on
# WEB_RESEARCH_CONTACT in core/config.py for why it is not an email.
def _user_agent() -> str:
    return (f"SatQueryAI/1.0 ({settings.WEB_RESEARCH_CONTACT}; "
            "remote-sensing context research)")

_TIMEOUT = httpx.Timeout(12.0, connect=6.0)

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
DUCKDUCKGO_API = "https://api.duckduckgo.com/"


class RetrievedDoc(dict):
    """A retrieved document: title, url, excerpt, publisher, source_type."""


def _clean(text: str, limit: int = 1200) -> str:
    text = re.sub(r"\s+", " ", (text or "")).strip()
    return text[:limit]


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
async def _wikipedia(client: httpx.AsyncClient, query: str, limit: int = 4) -> List[RetrievedDoc]:
    """
    Search Wikipedia and pull each hit's intro extract in the same round trip.

    `generator=search` + `prop=extracts` is the difference between a list of
    titles and text an extraction model can actually work from.
    """
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": query,
        "gsrlimit": str(limit),
        "prop": "extracts|info",
        "exintro": "1",
        "explaintext": "1",
        "inprop": "url",
        "redirects": "1",
    }
    r = await client.get(WIKIPEDIA_API, params=params, headers={"User-Agent": _user_agent()})
    r.raise_for_status()
    pages = (r.json().get("query") or {}).get("pages") or {}

    docs: List[RetrievedDoc] = []
    for page in pages.values():
        extract = _clean(page.get("extract") or "")
        if not extract:
            continue
        docs.append(RetrievedDoc(
            title=page.get("title") or "",
            url=page.get("fullurl") or f"https://en.wikipedia.org/wiki/{quote_plus(page.get('title', ''))}",
            excerpt=extract,
            publisher="Wikipedia",
            source_type="institutional",
        ))
    return docs


async def _duckduckgo(client: httpx.AsyncClient, query: str, limit: int = 4) -> List[RetrievedDoc]:
    """DuckDuckGo Instant Answer: abstract plus related topics, both with real URLs."""
    params = {"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"}
    r = await client.get(DUCKDUCKGO_API, params=params, headers={"User-Agent": _user_agent()})
    r.raise_for_status()
    # The endpoint sometimes replies with text/javascript rather than JSON.
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") \
        else __import__("json").loads(r.text)

    docs: List[RetrievedDoc] = []
    abstract = _clean(data.get("AbstractText") or "")
    if abstract and data.get("AbstractURL"):
        docs.append(RetrievedDoc(
            title=data.get("Heading") or query,
            url=data["AbstractURL"],
            excerpt=abstract,
            publisher=data.get("AbstractSource") or "DuckDuckGo",
            source_type="institutional",
        ))

    for topic in (data.get("RelatedTopics") or []):
        if len(docs) >= limit:
            break
        # Nested groups carry their own "Topics" list.
        for item in (topic.get("Topics") or [topic]):
            if len(docs) >= limit:
                break
            text = _clean(item.get("Text") or "")
            url = item.get("FirstURL")
            if not text or not url:
                continue
            docs.append(RetrievedDoc(
                title=text.split(" - ")[0][:160],
                url=url,
                excerpt=text,
                publisher="DuckDuckGo",
                source_type="institutional",
            ))
    return docs


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
async def search_many(queries: List[str], per_query: int = 4) -> List[RetrievedDoc]:
    """
    Run every query against both providers concurrently and merge, de-duplicated
    by URL.

    A provider that errors or times out is logged and skipped: partial evidence
    is still evidence, and one flaky endpoint must not fail the whole report.
    Returns [] when nothing could be retrieved — callers must treat that as
    "no sources", never as licence to invent some.
    """
    if getattr(settings, "OFFLINE_MODE", False):
        log.info("OFFLINE_MODE set - skipping web retrieval for location context")
        return []

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        tasks = []
        for q in queries:
            tasks.append(_wikipedia(client, q, per_query))
            tasks.append(_duckduckgo(client, q, per_query))
        results = await asyncio.gather(*tasks, return_exceptions=True)

    merged: List[RetrievedDoc] = []
    seen: set = set()
    for res in results:
        if isinstance(res, BaseException):
            log.warning("location-context retrieval provider failed: %r", res)
            continue
        for doc in res:
            url = doc.get("url")
            if not url or url in seen:
                continue
            seen.add(url)
            merged.append(doc)

    log.info("location-context retrieval: %d unique documents from %d queries",
             len(merged), len(queries))
    return merged


def render_documents(docs: List[Dict[str, Any]]) -> str:
    """Numbered evidence block for the extraction prompt. Ids match `src_N`."""
    blocks = []
    for i, d in enumerate(docs, start=1):
        blocks.append(
            f"[src_{i}] {d.get('title')}\n"
            f"  publisher: {d.get('publisher')}\n"
            f"  url: {d.get('url')}\n"
            f"  text: {d.get('excerpt')}"
        )
    return "\n\n".join(blocks)
