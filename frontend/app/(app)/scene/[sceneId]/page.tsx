'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import TopNav from '@/components/layout/TopNav';
import EvidenceCanvas from '@/components/evidence/EvidenceCanvas';
import LayerControls from '@/components/evidence/LayerControls';
import QueryConsole from '@/components/query/QueryConsole';
import ExecutionTimeline from '@/components/trace/ExecutionTimeline';
import { fetchScene } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Scene } from '@/lib/types';
import { mockScenes, mockQueryResults } from '@/lib/mocks';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AnalysisWorkspacePage() {
  const params = useParams();
  const sceneId = params?.sceneId as string;
  const {
    activeScene, setActiveScene,
    traceDrawerOpen, setTraceDrawerOpen,
    turns,
  } = useStore();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const scene = await fetchScene(sceneId);
      setActiveScene(scene);
      setLoading(false);
    };
    load();
  }, [sceneId, setActiveScene]);

  if (loading || !activeScene) {
    return (
      <div className="flex flex-col h-full">
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Loading...' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const lastTrace = turns.length > 0 ? turns[turns.length - 1]?.result?.trace : null;

  return (
    <div className="flex flex-col h-full">
      <TopNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Scene', href: '/dashboard' },
          { label: activeScene.name },
        ]}
      />

      {/* Main content: Canvas + Console */}
      <div className="flex-1 flex overflow-hidden">
        {/* Evidence Canvas */}
        <div className="relative flex-1 min-w-0">
          <EvidenceCanvas scene={activeScene} />
          <div className="absolute bottom-4 left-4 z-20">
            <LayerControls />
          </div>
        </div>

        {/* Query Console */}
        <div className="w-[420px] border-l border-border flex flex-col bg-card/50">
          <QueryConsole scene={activeScene} />
        </div>
      </div>

      {/* Execution Trace Drawer */}
      <div className={cn(
        'border-t border-border bg-card transition-all duration-300',
        traceDrawerOpen ? 'h-[280px]' : 'h-10'
      )}>
        <button
          id="btn-toggle-trace"
          onClick={() => setTraceDrawerOpen(!traceDrawerOpen)}
          className="flex items-center justify-between w-full h-10 px-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="font-medium uppercase tracking-wider">Execution Trace</span>
          <div className="flex items-center gap-2">
            {lastTrace && (
              <span className="text-[10px] text-muted-foreground">
                {lastTrace.task.selected} • {lastTrace.steps.length} steps • {lastTrace.durationMs}ms
              </span>
            )}
            {traceDrawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </button>
        {traceDrawerOpen && lastTrace && (
          <div className="overflow-auto px-4 pb-4" style={{ height: 'calc(100% - 40px)' }}>
            <ExecutionTimeline trace={lastTrace} />
          </div>
        )}
      </div>
    </div>
  );
}
