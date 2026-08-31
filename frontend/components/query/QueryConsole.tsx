'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SuggestedQueries from './SuggestedQueries';
import AnswerCard from './AnswerCard';
import AbstentionNotice from './AbstentionNotice';
import { VerificationToggle } from './VerificationBadge';
import PipelineVisualizer, {
  PipelineStage, ToolStep, VerificationState,
} from '@/components/trace/PipelineVisualizer';
import { Scene, QueryStreamEvent } from '@/lib/types';
import { useStore } from '@/lib/store';
import { streamQuery } from '@/lib/api';

interface QueryConsoleProps {
  scene: Scene;
}

function toPipelineStage(stage: string): PipelineStage | null {
  const map: Record<string, PipelineStage> = {
    classifying: 'classifying',
    validating: 'validating',
    planning: 'planning',
    fusing: 'fusing',
    verifying: 'verifying',
  };
  return map[stage] || null;
}

export default function QueryConsole({ scene }: QueryConsoleProps) {
  const [query, setQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(null);
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);
  const [verificationState, setVerificationState] = useState<VerificationState | null>(null);
  const [verifyEnabled, setVerifyEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { turns, addTurn, updateLastTurn, setTurnResult, initLayers } = useStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, pipelineStage, toolSteps, verificationState]);

  const handleSubmit = async () => {
    if (!query.trim() || isStreaming) return;
    const q = query.trim();
    setQuery('');
    setIsStreaming(true);
    setPipelineStage(null);
    setToolSteps([]);
    setVerificationState(null);
    addTurn(q);

    try {
      const result = await streamQuery(
        scene.id,
        q,
        (event: QueryStreamEvent) => {
          if (event.type === 'stage') {
            const stage = toPipelineStage(event.stage);
            if (stage) setPipelineStage(stage);
          } else if (event.type === 'step') {
            setPipelineStage('executing');
            setToolSteps((prev) => {
              const existing = prev.findIndex((s) => s.id === event.id);
              const step: ToolStep = {
                id: event.id,
                tool: event.tool,
                status: event.status as ToolStep['status'],
                summary: event.summary,
                confidence: event.confidence,
                durationMs: event.durationMs,
                reason: event.reason,
              };
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = step;
                return next;
              }
              return [...prev, step];
            });
          } else if (event.type === 'verification') {
            setVerificationState({
              status: event.status,
              reason: event.reason,
            });
          }
        },
        verifyEnabled,
      );

      setPipelineStage('complete');
      setTurnResult(result);
      initLayers(result.evidence);
    } catch (err) {
      updateLastTurn({
        isStreaming: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-card/60 backdrop-blur-md">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/80 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Query Console</h2>
            <p className="text-[10px] text-muted-foreground">
              multimodal analysis over {scene.inputConfig.toLowerCase().replace('_', '-')} imagery
            </p>
          </div>
          <VerificationToggle enabled={verifyEnabled} onChange={setVerifyEnabled} />
        </div>
      </div>

      {/* Chat transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {turns.length === 0 && (
          <div className="py-4">
            <SuggestedQueries
              inputConfig={scene.inputConfig}
              sceneId={scene.id}
              onSelect={(q) => setQuery(q)}
            />
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className="space-y-3">
            {/* User query */}
            <div className="flex justify-end">
              <div className="bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 rounded-2xl rounded-tr-xs px-4 py-2.5 max-w-[90%] shadow-sm">
                <p className="text-xs sm:text-sm leading-relaxed">{turn.query}</p>
              </div>
            </div>

            {/* Response */}
            {turn.isStreaming ? (
              <div className="space-y-2">
                <PipelineVisualizer
                  currentStage={pipelineStage}
                  toolSteps={toolSteps}
                  verification={verificationState}
                  isLive={true}
                />
              </div>
            ) : turn.error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-semibold text-destructive">
                  This query could not be answered.
                </p>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground break-all">
                  {turn.error}
                </p>
              </div>
            ) : turn.result ? (
              turn.result.abstained ? (
                <AbstentionNotice result={turn.result} />
              ) : (
                <AnswerCard result={turn.result} />
              )
            ) : null}
          </div>
        ))}
      </div>

      {/* Input Box - Command Line / Prompt Box style */}
      <div className="p-3 border-t border-border/80 shrink-0">
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 shadow-sm focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent transition-all p-2">
          <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] text-muted-foreground font-mono">
            <Terminal className="w-3 h-3 text-primary" strokeWidth={1.5} />
            <span>query prompt</span>
          </div>
          <textarea
            id="query-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a natural language question about this satellite scene..."
            disabled={isStreaming}
            rows={2}
            className="w-full bg-transparent px-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 resize-none focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between pt-1 px-1">
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              Ctrl+Enter to send
            </span>
            <Button
              id="btn-submit-query"
              size="sm"
              onClick={handleSubmit}
              disabled={!query.trim() || isStreaming}
              className="h-8 px-3 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 font-medium text-xs gap-1.5 shadow-sm"
            >
              {isStreaming ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <span>Send</span>
                  <Send className="w-3 h-3" strokeWidth={1.5} />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
