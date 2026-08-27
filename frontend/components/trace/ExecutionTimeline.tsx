'use client';

import { Download, ArrowRight, CheckCircle2, Clock, Cpu, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ToolStepCard from './ToolStepCard';
import { ExecutionTrace } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ExecutionTimelineProps {
  trace: ExecutionTrace;
}

export default function ExecutionTimeline({ trace }: ExecutionTimelineProps) {
  const downloadTraceJson = () => {
    const jsonStr = JSON.stringify(trace, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_${trace.traceId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

        <Button
          id="btn-download-trace"
          variant="outline"
          size="sm"
          onClick={downloadTraceJson}
          className="h-7 text-[11px] gap-1.5 border-border hover:bg-secondary"
        >
          <Download className="w-3 h-3" />
          Download Trace JSON
        </Button>
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
