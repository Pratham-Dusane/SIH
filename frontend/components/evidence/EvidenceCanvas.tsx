'use client';

import { useRef, useEffect, useState } from 'react';
import { Scene } from '@/lib/types';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const { layers, turns } = useStore();

  // Draw a placeholder satellite-style canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Dark background grid (simulated satellite view)
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, w, h);

    // Simulated terrain blocks
    const colors = ['#1b3a4b', '#164e63', '#1a5c3e', '#2d4a3a', '#1e3a5f', '#2a4858'];
    for (let x = 0; x < w; x += 40) {
      for (let y = 0; y < h; y += 40) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.globalAlpha = 0.6 + Math.random() * 0.4;
        ctx.fillRect(x, y, 38, 38);
      }
    }
    ctx.globalAlpha = 1;

    // Grid lines
    ctx.strokeStyle = 'rgba(14, 165, 183, 0.08)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Evidence overlays from turns
    const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
    if (lastTurn?.result?.evidence) {
      for (const ev of lastTurn.result.evidence) {
        const layerState = layers[ev.id];
        if (layerState && !layerState.visible) continue;

        ctx.globalAlpha = layerState?.opacity ?? 0.5;

        if (ev.type === 'mask') {
          // Simulate mask overlay
          ctx.fillStyle = ev.colour + '40';
          const regions = Math.floor(Math.random() * 5) + 2;
          for (let i = 0; i < regions; i++) {
            const rx = Math.random() * w * 0.7;
            const ry = Math.random() * h * 0.7;
            const rw = Math.random() * 200 + 50;
            const rh = Math.random() * 200 + 50;
            ctx.beginPath();
            ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2);
            ctx.fill();

            // Border
            ctx.strokeStyle = ev.colour;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        } else if (ev.type === 'boxes' && ev.boxes) {
          ctx.strokeStyle = ev.colour;
          ctx.lineWidth = 2;
          for (const box of ev.boxes) {
            const [x1, y1, x2, y2] = box.bbox;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.fillStyle = ev.colour;
            ctx.font = '10px monospace';
            ctx.fillText(`${(box.score * 100).toFixed(0)}%`, x1 + 2, y1 - 4);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // Scene info overlay
    ctx.fillStyle = 'rgba(11, 17, 32, 0.8)';
    ctx.fillRect(8, h - 44, 220, 36);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`${scene.images[0]?.width || 0} × ${scene.images[0]?.height || 0} px`, 14, h - 28);
    ctx.fillText(`CRS: ${scene.compatibility.targetCrs || 'N/A'}  GSD: ${scene.compatibility.targetGsdM || 'N/A'} m`, 14, h - 14);

  }, [scene, layers, turns]);

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
          width={800}
          height={600}
          className="rounded-sm"
        />
      </div>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-1 z-20">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 bg-card/80 backdrop-blur border-border"
          onClick={() => setZoom((z) => Math.min(z + 0.2, 4))}
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
        {scene.modalities.map((m, i) => (
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
