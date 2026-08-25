'use client';

import { BandStat } from '@/lib/types';

interface BandInspectorProps {
  bands: BandStat[];
}

export default function BandInspector({ bands }: BandInspectorProps) {
  return (
    <div className="mt-2 space-y-1">
      <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-3 text-[10px] text-muted-foreground font-medium px-2 py-1">
        <span>#</span>
        <span>Min</span>
        <span>Max</span>
        <span>Mean</span>
        <span>Label</span>
      </div>
      {bands.map((band) => (
        <div
          key={band.index}
          className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-3 text-[10px] px-2 py-1.5 rounded bg-secondary/30 hover:bg-secondary/50 transition-colors"
        >
          <span className="text-muted-foreground font-mono">B{band.index}</span>
          <span className="font-mono text-foreground">{band.min.toFixed(1)}</span>
          <span className="font-mono text-foreground">{band.max.toFixed(1)}</span>
          <span className="font-mono text-foreground">{band.mean.toFixed(1)}</span>
          <span className="text-brand-500 truncate">{band.label || band.description || '—'}</span>
        </div>
      ))}
    </div>
  );
}
