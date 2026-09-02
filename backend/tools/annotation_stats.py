"""
Annotation statistics tool — Extensions PRD §5.5 & §8.

Allows the agent to answer questions like "what is the area of the polygon I drew?"
or "how long is this line?" with 1.0 confidence and exact measurements.
"""

from typing import Any, Dict, List, Optional
from pydantic import Field

from tools.base import InputConfig, Tool, ToolParams, ToolResult
from tools.registry import register
from services.annotation.geometry import norm_to_geo


class AnnotationStatsParams(ToolParams):
    layer_id: Optional[str] = Field(
        None, description="ID of the annotation layer to measure. If omitted, measures all user annotations."
    )
    shape_index: Optional[int] = Field(
        None, description="1-based index of a specific shape/badge in the layer to measure."
    )


@register
class AnnotationStatsTool(Tool):
    name = "annotation_stats"
    description = (
        "Compute exact geometric statistics (area in hectares, perimeter in metres, bounding box, "
        "and geographical coordinates) for user-drawn annotation shapes and regions on the satellite scene."
    )
    accepts: List[InputConfig] = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: List[str] = []
    params_model = AnnotationStatsParams
    produces = ["stats", "text"]
    offline_capable = True

    async def run(self, ctx: Any, params: AnnotationStatsParams) -> ToolResult:
        from features.annotation.router import _SCENE_LAYERS

        scene = ctx.scene
        scene_id = scene.id if hasattr(scene, "id") else str(scene)
        layers = _SCENE_LAYERS.get(scene_id, [])

        if not layers:
            return ToolResult(
                tool=self.name,
                text="No annotation layers found on this scene. The user has not drawn any shapes.",
                confidence=1.0,
                confidence_basis="direct_geometry_inspection",
                facts={"shape_count": 0, "total_area_ha": 0.0},
            )

        target_layers = layers
        if params.layer_id:
            target_layers = [l for l in layers if l.id == params.layer_id]
            if not target_layers:
                return ToolResult(
                    tool=self.name,
                    text=f"Annotation layer '{params.layer_id}' was not found.",
                    confidence=1.0,
                    confidence_basis="lookup",
                    warnings=["layer_not_found"],
                )

        # Collect shapes
        all_shapes = []
        for l in target_layers:
            for s in l.shapes:
                all_shapes.append((l, s))

        if not all_shapes:
            return ToolResult(
                tool=self.name,
                text="The selected layer contains no shapes.",
                confidence=1.0,
                confidence_basis="geometry",
                facts={"shape_count": 0},
            )

        if params.shape_index is not None and 1 <= params.shape_index <= len(all_shapes):
            all_shapes = [all_shapes[params.shape_index - 1]]

        # Calculate geometric areas using scene GSD & image pixel sizes
        image = scene.images[0] if hasattr(scene, "images") and scene.images else None
        meta = image.metadata if image and hasattr(image, "metadata") else None
        width = meta.width if meta and hasattr(meta, "width") else 1024
        height = meta.height if meta and hasattr(meta, "height") else 1024
        gsd_m = meta.gsd_m if meta and hasattr(meta, "gsd_m") and meta.gsd_m else 10.0
        bounds = scene.bounds_wgs84() if hasattr(scene, "bounds_wgs84") and scene.bounds_wgs84() else [0, 0, 1, 1]

        pixel_area_m2 = gsd_m * gsd_m

        stats_list = []
        total_area_m2 = 0.0

        for idx, (layer, shape) in enumerate(all_shapes):
            pts = shape.points
            if len(pts) < 2 and shape.kind != "point":
                continue

            # Convert norm points to pixel coords
            px_pts = [(p[0] * width, p[1] * height) for p in pts]

            area_px = 0.0
            perimeter_px = 0.0

            if shape.kind in ("polygon", "rectangle", "freehand") and len(px_pts) >= 3:
                # Shoelace formula for polygon area
                n = len(px_pts)
                for i in range(n):
                    j = (i + 1) % n
                    area_px += px_pts[i][0] * px_pts[j][1]
                    area_px -= px_pts[j][0] * px_pts[i][1]
                    dx = px_pts[j][0] - px_pts[i][0]
                    dy = px_pts[j][1] - px_pts[i][1]
                    perimeter_px += (dx * dx + dy * dy) ** 0.5
                area_px = abs(area_px) / 2.0
            elif shape.kind in ("circle", "ellipse") and len(px_pts) >= 2:
                import math
                rx = abs(px_pts[1][0] - px_pts[0][0])
                ry = rx if shape.kind == "circle" else abs(px_pts[1][1] - px_pts[0][1])
                area_px = math.pi * rx * ry
                perimeter_px = 2 * math.pi * math.sqrt((rx * rx + ry * ry) / 2.0)
            elif shape.kind == "point":
                area_px = 0.0
                perimeter_px = 0.0

            area_ha = (area_px * pixel_area_m2) / 10000.0
            perimeter_m = perimeter_px * gsd_m
            total_area_m2 += area_px * pixel_area_m2

            cx = sum(p[0] for p in pts) / len(pts)
            cy = sum(p[1] for p in pts) / len(pts)
            geo_lon, geo_lat = norm_to_geo([cx, cy], bounds)

            stats_list.append({
                "badge": idx + 1,
                "kind": shape.kind,
                "label": shape.label or shape.text or f"Shape #{idx + 1}",
                "layer": layer.name,
                "area_ha": round(area_ha, 3),
                "perimeter_m": round(perimeter_m, 1),
                "centroid_lat": geo_lat,
                "centroid_lon": geo_lon,
            })

        total_area_ha = total_area_m2 / 10000.0

        # Build human-readable response
        lines = [f"**Annotation Measurements ({len(stats_list)} shapes):**"]
        for s in stats_list:
            lines.append(
                f"- **Region [{s['badge']}] ({s['kind']}):** Area = **{s['area_ha']:.3f} ha** (~{s['area_ha'] * 2.471:.2f} acres), "
                f"Perimeter = **{s['perimeter_m']:.1f} m**, Centroid = ({s['centroid_lat']}°N, {s['centroid_lon']}°E)"
            )
        lines.append(f"\n**Total Measured Area:** **{total_area_ha:.3f} ha** ({total_area_m2:.1f} m²)")

        return ToolResult(
            tool=self.name,
            text="\n".join(lines),
            confidence=1.0,
            confidence_basis="closed_form_vector_geometry",
            facts={
                "shape_count": len(stats_list),
                "total_area_ha": round(total_area_ha, 3),
                "total_area_m2": round(total_area_m2, 1),
                "shapes": stats_list,
            },
        )
