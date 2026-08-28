'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';

interface QueryConsoleProps {
  scene: Scene;
}

// Map SSE stage names to pipeline stages
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
            // When we enter a tool-execution stage, mark as executing
            // (tool steps arriving mean we are in execution)
          } else if (event.type === 'step') {
            // We are now in the execution phase
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Query Console</h2>
            <p className="text-[10px] text-muted-foreground">
              Ask questions about your {scene.inputConfig.toLowerCase().replace('_', '-')} imagery
            </p>
          </div>
          <VerificationToggle enabled={verifyEnabled} onChange={setVerifyEnabled} />
        </div>
      </div>

      {/* Chat transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {turns.length === 0 && (
          <div className="py-8">
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
              <div className="bg-brand-500/15 border border-brand-500/20 rounded-xl rounded-tr-sm px-3.5 py-2 max-w-[90%]">
                <p className="text-sm text-foreground">{turn.query}</p>
              </div>
            </div>

            {/* Response */}
            {turn.isStreaming ? (
              <div className="space-y-2">
                {/* Live Pipeline Visualizer (inline) */}
                <PipelineVisualizer
                  currentStage={pipelineStage}
                  toolSteps={toolSteps}
                  verification={verificationState}
                  isLive={true}
                />
              </div>
            ) : turn.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-semibold text-destructive">
                  This query could not be answered.
                </p>
                <p className="mt-1 text-[11px] font-mono text-muted-foreground break-all">
                  {turn.error}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  No answer is shown because none was produced. Check the backend
                  is running and that this scene exists.
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

      {/* Input */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <div className="relative">
          <textarea
            id="query-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this scene..."
            disabled={isStreaming}
            rows={2}
            className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2.5 pr-12 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50"
          />
          <Button
            id="btn-submit-query"
            size="sm"
            onClick={handleSubmit}
            disabled={!query.trim() || isStreaming}
            className="absolute right-2 bottom-2 h-7 w-7 p-0 bg-brand-500 hover:bg-brand-600 text-white"
          >
            {isStreaming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Ctrl+Enter to submit
        </p>
      </div>
    </div>
  );
}
