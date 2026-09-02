// SatQuery AI - Layered Annotation Types (Extensions PRD §5)

export type AnnotationKind =
  | 'freehand'
  | 'polygon'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'arrow'
  | 'point'
  | 'text'
  | 'select'
  | 'eraser';

export interface AnnotationShape {
  id: string;
  kind: 'freehand' | 'polygon' | 'rectangle' | 'circle' | 'ellipse' | 'arrow' | 'point' | 'text';
  // Canonical normalized coordinates [0, 1] relative to the image bounds
  points: [number, number][]; // [[x0, y0], [x1, y1], ...]
  colour?: string;
  strokeWidth?: number;
  filled?: boolean;
  fillOpacity?: number;
  label?: string;
  text?: string;
  badgeIndex?: number;
  geo?: {
    type: string;
    coordinates: any;
  };
}

export interface AnnotationLayer {
  id: string;
  sceneId: string;
  workspaceId?: string;
  name: string;
  author: 'user' | 'agent';
  sourceQueryId?: string;
  sourceTool?: string;
  targetImageRole?: string;
  colour: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  zIndex: number;
  shapes: AnnotationShape[];
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationContext {
  layerId: string;
  name: string;
  author: 'user' | 'agent';
  shapeCount: number;
  usedAs: 'context' | 'mask_ref';
}
