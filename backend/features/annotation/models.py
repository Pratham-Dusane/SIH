"""
Annotation models — Extensions PRD §5 & §15.2.
"""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class AnnotationShape(BaseModel):
    id: str
    kind: Literal["freehand", "polygon", "rectangle", "circle", "ellipse", "arrow", "point", "text"]
    points: List[List[float]]  # normalized [[x0, y0], [x1, y1], ...] in [0, 1]
    colour: Optional[str] = None
    stroke_width: Optional[float] = 2.0
    filled: bool = False
    fill_opacity: Optional[float] = 0.25
    label: Optional[str] = None
    text: Optional[str] = None
    badge_index: Optional[int] = None
    geo: Optional[Dict[str, Any]] = None


class AnnotationLayer(BaseModel):
    id: str
    scene_id: str
    workspace_id: Optional[str] = "ws_demo"
    name: str
    author: Literal["user", "agent"] = "user"
    source_query_id: Optional[str] = None
    source_tool: Optional[str] = None
    target_image_role: Optional[str] = None
    colour: str = "#ef4444"
    visible: bool = True
    locked: bool = False
    opacity: float = 1.0
    z_index: int = 0
    shapes: List[AnnotationShape] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AnnotationCreateRequest(BaseModel):
    name: str
    author: Literal["user", "agent"] = "user"
    colour: Optional[str] = None
    target_image_role: Optional[str] = None
    shapes: List[AnnotationShape] = Field(default_factory=list)


class AnnotationContext(BaseModel):
    layer_id: str
    name: str
    author: str
    shape_count: int
    used_as: Literal["context", "mask_ref"] = "context"
