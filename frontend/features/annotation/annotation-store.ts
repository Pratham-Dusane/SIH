'use client';

// SatQuery AI - Layered Annotation Store (Extensions PRD §5)
import { create } from 'zustand';
import { AnnotationLayer, AnnotationShape, AnnotationKind } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

const DEFAULT_PALETTE = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#e2e8f0', // White/Light
];

interface AnnotationState {
  layers: AnnotationLayer[];
  activeLayerId: string | null;
  activeTool: AnnotationKind;
  strokeColour: string;
  strokeWidth: number;
  filled: boolean;
  fillOpacity: number;
  selectedShapeId: string | null;
  history: AnnotationLayer[][];
  historyIndex: number;
  isDrawing: boolean;
  currentPoints: [number, number][];
  attachedToAgent: boolean;

  // Actions
  setLayers: (layers: AnnotationLayer[]) => void;
  setActiveLayerId: (id: string | null) => void;
  setActiveTool: (tool: AnnotationKind) => void;
  setStrokeColour: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFilled: (filled: boolean) => void;
  setFillOpacity: (opacity: number) => void;
  setSelectedShapeId: (id: string | null) => void;
  setIsDrawing: (drawing: boolean) => void;
  setCurrentPoints: (points: [number, number][]) => void;
  setAttachedToAgent: (attached: boolean) => void;

  createLayer: (sceneId: string, name?: string, author?: 'user' | 'agent', colour?: string) => AnnotationLayer;
  deleteLayer: (layerId: string) => void;
  updateLayer: (layerId: string, partial: Partial<AnnotationLayer>) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
  reorderLayers: (sourceIndex: number, destIndex: number) => void;
  duplicateLayer: (layerId: string) => void;

  addShapeToActiveLayer: (shape: Omit<AnnotationShape, 'id'>) => void;
  removeShape: (layerId: string, shapeId: string) => void;

  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  loadLayersForScene: (sceneId: string) => Promise<void>;
  saveLayerToBackend: (layer: AnnotationLayer) => Promise<void>;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  layers: [],
  activeLayerId: null,
  activeTool: 'select',
  strokeColour: '#ef4444',
  strokeWidth: 2,
  filled: false,
  fillOpacity: 0.25,
  selectedShapeId: null,
  history: [],
  historyIndex: -1,
  isDrawing: false,
  currentPoints: [],
  attachedToAgent: true,

  setLayers: (layers) => set({ layers }),
  setActiveLayerId: (activeLayerId) => set({ activeLayerId }),
  setActiveTool: (activeTool) => set({ activeTool, selectedShapeId: null }),
  setStrokeColour: (strokeColour) => set({ strokeColour }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setFilled: (filled) => set({ filled }),
  setFillOpacity: (fillOpacity) => set({ fillOpacity }),
  setSelectedShapeId: (selectedShapeId) => set({ selectedShapeId }),
  setIsDrawing: (isDrawing) => set({ isDrawing }),
  setCurrentPoints: (currentPoints) => set({ currentPoints }),
  setAttachedToAgent: (attachedToAgent) => set({ attachedToAgent }),

  pushHistory: () => {
    const { layers, history, historyIndex } = get();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(layers)));
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  createLayer: (sceneId: string, name?: string, author: 'user' | 'agent' = 'user', colour?: string) => {
    const { layers, pushHistory } = get();
    pushHistory();
    const color = colour || DEFAULT_PALETTE[layers.length % DEFAULT_PALETTE.length];
    const newLayer: AnnotationLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      sceneId,
      name: name || `Layer ${layers.length + 1}`,
      author,
      colour: color,
      visible: true,
      locked: false,
      opacity: 1.0,
      zIndex: layers.length,
      shapes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [...layers, newLayer];
    set({ layers: updated, activeLayerId: newLayer.id });
    return newLayer;
  },

  deleteLayer: (layerId: string) => {
    const { layers, activeLayerId, pushHistory } = get();
    pushHistory();
    const filtered = layers.filter((l) => l.id !== layerId);
    set({
      layers: filtered,
      activeLayerId: activeLayerId === layerId ? (filtered[0]?.id || null) : activeLayerId,
    });
  },

  updateLayer: (layerId: string, partial: Partial<AnnotationLayer>) => {
    const { layers, pushHistory } = get();
    pushHistory();
    const updated = layers.map((l) =>
      l.id === layerId ? { ...l, ...partial, updatedAt: new Date().toISOString() } : l
    );
    set({ layers: updated });
  },

  toggleLayerVisibility: (layerId: string) => {
    const { layers } = get();
    set({
      layers: layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    });
  },

  toggleLayerLock: (layerId: string) => {
    const { layers } = get();
    set({
      layers: layers.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l)),
    });
  },

  reorderLayers: (sourceIndex: number, destIndex: number) => {
    const { layers, pushHistory } = get();
    pushHistory();
    const result = Array.from(layers);
    const [removed] = result.splice(sourceIndex, 1);
    result.splice(destIndex, 0, removed);
    const updated = result.map((l, idx) => ({ ...l, zIndex: idx }));
    set({ layers: updated });
  },

  duplicateLayer: (layerId: string) => {
    const { layers, pushHistory } = get();
    const target = layers.find((l) => l.id === layerId);
    if (!target) return;
    pushHistory();
    const copy: AnnotationLayer = {
      ...JSON.parse(JSON.stringify(target)),
      id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: `${target.name} (Copy)`,
      zIndex: layers.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set({ layers: [...layers, copy], activeLayerId: copy.id });
  },

  addShapeToActiveLayer: (shapeData) => {
    const { layers, activeLayerId, createLayer, pushHistory, strokeColour, strokeWidth, filled, fillOpacity } = get();
    let currentActiveId = activeLayerId;
    let targetLayers = layers;

    if (!currentActiveId || !targetLayers.find((l) => l.id === currentActiveId)) {
      const newLayer = createLayer('default_scene', 'User Annotations', 'user', strokeColour);
      currentActiveId = newLayer.id;
      targetLayers = get().layers;
    }

    pushHistory();
    const shape: AnnotationShape = {
      ...shapeData,
      id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      colour: shapeData.colour || strokeColour,
      strokeWidth: shapeData.strokeWidth || strokeWidth,
      filled: shapeData.filled !== undefined ? shapeData.filled : filled,
      fillOpacity: shapeData.fillOpacity !== undefined ? shapeData.fillOpacity : fillOpacity,
    };

    const updated = targetLayers.map((layer) => {
      if (layer.id === currentActiveId) {
        return {
          ...layer,
          shapes: [...layer.shapes, shape],
          updatedAt: new Date().toISOString(),
        };
      }
      return layer;
    });

    set({ layers: updated });
  },

  removeShape: (layerId: string, shapeId: string) => {
    const { layers, pushHistory } = get();
    pushHistory();
    const updated = layers.map((layer) => {
      if (layer.id === layerId) {
        return {
          ...layer,
          shapes: layer.shapes.filter((s) => s.id !== shapeId),
          updatedAt: new Date().toISOString(),
        };
      }
      return layer;
    });
    set({ layers: updated, selectedShapeId: null });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      set({
        layers: JSON.parse(JSON.stringify(prev)),
        historyIndex: historyIndex - 1,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      set({
        layers: JSON.parse(JSON.stringify(next)),
        historyIndex: historyIndex + 1,
      });
    }
  },

  loadLayersForScene: async (sceneId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/scenes/${sceneId}/annotations`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          set({
            layers: data,
            activeLayerId: data[0]?.id || null,
            history: [JSON.parse(JSON.stringify(data))],
            historyIndex: 0,
          });
        }
      }
    } catch {
      // Backend maybe offline or no annotations yet
    }
  },

  saveLayerToBackend: async (layer: AnnotationLayer) => {
    try {
      await fetch(`${API_BASE}/api/scenes/${layer.sceneId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layer),
      });
    } catch {}
  },
}));
