from typing import Any, Dict, List

SAR_TAG_HINTS = ("sar", "risat", "sentinel-1", "s1a", "s1b", "radar", "vv", "vh", "hh", "hv")
OPT_TAG_HINTS = ("cartosat", "sentinel-2", "s2a", "s2b", "landsat", "resourcesat", "liss", "msi")


def detect_modality(meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evidence-based scored heuristics to detect if a raster is SAR, OPTICAL, MULTISPECTRAL,
    or AMBIGUOUS (when confidence < 0.35).
    """
    evidence: List[str] = []
    sar_score = 0.0
    opt_score = 0.0

    tags = meta.get("tags", {}) or {}
    tag_blob = " ".join(f"{k}={v}" for k, v in tags.items()).lower()
    
    band_stats = meta.get("band_stats", []) or []
    desc_blob = " ".join((b.get("description") or "") for b in band_stats).lower()

    # 1. Metadata tags are the strongest signal when present
    sar_tag_matched = any(h in tag_blob or h in desc_blob for h in SAR_TAG_HINTS)
    opt_tag_matched = any(h in tag_blob or h in desc_blob for h in OPT_TAG_HINTS)

    if sar_tag_matched:
        sar_score += 0.5
        evidence.append("SAR platform/polarisation keyword in metadata")
    if opt_tag_matched:
        opt_score += 0.5
        evidence.append("Optical platform keyword in metadata")

    # 2. Band count: S1 GRD = 1-2 bands; S2 = 10-13; Cartosat pan = 1; RGB = 3
    n = meta.get("band_count", 0)
    if n in (1, 2):
        sar_score += 0.2
        evidence.append(f"{n} band(s) consistent with SAR polarisations")
    elif n == 3:
        opt_score += 0.25
        evidence.append("3 bands consistent with RGB optical")
    elif n >= 4:
        opt_score += 0.35
        evidence.append(f"{n} bands consistent with multispectral")

    # 3. Statistical signature: SAR amplitude is right-skewed with speckle;
    #    optical reflectance is comparatively symmetric.
    if band_stats and len(band_stats) > 0:
        b0 = band_stats[0]
        std = b0.get("std", 0.0)
        mean = b0.get("mean", 0.0)
        if std > 0 and mean > 0:
            cv = std / mean
            if cv > 0.8:
                sar_score += 0.25
                evidence.append(f"High coefficient of variation ({cv:.2f}) indicates speckle")
            elif cv < 0.5:
                opt_score += 0.15
                evidence.append(f"Low coefficient of variation ({cv:.2f}) indicates optical reflectance")

    # 4. dtype: SAR products are commonly float32; optical commonly uint8/uint16
    dtypes = meta.get("dtypes", [])
    if dtypes:
        first_dtype = dtypes[0].lower()
        if "float" in first_dtype:
            sar_score += 0.1
        elif first_dtype in ("uint8", "uint16", "int16"):
            opt_score += 0.1

    conf = abs(sar_score - opt_score) / max(sar_score + opt_score, 1e-6)
    conf_rounded = round(min(conf, 1.0), 3)

    is_ambiguous = conf_rounded < 0.35
    if is_ambiguous:
        modality = "AMBIGUOUS"
        evidence.append(f"Low detection confidence ({conf_rounded:.2f}); manual confirmation required")
    else:
        if sar_score > opt_score:
            modality = "SAR"
        else:
            modality = "MULTISPECTRAL" if n >= 4 else "OPTICAL"

    return {
        "modality": modality,
        "confidence": conf_rounded,
        "evidence": evidence,
        "is_ambiguous": is_ambiguous,
        "sar_score": round(sar_score, 3),
        "opt_score": round(opt_score, 3),
    }
