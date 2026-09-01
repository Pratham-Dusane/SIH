"""
VLM gateway - PRD §7.1.

Thin, provider-agnostic wrapper around a hosted vision API.  `rs_vqa`,
`rs_caption`, `rs_ground`, `change_describe` and `change_vqa` are all thin
wrappers around `vlm_call`; the `ToolResult` shape (§8.1) is unchanged, so
nothing downstream in the agent (executor, fusion, trace, confidence) needs
to know the backend changed.

Honest framing (§7.0): this is a hosted, general-purpose model with **no
remote-sensing adaptation**.  R1 is not satisfied by this backend and every
confidence value produced here is a heuristic, not a calibrated score.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from core.config import settings

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# System prompt.
# Expert remote-sensing analyst framing with clear chatbot formatting guidelines.
# ---------------------------------------------------------------------------
SYSTEM = """You are an expert remote-sensing imagery analyst and geospatial AI assistant. You are shown satellite or aerial imagery (optical, multispectral, or SAR).
Your role is to provide clear, insightful, well-structured, and helpful analysis strictly grounded in what is visible.

Formatting and style guidelines:
- Use clean Markdown with bold headings or bullet points where appropriate to make your response easy to read and scan.
- Structure observations logically (e.g., scene type, infrastructure/built environment, natural features & vegetation, spatial layout).
- State uncertainty explicitly and honestly.
- Never invent counts, exact areas, or coordinates you cannot verify from the image.
- When asked to locate something, respond with a normalised bounding box in the form (x1,y1),(x2,y2) with values in [0,1]."""


# ---------------------------------------------------------------------------
# Task-specific instruction templates - structured for high-quality,
# informative, and conversational chatbot answers.
# The user's own question/phrase is always passed as data into a template slot.
# ---------------------------------------------------------------------------
TEMPLATES: Dict[str, str] = {
    "vqa": (
        "Question about this remote-sensing image: {question}\n\n"
        "Please provide a direct, helpful, and well-structured answer strictly grounded in what is visible in the imagery.\n"
        "• Begin with a clear, direct answer to the question.\n"
        "• Highlight key visual evidence (e.g. location, orientation, spatial context, structural patterns).\n"
        "• If the image does not contain enough information or resolution to answer with certainty, state that clearly rather than guessing."
    ),
    "caption_brief": (
        "Provide a concise, 1-2 sentence executive overview of this remote-sensing image. "
        "Highlight the primary land-use/environment type and notable visible landmarks or features."
    ),
    "caption_standard": (
        "Analyze and describe this remote-sensing image with clear structure and helpful detail (2-4 concise paragraphs or structured bullet points):\n\n"
        "1. **Scene Overview:** Primary classification (e.g. dense urban, suburban, agricultural, coastal, forested) and overall character.\n"
        "2. **Built Environment & Infrastructure:** Notable buildings, road/transportation networks (highways, arterial roads, railways), or industrial facilities.\n"
        "3. **Natural Features & Land Cover:** Vegetation, open ground, water bodies, or terrain characteristics.\n"
        "4. **Spatial Layout:** How these features are arranged across the scene (e.g. center, quadrants, corridors).\n\n"
        "Do not invent unverified statistics or coordinates."
    ),
    "caption_detailed": (
        "Provide a comprehensive, professional remote-sensing assessment of this image formatted cleanly with Markdown sections:\n\n"
        "### 1. Scene Classification & Overview\n"
        "Dominant environment type, development density, and landscape setting.\n\n"
        "### 2. Infrastructure & Built-Up Features\n"
        "Transportation corridors (highways, major roadways, intersections), residential/commercial/industrial zones, and structural patterns.\n\n"
        "### 3. Natural & Environmental Features\n"
        "Vegetation cover, agricultural plots, bare soil, water bodies/drainage channels, and topography/texture cues.\n\n"
        "### 4. Spatial Organization & Notable Observations\n"
        "Orientation, layout across sectors, and any distinctive landmarks or anomalies.\n\n"
        "Flag any ambiguous features clearly. Do not invent exact counts or measurements."
    ),
    "ground": (
        "Locate the region matching this description: {phrase}\n"
        "Respond with a single normalised bounding box in exactly the form "
        "(x1,y1),(x2,y2) with all four values in [0,1], where x is the fraction "
        "across the image from the left edge and y is the fraction down from the "
        "top edge. If no such region is present in the image, reply with exactly: "
        "NOT_FOUND"
    ),
    "change_describe": (
        "You are shown two co-registered satellite images of the same area at two different times: "
        "image 1 is the earlier date (T1), image 2 is the later date (T2).\n"
        "{facts_block}"
        "Provide a structured change assessment describing what has changed between T1 and T2:\n"
        "• **Overview of Changes:** High-level summary of the primary landscape transition.\n"
        "• **Specific Transformations:** Detail the direction of change (increase, decrease, or stability) for each land-cover type (built-up, vegetation, water, bare land).\n"
        "• **Spatial Focus:** Where the changes are concentrated.\n"
        "If measured statistics are given above, incorporate them accurately rather than estimating your own."
    ),
    "change_vqa": (
        "You are shown two co-registered images of the same area at two different times: "
        "image 1 is the earlier date (T1), image 2 is the later date (T2).\n"
        "{facts_block}"
        "Question about the change between T1 and T2: {question}\n\n"
        "Answer the question directly and thoroughly based strictly on visual differences between T1 and T2. "
        "If measured statistics are provided above, incorporate them accurately."
    ),
}


class VLMUnavailable(RuntimeError):
    """Raised when the configured VLM backend has no usable credentials."""


class VLMRateLimited(RuntimeError):
    """Raised when the provider kept returning 429/5xx after every retry."""


class VLMProviderError(RuntimeError):
    """Provider rejected the request; carries the provider's own message."""


# ---------------------------------------------------------------------------
# Retry policy.
#
# Free-tier Gemini keys rate-limit aggressively, and a 429 mid-demo would
# otherwise surface as a raw HTTP error.  Retries are bounded and respect the
# provider's own Retry-After when it sends one.
# ---------------------------------------------------------------------------
_RETRY_STATUS = {408, 409, 429, 500, 502, 503, 504}
_MAX_ATTEMPTS = 4
_BASE_BACKOFF_S = 2.0


def _retry_after_seconds(response: "httpx.Response", attempt: int) -> float:
    header = response.headers.get("retry-after")
    if header:
        try:
            return min(float(header), 30.0)
        except ValueError:
            pass
    # Exponential backoff: 2s, 4s, 8s.
    return _BASE_BACKOFF_S * (2 ** attempt)


def _provider_error(response: "httpx.Response") -> str:
    """
    Pull the provider's own explanation out of an error body.

    Google, OpenAI and Anthropic all nest it under `error.message`, and it is
    the only part worth showing: "Vertex AI API has not been used in project X"
    tells you exactly what to fix, where `HTTP 403` does not.
    """
    try:
        payload = response.json()
    except Exception:  # noqa: BLE001 - non-JSON error body
        return (response.text or "")[:400]
    err = payload.get("error")
    if isinstance(err, dict):
        return str(err.get("message") or err)[:600]
    return str(err or payload)[:400]


async def _post_with_retry(url: str, *, json: dict, headers: dict) -> "httpx.Response":
    """POST with bounded retry on rate limits and transient server errors."""
    last: Optional[httpx.Response] = None
    async with httpx.AsyncClient(timeout=settings.VLM_TIMEOUT_S) as client:
        for attempt in range(_MAX_ATTEMPTS):
            r = await client.post(url, json=json, headers=headers)
            if r.status_code not in _RETRY_STATUS:
                if r.status_code >= 400:
                    # Surface the provider's message, not just the status line -
                    # this is what ends up in the ToolResult and the trace.
                    raise VLMProviderError(
                        f"HTTP {r.status_code}: {_provider_error(r)}")
                return r
            last = r
            if attempt < _MAX_ATTEMPTS - 1:
                delay = _retry_after_seconds(r, attempt)
                log.warning("VLM provider returned %s; retrying in %.1fs (attempt %d/%d)",
                            r.status_code, delay, attempt + 1, _MAX_ATTEMPTS)
                await asyncio.sleep(delay)

    assert last is not None
    detail = _provider_error(last)
    if last.status_code == 429:
        raise VLMRateLimited(
            f"provider rate limit (HTTP 429) persisted after {_MAX_ATTEMPTS} attempts - "
            f"quota is likely exhausted; wait, or switch VLM_BACKEND. {detail}"
        )
    raise VLMRateLimited(
        f"provider returned HTTP {last.status_code} after {_MAX_ATTEMPTS} attempts: {detail}"
    )


# ---------------------------------------------------------------------------
# Backend descriptors
# ---------------------------------------------------------------------------
def _backend_spec(backend: Optional[str]) -> Dict[str, str]:
    backend = (backend or settings.VLM_BACKEND or "vertex").lower()
    specs = {
        "gemini": {
            "provider": "google-generativeai",
            "model": settings.GEMINI_MODEL,
            "api_key": settings.GEMINI_API_KEY,
            "key_env": "GEMINI_API_KEY",
        },
        "vertex": {
            "provider": "google-vertex-ai",
            "model": settings.VERTEX_MODEL,
            # Authenticated by service-account JSON, not an API key.  The
            # "api_key" slot carries the key path so the availability check
            # below stays uniform across backends.
            "api_key": settings.vertex_key_path if settings.vertex_project else "",
            "key_env": "VERTEX_KEY_PATH/GEE_KEY_PATH + VERTEX_PROJECT/GEE_PROJECT",
        },
        "gpt4v": {
            "provider": "openai",
            "model": settings.OPENAI_MODEL,
            "api_key": settings.OPENAI_API_KEY,
            "key_env": "OPENAI_API_KEY",
        },
        "claude": {
            "provider": "anthropic",
            "model": settings.ANTHROPIC_MODEL,
            "api_key": settings.ANTHROPIC_API_KEY,
            "key_env": "ANTHROPIC_API_KEY",
        },
    }
    if backend not in specs:
        raise VLMUnavailable(
            f"Unknown VLM backend {backend!r} - expected one of {sorted(specs)}"
        )
    spec = dict(specs[backend])
    spec["backend"] = backend
    return spec


def vlm_available(backend: Optional[str] = None) -> Tuple[bool, str]:
    """(available, reason).  Never raises - the input gate (§9.3) reads this."""
    if settings.OFFLINE_MODE:
        return False, "OFFLINE_MODE=true - hosted VLM is not offline-capable (PRD §11.5)"
    try:
        spec = _backend_spec(backend)
    except VLMUnavailable as e:
        return False, str(e)

    if spec["backend"] == "vertex":
        if not settings.vertex_project:
            return False, "VERTEX_PROJECT (or GEE_PROJECT) is not set"
        key = settings.vertex_key_path
        if not key:
            return False, "VERTEX_KEY_PATH (or GEE_KEY_PATH) is not set"
        if not os.path.exists(key):
            return False, f"Vertex service-account key not found at {key}"
        return True, (f"vertex -> {spec['model']} on {settings.vertex_project}"
                      f" ({settings.VERTEX_LOCATION})")

    if not spec["api_key"]:
        return False, f"{spec['key_env']} is not set"
    return True, f"{spec['backend']} -> {spec['model']}"


def gateway_status(backend: Optional[str] = None) -> Dict[str, Any]:
    """Served at GET /api/health/models and GET /health (§14)."""
    ok, reason = vlm_available(backend)
    try:
        spec = _backend_spec(backend)
    except VLMUnavailable:
        spec = {"backend": backend or settings.VLM_BACKEND,
                "provider": None, "model": None}
    return {
        "vlm_backend": spec["backend"],
        "provider": spec.get("provider"),
        "model": spec.get("model"),
        "configured": ok,
        "reason": reason,
        "offline_capable": False,
        "adaptation": "none - hosted general-purpose model, no fine-tuning",
    }


# ---------------------------------------------------------------------------
# Provider calls.  Raw HTTP via httpx - no provider SDKs, so the offline eval
# image stays small and no extra transitive deps enter requirements.txt.
# ---------------------------------------------------------------------------
def _gemini_body(images: List[bytes], instruction: str) -> Dict[str, Any]:
    """
    GenerateContent request body.  Shared verbatim by the AI Studio and Vertex
    transports - the two APIs take the same shape, only URL and auth differ.
    """
    parts: List[dict] = [
        {"inline_data": {"mime_type": "image/png",
                         "data": base64.b64encode(img).decode()}}
        for img in images
    ]
    parts.append({"text": instruction})

    gen_config: Dict[str, Any] = {
        "temperature": 0.0,
        "maxOutputTokens": settings.VLM_MAX_TOKENS,
    }
    if settings.GEMINI_THINKING_LEVEL:
        # Gemini 3.x reasons before emitting text and charges that to the output
        # budget.  Capping it keeps deterministic extraction cheap and stops the
        # answer being truncated away entirely.
        gen_config["thinkingConfig"] = {"thinkingLevel": settings.GEMINI_THINKING_LEVEL}

    return {
        "system_instruction": {"parts": [{"text": SYSTEM}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": gen_config,
    }


def _parse_gemini_response(data: Dict[str, Any]) -> Dict[str, Any]:
    """GenerateContent response -> the gateway's uniform result shape."""
    text = ""
    finish_reasons = []
    for cand in data.get("candidates", []):
        finish_reasons.append(cand.get("finishReason"))
        for part in cand.get("content", {}).get("parts", []):
            text += part.get("text", "")

    usage = data.get("usageMetadata", {})
    return {
        "text": text.strip(),
        "raw": data,
        "truncated": "MAX_TOKENS" in finish_reasons,
        "blocked": "SAFETY" in finish_reasons or "PROHIBITED_CONTENT" in finish_reasons,
        "thinking_tokens": usage.get("thoughtsTokenCount"),
    }


async def _call_gemini(spec, images: List[bytes], instruction: str) -> Dict[str, Any]:
    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           + spec["model"] + ":generateContent")
    r = await _post_with_retry(
        url, json=_gemini_body(images, instruction),
        headers={"x-goog-api-key": spec["api_key"],
                 "Content-Type": "application/json"})
    return _parse_gemini_response(r.json())


async def _call_openai(spec, images: List[bytes], instruction: str) -> Dict[str, Any]:
    content: List[dict] = [
        {"type": "image_url",
         "image_url": {"url": "data:image/png;base64,"
                              + base64.b64encode(img).decode()}}
        for img in images
    ]
    content.append({"type": "text", "text": instruction})
    body = {
        "model": spec["model"],
        "temperature": 0.0,
        "max_tokens": settings.VLM_MAX_TOKENS,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": content},
        ],
    }
    r = await _post_with_retry(
        "https://api.openai.com/v1/chat/completions", json=body,
        headers={"Authorization": "Bearer " + spec["api_key"],
                 "Content-Type": "application/json"})
    data = r.json()
    choices = data.get("choices") or [{}]
    text = choices[0].get("message", {}).get("content") or ""
    return {"text": text.strip(), "raw": data}


async def _call_anthropic(spec, images: List[bytes], instruction: str) -> Dict[str, Any]:
    content: List[dict] = [
        {"type": "image",
         "source": {"type": "base64", "media_type": "image/png",
                    "data": base64.b64encode(img).decode()}}
        for img in images
    ]
    content.append({"type": "text", "text": instruction})
    body = {
        "model": spec["model"],
        "system": SYSTEM,
        "temperature": 0.0,
        "max_tokens": settings.VLM_MAX_TOKENS,
        "messages": [{"role": "user", "content": content}],
    }
    r = await _post_with_retry(
        "https://api.anthropic.com/v1/messages", json=body,
        headers={"x-api-key": spec["api_key"],
                 "anthropic-version": "2023-06-01",
                 "Content-Type": "application/json"})
    data = r.json()
    text = "".join(b.get("text", "") for b in data.get("content", [])
                   if b.get("type") == "text")
    return {"text": text.strip(), "raw": data}


# ---------------------------------------------------------------------------
# Vertex AI transport.
#
# Same GenerateContent request/response shape as the AI Studio API, so the
# Gemini body builder is reused verbatim - only the URL and the auth differ.
# Auth is an OAuth token minted from the service-account JSON, cached until a
# minute before it expires.
# ---------------------------------------------------------------------------
_VERTEX_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
_vertex_creds = None


def _vertex_token() -> str:
    """Mint (or reuse) an OAuth access token for the Vertex service account."""
    global _vertex_creds
    from google.auth.transport.requests import Request
    from google.oauth2 import service_account

    key_path = settings.vertex_key_path
    if not key_path or not os.path.exists(key_path):
        raise VLMUnavailable(f"Vertex service-account key not found at {key_path!r}")

    if _vertex_creds is None or getattr(_vertex_creds, "_key_path", None) != key_path:
        _vertex_creds = service_account.Credentials.from_service_account_file(
            key_path, scopes=_VERTEX_SCOPES)
        _vertex_creds._key_path = key_path

    if not _vertex_creds.valid or _vertex_creds.expired:
        _vertex_creds.refresh(Request())
    return _vertex_creds.token


def _vertex_url(model: str) -> str:
    project = settings.vertex_project
    location = settings.VERTEX_LOCATION or "global"
    host = ("aiplatform.googleapis.com" if location == "global"
            else f"{location}-aiplatform.googleapis.com")
    return (f"https://{host}/v1/projects/{project}/locations/{location}"
            f"/publishers/google/models/{model}:generateContent")


async def _call_vertex(spec, images: List[bytes], instruction: str) -> Dict[str, Any]:
    if not settings.vertex_project:
        raise VLMUnavailable("VERTEX_PROJECT (or GEE_PROJECT) is not set")

    body = _gemini_body(images, instruction)
    # Minting the token does blocking I/O on first use / refresh.
    token = await asyncio.to_thread(_vertex_token)

    r = await _post_with_retry(
        _vertex_url(spec["model"]), json=body,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"})
    return _parse_gemini_response(r.json())


_DISPATCH = {
    "gemini": _call_gemini,
    "vertex": _call_vertex,
    "gpt4v": _call_openai,
    "claude": _call_anthropic,
}


async def vlm_call(images: List[bytes], instruction: str,
                   backend: str = "gemini") -> Dict[str, Any]:
    """
    Send images + instruction to the configured hosted vision API.

    Returns {"text": str, "raw": provider response, "backend":…, "model":…}.
    Raises VLMUnavailable when credentials are missing or OFFLINE_MODE is set.
    """
    ok, reason = vlm_available(backend)
    if not ok:
        raise VLMUnavailable(reason)
    if not images:
        raise VLMUnavailable("no model-ready images available for this scene")
    spec = _backend_spec(backend)
    out = await _DISPATCH[spec["backend"]](spec, images, instruction)
    out.setdefault("truncated", False)
    out.setdefault("blocked", False)
    out.setdefault("thinking_tokens", None)
    out["backend"] = spec["backend"]
    out["model"] = spec["model"]
    return out


def response_warnings(out: Dict[str, Any]) -> List[str]:
    """
    Provider-level problems worth surfacing in a ToolResult.  An empty response
    must never reach the user as a confident blank - it is reported as what it
    is: truncated, blocked, or simply empty.
    """
    warnings: List[str] = []
    if out.get("blocked"):
        warnings.append(
            "The VLM provider blocked this response under its safety filters - "
            "no analysis was returned."
        )
    if out.get("truncated"):
        warnings.append(
            "The VLM response hit the output-token ceiling"
            + (f" after {out['thinking_tokens']} reasoning tokens"
               if out.get("thinking_tokens") else "")
            + " and may be cut off. Raise VLM_MAX_TOKENS if this recurs."
        )
    if not (out.get("text") or "").strip():
        warnings.append("The VLM returned no text for this request.")
    return warnings


# ---------------------------------------------------------------------------
# Heuristic confidence - §7.1.
#
# NOT a calibrated score and NOT the old self-consistency signal.  It is a
# hedging-language score over the response text, and every ToolResult that
# uses it says so verbatim in confidence_basis.
# ---------------------------------------------------------------------------
_HEDGES = (
    "appears", "appear", "seems", "seem", "possibly", "perhaps", "maybe",
    "might", "may be", "could be", "likely", "unclear", "uncertain",
    "difficult to", "hard to", "insufficient", "ambiguous", "roughly",
    "approximately", "i think", "probably", "presumably", "suggests",
)
_REFUSALS = (
    "cannot", "can not", "can't", "unable to", "not visible", "no information",
    "not enough information", "not determinable", "not possible to", "not_found",
)
# Word-boundary matching: a substring test would score "significant" as a
# refusal (it contains "cant") and drag a perfectly confident answer to 0.15.
_REFUSAL_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(r) for r in _REFUSALS) + r")",
    re.IGNORECASE,
)


def heuristic_confidence(text: Optional[str]) -> float:
    """
    Hedging-language score in [0, 1].  Starts at 0.72 - an unadapted hosted VLM
    never earns a high prior on remote-sensing imagery - then subtracts for
    hedging language, and floors hard on refusal language.
    """
    if not text or not text.strip():
        return 0.0
    low = text.lower().replace("’", "'")

    if _REFUSAL_RE.search(low):
        # An honest "I cannot tell" is correct behaviour, but it is not an
        # answer - fusion and abstention (§9.7) must see it as low confidence.
        return 0.15

    score = 0.72
    hedge_hits = sum(1 for h in _HEDGES if h in low)
    score -= 0.08 * min(hedge_hits, 4)

    # Very short answers to open questions carry little evidence.
    if len(low.split()) < 3:
        score -= 0.05

    return round(max(0.05, min(0.85, score)), 3)


# ---------------------------------------------------------------------------
# Bounding-box parsing for rs_ground - §7.1 / §8.3.3.
#
# The fixed format is (x1,y1),(x2,y2) with values in [0,1].  If parsing fails
# or the box is out of range we return None; the tool then reports
# confidence=0.0 and an honest negative rather than guessing.
# ---------------------------------------------------------------------------
_NUM = r"[-+]?\d*\.?\d+"
_BOX_RE = re.compile(
    r"\(\s*(" + _NUM + r")\s*,\s*(" + _NUM + r")\s*\)\s*,\s*"
    r"\(\s*(" + _NUM + r")\s*,\s*(" + _NUM + r")\s*\)"
)


def parse_bbox(text: Optional[str]) -> Optional[List[float]]:
    """Parse `(x1,y1),(x2,y2)` normalised to [0,1].  Returns None on failure."""
    if not text:
        return None
    if "not_found" in text.lower():
        return None
    m = _BOX_RE.search(text)
    if not m:
        return None
    try:
        x1, y1, x2, y2 = (float(g) for g in m.groups())
    except ValueError:
        return None
    if x2 < x1:
        x1, x2 = x2, x1
    if y2 < y1:
        y1, y2 = y2, y1
    box = [x1, y1, x2, y2]
    if any(v < 0.0 or v > 1.0 for v in box):
        return None
    if (x2 - x1) <= 0.0 or (y2 - y1) <= 0.0:
        return None
    return [round(v, 5) for v in box]
