'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldCheck, Cpu, Clock, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ExecutionTimeline from '@/components/trace/ExecutionTimeline';
import ConfidenceMeter from '@/components/trace/ConfidenceMeter';
import { mockTrace } from '@/lib/mocks';
import { ExecutionTrace } from '@/lib/types';

export default function TraceDetailPage() {
  const params = useParams();
  const sceneId = params?.sceneId as string;
  const queryId = params?.queryId as string;
  const [trace, setTrace] = useState<ExecutionTrace | null>(null);

  useEffect(() => {
    // In Phase 1 mock mode, return mockTrace
    setTrace(mockTrace);
  }, [queryId]);

  if (!trace) {
    return (
      <div className="flex flex-col h-full">
        <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Trace' }]} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Scene Workspace', href: `/scene/${sceneId}` },
          { label: `Trace ${trace.traceId}` },
        ]}
      />

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/scene/${sceneId}`}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-foreground">Execution Trace Audit</h1>
              <p className="text-xs text-muted-foreground font-mono">ID: {trace.traceId}</p>
            </div>
          </div>

          <Badge className="bg-confidence-high/15 text-confidence-high border-confidence-high/30">
            Status: {trace.status}
          </Badge>
        </div>

        {/* User Query Banner */}
        <Card className="bg-brand-500/10 border-brand-500/20">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1">User Query</p>
            <p className="text-base text-foreground font-medium">"{trace.query}"</p>
          </CardContent>
        </Card>

        {/* Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Task Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <Badge variant="outline" className="bg-brand-500/15 text-brand-500 font-mono text-xs">
                {trace.task.selected}
              </Badge>
              <p className="text-xs text-muted-foreground">
                Confidence: {(trace.task.classifierConfidence * 100).toFixed(0)}%
              </p>
              <div className="text-[11px] text-muted-foreground space-y-0.5">
                {trace.task.evidence.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Planner & Execution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Planner Backend:</span>
                <span className="font-mono text-foreground">{trace.plan.backend}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Steps:</span>
                <span className="font-mono text-foreground">{trace.plan.stepCount}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-mono text-foreground">{trace.durationMs} ms</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase">Aggregate Confidence</CardTitle>
            </CardHeader>
            <CardContent>
              <ConfidenceMeter confidence={trace.confidence} />
            </CardContent>
          </Card>
        </div>

        {/* Trace Steps Timeline */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Tool Execution DAG</CardTitle>
          </CardHeader>
          <CardContent>
            <ExecutionTimeline trace={trace} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
