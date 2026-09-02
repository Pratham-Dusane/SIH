'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Scene } from '@/lib/types';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2, Layers, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AnnotationCanvas from '@/features/annotation/AnnotationCanvas';
import { useAnnotationStore } from '@/features/annotation/annotation-store';
import { useFeaturesStore } from '@/lib/features-store';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

interface EvidenceCanvasProps {
  scene: Scene;
}

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
  const [loadedImages, setLoadedImages] = useState<(HTMLImageElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [blend, setBlend] = useState(false);
  const [blendAmount, setBlendAmount] = useState(0.5);
  const [imageError, setImageError] = useState(false);
  const { layers, turns } = useStore();

  const images = useMemo(() => scene.images ?? [], [scene.images]);
  const isMulti = images.length > 1;
  const baseImage = loadedImages[activeIndex] ?? null;

  // Resolve preview URL across relative paths, API proxied paths, etc.
  const resolvePreviewUrl = useCallback((url: string): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/api/')) return `${API_BASE}${url}`;
    if (url.startsWith('/')) return `${API_BASE}${url}`;
    return `${API_BASE}/api/files/${url.replace(/^\/+/, '')}`;
  }, []);

  // Load every preview in the scene, preserving index order
  useEffect(() => {
    let cancelled = false;

    if (images.length === 0) {
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
        const targetUrl = resolvePreviewUrl(meta.previewUrl);

        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          // Retry with alternative /api/files path
          const cleanPath = meta.previewUrl.replace(/^\/+/, '');
          const altUrl = cleanPath.startsWith('api/files/')
            ? `${API_BASE}/${cleanPath}`
            : `${API_BASE}/api/files/${cleanPath}`;

          if (altUrl !== targetUrl) {
            const retryImg = new Image();
            retryImg.onload = () => resolve(retryImg);
            retryImg.onerror = () => {
              console.warn('Preview image failed to load:', targetUrl);
              resolve(null);
            };
            retryImg.src = altUrl;
          } else {
            console.warn('Preview image failed to load:', targetUrl);
            resolve(null);
          }
        };
        img.src = targetUrl;
      })),
    ).then((loaded) => {
      if (cancelled) return;
      setLoadedImages(loaded);
      setImageError(loaded.every((i) => i === null));
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
    ctx.fillStyle = '#060b19';
    ctx.fillRect(0, 0, w, h);

    if (baseImage && !imageError) {
      // Draw satellite image fitted with aspect ratio preserved
      const imgAspect = baseImage.width / baseImage.height;
      const canvasAspect = w / h;
      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (imgAspect > canvasAspect) {
        drawW = w;
        drawH = w / imgAspect;
        drawX = 0;
        drawY = (h - drawH) / 2;
      } else {
        drawH = h;
        drawW = h * imgAspect;
        drawX = (w - drawW) / 2;
        drawY = 0;
      }

      ctx.drawImage(baseImage, drawX, drawY, drawW, drawH);

      // Blend mode for pairs
      if (blend && isMulti) {
        const otherIdx = (activeIndex + 1) % images.length;
        const other = loadedImages[otherIdx];
        if (other) {
          ctx.globalAlpha = blendAmount;
          ctx.drawImage(other, drawX, drawY, drawW, drawH);
          ctx.globalAlpha = 1;
        }
      }

      // Evidence overlays
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
            ctx.fillStyle = (ev.colour || '#38bdf8') + '30';
            ctx.fillRect(drawX, drawY, drawW, drawH);
          } else if (ev.type === 'boxes' && ev.boxes) {
            ctx.strokeStyle = ev.colour || '#38bdf8';
            ctx.lineWidth = 2;
            for (const box of ev.boxes) {
              const [x1, y1, x2, y2] = box.bbox;
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
      // Fallback
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#060b19');
      gradient.addColorStop(0.5, '#0f172a');
      gradient.addColorStop(1, '#060b19');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      ctx.fillStyle = '#64748b';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Preview image not available', w / 2, h / 2 - 10);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('Upload a GeoTIFF or benchmark sample to render imagery', w / 2, h / 2 + 14);
      ctx.textAlign = 'start';
    }

    // Scene info overlay bottom-left
    ctx.fillStyle = 'rgba(6, 11, 25, 0.85)';
    const infoW = 240;
    const infoH = 40;
    ctx.beginPath();
    ctx.roundRect(12, h - infoH - 12, infoW, infoH, 8);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(
      `${scene.images[0]?.width || 0} × ${scene.images[0]?.height || 0} px`,
      20, h - infoH + 4
    );
    ctx.fillText(
      `CRS: ${scene.compatibility.targetCrs || 'N/A'}  GSD: ${scene.compatibility.targetGsdM || 'N/A'} m`,
      20, h - infoH + 20
    );
  }, [scene, layers, turns, baseImage, imageError,
      blend, blendAmount, activeIndex, isMulti, images.length, loadedImages]);

  // Non-passive wheel event listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.max(0.2, Math.min(z + delta, 5)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const { activeTool } = useAnnotationStore();
  const { isEnabled } = useFeaturesStore();
  const annotationEnabled = isEnabled('annotation');

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool !== 'select' && annotationEnabled) return;
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setDragging(false);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full overflow-hidden bg-[#060b19] rounded-2xl border border-border/70 shadow-inner',
        activeTool === 'select' || !annotationEnabled
          ? 'cursor-grab active:cursor-grabbing'
          : 'cursor-crosshair'
      )}
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
        className="w-full h-full flex items-center justify-center relative select-none"
      >
        <div className="relative w-[960px] h-[720px] rounded-xl overflow-hidden shadow-lg shrink-0">
          <canvas
            ref={canvasRef}
            width={960}
            height={720}
            className="w-full h-full block"
          />

          {/* Vector Annotation Overlay (Extensions PRD §5) */}
          {annotationEnabled && (
            <AnnotationCanvas
              width={960}
              height={720}
              sceneId={scene.id}
            />
          )}
        </div>
      </div>

      {/* Zoom controls */}
      <div
        className="absolute top-4 right-4 flex flex-col gap-1.5 z-20"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 glass-panel rounded-xl"
          onClick={() => setZoom((z) => Math.min(z + 0.2, 5))}
        >
          <ZoomIn className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 glass-panel rounded-xl"
          onClick={() => setZoom((z) => Math.max(z - 0.2, 0.2))}
        >
          <ZoomOut className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 glass-panel rounded-xl"
          onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Image switcher + blend */}
      <div
        className="absolute top-4 left-4 z-20 flex flex-col gap-2 items-start"
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1.5 items-center">
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
                  : `${img.filename} - ${img.modality}${img.acquiredAt ? ` - ${img.acquiredAt}` : ''}`}
                className={cn(
                  'px-3 py-1 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 shadow-sm',
                  selected
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-md'
                    : 'glass-panel text-muted-foreground hover:text-foreground'
                )}
              >
                <ImageIcon className="w-3 h-3" strokeWidth={1.5} />
                {label}
              </button>
            );
          })}

          {isMulti && (
            <button
              onClick={() => setBlend(!blend)}
              className={cn(
                'px-3 py-1 rounded-xl text-xs font-semibold transition-all border flex items-center gap-1.5 shadow-sm',
                blend
                  ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                  : 'glass-panel text-muted-foreground hover:text-foreground'
              )}
            >
              <Layers className="w-3 h-3" strokeWidth={1.5} />
              Blend
            </button>
          )}
        </div>

        {blend && isMulti && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel text-xs text-foreground shadow-sm">
            <span className="text-[10px] text-muted-foreground font-mono">Mix</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={blendAmount}
              onChange={(e) => setBlendAmount(parseFloat(e.target.value))}
              className="w-24 h-1 accent-primary"
            />
            <span className="text-[10px] font-mono font-medium">
              {Math.round(blendAmount * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
