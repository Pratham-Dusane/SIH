'use client';

import { ArrowRight, Clock, Cpu, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ToolStepCard from './ToolStepCard';
import PipelineVisualizer, { ToolStep, VerificationState } from './PipelineVisualizer';
import DownloadModal from './DownloadModal';
import { ExecutionTrace } from '@/lib/types';

interface ExecutionTimelineProps {
  trace: ExecutionTrace;
}

export default function ExecutionTimeline({ trace }: ExecutionTimelineProps) {
  const toolSteps: ToolStep[] = (trace.steps || []).map((s) => ({
    id: s.id,
    tool: s.tool,
    status: s.status === 'OK' ? 'complete' : s.status === 'FAILED' ? 'failed' : 'skipped',
    summary: s.outputSummary,
    confidence: s.confidence,
    durationMs: s.durationMs,
  }));

  const verification: VerificationState | null = trace.verification
    ? {
        status: trace.verification.status as VerificationState['status'],
        reason: trace.verification.reason,
      }
    : null;

  // The backend persists queries keyed by trace_id, so that is the query ID
  // the export endpoints need.
  const queryId = trace.traceId;

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            <span className="text-muted-foreground">Task:</span>
            <Badge variant="outline" className="text-[10px] font-mono bg-brand-500/10 text-brand-500 border-brand-500/30">
              {trace.task?.selected || 'N/A'}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Planner:</span>
            <span className="font-mono text-foreground">{trace.plan?.backend || 'rules'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Wall time:</span>
            <span className="font-mono text-foreground">{trace.durationMs || 0}ms</span>
          </div>
        </div>

        <DownloadModal queryId={queryId} compact />
      </div>

      {/* Completed Pipeline Visualizer Graph */}
      <div className="p-2 rounded-lg bg-card/60 border border-border/60">
        <PipelineVisualizer
          currentStage="complete"
          toolSteps={toolSteps}
          verification={verification}
          isLive={false}
        />
      </div>

      {/* Horizontal Step Cards Sequence */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1">
        {trace?.steps?.map((step, idx) => (
          <div key={step.id} className="flex items-center gap-2">
            <ToolStepCard step={step} index={idx} />
            {idx < (trace.steps?.length || 0) - 1 && (
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
