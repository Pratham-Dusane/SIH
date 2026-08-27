"""
Backend cards — PRD §7.6.

Replaces the old `model_card.json` (old §7.7): no training lineage exists to
record, because nothing was fine-tuned.  `GET /api/models` (§14) serves these
instead of trained-model cards.

The static card text lives in `cards/backend_card.json`; live state (which
provider/model is actually configured, whether Earth Engine initialised) is
merged in at read time so the page can never claim a backend is running when
it is not.  In Firestore this becomes one `models/{modelId}` document per card
with an `active: bool` field (§13).

**When a judge asks "what exactly did you fine-tune?", this must say plainly:
nothing — and point to §7.0.**
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

CARDS_PATH = Path(__file__).resolve().parent.parent / "cards" / "backend_card.json"

R1_DISCLOSURE = (
    "No component of this system was fine-tuned on remote-sensing data. "
    "Requirement R1 (an RS-adapted visual/VL component) is NOT ATTEMPTED in this "
    "version — see PRD §7.0 for the trade-off that was made and what it costs. "
    "Perception comes from a hosted general-purpose VLM and from Google Earth "
    "Engine catalog products, neither of which is remote-sensing-adapted by us."
)


def _static_cards() -> List[Dict[str, Any]]:
    with open(CARDS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_backend_cards() -> List[Dict[str, Any]]:
    """Backend cards with live `active` state and the resolved provider merged in."""
    from core.config import settings
    from core.gee import gee_available
    from services.inference.vlm_gateway import gateway_status

    vlm = gateway_status()
    gee_ok, gee_reason = gee_available()

    cards = []
    for card in _static_cards():
        card = dict(card)
        bid = card.get("backend_id")

        if bid == "V1":
            # The PRD's example card names `gemini-1.5-pro-vision`; the actually
            # configured provider/model is authoritative and is reported here.
            card["provider_configured"] = f"{vlm['provider']}:{vlm['model']}"
            card["vlm_backend"] = vlm["vlm_backend"]
            card["active"] = bool(vlm["configured"])
            card["status_reason"] = vlm["reason"]
        elif bid in ("G1", "G2", "G3"):
            card["active"] = bool(gee_ok)
            card["status_reason"] = gee_reason
            card["gee_project"] = settings.GEE_PROJECT or None
        else:
            card["active"] = True
            card["status_reason"] = "local computation — always available"

        card["r1_status"] = "NOT_ATTEMPTED"
        cards.append(card)

    return cards


def fine_tuning_disclosure() -> Dict[str, Any]:
    """The plain-language answer to 'what did you fine-tune?' — §7.6."""
    return {
        "fine_tuned_components": [],
        "r1_status": "NOT_ATTEMPTED",
        "statement": R1_DISCLOSURE,
        "prd_reference": "§7.0",
    }
