'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import TopNav from '@/components/layout/TopNav';
import EvidenceCanvas from '@/components/evidence/EvidenceCanvas';
import LayerControls from '@/components/evidence/LayerControls';
import QueryConsole from '@/components/query/QueryConsole';
import ExecutionTimeline from '@/components/trace/ExecutionTimeline';
import Link from 'next/link';
import { ApiError, fetchScene } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Scene } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronUp, ChevronDown, CloudOff } from 'lucide-react';
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
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const scene = await fetchScene(sceneId);
        if (cancelled) return;
        setActiveScene(scene);
      } catch (err) {
        if (cancelled) return;
        // Show the failure. Substituting a demo scene here is what made a
        // missing scene render as someone else's imagery under a hardcoded name.
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
      <div className="flex flex-col h-full">
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Loading…' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !activeScene) {
    const notFound = error?.isNotFound ?? true;
    const unreachable = error?.status === 0;
    return (
      <div className="flex flex-col h-full">
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
                  ? <>No scene with id <code className="font-mono text-foreground">{sceneId}</code> is
                    stored in this workspace. Upload imagery to create one.</>
                  : error?.message}
            </p>
            {error && (
              <p className="text-[11px] font-mono text-muted-foreground/80 break-all">
                {error.message}
              </p>
            )}
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
    <div className="flex flex-col h-full max-h-full overflow-hidden">
      <TopNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Scene', href: '/dashboard' },
          { label: activeScene.name },
        ]}
      />

      {/* Main content: Canvas + Console */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Evidence Canvas */}
        <div className="relative flex-1 min-w-0 h-full">
          <EvidenceCanvas scene={activeScene} />
          <div className="absolute bottom-4 left-4 z-20">
            <LayerControls />
          </div>
        </div>

        {/* Query Console */}
        <div className="w-[420px] shrink-0 border-l border-border flex flex-col bg-card/50 h-full">
          <QueryConsole scene={activeScene} />
        </div>
      </div>

      {/* Execution Trace Drawer */}
      <div className={cn(
        'border-t border-border bg-card transition-all duration-300 shrink-0 overflow-hidden',
        traceDrawerOpen ? 'h-[320px]' : 'h-10'
      )}>
        <button
          id="btn-toggle-trace"
          onClick={() => setTraceDrawerOpen(!traceDrawerOpen)}
          className="flex items-center justify-between w-full h-10 px-4 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <span className="font-medium uppercase tracking-wider">Execution Trace</span>
          <div className="flex items-center gap-2">
            {lastTrace && (
              <span className="text-[10px] text-muted-foreground">
                {lastTrace.task?.selected} • {lastTrace.steps?.length} steps • {lastTrace.durationMs}ms
              </span>
            )}
            {traceDrawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </button>
        {traceDrawerOpen && lastTrace && (
          <div className="overflow-auto px-4 pb-4 max-w-full" style={{ height: 'calc(100% - 40px)' }}>
            <ExecutionTimeline trace={lastTrace} />
          </div>
        )}
      </div>
    </div>
  );
}
