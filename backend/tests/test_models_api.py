"""
SatQuery AI — Unit Tests for Models API & Model Registry (PRD §7.7)
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from services.model_registry import get_all_cards, get_card

client = TestClient(app)


def test_model_registry_service():
    cards = get_all_cards()
    assert len(cards) >= 2

    m1 = get_card("M1")
    assert m1 is not None
    assert m1["name"] == "rs-clip-dual-encoder"
    assert "metrics" in m1
    assert "fused_mAP" in m1["metrics"]

    m2 = get_card("M2")
    assert m2 is not None
    assert m2["name"] == "rs-vlm-qwen2vl-lora"
    assert "rsvqa_lr_val_acc" in m2["metrics"]


def test_models_api_endpoints():
    response = client.get("/api/models")
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert data["count"] >= 2

    # GET M1 detail
    resp_m1 = client.get("/api/models/M1")
    assert resp_m1.status_code == 200
    assert resp_m1.json()["model_id"] == "M1"

    # GET non-existent model
    resp_404 = client.get("/api/models/UNKNOWN")
    assert resp_404.status_code == 404
