"""
Parameter whitelisting — PRD §8.4 (R9).

Enforced in three layers so no single mistake opens the gate:
1. Schema: ToolParams.model_config = ConfigDict(extra='forbid')
2. Range: every numeric parameter carries ge/le; every string choice is a Literal.
3. Audit: executor records params_requested and params_applied separately in the trace.
"""

from __future__ import annotations

from typing import List, Tuple

from pydantic import ValidationError

from tools.base import Tool, ToolParams


def bind_params(tool: Tool, requested: dict) -> Tuple[ToolParams, List[str]]:
    """
    Validate and bind requested parameters against the tool's params_model.

    Returns (params, warnings).  Non-permitted or out-of-range keys are
    silently dropped and logged as warnings.  Raises if a *required* field
    was among the rejected set.
    """
    warnings: List[str] = []
    try:
        return tool.params_model(**requested), warnings
    except ValidationError as e:
        rejected = set()
        for err in e.errors():
            if err.get("loc"):
                rejected.add(str(err["loc"][0]))
        cleaned = {k: v for k, v in requested.items() if k not in rejected}
        warnings.append(f"Rejected non-permitted or invalid parameters: {sorted(rejected)}")
        # This will raise again if a required field was in the rejected set —
        # that's intentional; a missing required param is a hard error.
        return tool.params_model(**cleaned), warnings
