'use client';

// SatQuery AI - Workbench Right Rail (Extensions PRD §3.1)
// Unified right-hand container hosting:
// 1. Query Console
// 2. Scene Enhancement (F1)
// 3. Layered Annotation (F2)
// 4. Location Context (F12)
//
// Default width: 440px (resizable). Esc collapses, Alt+1..9 toggles panels.

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles, PenTool, Clock, Layers, Brain, Cuboid, Mic,
  FileText, Radio, Satellite, ChevronLeft, ChevronRight, BookOpen,
  Terminal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { panelsFor, allPanels, type WorkbenchPanel } from '@/lib/registry';
import { useFeaturesStore } from '@/lib/features-store';

const ICON_MAP: Record<string, typeof Sparkles> = {
  terminal: Terminal,
  sparkles: Sparkles,
  pen_tool: PenTool,
  book_open: BookOpen,
  clock: Clock,
  layers: Layers,
  brain: Brain,
  cuboid: Cuboid,
  mic: Mic,
  file_text: FileText,
  radio: Radio,
  satellite: Satellite,
};

interface RightRailProps {
  scene: any;
}

export default function RightRail({ scene }: RightRailProps) {
  const { enabledSet, loaded } = useFeaturesStore();
  const [expanded, setExpanded] = useState(true);
  const [activePanel, setActivePanel] = useState<string | null>('console');
  const [width, setWidth] = useState(440);
  const resizeRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Get all panels (enabled + disabled for greyed icons)
  const enabledPanels = loaded ? panelsFor(scene, enabledSet) : [];
  const allRegistered = allPanels();

  const togglePanel = useCallback((id: string) => {
    if (activePanel === id && expanded) {
      setExpanded(false);
      setActivePanel(null);
    } else {
      setExpanded(true);
      setActivePanel(id);
    }
  }, [activePanel, expanded]);

  // Keyboard shortcuts: Alt+1..9 and Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expanded) {
        setExpanded(false);
        setActivePanel(null);
        return;
      }
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < enabledPanels.length) {
          e.preventDefault();
          togglePanel(enabledPanels[idx].id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded, enabledPanels, togglePanel]);

  // Drag resize
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startX - ev.clientX;
      setWidth(Math.max(360, Math.min(680, startWidth + delta)));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width]);

  const activePanelDef = enabledPanels.find(p => p.id === activePanel);
  const ActiveComponent = activePanelDef?.Component || null;

  if (!loaded || allRegistered.length === 0) return null;

  return (
    <div
      className="h-full shrink-0 flex relative transition-all duration-300 ease-in-out select-none"
      style={{ width: expanded ? width + 56 : 56 }}
    >
      {/* Resize handle (left edge of the panel) */}
      {expanded && (
        <div
          ref={resizeRef}
          onMouseDown={onMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 hover:bg-primary/40 transition-colors"
          title="Drag to resize panel"
        />
      )}

      {/* Expanded panel content area */}
      {expanded && ActiveComponent && (
        <div className="flex-1 min-w-0 h-full border border-border/70 rounded-2xl bg-card/60 backdrop-blur-xl flex flex-col overflow-hidden shadow-sm mr-2 select-text">
          {/* Panel header for non-console tools */}
          {activePanel !== 'console' && (
            <div className="shrink-0 h-11 px-4 flex items-center justify-between border-b border-border/60 bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground tracking-wide uppercase">
                  {activePanelDef?.label}
                </span>
              </div>
              <button
                onClick={() => { setExpanded(false); setActivePanel(null); }}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
                title="Collapse panel"
              >
                <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          )}

          {/* Panel component */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ActiveComponent scene={scene} />
          </div>
        </div>
      )}

      {/* Vertical icon strip pinned to right edge */}
      <div className="w-[56px] shrink-0 h-full flex flex-col items-center py-3 gap-2 border border-border/70 rounded-2xl bg-card/40 backdrop-blur-xl shadow-sm">
        {allRegistered.map((panel, i) => {
          const isEnabled = enabledPanels.some(p => p.id === panel.id);
          const isActive = expanded && activePanel === panel.id;
          const Icon = ICON_MAP[panel.icon] || Sparkles;
          const gateResult = panel.gate?.(scene);
          const isGated = gateResult && !gateResult.ok;
          const tooltip = !isEnabled
            ? `${panel.label} (feature not enabled)`
            : isGated
            ? `${panel.label}: ${gateResult?.reason || 'unavailable'}`
            : panel.label;

          return (
            <Tooltip key={panel.id}>
              <TooltipTrigger
                onClick={() => isEnabled && !isGated && togglePanel(panel.id)}
                disabled={!isEnabled || !!isGated}
                className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-all relative',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md scale-105'
                    : isEnabled && !isGated
                    ? 'text-muted-foreground hover:text-foreground hover:bg-accent/60 cursor-pointer'
                    : 'text-muted-foreground/30 cursor-not-allowed'
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={1.5} />
                {i < 9 && isEnabled && (
                  <span className="absolute -bottom-0.5 right-1 text-[8px] text-muted-foreground/60 font-mono">
                    {i + 1}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
