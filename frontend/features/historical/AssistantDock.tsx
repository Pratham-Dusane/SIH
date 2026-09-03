'use client';

/**
 * AssistantDock — cross-scene retrieval assistant (Extensions PRD §8, F5).
 *
 * A star button parked bottom-right of the analytics dashboard; clicking it
 * opens a chat rail that can answer questions spanning every scene in the
 * workspace ("which districts have I looked at?", "how many bi-temporal pairs?").
 *
 * The grounding contract is visible in the UI, not just the backend:
 *
 * - Workspace figures come from `aggregates`, computed server-side from the
 *   stored rows. They are rendered as their own strip so a reader can check the
 *   prose against them.
 * - Every answer carries the scene ids it was retrieved from, rendered as
 *   clickable citations into the workbench.
 * - When the language model is unreachable the reply is the deterministic
 *   record dump, and it is labelled as such rather than passed off as generated.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Database, Loader2, Send, Sparkles, X,
} from 'lucide-react';

import Markdown from '@/components/query/Markdown';
import { Button } from '@/components/ui/button';
import { askAssistant } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AssistantAggregates, AssistantResponse } from '@/lib/types';

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  citations?: string[];
  aggregates?: AssistantAggregates;
  degraded?: boolean;
  reason?: string | null;
  model?: string | null;
  failed?: boolean;
}

const SUGGESTIONS = [
  'Which districts have I analysed?',
  'How many bi-temporal pairs have I run?',
  'What did the change detection find?',
  'Which scenes have no queries yet?',
];

export default function AssistantDock({
  sceneCount,
}: {
  /** Shown on the launcher so the affordance says what it can search. */
  sceneCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the newest turn in view as answers stream in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;

    const id = `${Date.now()}`;
    setTurns((t) => [...t, { id: `u-${id}`, role: 'user', text: q }]);
    setDraft('');
    setBusy(true);

    try {
      const res: AssistantResponse = await askAssistant(q);
      setTurns((t) => [...t, {
        id: `a-${id}`,
        role: 'assistant',
        text: res.answer,
        citations: res.citations,
        aggregates: res.aggregates,
        degraded: res.degraded,
        reason: res.reason,
        model: res.model,
      }]);
    } catch (err) {
      // A failed request is reported as a failure — never as an empty answer.
      setTurns((t) => [...t, {
        id: `a-${id}`,
        role: 'assistant',
        failed: true,
        text: err instanceof Error ? err.message : String(err),
      }]);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Launcher                                                          */}
      {/* ---------------------------------------------------------------- */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="group fixed bottom-6 right-6 z-40 flex items-center gap-2"
          >
            {/* The label is a sibling, not padding inside the button. An
                earlier version expanded the button itself on hover, which made
                it 50x37 - a pill, never a circle. */}
            <span className="pointer-events-none max-w-0 overflow-hidden whitespace-nowrap
                             rounded-full bg-popover/95 text-xs font-semibold text-foreground
                             opacity-0 shadow-lg backdrop-blur transition-all duration-300
                             group-hover:max-w-[16rem] group-hover:px-3 group-hover:py-2
                             group-hover:opacity-100">
              Ask across{' '}
              {typeof sceneCount === 'number' ? `${sceneCount} scenes` : 'your scenes'}
            </span>

            <button
              onClick={() => setOpen(true)}
              aria-label="Open the workspace assistant"
              className="relative grid size-14 shrink-0 place-items-center rounded-full
                         border border-primary/30 bg-primary text-primary-foreground
                         shadow-lg shadow-primary/25 transition-shadow hover:shadow-xl
                         hover:shadow-primary/35"
            >
              <span className="absolute inset-2 animate-ping rounded-full bg-primary-foreground/20" />
              <Sparkles className="relative size-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------------- */}
      {/* Rail                                                              */}
      {/* ---------------------------------------------------------------- */}
      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            role="dialog"
            aria-label="Workspace assistant"
            className="tint-brand fixed bottom-6 right-6 top-20 z-40 flex w-[min(24rem,calc(100vw-3rem))]
                       flex-col overflow-hidden rounded-3xl border border-border
                       bg-card/95 shadow-2xl backdrop-blur-xl"
          >
            <header className="tint-rule-brand flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-foreground">Workspace assistant</p>
                  <p className="text-[10px] text-muted-foreground">
                    Reads your scenes, queries and traces
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close the assistant"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors
                           hover:bg-foreground/5 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {turns.length === 0 && (
                <div className="space-y-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Ask about anything this workspace has analysed. Answers are drawn
                    from stored records only — figures come from the database, not
                    from the model.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => ask(s)}
                        className="rounded-full border border-border bg-background px-2.5 py-1
                                   text-[11px] text-muted-foreground transition-colors
                                   hover:border-primary/40 hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turns.map((t) => (
                <TurnBubble key={t.id} turn={t} />
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Searching your scenes…
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); ask(draft); }}
              className="border-t border-border p-3"
            >
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2
                              focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  disabled={busy}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); }
                  }}
                  placeholder="Ask about your scenes…"
                  aria-label="Question for the workspace assistant"
                  className="max-h-28 min-h-[1.5rem] flex-1 resize-none bg-transparent text-xs
                             text-foreground outline-none placeholder:text-muted-foreground"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || !draft.trim()}
                  className="size-7 shrink-0 rounded-xl p-0"
                  aria-label="Send"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                </Button>
              </div>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------

function TurnBubble({ turn }: { turn: Turn }) {
  if (turn.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs
                      leading-relaxed text-primary-foreground">
          {turn.text}
        </p>
      </div>
    );
  }

  if (turn.failed) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-destructive/30
                      bg-destructive/5 px-3 py-2">
        <AlertTriangle className="mt-px size-3.5 shrink-0 text-destructive" />
        <p className="text-[11px] leading-relaxed text-destructive">{turn.text}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="max-w-full rounded-2xl rounded-bl-md border border-border bg-background
                      px-3 py-2 text-xs leading-relaxed text-foreground">
        <Markdown text={turn.text} />
      </div>

      {turn.degraded && (
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-500">
          <AlertTriangle className="mt-px size-3 shrink-0" />
          <span>
            Language model unavailable ({turn.reason}) — this is the raw record list,
            not a generated answer.
          </span>
        </p>
      )}

      {turn.aggregates && <AggregateStrip aggregates={turn.aggregates} />}

      {turn.citations && turn.citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span
            className="text-[10px] text-muted-foreground"
            title="The assistant sees a one-line summary of every scene in the workspace; these are the ones it read in full."
          >
            Read in full:
          </span>
          {turn.citations.map((id) => (
            <Link
              key={id}
              href={`/scene/${id}`}
              title={id}
              className="rounded-md border border-border bg-background px-1.5 py-0.5
                         font-mono text-[10px] text-muted-foreground transition-colors
                         hover:border-primary/40 hover:text-primary"
            >
              {id.replace(/^scene_/, '').slice(-6)}
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}

/**
 * Workspace totals as returned by the server. Rendered separately from the
 * prose so a figure in the answer can be checked against the stored rows
 * rather than taken on the model's word.
 */
function AggregateStrip({ aggregates }: { aggregates: AssistantAggregates }) {
  const configs = Object.entries(aggregates.byInputConfig ?? {});
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-2.5 py-2">
      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        <Database className="size-2.5" />
        From the database
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <Fact label="scenes" value={aggregates.sceneCount} />
        <Fact label="queries" value={aggregates.queryCount} />
        <Fact label="georeferenced" value={aggregates.georeferencedScenes} />
        {aggregates.meanConfidence != null && (
          <Fact label="mean conf." value={aggregates.meanConfidence.toFixed(2)} />
        )}
        {configs.map(([k, v]) => (
          <Fact key={k} label={k.toLowerCase().replace('_', '-')} value={v} />
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: number | string }) {
  return (
    <span className={cn('tabular-nums')}>
      <span className="font-semibold text-foreground">{value}</span> {label}
    </span>
  );
}
