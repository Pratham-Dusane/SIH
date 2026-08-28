'use client';

/**
 * Acquisition-date editor.
 *
 * `rs_classify` and `change_detect` query the Earth Engine catalog by AOI +
 * date range. Most downloaded GeoTIFFs carry no date tag this backend can
 * parse, so those tools correctly refuse with NO_DATES rather than inventing a
 * window — but until now there was no way to supply the dates from the UI, so
 * the refusal was a dead end instead of a remedy.
 */

import { useEffect, useState } from 'react';
import { CalendarClock, Check, Loader2, Lock, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { fetchSceneQueries, setSceneDates } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Scene } from '@/lib/types';

function roleLabel(role: string): string {
  switch (role) {
    case 't1': return 'T1 (earlier)';
    case 't2': return 'T2 (later)';
    case 'optical': return 'Optical';
    case 'sar': return 'SAR';
    case 'single': return 'Image';
    default: return role;
  }
}

interface Props {
  scene: Scene;
  onUpdated: (scene: Scene) => void;
}

export default function AcquisitionDates({ scene, onUpdated }: Props) {
  const images = scene.images ?? [];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(images.map((i) => [i.role, i.acquiredAt ?? ''])),
  );

  const missing = images.filter((i) => !i.acquiredAt);
  const allSet = missing.length === 0;

  // Dates are an input to every stored answer and trace, so the backend locks
  // them once the scene has been queried. Reflect that instead of offering an
  // edit that will be rejected.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchSceneQueries(scene.id)
      .then((h) => { if (!cancelled) setLocked(h.datesLocked); })
      .catch(() => { /* leave unlocked; the backend is still authoritative */ });
    return () => { cancelled = true; };
  }, [scene.id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const byRole = Object.fromEntries(
        Object.entries(dates).filter(([, v]) => v),
      );
      const updated = await setSceneDates(scene.id, byRole);
      onUpdated(updated);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (locked) {
    const summary = images
      .map((i) => `${roleLabel(i.role)}: ${i.acquiredAt ?? 'not set'}`)
      .join('  ·  ');
    return (
      <span
        title={`Locked - this scene has been queried. ${summary}`}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium
                   border border-border bg-secondary/60 text-muted-foreground"
      >
        <Lock className="w-3.5 h-3.5" />
        {allSet ? 'Dates locked' : 'Dates not set - locked'}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={allSet
          ? 'Acquisition dates are set — Earth Engine tools can run'
          : 'Earth Engine tools need acquisition dates to query the catalog'}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium',
          'border transition-colors backdrop-blur',
          allSet
            ? 'bg-confidence-high/15 text-confidence-high border-confidence-high/30'
            : 'bg-amber-500/15 text-amber-500 border-amber-500/40 hover:bg-amber-500/25',
        )}
      >
        <CalendarClock className="w-3.5 h-3.5" />
        {allSet
          ? 'Dates set'
          : `Set acquisition date${missing.length > 1 ? 's' : ''}`}
      </button>
    );
  }

  return (
    <div className="absolute right-0 top-8 z-30 w-[320px] rounded-lg border border-border
                    bg-card shadow-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">Acquisition dates</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Earth Engine queries its catalog by area and date. Without these,
            <span className="font-mono"> rs_classify</span> and
            <span className="font-mono"> change_detect</span> refuse rather than
            guess a date range.
          </p>
        </div>
        <button onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {images.map((img) => (
          <label key={img.role} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-24 shrink-0">
              {roleLabel(img.role)}
            </span>
            <input
              type="date"
              value={dates[img.role] ?? ''}
              onChange={(e) =>
                setDates((d) => ({ ...d, [img.role]: e.target.value }))}
              className="flex-1 rounded border border-border bg-background px-2 py-1
                         text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </label>
        ))}
      </div>

      {error && (
        <p className="text-[11px] font-mono text-destructive break-all">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          {saving
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
            : <><Check className="w-3.5 h-3.5" />Save dates</>}
        </Button>
      </div>
    </div>
  );
}
