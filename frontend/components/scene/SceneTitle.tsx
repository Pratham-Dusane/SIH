'use client';

/**
 * SceneTitle — inline-editable scene name, in the manner of a document title.
 *
 * The upload wizard no longer asks for a name: a scene is named after its file
 * and renamed here, once the user can actually see what it contains. Click to
 * edit, Enter to commit, Escape to abandon. A failed save restores the previous
 * name rather than leaving the UI showing something the server did not accept.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil } from 'lucide-react';

import { renameScene } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Scene } from '@/lib/types';

export default function SceneTitle({
  scene,
  onRenamed,
  className,
}: {
  scene: Scene;
  onRenamed: (scene: Scene) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the draft in step when the scene changes underneath us.
  useEffect(() => { setDraft(scene.name); }, [scene.name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    const name = draft.trim();
    if (!name || name === scene.name) {
      setDraft(scene.name);
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onRenamed(await renameScene(scene.id, name));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDraft(scene.name);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title="Click to rename this scene"
        className={cn(
          'group flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5',
          'text-left transition-colors hover:bg-foreground/[0.06]',
          className,
        )}
      >
        <span className="truncate font-semibold tracking-tight text-foreground">
          {scene.name}
        </span>
        <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <span className={cn('flex items-center gap-1.5', className)}>
      <input
        ref={inputRef}
        value={draft}
        disabled={saving}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(scene.name); setEditing(false); }
        }}
        aria-label="Scene name"
        className="min-w-[10ch] max-w-[32ch] rounded-lg border border-primary/50 bg-background px-1.5 py-0.5
                   font-semibold tracking-tight text-foreground outline-none
                   focus:ring-2 focus:ring-primary/30"
      />
      {saving
        ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        : <Check className="size-3.5 text-muted-foreground" />}
      {error && (
        <span className="max-w-[24ch] truncate text-[10px] text-destructive" title={error}>
          {error}
        </span>
      )}
    </span>
  );
}
