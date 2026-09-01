import math
import numpy as np
import pytest
from services.ingest.compatibility_checker import check_compatibility, estimate_shift, PASS, WARN, FAIL, NA


def _make_dummy_image(
    name: str = "img1",
    modality: str = "OPTICAL",
    crs: str = "EPSG:4326",
    bounds_wgs84: list = None,
    gsd_m: float = 10.0,
    georeferenced: bool = True,
    width: int = 512,
    height: int = 512,
    array: np.ndarray = None,
):
    if bounds_wgs84 is None:
        bounds_wgs84 = [78.0, 20.0, 78.1, 20.1]
    if array is None:
        array = (np.random.rand(width, height) * 255).astype(np.float32)
    return {
        "name": name,
        "modality": {"modality": modality},
        "crs": crs,
        "bounds_wgs84": bounds_wgs84,
        "gsd_m": gsd_m,
        "georeferenced": georeferenced,
        "width": width,
        "height": height,
        "array": array,
    }


def test_c1_image_count():
    """Test C1: Check image count matches declared config."""
    img1 = _make_dummy_image("img1")
    img2 = _make_dummy_image("img2")

    # SINGLE with 1 image -> PASS
    res1 = check_compatibility([img1], declared_config="SINGLE")
    assert res1["checks"][0]["status"] == PASS
    assert res1["verdict"] == PASS

    # SINGLE with 2 images -> FAIL
    res2 = check_compatibility([img1, img2], declared_config="SINGLE")
    assert res2["checks"][0]["status"] == FAIL
    assert res2["verdict"] == FAIL

    # CROSS_MODAL with 1 image -> FAIL
    res3 = check_compatibility([img1], declared_config="CROSS_MODAL")
    assert res3["checks"][0]["status"] == FAIL
    assert res3["verdict"] == FAIL


def test_c2_modality_pairing():
    """Test C2: Cross-modal requires SAR + Optical; Bi-temporal warns if different."""
    sar_img = _make_dummy_image("sar", modality="SAR")
    opt_img = _make_dummy_image("opt", modality="OPTICAL")
    opt_img2 = _make_dummy_image("opt2", modality="OPTICAL")

    # CROSS_MODAL with SAR + Optical -> PASS
    res_cm_pass = check_compatibility([sar_img, opt_img], declared_config="CROSS_MODAL")
    c2 = next(c for c in res_cm_pass["checks"] if c["name"] == "modality_pairing")
    assert c2["status"] == PASS

    # CROSS_MODAL with Optical + Optical -> FAIL
    res_cm_fail = check_compatibility([opt_img, opt_img2], declared_config="CROSS_MODAL")
    c2 = next(c for c in res_cm_fail["checks"] if c["name"] == "modality_pairing")
    assert c2["status"] == FAIL
    assert res_cm_fail["verdict"] == FAIL

    # BI_TEMPORAL with matching modalities -> PASS
    res_bt_pass = check_compatibility([opt_img, opt_img2], declared_config="BI_TEMPORAL")
    c2 = next(c for c in res_bt_pass["checks"] if c["name"] == "modality_pairing")
    assert c2["status"] == PASS

    # BI_TEMPORAL with differing modalities -> WARN
    res_bt_warn = check_compatibility([sar_img, opt_img], declared_config="BI_TEMPORAL")
    c2 = next(c for c in res_bt_warn["checks"] if c["name"] == "modality_pairing")
    assert c2["status"] == WARN


def test_c3_crs_match():
    """Test C3: Mismatched CRS produces WARN, matching produces PASS."""
    img1 = _make_dummy_image("img1", crs="EPSG:4326")
    img2_same = _make_dummy_image("img2", crs="EPSG:4326")
    img2_diff = _make_dummy_image("img2_diff", crs="EPSG:32643")

    res_pass = check_compatibility([img1, img2_same], declared_config="BI_TEMPORAL")
    c3_pass = next(c for c in res_pass["checks"] if c["name"] == "crs_match")
    assert c3_pass["status"] == PASS

    res_warn = check_compatibility([img1, img2_diff], declared_config="BI_TEMPORAL")
    c3_warn = next(c for c in res_warn["checks"] if c["name"] == "crs_match")
    assert c3_warn["status"] == WARN


def test_c4_spatial_overlap():
    """Test C4: Spatial overlap >= 90% PASS, 50-89% WARN, < 50% FAIL."""
    img1 = _make_dummy_image("img1", bounds_wgs84=[0.0, 0.0, 1.0, 1.0])

    # 100% overlap
    img_100 = _make_dummy_image("img_100", bounds_wgs84=[0.0, 0.0, 1.0, 1.0])
    res_100 = check_compatibility([img1, img_100], declared_config="BI_TEMPORAL")
    assert next(c for c in res_100["checks"] if c["name"] == "spatial_overlap")["status"] == PASS

    # 60% overlap (0.0, 0.0, 1.0, 0.6)
    img_60 = _make_dummy_image("img_60", bounds_wgs84=[0.0, 0.0, 1.0, 0.6])
    res_60 = check_compatibility([img1, img_60], declared_config="BI_TEMPORAL")
    assert next(c for c in res_60["checks"] if c["name"] == "spatial_overlap")["status"] == WARN

    # 20% overlap (0.0, 0.0, 1.0, 0.2)
    img_20 = _make_dummy_image("img_20", bounds_wgs84=[0.0, 0.0, 1.0, 0.2])
    res_20 = check_compatibility([img1, img_20], declared_config="BI_TEMPORAL")
    assert next(c for c in res_20["checks"] if c["name"] == "spatial_overlap")["status"] == FAIL
    assert res_20["verdict"] == FAIL


def test_c5_gsd_ratio():
    """Test C5: GSD ratio <= 2 PASS, <= 4 WARN, > 4 FAIL."""
    img1 = _make_dummy_image("img1", gsd_m=10.0)

    # 10m vs 15m (ratio 1.5) -> PASS
    img_pass = _make_dummy_image("pass", gsd_m=15.0)
    res_pass = check_compatibility([img1, img_pass], declared_config="BI_TEMPORAL")
    assert next(c for c in res_pass["checks"] if c["name"] == "gsd_ratio")["status"] == PASS

    # 10m vs 35m (ratio 3.5) -> WARN
    img_warn = _make_dummy_image("warn", gsd_m=35.0)
    res_warn = check_compatibility([img1, img_warn], declared_config="BI_TEMPORAL")
    assert next(c for c in res_warn["checks"] if c["name"] == "gsd_ratio")["status"] == WARN

    # 10m vs 60m (ratio 6.0) -> FAIL
    img_fail = _make_dummy_image("fail", gsd_m=60.0)
    res_fail = check_compatibility([img1, img_fail], declared_config="BI_TEMPORAL")
    assert next(c for c in res_fail["checks"] if c["name"] == "gsd_ratio")["status"] == FAIL
    assert res_fail["verdict"] == FAIL


def test_c6_co_registration_shift_synthetic_roll():
    """Test C6: Phase correlation against known synthetic pixel roll shift."""
    np.random.seed(42)
    base_pattern = np.zeros((512, 512), dtype=np.float32)
    # Add distinctive features
    base_pattern[100:200, 100:200] = 100.0
    base_pattern[300:350, 300:400] = 200.0

    img_a = _make_dummy_image("a", array=base_pattern.copy(), width=512, height=512)

    # Zero shift test -> PASS (shift ~ 0.0 px)
    img_same = _make_dummy_image("same", array=base_pattern.copy(), width=512, height=512)
    shift_0, _ = estimate_shift(img_a, img_same)
    assert abs(shift_0) < 0.5
    res_0 = check_compatibility([img_a, img_same], declared_config="BI_TEMPORAL")
    assert next(c for c in res_0["checks"] if c["name"] == "co_registration")["status"] == PASS

    # Rolled by dy=1, dx=1 -> total shift approx sqrt(2) approx 1.41 px (PASS <= 2.0)
    rolled_small = np.roll(np.roll(base_pattern, 1, axis=0), 1, axis=1)
    img_small_roll = _make_dummy_image("small", array=rolled_small, width=512, height=512)
    shift_small, _ = estimate_shift(img_a, img_small_roll)
    assert abs(shift_small - math.sqrt(2)) < 0.5

    # Rolled by dy=3, dx=4 -> shift approx 5.0 px (WARN between 2.0 and 8.0)
    rolled_warn = np.roll(np.roll(base_pattern, 3, axis=0), 4, axis=1)
    img_warn_roll = _make_dummy_image("warn", array=rolled_warn, width=512, height=512)
    shift_warn, _ = estimate_shift(img_a, img_warn_roll)
    assert abs(shift_warn - 5.0) < 0.5
    res_warn = check_compatibility([img_a, img_warn_roll], declared_config="BI_TEMPORAL")
    assert next(c for c in res_warn["checks"] if c["name"] == "co_registration")["status"] == WARN

    # Rolled by dy=9, dx=12 -> shift approx 15.0 px (FAIL > 8.0)
    rolled_fail = np.roll(np.roll(base_pattern, 9, axis=0), 12, axis=1)
    img_fail_roll = _make_dummy_image("fail", array=rolled_fail, width=512, height=512)
    shift_fail, _ = estimate_shift(img_a, img_fail_roll)
    assert abs(shift_fail - 15.0) < 1.0
    res_fail = check_compatibility([img_a, img_fail_roll], declared_config="BI_TEMPORAL")
    assert next(c for c in res_fail["checks"] if c["name"] == "co_registration")["status"] == FAIL
    assert res_fail["verdict"] == FAIL


# ---------------------------------------------------------------------------
# C6 regression: optical/SAR co-registration.
#
# Phase correlation between optical and SAR intensities is noise - they measure
# different physics. Letting that noise drive the verdict rejected genuinely
# well-aligned Sentinel-2 + Sentinel-1 pairs with ~65 px of imaginary shift.
# ---------------------------------------------------------------------------
def test_c6_cross_modal_uses_geotransform_not_intensity_correlation():
    from services.ingest.compatibility_checker import co_registration_estimate

    np.random.seed(7)
    # Same footprint, but radiometrically unrelated content - as optical and
    # SAR always are, even over the identical patch of ground.
    optical = _make_dummy_image(
        "opt", modality="OPTICAL", width=256, height=256,
        bounds_wgs84=[73.8417, 18.4488, 73.8598, 18.4668],
        array=(np.random.rand(256, 256) * 255).astype(np.float32))
    sar = _make_dummy_image(
        "sar", modality="SAR", width=256, height=256,
        bounds_wgs84=[73.8417, 18.4488, 73.8598, 18.4668],
        array=(np.random.rand(256, 256) ** 3 * 255).astype(np.float32))

    shift, method, _ = co_registration_estimate(optical, sar)
    assert method == "geotransform", "cross-modal must not trust intensity correlation"
    assert shift is not None and shift < 0.01, f"identical footprints -> ~0 px, got {shift}"

    res = check_compatibility([optical, sar], declared_config="CROSS_MODAL")
    coreg = next(c for c in res["checks"] if c["name"] == "co_registration")
    assert coreg["status"] == PASS
    assert res["verdict"] != FAIL, "a well-georeferenced optical+SAR pair must not be rejected"


def test_c6_cross_modal_detects_a_real_grid_offset():
    """The geotransform path must still catch genuinely offset footprints."""
    from services.ingest.compatibility_checker import co_registration_estimate

    optical = _make_dummy_image("opt", modality="OPTICAL", width=100, height=100,
                                bounds_wgs84=[78.0, 20.0, 78.1, 20.1])
    # Shift the SAR footprint east by 10% of the frame = 10 px.
    sar = _make_dummy_image("sar", modality="SAR", width=100, height=100,
                            bounds_wgs84=[78.01, 20.0, 78.11, 20.1])

    shift, method, _ = co_registration_estimate(optical, sar)
    assert method == "geotransform"
    assert abs(shift - 10.0) < 0.5, f"expected ~10 px, got {shift}"

    res = check_compatibility([optical, sar], declared_config="CROSS_MODAL")
    coreg = next(c for c in res["checks"] if c["name"] == "co_registration")
    assert coreg["status"] == FAIL


def test_c6_same_modality_still_catches_content_offset():
    """
    Identical geotransforms but shifted pixels means the product's own
    georeferencing is wrong - still a real misregistration, still detected.
    """
    from services.ingest.compatibility_checker import co_registration_estimate

    base = np.zeros((512, 512), dtype=np.float32)
    base[100:200, 100:200] = 100.0
    base[300:350, 300:400] = 200.0
    a = _make_dummy_image("a", array=base.copy(), width=512, height=512)
    b = _make_dummy_image("b", array=np.roll(np.roll(base, 3, 0), 4, 1),
                          width=512, height=512)

    shift, method, note = co_registration_estimate(a, b)
    assert method == "phase_correlation"
    assert abs(shift - 5.0) < 0.5
    assert "georeferencing may be wrong" in note


def test_c6_unreferenced_cross_modal_can_warn_but_never_fails():
    """Benchmark PNGs have no geotransform; an edge-correlation guess must not reject."""
    np.random.seed(11)
    optical = _make_dummy_image("opt", modality="OPTICAL", georeferenced=False,
                                bounds_wgs84=None, crs=None, width=256, height=256,
                                array=(np.random.rand(256, 256) * 255).astype(np.float32))
    sar = _make_dummy_image("sar", modality="SAR", georeferenced=False,
                            bounds_wgs84=None, crs=None, width=256, height=256,
                            array=(np.random.rand(256, 256) * 255).astype(np.float32))

    res = check_compatibility([optical, sar], declared_config="CROSS_MODAL",
                              benchmark_mode=True)
    coreg = next(c for c in res["checks"] if c["name"] == "co_registration")
    assert coreg["status"] in (PASS, WARN)
    assert coreg["status"] != FAIL
