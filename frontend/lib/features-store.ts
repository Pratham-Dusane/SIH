// SatQuery AI - Feature Capability Store (Extensions PRD §3.2)
// Fetches GET /api/features once at layout mount; panelsFor() and navItemsFor() read it.
import { create } from 'zustand';
import type { FeatureId } from './registry';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

interface FeaturesState {
  features: Record<string, boolean>;
  loaded: boolean;
  enabledSet: Set<FeatureId>;
  fetchFeatures: () => Promise<void>;
  isEnabled: (fid: FeatureId) => boolean;
}

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
  features: {},
  loaded: false,
  enabledSet: new Set(),

  fetchFeatures: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch(`${API_BASE}/api/features`);
      if (res.ok) {
        const data = await res.json();
        const enabledSet = new Set<FeatureId>();
        for (const [key, val] of Object.entries(data)) {
          if (val === true) enabledSet.add(key as FeatureId);
        }
        set({ features: data, loaded: true, enabledSet });
      } else {
        // Backend may not have the endpoint yet — treat all as disabled
        set({ loaded: true });
      }
    } catch {
      // Offline or backend down — degrade silently
      set({ loaded: true });
    }
  },

  isEnabled: (fid: FeatureId) => get().enabledSet.has(fid),
}));
