'use client';

/**
 * SceneReel — the moving backdrop behind the login hero from commit a71c4b0.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const FRAMES = [
  '/samples/preview_optical.png',
  '/samples/preview_sar.png',
  '/samples/thumb_optical.png',
];

const VIDEO_SRC = '/videos/hero.mp4';

export default function SceneReel({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(VIDEO_SRC, { method: 'HEAD' })
      .then((r) => { if (!cancelled && r.ok) setHasVideo(true); })
      .catch(() => { /* no video shipped — fallback to orbital backdrop */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div aria-hidden className={cn('absolute inset-0 overflow-hidden bg-slate-950', className)}>
      {hasVideo ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          src={VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.15),transparent_60%),radial-gradient(ellipse_at_bottom_right,rgba(245,158,11,0.12),transparent_60%)]" />
      )}

      {/* Scrim overlay */}
      <div className="absolute inset-0 bg-slate-950/60" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-slate-950/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/50" />

      {/* Reticle marks */}
      <svg
        className="absolute bottom-8 right-8 w-24 h-24 text-white/10"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        <circle cx="50" cy="50" r="30" />
        <circle cx="50" cy="50" r="14" strokeDasharray="3 4" />
        <path d="M50 4v18M50 78v18M4 50h18M78 50h18" />
      </svg>
    </div>
  );
}
