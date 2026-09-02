// SatQuery AI - Panel & Nav Registry (Extensions PRD §3.1)
// The independence mechanism: features register panels/nav items here,
// and the shell renders them without knowing what they are.

import { type ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Scene types
// ---------------------------------------------------------------------------
export type SceneType = 'SINGLE' | 'CROSS_MODAL' | 'BI_TEMPORAL' | 'MULTITEMPORAL';
export const ALL_SCENE_TYPES: SceneType[] = ['SINGLE', 'CROSS_MODAL', 'BI_TEMPORAL', 'MULTITEMPORAL'];

export type FeatureId =
  | 'console'
  | 'enhancement' | 'annotation' | 'temporal_fetch' | 'stack'
  | 'historical' | 'causal' | 'geo3d' | 'voice' | 'reports'
  | 'monitor' | 'live' | 'location_history';

// ---------------------------------------------------------------------------
// Workbench Right Rail Panels
// ---------------------------------------------------------------------------
export interface WorkbenchPanel {
  id: string;
  featureId: FeatureId;
  label: string;
  icon: string;  // Lucide icon name
  order: number; // reserved bands: F1=100, F2=200, F3=300, F4=400, F6=600, F7=700
  availableFor: SceneType[];
  gate?: (scene: any) => { ok: boolean; reason?: string };
  Component: ComponentType<{ scene: any }>;
}

const panels = new Map<string, WorkbenchPanel>();

export function registerPanel(p: WorkbenchPanel) {
  panels.set(p.id, p);
}

export function panelsFor(scene: any, enabled: Set<FeatureId>): WorkbenchPanel[] {
  const sceneType = (scene?.inputConfig || 'SINGLE') as SceneType;
  return [...panels.values()]
    .filter(p => p.featureId === 'console' || enabled.has(p.featureId))
    .filter(p => p.availableFor.includes(sceneType))
    .sort((a, b) => a.order - b.order);
}

export function allPanels(): WorkbenchPanel[] {
  return [...panels.values()].sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// Left Nav Items
// ---------------------------------------------------------------------------
export interface NavItem {
  id: string;
  featureId: FeatureId;
  label: string;
  icon: string;
  order: number; // F5=250, F9=500, F10=600, F11=350
  href: string;
}

const navItems = new Map<string, NavItem>();

export function registerNavItem(item: NavItem) {
  navItems.set(item.id, item);
}

export function navItemsFor(enabled: Set<FeatureId>): NavItem[] {
  return [...navItems.values()]
    .filter(n => enabled.has(n.featureId))
    .sort((a, b) => a.order - b.order);
}

export function allNavItems(): NavItem[] {
  return [...navItems.values()].sort((a, b) => a.order - b.order);
}
