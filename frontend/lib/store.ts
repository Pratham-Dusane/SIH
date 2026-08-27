// SatQuery AI - Zustand Store (PRD §4.7)
import { create } from 'zustand';
import { Scene, QueryResult, EvidenceLayer, InputConfig } from './types';

interface LayerState {
  visible: boolean;
  opacity: number;
}

interface Turn {
  query: string;
  result: QueryResult | null;
  isStreaming: boolean;
  streamStage?: string;
  streamSteps?: { id: string; tool: string; status: string; reason?: string }[];
  /** Set when the query failed. A failed turn shows the error, never a
   *  fabricated answer — a made-up result would carry a confidence value and
   *  an evidence list that no tool produced. */
  error?: string;
}

interface SatQueryStore {
  // Scene
  activeScene: Scene | null;
  setActiveScene: (scene: Scene | null) => void;

  // Layers - visibility survives new queries
  layers: Record<string, LayerState>;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  initLayers: (evidence: EvidenceLayer[]) => void;

  // Chat / query turns
  turns: Turn[];
  addTurn: (query: string) => void;
  updateLastTurn: (update: Partial<Turn>) => void;
  setTurnResult: (result: QueryResult) => void;

  // Trace
  activeTraceId: string | null;
  setActiveTraceId: (id: string | null) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Base image selector for pairs
  activeBaseImage: 'primary' | 'secondary';
  setActiveBaseImage: (v: 'primary' | 'secondary') => void;

  // Trace drawer
  traceDrawerOpen: boolean;
  setTraceDrawerOpen: (open: boolean) => void;

  // Theme
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
}

export const useStore = create<SatQueryStore>((set, get) => ({
  // Scene
  activeScene: null,
  setActiveScene: (scene) => set({ activeScene: scene }),

  // Layers
  layers: {},
  setLayerVisibility: (id, visible) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], visible } },
    })),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: { ...s.layers, [id]: { ...s.layers[id], opacity } },
    })),
  initLayers: (evidence) => {
    const existing = get().layers;
    const next: Record<string, LayerState> = { ...existing };
    const items: Array<{ id: string }> = Array.isArray(evidence)
      ? evidence
      : (evidence && typeof evidence === 'object')
        ? Object.keys(evidence).map((k) => ({ id: k }))
        : [];
    for (const e of items) {
      if (e && e.id && !next[e.id]) {
        next[e.id] = { visible: true, opacity: 0.7 };
      }
    }
    set({ layers: next });
  },

  // Turns
  turns: [],
  addTurn: (query) =>
    set((s) => ({
      turns: [...s.turns, { query, result: null, isStreaming: true, streamSteps: [] }],
    })),
  updateLastTurn: (update) =>
    set((s) => {
      const turns = [...s.turns];
      if (turns.length > 0) {
        turns[turns.length - 1] = { ...turns[turns.length - 1], ...update };
      }
      return { turns };
    }),
  setTurnResult: (result) =>
    set((s) => {
      const turns = [...s.turns];
      if (turns.length > 0) {
        turns[turns.length - 1] = {
          ...turns[turns.length - 1],
          result,
          isStreaming: false,
        };
      }
      return { turns };
    }),

  // Trace
  activeTraceId: null,
  setActiveTraceId: (id) => set({ activeTraceId: id }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Base image
  activeBaseImage: 'primary',
  setActiveBaseImage: (v) => set({ activeBaseImage: v }),

  // Trace drawer
  traceDrawerOpen: false,
  setTraceDrawerOpen: (open) => set({ traceDrawerOpen: open }),

  // Theme
  theme: 'light',
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('satquery-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  },
}));
