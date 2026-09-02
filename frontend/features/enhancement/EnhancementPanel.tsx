'use client';

// F1 Enhancement Panel — Right Rail (Extensions PRD §4)
// Method selector, before/after slider, quality readout, standing notice.

import { useState, useCallback } from 'react';
import { Sparkles, AlertTriangle, Info, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

type Method = 'none' | 'radiometric' | 'pansharpen' | 'speckle' | 'sr_x2' | 'sr_x4';

const METHODS: { value: Method; label: string; desc: string }[] = [
  { value: 'none', label: 'None', desc: 'Original raster' },
  { value: 'radiometric', label: 'Radiometric', desc: '2-98% stretch + CLAHE' },
  { value: 'pansharpen', label: 'Pansharpen', desc: 'Brovey fusion (needs PAN band)' },
  { value: 'speckle', label: 'Speckle', desc: 'NLM filter (SAR)' },
  { value: 'sr_x2', label: 'SR ×2', desc: 'Super-resolution 2×' },
  { value: 'sr_x4', label: 'SR ×4', desc: 'Super-resolution 4×' },
];

interface EnhancementRecord {
  method: string;
  scale: number;
  effective_gsd_m: number | null;
  is_synthetic_resolution: boolean;
  quality: { ssim_vs_upsampled?: number; lap_var_before?: number; lap_var_after?: number };
  accepted: boolean;
  rejection_reason: string | null;
  duration_ms: number;
  cache_hit: boolean;
}

export default function EnhancementPanel({ scene }: { scene: any }) {
  const [method, setMethod] = useState<Method>('radiometric');
  const [running, setRunning] = useState(false);
  const [record, setRecord] = useState<EnhancementRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enhance = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/scenes/${scene.id}/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRecord(data);
    } catch (err: any) {
      setError(err.message || 'Enhancement failed');
    } finally {
      setRunning(false);
    }
  }, [scene.id, method]);

  const revert = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/scenes/${scene.id}/enhancement`, { method: 'DELETE' });
      setRecord(null);
    } catch {}
  }, [scene.id]);

  return (
    <div className="p-4 space-y-4">
      {/* Standing notice */}
      <div className="flex gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
          Enhancement improves <strong>perception only</strong>. All measurements
          (area, change, indices) always run on the original raster. No
          enhancement artefact contaminates any quantitative output.
        </p>
      </div>

      {/* Method selector */}
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
          Method
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {METHODS.map(m => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                'text-left px-3 py-2 rounded-lg border transition-all text-xs cursor-pointer',
                method === m.value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border/60 text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              )}
            >
              <span className="block font-medium">{m.label}</span>
              <span className="block text-[10px] text-muted-foreground mt-0.5">{m.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <Button
        onClick={enhance}
        disabled={running || method === 'none'}
        className="w-full gap-2"
        size="sm"
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Enhancing...</>
        ) : (
          <><Sparkles className="w-4 h-4" /> Apply Enhancement</>
        )}
      </Button>

      {error && (
        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
          {error}
        </div>
      )}

      {/* Quality readout */}
      {record && (
        <div className="space-y-3 border-t border-border/50 pt-3">
          <div className="flex items-center gap-2">
            {record.accepted ? (
              <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <Check className="w-4 h-4" />
                <span className="text-xs font-semibold">Accepted</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <X className="w-4 h-4" />
                <span className="text-xs font-semibold">Rejected — fallback applied</span>
              </div>
            )}
          </div>

          {record.rejection_reason && (
            <p className="text-[10px] text-muted-foreground">{record.rejection_reason}</p>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <span className="text-muted-foreground">Method</span>
            <span className="font-medium text-foreground">{record.method}</span>

            <span className="text-muted-foreground">Scale</span>
            <span className="font-medium text-foreground">{record.scale}×</span>

            {record.effective_gsd_m && (
              <>
                <span className="text-muted-foreground">Effective GSD</span>
                <span className="font-medium text-foreground">{record.effective_gsd_m.toFixed(1)} m</span>
              </>
            )}

            {record.quality?.ssim_vs_upsampled != null && (
              <>
                <span className="text-muted-foreground">SSIM</span>
                <span className="font-medium text-foreground">{record.quality.ssim_vs_upsampled.toFixed(4)}</span>
              </>
            )}

            {record.quality?.lap_var_after != null && (
              <>
                <span className="text-muted-foreground">Sharpness</span>
                <span className="font-medium text-foreground">
                  {record.quality.lap_var_before?.toFixed(1)} → {record.quality.lap_var_after.toFixed(1)}
                </span>
              </>
            )}

            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium text-foreground">{record.duration_ms} ms</span>

            {record.cache_hit && (
              <>
                <span className="text-muted-foreground">Cache</span>
                <span className="font-medium text-green-600">Hit</span>
              </>
            )}

            {record.is_synthetic_resolution && (
              <>
                <span className="text-muted-foreground col-span-2 text-amber-600 dark:text-amber-400 mt-1">
                  ⚠ Synthetic resolution — measurements use original GSD
                </span>
              </>
            )}
          </div>

          {/* Revert button */}
          <Button variant="outline" size="sm" onClick={revert} className="w-full mt-2">
            Revert to Original
          </Button>
        </div>
      )}
    </div>
  );
}
