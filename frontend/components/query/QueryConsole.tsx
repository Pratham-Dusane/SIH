'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import SuggestedQueries from './SuggestedQueries';
import AnswerCard from './AnswerCard';
import AbstentionNotice from './AbstentionNotice';
import { Scene, QueryStreamEvent } from '@/lib/types';
import { useStore } from '@/lib/store';
import { streamQuery } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface QueryConsoleProps {
  scene: Scene;
}

const stageLabels: Record<string, string> = {
  classifying: 'Classifying task…',
  validating: 'Validating inputs…',
  planning: 'Planning execution…',
  fusing: 'Fusing results…',
};

export default function QueryConsole({ scene }: QueryConsoleProps) {
  const [query, setQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStage, setStreamStage] = useState<string | null>(null);
  const [streamSteps, setStreamSteps] = useState<{ id: string; tool: string; status: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { turns, addTurn, updateLastTurn, setTurnResult, initLayers, setTraceDrawerOpen } = useStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, streamStage, streamSteps]);

  const handleSubmit = async () => {
    if (!query.trim() || isStreaming) return;
    const q = query.trim();
    setQuery('');
    setIsStreaming(true);
    setStreamStage(null);
    setStreamSteps([]);
    addTurn(q);

    try {
      const result = await streamQuery(scene.id, q, (event: QueryStreamEvent) => {
        if (event.type === 'stage') {
          setStreamStage(event.stage);
        } else if (event.type === 'step') {
          setStreamSteps((prev) => {
            const existing = prev.findIndex((s) => s.id === event.id);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = { id: event.id, tool: event.tool, status: event.status };
              return next;
            }
            return [...prev, { id: event.id, tool: event.tool, status: event.status }];
          });
        }
      });

      setTurnResult(result);
      initLayers(result.evidence);
      setTraceDrawerOpen(true);
    } catch (err) {
      updateLastTurn({
        isStreaming: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsStreaming(false);
      setStreamStage(null);
      setStreamSteps([]);
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
        <h2 className="text-sm font-semibold text-foreground">Query Console</h2>
        <p className="text-[10px] text-muted-foreground">
          Ask questions about your {scene.inputConfig.toLowerCase().replace('_', '-')} imagery
        </p>
      </div>

      {/* Chat transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {turns.length === 0 && (
          <div className="py-8">
            <SuggestedQueries
              inputConfig={scene.inputConfig}
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
                {/* Stage indicator */}
                {streamStage && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg animate-shimmer">
                    <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin" />
                    <span className="text-xs text-brand-500">
                      {stageLabels[streamStage] || streamStage}
                    </span>
                  </div>
                )}

                {/* Step chips */}
                {streamSteps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {streamSteps.map((step) => (
                      <Badge
                        key={step.id}
                        variant="outline"
                        className={cn(
                          'text-[10px] font-mono',
                          step.status === 'complete'
                            ? 'border-confidence-high/30 text-confidence-high'
                            : step.status === 'running'
                              ? 'border-brand-500/30 text-brand-500 animate-pulse'
                              : 'border-border text-muted-foreground'
                        )}
                      >
                        {step.status === 'running' && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
                        {step.tool}
                      </Badge>
                    ))}
                  </div>
                )}
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
            placeholder="Ask a question about this scene…"
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
