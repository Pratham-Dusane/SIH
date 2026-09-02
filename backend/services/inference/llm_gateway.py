"""
LLM Gateway for Text Reasoning & Planning.

Supports:
1. Ollama local models (e.g. Qwen3 14B / Qwen2.5 14B / Phi-3 Mini)
2. Vertex AI / Gemini cloud models
3. Graceful fallback between local and cloud backends
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

import httpx

from core.config import settings

log = logging.getLogger(__name__)


class LLMUnavailable(RuntimeError):
    """Raised when the requested LLM backend is not reachable or fails."""
    pass


async def _call_ollama(
    prompt: str,
    system: str = "",
    model: str = "qwen3:14b",
    json_mode: bool = True,
    timeout: float = 20.0,
) -> Dict[str, Any]:
    """Call Ollama chat API with JSON format enforcement."""
    base_url = getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
    url = f"{base_url.rstrip('/')}/api/chat"

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "top_p": 0.9,
        },
    }
    if json_mode:
        payload["format"] = "json"

    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(url, json=payload)
        if res.status_code != 200:
            raise LLMUnavailable(f"Ollama returned status {res.status_code}: {res.text[:200]}")
        data = res.json()
        raw_text = data.get("message", {}).get("content", "")
        return {
            "backend": "ollama",
            "model": model,
            "text": raw_text,
        }


async def _call_vertex_llm(
    prompt: str,
    system: str = "",
    model: str = "gemini-2.5-flash",
    json_mode: bool = True,
    timeout: float = 20.0,
) -> Dict[str, Any]:
    """Call Vertex AI generateContent REST endpoint with OAuth token."""
    from services.inference.vlm_gateway import _vertex_token, _vertex_url, _parse_gemini_response, _post_with_retry

    project = settings.vertex_project
    if not project:
        raise LLMUnavailable("VERTEX_PROJECT (or GEE_PROJECT) is not set")

    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    generation_config: Dict[str, Any] = {
        "temperature": 0.1,
    }
    if json_mode:
        generation_config["response_mime_type"] = "application/json"

    body: Dict[str, Any] = {
        "contents": contents,
        "generation_config": generation_config,
    }
    if system:
        body["system_instruction"] = {"parts": [{"text": system}]}

    token = await asyncio.to_thread(_vertex_token)
    url = _vertex_url(model)

    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            url,
            json=body,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        if res.status_code != 200:
            raise LLMUnavailable(f"Vertex returned status {res.status_code}: {res.text[:200]}")
        data = res.json()
        parsed = _parse_gemini_response(data)
        return {
            "backend": "vertex",
            "model": model,
            "text": parsed.get("text", ""),
        }


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Robustly extract and parse JSON object from raw LLM output text."""
    text = text.strip()
    # Direct JSON parse attempt
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    # Extract between markdown code fences
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except Exception:
            pass

    # Extract outermost braces
    brace_match = re.search(r"(\{.*\})", text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(1))
        except Exception:
            pass

    return None


async def call_llm_json(
    prompt: str,
    system: str = "",
    prefer_backend: str = "auto",
    prefer_model: Optional[str] = None,
    timeout: float = 15.0,
) -> Tuple[Dict[str, Any], str]:
    """
    Execute structured JSON completion using Ollama or Vertex AI with seamless fallback.
    Returns: (parsed_json_dict, backend_info_string)
    """
    backends_to_try = []

    if prefer_backend == "ollama":
        backends_to_try = ["ollama", "vertex"]
    elif prefer_backend == "vertex":
        backends_to_try = ["vertex", "ollama"]
    else:  # auto
        backends_to_try = ["ollama", "vertex"]

    last_err: Optional[Exception] = None

    for backend in backends_to_try:
        try:
            if backend == "ollama":
                model_name = prefer_model or getattr(settings, "OLLAMA_PLANNER_MODEL", "qwen3:14b")
                # Try with short timeout to detect if Ollama daemon is active
                res = await _call_ollama(prompt, system=system, model=model_name, json_mode=True, timeout=min(timeout, 8.0))
            else:
                # Use standard Vertex model (ensure no Ollama tags like "phi3:mini" or "qwen3:14b" are sent to Vertex)
                model_name = getattr(settings, "VERTEX_MODEL", "gemini-2.5-flash")
                if prefer_model and not (":" in prefer_model or "qwen" in prefer_model or "phi" in prefer_model or "llama" in prefer_model):
                    model_name = prefer_model
                res = await _call_vertex_llm(prompt, system=system, model=model_name, json_mode=True, timeout=timeout)

            parsed = _extract_json(res["text"])
            if parsed is not None:
                return parsed, f"{res['backend']}:{res['model']}"
            else:
                log.warning("LLM (%s) did not return valid JSON: %s", res['backend'], res['text'][:200])
        except Exception as e:
            last_err = e
            log.info("Backend %s unavailable for LLM JSON call, trying next: %s", backend, e)

    raise LLMUnavailable(f"All LLM backends failed. Last error: {last_err}")
