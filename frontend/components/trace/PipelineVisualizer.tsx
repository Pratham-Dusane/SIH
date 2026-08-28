'use client';

/**
 * PipelineVisualizer -- Aerospace / ISRO-grade Agentic Telemetry Visualizer.
 *
 * Renders the orchestration pipeline in real time as queries stream:
 * - [1] Task Classification & Modality Gating
 * - [2] Deterministic / Specialist Model Dispatch
 * - [3] Grounded Answer Fusion
 * - [4] Secondary Verification Pass
 *
 * Designed with refined telemetry aesthetics: sleek dark glass, crisp monospace
 * metadata, subtle status pulses, and high-density technical clarity.
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, CheckCircle2, XCircle, Loader2, ArrowDown,
  ShieldCheck, ShieldAlert, Activity, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PipelineStage =
  | 'classifying' | 'validating' | 'planning'
  | 'executing' | 'fusing' | 'verifying' | 'complete';

export interface ToolStep {
  id: string;
  tool: string;
  status: 'running' | 'complete' | 'skipped' | 'failed';
  summary?: string;
  confidence?: number;
  durationMs?: number;
  reason?: string;
}

export interface VerificationState {
  status: 'verified' | 'uncertain' | 'skipped';
  reason: string;
}

interface PipelineVisualizerProps {
  currentStage: PipelineStage | null;
  toolSteps: ToolStep[];
  verification?: VerificationState | null;
  isLive?: boolean;
}

export default function PipelineVisualizer({
  currentStage,
  toolSteps,
  verification,
  isLive = true,
}: PipelineVisualizerProps) {
  const isClassifying = currentStage === 'classifying';
  const isValidating = currentStage === 'validating';
  const isPlanning = currentStage === 'planning';
  const isExecuting = currentStage === 'executing';
  const isFusing = currentStage === 'fusing';
  const isVerifying = currentStage === 'verifying';
  const isComplete = currentStage === 'complete';

  const isPastClassify = !isClassifying && currentStage != null;
  const isPastGate = isPastClassify && !isValidating;
  const isPastPlan = isPastGate && !isPlanning;
  const isPastFuse = isComplete || isVerifying;

  return (
    <div className="rounded-xl border border-border/80 bg-card/90 shadow-lg backdrop-blur-md overflow-hidden text-xs">
      {/* Telemetry Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/60 bg-secondary/30">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {!isComplete ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-2 w-2 bg-confidence-high" />
            )}
          </span>
          <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-foreground/90">
            Agentic Orchestration Trace
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-muted-foreground" />
          <span className="font-mono text-[10px] text-muted-foreground">
            {!isComplete ? (currentStage || 'initializing') : 'executed'}
          </span>
        </div>
      </div>

      {/* Main Orchestration Flow */}
      <div className="p-3 space-y-2.5">
        {/* Stage 1: Classifier & Gate */}
        <div className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-secondary/20">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-bold',
              isPastGate
                ? 'bg-confidence-high/15 text-confidence-high border border-confidence-high/30'
                : isClassifying || isValidating
                  ? 'bg-brand-500/15 text-brand-500 border border-brand-500/30'
                  : 'bg-muted/40 text-muted-foreground'
            )}>
              {isPastGate ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : isClassifying || isValidating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                '01'
              )}
            </div>
            <div>
              <div className="font-semibold text-[11px] text-foreground flex items-center gap-1.5">
                Task Classifier & Modality Gate
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                {isClassifying
                  ? 'Classifying intent & sensor requirements...'
                  : isValidating
                    ? 'Validating input resolution & overlap...'
                    : 'Modality compatibility validated'}
              </p>
            </div>
          </div>
          <span className={cn(
            'text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold',
            isPastGate
              ? 'bg-confidence-high/10 text-confidence-high'
              : isClassifying || isValidating
                ? 'bg-brand-500/10 text-brand-500 animate-pulse'
                : 'text-muted-foreground/60'
          )}>
            {isPastGate ? 'PASS' : isClassifying || isValidating ? 'ACTIVE' : 'PENDING'}
          </span>
        </div>

        {/* Dynamic Planner & Specialist Execution */}
        <div className="rounded-lg border border-border/40 bg-secondary/10 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-muted-foreground">
              <Cpu className="w-3.5 h-3.5 text-brand-500" />
              Specialist Model Execution
            </div>
            {isPlanning && (
              <span className="text-[9px] font-mono text-brand-500 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Planning DAG...
              </span>
            )}
          </div>

          {/* Render Specialists */}
          {toolSteps.length > 0 ? (
            <div className="space-y-1.5 pt-0.5">
              {toolSteps.map((step) => {
                const isRunning = step.status === 'running';
                const isSuccess = step.status === 'complete';
                const isFailed = step.status === 'failed';

                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'flex items-center justify-between p-2 rounded-md border text-[11px] transition-all',
                      isRunning && 'bg-brand-500/10 border-brand-500/40 shadow-sm',
                      isSuccess && 'bg-secondary/40 border-border/60',
                      isFailed && 'bg-destructive/10 border-destructive/30',
                      step.status === 'skipped' && 'opacity-50 border-border/20 bg-secondary/10',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {isRunning ? (
                        <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin shrink-0" />
                      ) : isSuccess ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-confidence-high shrink-0" />
                      ) : isFailed ? (
                        <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-foreground truncate flex items-center gap-1.5">
                          {step.tool}
                          {step.durationMs != null && (
                            <span className="text-[9px] font-normal text-muted-foreground/80">
                              ({step.durationMs}ms)
                            </span>
                          )}
                        </div>
                        {step.summary && (
                          <div className="text-[10px] text-muted-foreground truncate max-w-[240px]">
                            {step.summary}
                          </div>
                        )}
                      </div>
                    </div>

                    {step.confidence != null && (
                      <div className="text-right shrink-0">
                        <span className={cn(
                          'font-mono text-[10px] font-bold px-1.5 py-0.5 rounded',
                          step.confidence >= 0.75
                            ? 'text-confidence-high bg-confidence-high/10'
                            : step.confidence >= 0.45
                              ? 'text-confidence-medium bg-confidence-medium/10'
                              : 'text-confidence-low bg-confidence-low/10'
                        )}>
                          {(step.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground/60 italic font-mono py-1 px-1 flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
              {isPlanning ? 'Selecting optimal specialist tools...' : 'Awaiting planner dispatch...'}
            </div>
          )}
        </div>

        {/* Stage 3: Grounded Answer Fusion */}
        <div className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-secondary/20">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-bold',
              isPastFuse
                ? 'bg-confidence-high/15 text-confidence-high border border-confidence-high/30'
                : isFusing
                  ? 'bg-brand-500/15 text-brand-500 border border-brand-500/30'
                  : 'bg-muted/40 text-muted-foreground'
            )}>
              {isPastFuse ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : isFusing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                '03'
              )}
            </div>
            <div>
              <div className="font-semibold text-[11px] text-foreground">
                Grounded Answer Fusion
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                {isFusing
                  ? 'Verifying numeric grounding against evidence...'
                  : isPastFuse
                    ? 'Numeric facts verified against raster arrays'
                    : 'Pending specialist completion'}
              </p>
            </div>
          </div>
          <span className={cn(
            'text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold',
            isPastFuse
              ? 'bg-confidence-high/10 text-confidence-high'
              : isFusing
                ? 'bg-brand-500/10 text-brand-500 animate-pulse'
                : 'text-muted-foreground/60'
          )}>
            {isPastFuse ? 'GROUNDED' : isFusing ? 'FUSING' : 'PENDING'}
          </span>
        </div>

        {/* Stage 4: Self-Verification (Second Pass) */}
        {verification && verification.status !== 'skipped' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={cn(
              'p-2 rounded-lg border flex items-start gap-2',
              verification.status === 'verified'
                ? 'bg-confidence-high/10 border-confidence-high/30'
                : 'bg-confidence-medium/10 border-confidence-medium/30'
            )}
          >
            {verification.status === 'verified' ? (
              <ShieldCheck className="w-4 h-4 text-confidence-high shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-confidence-medium shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className={cn(
                'text-[10px] font-mono uppercase font-bold',
                verification.status === 'verified' ? 'text-confidence-high' : 'text-confidence-medium'
              )}>
                Self-Verification Pass: {verification.status}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {verification.reason}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
