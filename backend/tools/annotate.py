"""
Agent annotation tool — Extensions PRD §5.6.

Allows the agent to author vector annotation layers directly onto the scene canvas
from visual measurement results (masks or bounding boxes), supporting:
- rectangle
- ellipse / circle
- arrow
- polygon
"""

from typing import Any, Dict, List, Literal, Optional
import uuid
from pydantic import Field

from tools.base import InputConfig, Tool, ToolParams, ToolResult
from tools.registry import register
from features.annotation.models import AnnotationLayer, AnnotationShape
from features.annotation.router import _SCENE_LAYERS


class AnnotateParams(ToolParams):
    label: str = Field(..., description="Label or description of the feature to annotate (e.g. 'Highways', 'Water bodies', 'Urban expansion').")
    boxes: Optional[Any] = Field(None, description="Bounding boxes [[ymin, xmin, ymax, xmax], ...] or [[xmin, ymin, xmax, ymax], ...].")
    kind: Optional[Literal["rectangle", "ellipse", "circle", "arrow", "polygon", "point"]] = Field("rectangle", description="Vector drawing shape kind.")
    points: Optional[List[List[float]]] = Field(None, description="Explicit normalized coordinates [[x, y], ...].")
    mask_key: Optional[str] = Field(None, description="Optional key of a mask artifact produced by an earlier step.")
    colour: str = Field("#06b6d4", description="Hex color for the agent annotation layer (defaults to cyan #06b6d4).")


@register
class AnnotateTool(Tool):
    name = "annotate"
    description = (
        "Draw vector annotations on the user's canvas to highlight regions of interest, detected objects, "
        "highways, or segmented features. Decides the best drawing tool (rectangle, ellipse, arrow) "
        "and coordinates, automatically creating a distinct agent annotation layer."
    )
    accepts: List[InputConfig] = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: List[str] = []
    params_model = AnnotateParams
    produces = ["annotation", "text"]
    offline_capable = True

    async def run(self, ctx: Any, params: AnnotateParams) -> ToolResult:
        from features.annotation.router import _SCENE_LAYERS

        scene = ctx.scene
        scene_id = scene.id if hasattr(scene, "id") else str(scene)
        shapes: List[AnnotationShape] = []

        # Resolve boxes if string reference was passed
        boxes = params.boxes
        if isinstance(boxes, str) and hasattr(ctx, "get_artifact"):
            boxes = ctx.get_artifact(boxes)

        chosen_kind = params.kind or "rectangle"

        # 1. If bounding boxes provided
        if boxes and isinstance(boxes, list):
            for b_idx, box in enumerate(boxes):
                if isinstance(box, (list, tuple)) and len(box) == 4:
                    # Normalized coords
                    c1, c2, c3, c4 = (float(v) for v in box)
                    # Normalize orientation: if [ymin, xmin, ymax, xmax] vs [xmin, ymin, xmax, ymax]
                    xmin = min(c1, c3) if c1 > c2 else min(c2, c4)
                    ymin = min(c1, c2)
                    xmax = max(c1, c3) if c1 > c2 else max(c2, c4)
                    ymax = max(c2, c4)

                    # Clamp to [0, 1]
                    xmin = max(0.0, min(1.0, xmin))
                    ymin = max(0.0, min(1.0, ymin))
                    xmax = max(0.0, min(1.0, xmax))
                    ymax = max(0.0, min(1.0, ymax))

                    if chosen_kind == "arrow":
                        pts = [[xmin, ymin], [xmax, ymax]]
                    elif chosen_kind in ("ellipse", "circle"):
                        pts = [[xmin, ymin], [xmax, ymax]]
                    else:  # rectangle
                        pts = [
                            [xmin, ymin],
                            [xmax, ymin],
                            [xmax, ymax],
                            [xmin, ymax],
                        ]

                    shapes.append(
                        AnnotationShape(
                            id=f"shape_agent_{uuid.uuid4().hex[:6]}",
                            kind=chosen_kind,
                            points=pts,
                            colour=params.colour,
                            stroke_width=3.0,
                            filled=True if chosen_kind in ("rectangle", "ellipse", "circle") else False,
                            fill_opacity=0.2 if chosen_kind in ("rectangle", "ellipse", "circle") else 0.0,
                            label=f"{params.label} #{b_idx + 1}" if len(boxes) > 1 else params.label,
                            badge_index=b_idx + 1,
                        )
                    )

        # 2. If explicit points provided
        elif params.points and isinstance(params.points, list):
            shapes.append(
                AnnotationShape(
                    id=f"shape_agent_{uuid.uuid4().hex[:6]}",
                    kind=chosen_kind,
                    points=params.points,
                    colour=params.colour,
                    stroke_width=3.0,
                    filled=True if chosen_kind in ("rectangle", "ellipse", "circle") else False,
                    fill_opacity=0.2 if chosen_kind in ("rectangle", "ellipse", "circle") else 0.0,
                    label=params.label,
                    badge_index=1,
                )
            )

        # If no valid shapes detected, return clean failure rather than inventing fake boxes
        if not shapes:
            return ToolResult(
                tool=self.name,
                text=f"No detected regions found to annotate for '{params.label}'.",
                confidence=0.0,
                confidence_basis="no_shapes_detected",
                warnings=["No valid bounding boxes or coordinates were provided from previous detection step."],
                artifacts={},
            )

        new_layer = AnnotationLayer(
            id=f"layer_agent_{uuid.uuid4().hex[:8]}",
            scene_id=scene_id,
            name=f"Agent: {params.label}",
            author="agent",
            colour=params.colour,
            visible=True,
            locked=False,
            opacity=1.0,
            shapes=shapes,
        )

        layers = _SCENE_LAYERS.setdefault(scene_id, [])
        layers.append(new_layer)

        return ToolResult(
            tool=self.name,
            text=f"Marked {len(shapes)} region(s) as '{new_layer.name}' using {chosen_kind} annotations on canvas.",
            confidence=0.96,
            confidence_basis="vector_annotation_layer_rendered",
            facts={
                "layer_id": new_layer.id,
                "layer_name": new_layer.name,
                "kind": chosen_kind,
                "shape_count": len(shapes),
                "author": "agent",
            },
            artifacts={
                "annotation_layer_id": new_layer.id,
                "annotation_layer": new_layer.model_dump(),
                "shapes": [s.model_dump() for s in shapes],
            },
        )
