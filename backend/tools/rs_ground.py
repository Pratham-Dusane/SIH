"""
rs_ground tool - PRD §7.1, §8.3.3.  Text-guided region grounding (R3).

There is no dedicated grounding model any more (M3 no longer exists).  The VLM
is asked directly for a normalised bounding box in the fixed `(x1,y1),(x2,y2)`
format and the answer is parsed.

If parsing fails or the box is out of range, this returns `confidence=0.0` and
`text="No region matching '<phrase>' could be located"` rather than guessing -
the same honest-negative contract as the old M3 fallback path (old §8.3.3).

Confidence is the VLM's self-reported certainty language, heuristically scored,
**not a detector's softmax**.  `confidence_basis` says so explicitly so a judge
does not mistake it for calibrated detector output.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from tools._backends import error_result, unavailable_result
from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register
from services.inference.vlm_gateway import (
    TEMPLATES, VLMUnavailable, heuristic_confidence, parse_all_bboxes, parse_bbox,
    response_warnings, vlm_available, vlm_call,
)

BACKEND_LABEL = "the hosted VLM gateway (backend V1)"


class RSGroundParams(ToolParams):
    phrase: str


def _boxes_to_geojson(boxes: List[List[float]], bounds: Optional[List[float]],
                      phrase: str) -> Optional[Dict[str, Any]]:
    """
    Normalised [[x1,y1,x2,y2], ...] -> EPSG:4326 GeoJSON FeatureCollection.
    """
    if not bounds or len(bounds) != 4 or not boxes:
        return None
    w, s, e, n = (float(v) for v in bounds)
    features = []
    for idx, box in enumerate(boxes, 1):
        x1, y1, x2, y2 = box
        lng1, lng2 = w + x1 * (e - w), w + x2 * (e - w)
        lat1, lat2 = n - y1 * (n - s), n - y2 * (n - s)
        ring = [[lng1, lat1], [lng2, lat1], [lng2, lat2], [lng1, lat2], [lng1, lat1]]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {"phrase": phrase, "source": "rs_ground", "model_id": "V1", "index": idx},
        })
    return {
        "type": "FeatureCollection",
        "features": features,
    }


def _box_to_geojson(box: List[float], bounds: Optional[List[float]],
                    phrase: str) -> Optional[Dict[str, Any]]:
    return _boxes_to_geojson([box], bounds, phrase)


@register
class RSGroundTool(Tool):
    name = "rs_ground"
    description = (
        "Locate all distinct regions or instances matching a text description, returning "
        "normalised bounding boxes (and GeoJSON polygons when the scene is "
        "georeferenced). Backed by a hosted general-purpose vision model. "
        "Returns explicit negative if nothing matches. Requires network access."
    )
    accepts: list = ["SINGLE", "CROSS_MODAL"]
    required_modalities: list = []
    params_model = RSGroundParams
    produces: list = ["boxes", "geojson"]
    model_id = "V1"
    offline_capable = False

    async def run(self, ctx, p: RSGroundParams) -> ToolResult:
        not_found_text = f"No region matching '{p.phrase}' could be located"

        ok, reason = vlm_available(getattr(ctx, "vlm_backend", None))
        if not ok:
            return unavailable_result(self.name, self.model_id, reason, BACKEND_LABEL)

        imgs = ctx.model_ready_images()
        instruction = TEMPLATES["ground"].format(phrase=p.phrase)
        try:
            out = await vlm_call(imgs, instruction, backend=ctx.vlm_backend)
        except VLMUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        model_version = f"{out['backend']}:{out['model']}"
        boxes = parse_all_bboxes(out["text"])

        if not boxes:
            # Parsing failed or the box was out of range - honest negative.
            return ToolResult(
                tool=self.name,
                model_id="V1",
                model_version=model_version,
                text=not_found_text,
                facts={"phrase": p.phrase, "boxes": [], "box_count": 0, "raw_response": out["text"]},
                confidence=0.0,
                confidence_basis=(
                    "no parseable normalised bounding box in the VLM response - "
                    "honest negative, not a low-scoring detection"
                ),
                warnings=["rs_ground returned no box: response did not contain a "
                          "valid (x1,y1),(x2,y2) in [0,1]"] + response_warnings(out),
            )

        bounds = ctx.scene_bounds_wgs84() if hasattr(ctx, "scene_bounds_wgs84") else None
        geojson = _boxes_to_geojson(boxes, bounds, p.phrase)

        ctx.store_artifact("ground_boxes", boxes)
        artifacts: Dict[str, Any] = {"boxes": boxes}
        if geojson is not None:
            ctx.store_artifact("ground_geojson", geojson)
            artifacts["geojson"] = geojson

        conf = heuristic_confidence(out["text"])
        total_area_frac = sum((b[2] - b[0]) * (b[3] - b[1]) for b in boxes)

        if len(boxes) == 1:
            box = boxes[0]
            text = (f"Located '{p.phrase}' at normalised box "
                    f"({box[0]:.3f},{box[1]:.3f}),({box[2]:.3f},{box[3]:.3f}) - "
                    f"{(box[2]-box[0])*(box[3]-box[1]) * 100:.1f}% of the image footprint.")
        else:
            text = (f"Located {len(boxes)} distinct regions matching '{p.phrase}' "
                    f"occupying {total_area_frac * 100:.1f}% total coverage across disconnected instances.")

        if geojson is None:
            text += ("  Scene is not georeferenced, so no map coordinates are "
                     "reported for these boxes.")

        return ToolResult(
            tool=self.name,
            model_id="V1",
            model_version=model_version,
            text=text,
            facts={
                "phrase": p.phrase,
                "boxes": boxes,
                "box_count": len(boxes),
                "box_area_fraction": round(total_area_frac, 5),
                "georeferenced": geojson is not None,
                "raw_response": out["text"],
            },
            artifacts=artifacts,
            confidence=round(conf, 3),
            confidence_basis=(
                "heuristic hedging-language score on the VLM's own certainty "
                "language - this is NOT a detector softmax and is not calibrated"
            ),
            warnings=response_warnings(out),
        )
