'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Scene } from '@/lib/types';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

interface EvidenceCanvasProps {
  scene: Scene;
}

export default function EvidenceCanvas({ scene }: EvidenceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const { layers, turns } = useStore();

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

  // Load the scene's base preview image
  useEffect(() => {
    if (!scene.images || scene.images.length === 0) return;

    const primaryImage = scene.images[0];
    const url = primaryImage.previewUrl;
    if (!url) {
      setImageError(true);
      return;
    }

    const resolved = resolvePreviewUrl(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      setBaseImage(img);
      setImageError(false);
    };
    img.onerror = () => {
      console.warn('Preview image failed to load:', resolved);
      setImageError(true);
      setBaseImage(null);
    };
    img.src = resolved;
  }, [scene, resolvePreviewUrl]);

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
  }, [scene, layers, turns, baseImage, imageError]);

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
      <div className="absolute top-4 right-4 flex flex-col gap-1 z-20">
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

      {/* Modality indicator */}
      <div className="absolute top-4 left-4 z-20 flex gap-2">
        {scene?.modalities?.map((m, i) => (
          <span
            key={i}
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-medium',
              m === 'SAR' ? 'bg-modality-sar/20 text-modality-sar' :
              m === 'MULTISPECTRAL' ? 'bg-modality-optical/20 text-modality-optical' :
              'bg-modality-optical/20 text-modality-optical'
            )}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
