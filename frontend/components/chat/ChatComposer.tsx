'use client';

// SatQuery AI - ChatComposer Primitive (Extensions PRD §3.3)
// Reusable chat input used by v1 QueryConsole, F3, F5, F6, and F8.
// Autosize textarea (1-8 rows), Cmd/Ctrl+Enter submit, Enter newline,
// draft persistence, busy state, aria-live region, suggestions, accessories.

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ContextChip {
  id: string;
  label: string;
  icon?: string;
  onRemove?: () => void;
}

export interface ComposerAttachment {
  type: string;
  id: string;
  data?: any;
}

export interface ChatComposerProps {
  onSubmit: (text: string, attachments?: ComposerAttachment[]) => void;
  placeholder?: string;
  suggestions?: string[];
  contextChips?: ContextChip[];
  accessories?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
  busy?: boolean;
  draftKey?: string;  // key for draft persistence per surface
}

export default function ChatComposer({
  onSubmit,
  placeholder = 'Ask a question about this scene...',
  suggestions,
  contextChips,
  accessories,
  disabled = false,
  disabledReason,
  busy = false,
  draftKey,
}: ChatComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Draft persistence
  useEffect(() => {
    if (draftKey) {
      const saved = sessionStorage.getItem(`composer-draft-${draftKey}`);
      if (saved) setText(saved);
    }
  }, [draftKey]);

  useEffect(() => {
    if (draftKey && text) {
      sessionStorage.setItem(`composer-draft-${draftKey}`, text);
    }
  }, [text, draftKey]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      const lineHeight = 22;
      const maxHeight = lineHeight * 8;
      ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
    }
  }, [text]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy || disabled) return;
    onSubmit(trimmed);
    setText('');
    if (draftKey) {
      sessionStorage.removeItem(`composer-draft-${draftKey}`);
    }
  }, [text, busy, disabled, onSubmit, draftKey]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const canSubmit = text.trim().length > 0 && !busy && !disabled;

  return (
    <div className="flex flex-col gap-2">
      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && !text && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setText(s); textareaRef.current?.focus(); }}
              className="text-[11px] px-2.5 py-1.5 rounded-full bg-primary/8 text-primary
                hover:bg-primary/15 transition-colors border border-primary/15 cursor-pointer
                leading-tight"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Context chips */}
      {contextChips && contextChips.length > 0 && (
        <div className="flex flex-wrap gap-1 px-1">
          {contextChips.map(chip => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full
                bg-accent/60 text-accent-foreground border border-border/50"
            >
              {chip.label}
              {chip.onRemove && (
                <button onClick={chip.onRemove} className="text-muted-foreground hover:text-foreground ml-0.5 cursor-pointer">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className={cn(
        'relative flex items-end gap-2 rounded-xl border border-border/80 bg-background/60 backdrop-blur-sm px-3 py-2 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20'
      )}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? (disabledReason || placeholder) : placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60',
            'focus:outline-none min-h-[22px] max-h-[176px] leading-[22px]',
            disabled && 'cursor-not-allowed'
          )}
          aria-label="Query input"
        />

        {/* Accessories slot (F8 mic goes here) */}
        {accessories}

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'shrink-0 h-8 w-8 p-0 rounded-lg transition-all',
            canSubmit
              ? 'text-primary hover:bg-primary/10 cursor-pointer'
              : 'text-muted-foreground/40'
          )}
          aria-label="Submit query"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" strokeWidth={1.5} />
          )}
        </Button>
      </div>

      {/* Status region */}
      {busy && (
        <div aria-live="polite" className="text-[10px] text-muted-foreground px-1 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing...
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/50 px-1">
        ⌘+Enter to submit · Enter for newline
      </p>
    </div>
  );
}
