import io
import sys
from pathlib import Path

import pytest

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import core.gee as _gee  # noqa: E402

# Captured before any fixture stubs it out, so `real_settings` can put it back.
_REAL_INIT_GEE = _gee.init_gee


# ---------------------------------------------------------------------------
# --live: opt in to the tests that make real network calls
# ---------------------------------------------------------------------------
def pytest_addoption(parser):
    parser.addoption("--live", action="store_true", default=False,
                     help="run the live backend tests that make real network calls")


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "live: makes real network calls; requires --live and real credentials")


def pytest_collection_modifyitems(config, items):
    if config.getoption("--live"):
        return
    skip = pytest.mark.skip(reason="live backend test — run with --live")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)


# ---------------------------------------------------------------------------
# Hermeticity
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def no_network_by_default(monkeypatch):
    """
    Keep the suite hermetic.

    Once a real `.env` exists, anything that calls `gee_available()` or
    `vlm_available()` would reach out to Google — making tests slow, flaky, and
    impossible to run in the `--network none` offline evaluation container the
    PRD requires (§11.5).  Earth Engine init is stubbed to a clean "unavailable"
    and the VLM keys are blanked; tests that need a backend to look available
    monkeypatch it explicitly, and live tests use `real_settings`.
    """
    from core.config import settings

    monkeypatch.setattr(_gee, "init_gee", lambda force=False: False)
    monkeypatch.setitem(_gee._STATE, "attempted", True)
    monkeypatch.setitem(_gee._STATE, "initialized", False)
    monkeypatch.setitem(_gee._STATE, "reason", "stubbed unavailable in tests")

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    monkeypatch.setattr(settings, "OFFLINE_MODE", False)


@pytest.fixture
def real_settings(monkeypatch):
    """Undo the hermetic stubs for a test that genuinely wants the real backends."""
    from core.config import Settings, settings as live

    fresh = Settings()
    for field in fresh.model_fields:
        monkeypatch.setattr(live, field, getattr(fresh, field))

    monkeypatch.setattr(_gee, "init_gee", _REAL_INIT_GEE)
    monkeypatch.setitem(_gee._STATE, "attempted", False)
    monkeypatch.setitem(_gee._STATE, "initialized", False)
    monkeypatch.setitem(_gee._STATE, "reason", "not attempted")
    return live


# ---------------------------------------------------------------------------
# Backend-availability doubles for gate tests
# ---------------------------------------------------------------------------
@pytest.fixture
def all_backends_available(monkeypatch):
    """
    Pretend every hosted backend (V1 VLM, G1/G2 Earth Engine) is reachable.

    The input gate refuses a task whose only backend is unconfigured (PRD §7.2),
    which is correct but makes scene-level gating tests depend on whether the
    developer happens to have API keys in their environment.  Tests that are
    about *scene* validity use this fixture; tests that are about capability
    reporting assert on the real availability path instead.
    """
    import agent.input_gate as gate

    def _all_ok():
        return {
            bid: {"available": True, "reason": "stubbed available in tests",
                  "label": gate.BACKEND_LABELS[bid], "offline_capable": False}
            for bid in ("V1", "G1", "G2")
        }

    monkeypatch.setattr(gate, "backend_capabilities", _all_ok)
    return _all_ok


@pytest.fixture
def no_backends_available(monkeypatch):
    """Pretend every hosted backend is unreachable."""
    import agent.input_gate as gate

    def _none_ok():
        return {
            bid: {"available": False, "reason": "stubbed unavailable in tests",
                  "label": gate.BACKEND_LABELS[bid], "offline_capable": False}
            for bid in ("V1", "G1", "G2")
        }

    monkeypatch.setattr(gate, "backend_capabilities", _none_ok)
    return _none_ok


# ---------------------------------------------------------------------------
# A georeferenced scene + ExecutionContext for the live tests
# ---------------------------------------------------------------------------
class _LiveImage:
    def __init__(self, role, acquired_at, bounds):
        self.role = role
        self.acquired_at = acquired_at
        self.object_path = f"{role}.tif"
        self.preview_path = None

        class _Meta:
            pass
        self.metadata = _Meta()
        self.metadata.bounds_wgs84 = bounds
        self.metadata.georeferenced = True
        self.metadata.gsd_m = self.metadata.gsd_x = self.metadata.gsd_y = 10.0
        self.metadata.tags = {}

        class _Mod:
            modality = "OPTICAL"
        self.modality = _Mod()


class _LiveScene:
    """~10 km AOI over Bengaluru — real Sentinel-2 and Dynamic World coverage."""
    BOUNDS = [77.55, 12.90, 77.65, 13.00]

    def __init__(self, input_config):
        self.id, self.workspace_id = "live_scene", "ws_live"
        self.input_config = input_config
        self.modalities = ["OPTICAL"]
        self.coreg_shift_px = 1.2
        self.benchmark_mode = False
        self.roi = None
        self.compatibility = None
        if input_config == "BI_TEMPORAL":
            self.images = [_LiveImage("t1", "2020-01-15", self.BOUNDS),
                           _LiveImage("t2", "2023-01-15", self.BOUNDS)]
        else:
            self.images = [_LiveImage("single", "2023-02-15", self.BOUNDS)]

    def bounds_wgs84(self):
        return list(self.BOUNDS)

    def acquisition_window(self):
        dates = sorted(i.acquired_at for i in self.images)
        return (dates[0], dates[-1]) if len(dates) > 1 else ("2023-01-01", "2023-03-31")

    @property
    def t1_date(self):
        return next((i.acquired_at for i in self.images if i.role == "t1"), None)

    @property
    def t2_date(self):
        return next((i.acquired_at for i in self.images if i.role == "t2"), None)


class _LiveStorage:
    def __init__(self, root):
        self.root = root

    def local_path(self, path):
        p = Path(self.root) / path
        p.parent.mkdir(parents=True, exist_ok=True)
        return str(p)


def _synthetic_tile(kind):
    import numpy as np
    from PIL import Image

    a = np.zeros((320, 320, 3), dtype="uint8")
    a[:100] = (28, 62, 138)
    if kind == "t2":
        a[100:210] = (46, 118, 52)
        a[210:] = (168, 166, 160)
    else:
        a[100:] = (46, 118, 52)
    buf = io.BytesIO()
    Image.fromarray(a).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def live_ctx(tmp_path):
    """Factory: live_ctx("SINGLE") or live_ctx("BI_TEMPORAL")."""
    from agent.context import ExecutionContext

    def _make(input_config="SINGLE"):
        scene = _LiveScene(input_config)
        ctx = ExecutionContext(scene=scene, storage=_LiveStorage(tmp_path),
                               vlm_backend=None)
        from core.config import settings
        ctx.vlm_backend = settings.VLM_BACKEND
        kinds = ["t1", "t2"] if input_config == "BI_TEMPORAL" else ["single"]
        ctx.model_ready_images = lambda: [_synthetic_tile(k) for k in kinds]
        return ctx

    return _make
