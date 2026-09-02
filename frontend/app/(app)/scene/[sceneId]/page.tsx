'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import TopNav from '@/components/layout/TopNav';
import EvidenceCanvas from '@/components/evidence/EvidenceCanvas';
import LayerControls from '@/components/evidence/LayerControls';
import QueryConsole from '@/components/query/QueryConsole';
import ExecutionTimeline from '@/components/trace/ExecutionTimeline';
import AcquisitionDates from '@/components/scene/AcquisitionDates';
import Link from 'next/link';
import { ApiError, fetchScene } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronUp, ChevronDown, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

import RightRail from '@/components/workbench/RightRail';
import { useFeaturesStore } from '@/lib/features-store';

// Import feature registrations
import '@/features';

import { useAnnotationStore } from '@/features/annotation/annotation-store';

export default function AnalysisWorkspacePage() {
  const params = useParams();
  const sceneId = params?.sceneId as string;
  const {
    activeScene, setActiveScene,
    traceDrawerOpen, setTraceDrawerOpen,
    turns,
  } = useStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const { fetchFeatures } = useFeaturesStore();

  // Fetch feature flags once
  useEffect(() => { fetchFeatures(); }, [fetchFeatures]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const scene = await fetchScene(sceneId);
        if (cancelled) return;
        setActiveScene(scene);
        // Load annotation layers for this scene
        useAnnotationStore.getState().loadLayersForScene(sceneId);
      } catch (err) {
        if (cancelled) return;
        setActiveScene(null);
        setError(err instanceof ApiError
          ? err
          : new ApiError(String(err), 0, `/api/scenes/${sceneId}`));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [sceneId, setActiveScene]);

  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Loading...' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !activeScene) {
    const notFound = error?.isNotFound ?? true;
    const unreachable = error?.status === 0;
    return (
      <div className="flex flex-col h-full min-h-0">
        <TopNav
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: notFound ? 'Scene not found' : 'Scene unavailable' },
          ]}
        />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="flex justify-center">
              {unreachable
                ? <CloudOff className="w-10 h-10 text-destructive" />
                : <AlertTriangle className="w-10 h-10 text-amber-500" />}
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {unreachable
                ? 'Cannot reach the backend'
                : notFound
                  ? 'This scene does not exist'
                  : 'Scene could not be loaded'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {unreachable
                ? 'The API did not respond. Start the backend and try again.'
                : notFound
                  ? <>No scene with id <code className="font-mono text-foreground">{sceneId}</code> is stored in this workspace.</>
                  : error?.message}
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <Link href="/dashboard">
                <Button variant="outline" size="sm">Back to dashboard</Button>
              </Link>
              <Link href="/scene/new">
                <Button size="sm">Upload imagery</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const lastTrace = turns.length > 0 ? turns[turns.length - 1]?.result?.trace : null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="shrink-0">
        <TopNav
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Scene', href: '/dashboard' },
            { label: activeScene.name },
          ]}
          extra={<AcquisitionDates scene={activeScene} onUpdated={setActiveScene} />}
        />
      </div>

      {/* Main content: Canvas + Right Rail (Housing Console, Enhancement, Annotation, Location Context) */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden rounded-2xl">
        {/* Evidence Canvas */}
        <div className="relative flex-1 min-w-0 h-full rounded-2xl overflow-hidden">
          <EvidenceCanvas scene={activeScene} />
          <div className="absolute bottom-4 left-4 z-20">
            <LayerControls />
          </div>
        </div>

        {/* Right Rail with unified panels (Console, Enhancement, Annotation, Location Context) */}
        <RightRail scene={activeScene} />
      </div>

      {/* Execution Trace Drawer */}
      <div className={cn(
        'mt-2.5 rounded-2xl border border-border/80 bg-card/75 backdrop-blur-xl transition-all duration-300 shrink-0 overflow-hidden shadow-sm',
        traceDrawerOpen ? 'h-[230px]' : 'h-9'
      )}>
        <button
          id="btn-toggle-trace"
          onClick={() => setTraceDrawerOpen(!traceDrawerOpen)}
          className="w-full h-9 px-4 flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Execution Trace & Provenance
          </span>
          {traceDrawerOpen ? (
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>

        {traceDrawerOpen && (
          <div className="p-4 pt-1 h-[190px] overflow-y-auto">
            {lastTrace ? (
              <ExecutionTimeline trace={lastTrace} />
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No trace recorded for this session yet. Run a query to inspect live tool execution timeline.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
