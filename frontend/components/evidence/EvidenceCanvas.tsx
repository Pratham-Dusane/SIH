'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Scene } from '@/lib/types';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2, Layers, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

interface EvidenceCanvasProps {
  scene: Scene;
}

/** Human label for an image role: t1/t2 read as dates, optical/sar as sensors. */
function roleLabel(role?: string): string {
  switch (role) {
    case 't1': return 'T1 (earlier)';
    case 't2': return 'T2 (later)';
    case 'optical': return 'Optical';
    case 'sar': return 'SAR';
    case 'single': return 'Image';
    default: return role ?? 'Image';
  }
}

export default function EvidenceCanvas({ scene }: EvidenceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  // Every scene image, indexed the same as scene.images. A bi-temporal or
  // cross-modal scene has two, and both must be reachable - previously only
  // images[0] was ever loaded, so the SAR / T2 image was invisible.
  const [loadedImages, setLoadedImages] = useState<(HTMLImageElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [blend, setBlend] = useState(false);
  const [blendAmount, setBlendAmount] = useState(0.5);
  const [imageError, setImageError] = useState(false);
  const { layers, turns } = useStore();

  // Memoised: `scene.images ?? []` would allocate a fresh array every render,
  // and this array is a dependency of the loader effect — that combination
  // re-runs the effect, sets state, and loops forever.
  const images = useMemo(() => scene.images ?? [], [scene.images]);
  const isMulti = images.length > 1;
  const baseImage = loadedImages[activeIndex] ?? null;

  // Resolve preview URL - handle relative paths, API proxied paths, etc.
  const resolvePreviewUrl = useCallback((url: string): string => {
    if (!url) return '';
    // Already absolute URL
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // API file path (from backend storage)
    if (url.startsWith('/api/')) return `${API_BASE}${url}`;
    // Relative path from backend (e.g. workspaces/ws_demo/scenes/...)
    if (!url.startsWith('/')) return `${API_BASE}/api/files/${url}`;
    // Path starting with / (Next.js public or sample)
    return url;
  }, []);

  // Load every preview in the scene, preserving index order.
  useEffect(() => {
    let cancelled = false;

    if (images.length === 0) {
      // Resolve asynchronously so the effect body never sets state
      // synchronously and cascades a render.
      Promise.resolve().then(() => {
        if (cancelled) return;
        setLoadedImages([]);
        setImageError(true);
      });
      return () => { cancelled = true; };
    }

    Promise.all(
      images.map((meta) => new Promise<HTMLImageElement | null>((resolve) => {
        if (!meta.previewUrl) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn('Preview image failed to load:', resolvePreviewUrl(meta.previewUrl));
          resolve(null);
        };
        img.src = resolvePreviewUrl(meta.previewUrl);
      })),
    ).then((loaded) => {
      if (cancelled) return;
      setLoadedImages(loaded);
      setImageError(loaded.every((i) => i === null));
      // Clamp the selection in case the new scene has fewer images.
      setActiveIndex((i) => (i < loaded.length ? i : 0));
    });

    return () => { cancelled = true; };
  }, [scene.id, images, resolvePreviewUrl]);

  // Render the canvas: real image or fallback
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, w, h);

    if (baseImage && !imageError) {
      // ─── Draw the ACTUAL satellite image ───
      // Fit the image into the canvas while preserving aspect ratio
      const imgAspect = baseImage.width / baseImage.height;
      const canvasAspect = w / h;
      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (imgAspect > canvasAspect) {
        // Image is wider - fit to width
        drawW = w;
        drawH = w / imgAspect;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        // Image is taller - fit to height
        drawH = h;
        drawW = h * imgAspect;
        drawX = (w - drawW) / 2;
        drawY = 0;
      }

      ctx.drawImage(baseImage, drawX, drawY, drawW, drawH);

      // Blend mode: draw the other image over the top at partial opacity, so
      // the two acquisitions (or the optical and SAR views) can be compared in
      // place. Anything that moved between them shows as a ghosted difference.
      if (blend && isMulti) {
        const otherIdx = (activeIndex + 1) % images.length;
        const other = loadedImages[otherIdx];
        if (other) {
          ctx.globalAlpha = blendAmount;
          // Both previews cover the same footprint, so reuse the same fitted
          // rect rather than re-fitting - otherwise a 192px SAR frame and a
          // 195px optical frame would not line up.
          ctx.drawImage(other, drawX, drawY, drawW, drawH);
          ctx.globalAlpha = 1;
        }
      }

      // Evidence overlays from turns
      const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
      const rawEv = lastTurn?.result?.evidence;
      const evidenceList: any[] = Array.isArray(rawEv)
        ? rawEv
        : (rawEv && typeof rawEv === 'object')
          ? Object.entries(rawEv).map(([key, val], idx) => ({
              id: key,
              type: 'mask',
              label: typeof val === 'string' ? val : key,
              colour: ['#38bdf8', '#f59e0b', '#10b981', '#a855f7'][idx % 4],
              sourceStep: key.split('.')[0] || 's1',
            }))
          : [];

      if (evidenceList.length > 0) {
        for (const ev of evidenceList) {
          const layerState = layers[ev.id];
          if (layerState && !layerState.visible) continue;

          ctx.globalAlpha = layerState?.opacity ?? 0.5;

          if (ev.type === 'mask' && ev.pngUrl) {
            // Load mask overlay image if available
            // For now draw a semi-transparent overlay indicator
            ctx.fillStyle = (ev.colour || '#38bdf8') + '30';
            ctx.fillRect(drawX, drawY, drawW, drawH);
          } else if (ev.type === 'boxes' && ev.boxes) {
            ctx.strokeStyle = ev.colour || '#38bdf8';
            ctx.lineWidth = 2;
            for (const box of ev.boxes) {
              const [x1, y1, x2, y2] = box.bbox;
              // Normalised coords [0,1] -> canvas coords
              const bx = drawX + x1 * drawW;
              const by = drawY + y1 * drawH;
              const bw = (x2 - x1) * drawW;
              const bh = (y2 - y1) * drawH;
              ctx.strokeRect(bx, by, bw, bh);
              ctx.fillStyle = ev.colour || '#38bdf8';
              ctx.font = '11px monospace';
              ctx.fillText(`${((box.score || 0) * 100).toFixed(0)}%`, bx + 3, by - 5);
            }
          }
        }
        ctx.globalAlpha = 1;
      }
    } else {
      // ─── Fallback: no preview available ───
      // Show a dark placeholder with a message
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#0d1b2a');
      gradient.addColorStop(0.5, '#1b2838');
      gradient.addColorStop(1, '#0d1b2a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = 'rgba(14, 165, 183, 0.06)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      // "No preview" message
      ctx.fillStyle = '#475569';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Preview image not available', w / 2, h / 2 - 10);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText('Upload a GeoTIFF to see the satellite image here', w / 2, h / 2 + 14);
      ctx.textAlign = 'start';
    }

    // ─── Scene info overlay (bottom-left) ───
    ctx.fillStyle = 'rgba(11, 17, 32, 0.85)';
    const infoW = 240;
    const infoH = 40;
    ctx.beginPath();
    ctx.roundRect(8, h - infoH - 8, infoW, infoH, 6);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(
      `${scene.images[0]?.width || 0} × ${scene.images[0]?.height || 0} px`,
      16, h - infoH + 6
    );
    ctx.fillText(
      `CRS: ${scene.compatibility.targetCrs || 'N/A'}  GSD: ${scene.compatibility.targetGsdM || 'N/A'} m`,
      16, h - infoH + 22
    );
  }, [scene, layers, turns, baseImage, imageError,
      blend, blendAmount, activeIndex, isMulti, images.length, loadedImages]);

  // Non-passive wheel event listener for zoom to avoid browser warnings
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.max(0.2, Math.min(z + delta, 5)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#0b1120] cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
        className="w-full h-full flex items-center justify-center"
      >
        <canvas
          ref={canvasRef}
          width={960}
          height={720}
          className="rounded-sm"
        />
      </div>

      {/* Zoom controls */}
      {/* Controls sit on the pan surface, so their drags must not reach it. */}
      <div
        className="absolute top-4 right-4 flex flex-col gap-1 z-20"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 bg-card/80 backdrop-blur border-border"
          onClick={() => setZoom((z) => Math.min(z + 0.2, 5))}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 bg-card/80 backdrop-blur border-border"
          onClick={() => setZoom((z) => Math.max(z - 0.2, 0.2))}
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 bg-card/80 backdrop-blur border-border"
          onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Image switcher + blend — only meaningful when the scene has a pair */}
      {/* Dragging the blend slider must not also pan the image. */}
      <div
        className="absolute top-4 left-4 z-20 flex flex-col gap-2 items-start"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-2 items-center">
          {images.map((img, i) => {
            const label = roleLabel(img.role);
            const selected = i === activeIndex;
            const missing = loadedImages[i] === null;
            return (
              <button
                key={`${img.role}-${i}`}
                onClick={() => setActiveIndex(i)}
                disabled={missing}
                title={missing
                  ? `${img.filename}: preview unavailable`
                  : `${img.filename} — ${img.modality}${img.acquiredAt ? ` — ${img.acquiredAt}` : ''}`}
                className={cn(
                  'px-2.5 py-1 rounded text-[10px] font-medium transition-colors border',
                  'backdrop-blur flex items-center gap-1.5',
                  missing && 'opacity-40 cursor-not-allowed',
                  selected
                    ? 'bg-brand-500/25 text-brand-500 border-brand-500/50'
                    : 'bg-card/70 text-muted-foreground border-border hover:text-foreground',
                )}
              >
                <ImageIcon className="w-3 h-3" />
                <span>{label}</span>
                <span className={cn(
                  'px-1 rounded text-[9px]',
                  img.modality === 'SAR'
                    ? 'bg-modality-sar/20 text-modality-sar'
                    : 'bg-modality-optical/20 text-modality-optical',
                )}>
                  {img.modality}
                </span>
              </button>
            );
          })}

          {isMulti && (
            <button
              onClick={() => setBlend((b) => !b)}
              title="Overlay both images semi-transparently to compare them in place"
              className={cn(
                'px-2.5 py-1 rounded text-[10px] font-medium transition-colors border',
                'backdrop-blur flex items-center gap-1.5',
                blend
                  ? 'bg-amber-500/25 text-amber-500 border-amber-500/50'
                  : 'bg-card/70 text-muted-foreground border-border hover:text-foreground',
              )}
            >
              <Layers className="w-3 h-3" />
              Blend
            </button>
          )}
        </div>

        {isMulti && blend && (
          <div className="flex items-center gap-2 bg-card/80 backdrop-blur border border-border
                          rounded px-2.5 py-1.5">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {roleLabel(images[activeIndex]?.role)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={blendAmount}
              onChange={(e) => setBlendAmount(Number(e.target.value))}
              className="w-28 accent-amber-500"
              aria-label="Blend amount"
            />
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {roleLabel(images[(activeIndex + 1) % images.length]?.role)}
            </span>
            <span className="text-[10px] font-mono text-foreground w-8 text-right">
              {(blendAmount * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
