'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, ShieldCheck, Cpu, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TraceStep } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ToolStepCardProps {
  step: TraceStep;
  index: number;
}

const statusStyle = {
  OK: 'bg-confidence-high/15 text-confidence-high border-confidence-high/30',
  FAILED: 'bg-confidence-low/15 text-confidence-low border-confidence-low/30',
  SKIPPED: 'bg-muted text-muted-foreground border-border',
};

export default function ToolStepCard({ step, index }: ToolStepCardProps) {
  const [showParams, setShowParams] = useState(false);

  return (
    <Card className="bg-card border-border hover:border-brand-500/30 transition-colors min-w-[280px] max-w-[320px] shrink-0">
      <CardContent className="p-3.5 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded bg-brand-500/20 text-brand-500 font-mono text-[10px] font-bold">
              {step.id}
            </span>
            <span className="font-mono text-xs font-bold text-foreground">{step.tool}</span>
          </div>
          <Badge variant="outline" className={cn('text-[9px] font-mono', statusStyle[step.status])}>
            {step.status}
          </Badge>
        </div>

        {/* Model ID */}
        {step.model && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Cpu className="w-3 h-3 text-brand-500 shrink-0" />
            <span className="font-mono text-brand-400 truncate">{step.model}</span>
          </div>
        )}

        {/* Summary output */}
        <p className="text-xs text-foreground bg-secondary/50 p-2 rounded border border-border/50 font-mono text-[11px] leading-snug">
          {step.outputSummary}
        </p>

        {/* Stats row: duration & confidence */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{step.durationMs}ms</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-confidence-high" />
            <span>{(step.confidence * 100).toFixed(0)}% conf</span>
          </div>
        </div>

        {/* Collapsible Parameters */}
        <div>
          <button
            onClick={() => setShowParams(!showParams)}
            className="flex items-center gap-1 text-[10px] text-brand-500 hover:text-brand-400 transition-colors"
          >
            {showParams ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Parameters ({Object.keys(step.paramsApplied || {}).length})
          </button>
          {showParams && (
            <pre className="mt-1.5 p-2 bg-secondary/80 rounded text-[9px] font-mono text-muted-foreground overflow-x-auto max-h-[120px]">
              {JSON.stringify(step.paramsApplied, null, 2)}
            </pre>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
