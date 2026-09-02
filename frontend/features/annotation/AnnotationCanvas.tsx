'use client';

// SatQuery AI - Vector Annotation SVG Canvas (Extensions PRD §5)
// Positioned directly 1:1 over the 960x720 canvas viewport.
// Handles drawing for all 7 shape kinds, selection, and interactive eraser with hit-testing.

import React, { useRef, useState, useCallback } from 'react';
import { useAnnotationStore } from './annotation-store';
import { AnnotationShape, AnnotationLayer } from './types';
import { cn } from '@/lib/utils';

interface AnnotationCanvasProps {
  width?: number;
  height?: number;
  sceneId: string;
}

// Fast point-to-segment distance
function distToSegment(
  [px, py]: [number, number],
  [x1, y1]: [number, number],
  [x2, y2]: [number, number]
): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

// Comprehensive geometric hit-testing for eraser and selection
function isPointNearShape(
  px: number,
  py: number,
  shape: AnnotationShape,
  width: number,
  height: number
): boolean {
  const normToScreen = ([nx, ny]: [number, number]): [number, number] => [nx * width, ny * height];
  const pts = shape.points.map(normToScreen);
  const THRESHOLD = 16;

  if (shape.kind === 'point' || shape.kind === 'text') {
    if (pts.length >= 1) {
      return Math.hypot(px - pts[0][0], py - pts[0][1]) <= 24;
    }
  }

  if (shape.kind === 'rectangle') {
    if (pts.length >= 4) {
      const xmin = Math.min(pts[0][0], pts[1][0], pts[2][0], pts[3][0]);
      const xmax = Math.max(pts[0][0], pts[1][0], pts[2][0], pts[3][0]);
      const ymin = Math.min(pts[0][1], pts[1][1], pts[2][1], pts[3][1]);
      const ymax = Math.max(pts[0][1], pts[1][1], pts[2][1], pts[3][1]);
      return px >= xmin - THRESHOLD && px <= xmax + THRESHOLD && py >= ymin - THRESHOLD && py <= ymax + THRESHOLD;
    }
  }

  if (shape.kind === 'circle' || shape.kind === 'ellipse') {
    if (pts.length >= 2) {
      const cx = (pts[0][0] + pts[1][0]) / 2;
      const cy = (pts[0][1] + pts[1][1]) / 2;
      const rx = Math.abs(pts[1][0] - pts[0][0]) / 2 + THRESHOLD;
      const ry = Math.abs(pts[1][1] - pts[0][1]) / 2 + THRESHOLD;
      if (rx > 0 && ry > 0) {
        const d = ((px - cx) ** 2) / (rx ** 2) + ((py - cy) ** 2) / (ry ** 2);
        return d <= 1.0;
      }
    }
  }

  if (shape.kind === 'arrow') {
    if (pts.length >= 2) {
      return distToSegment([px, py], pts[0], pts[1]) <= THRESHOLD;
    }
  }

  if (shape.kind === 'freehand' || shape.kind === 'polygon') {
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment([px, py], pts[i], pts[i + 1]) <= THRESHOLD) {
        return true;
      }
    }
    if (shape.kind === 'polygon' && pts.length >= 3) {
      if (distToSegment([px, py], pts[pts.length - 1], pts[0]) <= THRESHOLD) {
        return true;
      }
    }
  }

  return false;
}

export default function AnnotationCanvas({
  width = 960,
  height = 720,
  sceneId,
}: AnnotationCanvasProps) {
  const {
    layers,
    activeLayerId,
    activeTool,
    strokeColour,
    strokeWidth,
    filled,
    fillOpacity,
    selectedShapeId,
    setSelectedShapeId,
    addShapeToActiveLayer,
    removeShape,
  } = useAnnotationStore();

  const svgRef = useRef<SVGSVGElement>(null);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [textPromptPos, setTextPromptPos] = useState<[number, number] | null>(null);
  const [textValue, setTextValue] = useState('');

  // Convert mouse screen coordinates to normalized [0, 1] relative to the 960x720 canvas
  const clientToNormalized = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      if (!svgRef.current) return null;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const normX = (clientX - rect.left) / rect.width;
      const normY = (clientY - rect.top) / rect.height;

      return [
        Math.max(0, Math.min(1, normX)),
        Math.max(0, Math.min(1, normY)),
      ];
    },
    []
  );

  // Convert normalized [0, 1] to SVG pixel coordinates
  const normToSvg = useCallback(
    (nx: number, ny: number): [number, number] => {
      return [nx * width, ny * height];
    },
    [width, height]
  );

  // Erase shapes under screen position
  const eraseUnderPosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * width;
      const py = ((clientY - rect.top) / rect.height) * height;

      // Check visible, unlocked layers in reverse z-index order (top-most first)
      const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
      for (const layer of sortedLayers) {
        if (!layer.visible || layer.locked) continue;
        for (const shape of [...layer.shapes].reverse()) {
          if (isPointNearShape(px, py, shape, width, height)) {
            removeShape(layer.id, shape.id);
            return;
          }
        }
      }
    },
    [layers, removeShape, width, height]
  );

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click

    if (activeTool === 'select') return;

    if (activeTool === 'eraser') {
      setIsErasing(true);
      eraseUnderPosition(e.clientX, e.clientY);
      return;
    }

    const norm = clientToNormalized(e.clientX, e.clientY);
    if (!norm) return;

    if (activeTool === 'point') {
      addShapeToActiveLayer({
        kind: 'point',
        points: [norm],
        colour: strokeColour,
        strokeWidth,
      });
      return;
    }

    if (activeTool === 'text') {
      setTextPromptPos(norm);
      setTextValue('');
      return;
    }

    if (activeTool === 'polygon') {
      setDrawingPoints((prev) => [...prev, norm]);
      return;
    }

    setIsMouseDown(true);
    setDrawingPoints([norm, norm]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activeTool === 'eraser' && isErasing) {
      eraseUnderPosition(e.clientX, e.clientY);
      return;
    }

    if (!isMouseDown) return;
    const norm = clientToNormalized(e.clientX, e.clientY);
    if (!norm) return;

    if (activeTool === 'freehand') {
      setDrawingPoints((prev) => [...prev, norm]);
    } else if (
      activeTool === 'rectangle' ||
      activeTool === 'circle' ||
      activeTool === 'ellipse' ||
      activeTool === 'arrow'
    ) {
      setDrawingPoints(([start]) => [start, norm]);
    }
  };

  const handleMouseUp = () => {
    if (isErasing) {
      setIsErasing(false);
    }

    if (!isMouseDown) return;
    setIsMouseDown(false);

    if (drawingPoints.length < 2) {
      setDrawingPoints([]);
      return;
    }

    if (activeTool === 'freehand') {
      if (drawingPoints.length >= 2) {
        addShapeToActiveLayer({
          kind: 'freehand',
          points: drawingPoints,
          colour: strokeColour,
          strokeWidth,
          filled,
          fillOpacity,
        });
      }
    } else if (activeTool === 'rectangle') {
      if (drawingPoints.length === 2) {
        const [p1, p2] = drawingPoints;
        const xmin = Math.min(p1[0], p2[0]);
        const xmax = Math.max(p1[0], p2[0]);
        const ymin = Math.min(p1[1], p2[1]);
        const ymax = Math.max(p1[1], p2[1]);

        if (Math.abs(xmax - xmin) > 0.005 || Math.abs(ymax - ymin) > 0.005) {
          const pts: [number, number][] = [
            [xmin, ymin],
            [xmax, ymin],
            [xmax, ymax],
            [xmin, ymax],
          ];
          addShapeToActiveLayer({
            kind: 'rectangle',
            points: pts,
            colour: strokeColour,
            strokeWidth,
            filled,
            fillOpacity,
          });
        }
      }
    } else if (activeTool === 'circle' || activeTool === 'ellipse') {
      if (drawingPoints.length === 2) {
        const [p1, p2] = drawingPoints;
        if (Math.abs(p2[0] - p1[0]) > 0.005 || Math.abs(p2[1] - p1[1]) > 0.005) {
          addShapeToActiveLayer({
            kind: activeTool,
            points: [p1, p2],
            colour: strokeColour,
            strokeWidth,
            filled,
            fillOpacity,
          });
        }
      }
    } else if (activeTool === 'arrow') {
      if (drawingPoints.length === 2) {
        const [p1, p2] = drawingPoints;
        if (Math.abs(p2[0] - p1[0]) > 0.005 || Math.abs(p2[1] - p1[1]) > 0.005) {
          addShapeToActiveLayer({
            kind: 'arrow',
            points: [p1, p2],
            colour: strokeColour,
            strokeWidth,
          });
        }
      }
    }

    setDrawingPoints([]);
  };

  const handlePolygonDoubleClick = () => {
    if (activeTool === 'polygon' && drawingPoints.length >= 3) {
      addShapeToActiveLayer({
        kind: 'polygon',
        points: drawingPoints,
        colour: strokeColour,
        strokeWidth,
        filled,
        fillOpacity,
      });
      setDrawingPoints([]);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textPromptPos && textValue.trim()) {
      addShapeToActiveLayer({
        kind: 'text',
        points: [textPromptPos],
        colour: strokeColour,
        strokeWidth: 1,
        text: textValue.trim(),
      });
    }
    setTextPromptPos(null);
    setTextValue('');
  };

  // Render a persistent shape
  const renderShape = (shape: AnnotationShape, layer: AnnotationLayer, badgeNumber: number) => {
    const isSelected = selectedShapeId === shape.id;
    const stroke = shape.colour || layer.colour || '#ef4444';
    const sWidth = isSelected ? (shape.strokeWidth || 2) + 1.5 : shape.strokeWidth || 2;
    const isAgent = layer.author === 'agent';
    const dashArray = isAgent ? '6 4' : undefined;

    const handleShapeClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (activeTool === 'eraser') {
        removeShape(layer.id, shape.id);
      } else if (activeTool === 'select') {
        setSelectedShapeId(isSelected ? null : shape.id);
      }
    };

    let shapeEl: React.ReactNode = null;

    if (shape.kind === 'freehand' || shape.kind === 'polygon') {
      if (shape.points.length >= 2) {
        const pathData = shape.points
          .map(([nx, ny], idx) => {
            const [x, y] = normToSvg(nx, ny);
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ') + (shape.kind === 'polygon' ? ' Z' : '');

        shapeEl = (
          <g onClick={handleShapeClick}>
            {/* Invisible thick hit area for easy click & erase */}
            <path
              d={pathData}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(sWidth + 14, 18)}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="cursor-pointer"
            />
            <path
              d={pathData}
              fill={shape.filled ? stroke : 'none'}
              fillOpacity={shape.filled ? shape.fillOpacity ?? 0.25 : 0}
              stroke={stroke}
              strokeWidth={sWidth}
              strokeDasharray={dashArray}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      }
    } else if (shape.kind === 'rectangle') {
      if (shape.points.length >= 4) {
        const [x1, y1] = normToSvg(shape.points[0][0], shape.points[0][1]);
        const [x2, y2] = normToSvg(shape.points[2][0], shape.points[2][1]);
        const rx = Math.min(x1, x2);
        const ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1);
        const rh = Math.abs(y2 - y1);

        shapeEl = (
          <g onClick={handleShapeClick}>
            {/* Invisible hit box covering the whole rectangle interior and border */}
            <rect
              x={rx - 4}
              y={ry - 4}
              width={rw + 8}
              height={rh + 8}
              fill="transparent"
              stroke="transparent"
              className="cursor-pointer"
            />
            <rect
              x={rx}
              y={ry}
              width={rw}
              height={rh}
              fill={shape.filled ? stroke : 'none'}
              fillOpacity={shape.filled ? shape.fillOpacity ?? 0.25 : 0}
              stroke={stroke}
              strokeWidth={sWidth}
              strokeDasharray={dashArray}
              rx={4}
            />
          </g>
        );
      }
    } else if (shape.kind === 'circle' || shape.kind === 'ellipse') {
      if (shape.points.length >= 2) {
        const [p1, p2] = shape.points;
        const [x1, y1] = normToSvg(p1[0], p1[1]);
        const [x2, y2] = normToSvg(p2[0], p2[1]);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;

        shapeEl = (
          <g onClick={handleShapeClick}>
            {/* Invisible hit box covering the whole ellipse */}
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx + 6}
              ry={ry + 6}
              fill="transparent"
              stroke="transparent"
              className="cursor-pointer"
            />
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill={shape.filled ? stroke : 'none'}
              fillOpacity={shape.filled ? shape.fillOpacity ?? 0.25 : 0}
              stroke={stroke}
              strokeWidth={sWidth}
              strokeDasharray={dashArray}
            />
          </g>
        );
      }
    } else if (shape.kind === 'arrow') {
      if (shape.points.length >= 2) {
        const [p1, p2] = shape.points;
        const [x1, y1] = normToSvg(p1[0], p1[1]);
        const [x2, y2] = normToSvg(p2[0], p2[1]);
        const markerId = `arrow-${shape.id}`;

        shapeEl = (
          <g onClick={handleShapeClick}>
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill={stroke} />
              </marker>
            </defs>
            {/* Thick hit line */}
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="transparent"
              strokeWidth={Math.max(sWidth + 14, 18)}
              className="cursor-pointer"
            />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={sWidth}
              strokeDasharray={dashArray}
              markerEnd={`url(#${markerId})`}
            />
          </g>
        );
      }
    } else if (shape.kind === 'point') {
      if (shape.points.length >= 1) {
        const [px, py] = normToSvg(shape.points[0][0], shape.points[0][1]);
        shapeEl = (
          <g onClick={handleShapeClick} className="cursor-pointer">
            <circle cx={px} cy={py} r={18} fill="transparent" stroke="transparent" />
            <circle cx={px} cy={py} r={5} fill={stroke} stroke="#ffffff" strokeWidth={1.5} />
            <circle cx={px} cy={py} r={11} fill={stroke} fillOpacity={0.25} />
          </g>
        );
      }
    } else if (shape.kind === 'text') {
      if (shape.points.length >= 1) {
        const [tx, ty] = normToSvg(shape.points[0][0], shape.points[0][1]);
        shapeEl = (
          <g onClick={handleShapeClick} className="cursor-pointer">
            <text
              x={tx}
              y={ty}
              fill={stroke}
              fontSize="13"
              fontWeight="bold"
              fontFamily="sans-serif"
              paintOrder="stroke"
              stroke="#000000"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {shape.text || shape.label}
            </text>
          </g>
        );
      }
    }

    const isDrawingMode = activeTool !== 'select' && activeTool !== 'eraser';

    return (
      <g
        key={shape.id}
        id={`shape-group-${shape.id}`}
        className={cn(
          isDrawingMode ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'
        )}
      >
        {shapeEl}
      </g>
    );
  };

  // Active drawing in-progress preview
  const renderPreview = () => {
    if (drawingPoints.length === 0) return null;

    if (activeTool === 'freehand' || activeTool === 'polygon') {
      const pathData = drawingPoints
        .map(([nx, ny], idx) => {
          const [x, y] = normToSvg(nx, ny);
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

      return (
        <path
          d={pathData}
          fill="none"
          stroke={strokeColour}
          strokeWidth={strokeWidth}
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    if (activeTool === 'rectangle' && drawingPoints.length === 2) {
      const [p1, p2] = drawingPoints;
      const [x1, y1] = normToSvg(p1[0], p1[1]);
      const [x2, y2] = normToSvg(p2[0], p2[1]);
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);

      return (
        <rect
          x={rx}
          y={ry}
          width={rw}
          height={rh}
          fill={filled ? strokeColour : 'none'}
          fillOpacity={filled ? fillOpacity : 0}
          stroke={strokeColour}
          strokeWidth={strokeWidth}
          strokeDasharray="4 3"
          rx={4}
        />
      );
    }

    if ((activeTool === 'circle' || activeTool === 'ellipse') && drawingPoints.length === 2) {
      const [p1, p2] = drawingPoints;
      const [x1, y1] = normToSvg(p1[0], p1[1]);
      const [x2, y2] = normToSvg(p2[0], p2[1]);
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;

      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill={filled ? strokeColour : 'none'}
          fillOpacity={filled ? fillOpacity : 0}
          stroke={strokeColour}
          strokeWidth={strokeWidth}
          strokeDasharray="4 3"
        />
      );
    }

    if (activeTool === 'arrow' && drawingPoints.length === 2) {
      const [p1, p2] = drawingPoints;
      const [x1, y1] = normToSvg(p1[0], p1[1]);
      const [x2, y2] = normToSvg(p2[0], p2[1]);

      return (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={strokeColour}
          strokeWidth={strokeWidth}
          strokeDasharray="4 3"
        />
      );
    }

    return null;
  };

  const isInteractive = activeTool !== 'select';
  const cursorClass =
    activeTool === 'eraser'
      ? 'cursor-pointer'
      : activeTool === 'select'
      ? 'cursor-default'
      : 'cursor-crosshair';

  let badgeCounter = 1;

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 select-none',
        isInteractive ? 'pointer-events-auto' : 'pointer-events-none',
        cursorClass
      )}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={cn('w-full h-full block', cursorClass)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handlePolygonDoubleClick}
      >
        {/* Render persistent layers sorted by zIndex */}
        {[...layers]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((layer) => {
            if (!layer.visible) return null;
            return (
              <g
                key={layer.id}
                id={`annotation-layer-${layer.id}`}
                opacity={layer.opacity}
              >
                {layer.shapes.map((shape) => {
                  const num = badgeCounter++;
                  return renderShape(shape, layer, num);
                })}
              </g>
            );
          })}

        {/* Active Drawing Preview */}
        {renderPreview()}
      </svg>

      {/* Floating Text Input Box */}
      {textPromptPos && (
        <form
          onSubmit={handleTextSubmit}
          className="absolute z-30 p-2 rounded-xl bg-card/95 border border-primary shadow-xl backdrop-blur-md flex gap-1.5 items-center pointer-events-auto"
          style={{
            left: `${Math.min(width - 220, Math.max(10, normToSvg(textPromptPos[0], textPromptPos[1])[0]))}px`,
            top: `${Math.min(height - 60, Math.max(10, normToSvg(textPromptPos[0], textPromptPos[1])[1]))}px`,
          }}
        >
          <input
            autoFocus
            type="text"
            placeholder="Label text..."
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            className="px-2.5 py-1 text-xs bg-background border border-border/80 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-xs bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 cursor-pointer"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setTextPromptPos(null)}
            className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            ✕
          </button>
        </form>
      )}
    </div>
  );
}
