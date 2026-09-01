'use client';

/**
 * SceneReel — the moving backdrop behind the login hero.
 *
 * Plays `/videos/hero.mp4` when that file exists. When it does not, it falls
 * back to a Ken Burns reel over real scene previews from `public/samples`,
 * cross-fading between frames with a sensor sweep and raster lines over the
 * top. Either way the panel is always in motion, and the fallback uses the
 * project's own imagery rather than stock footage.
 *
 * Purely decorative: `aria-hidden`, no data access, and every animation is
 * disabled under `prefers-reduced-motion`.
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

  // Probe for the optional video rather than rendering a broken <video>.
  useEffect(() => {
    let cancelled = false;
    fetch(VIDEO_SRC, { method: 'HEAD' })
      .then((r) => { if (!cancelled && r.ok) setHasVideo(true); })
      .catch(() => { /* no video shipped — the reel below carries the panel */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div aria-hidden className={cn('absolute inset-0 overflow-hidden', className)}>
      {hasVideo ? (
        <video
          ref={videoRef}
          className="size-full object-cover"
          src={VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
        />
      ) : (
        FRAMES.map((src, i) => (
          <div
            key={src}
            className="frame-cycle absolute inset-0"
            style={{ animationDelay: `${i * -7}s` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="animate-kenburns size-full object-cover contrast-125 saturate-[0.85]"
              style={{ animationDelay: `${i * -8}s` }}
            />
          </div>
        ))
      )}

      {/* Grade the imagery so display type stays legible without burying it.
          The scrim is heaviest behind the copy column and lifts to the right,
          where the frame is allowed to read. */}
      <div className="absolute inset-0 bg-ink/45" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/60 to-ink/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-transparent to-ink/50" />

      {/* Ember wash — ties the panel to the accent without tinting the imagery. */}
      <div
        className="absolute inset-0 mix-blend-soft-light"
        style={{
          background:
            'radial-gradient(65% 55% at 30% 35%, rgba(250,99,23,0.6), transparent 72%)',
        }}
      />

      {/* Downlink raster + a sweeping capture bar. */}
      <div className="raster absolute inset-0" />
      <div className="absolute inset-x-0 top-0 h-full">
        <div className="animate-scanline h-24 w-full bg-gradient-to-b from-transparent via-ember-500/25 to-transparent blur-[2px]" />
      </div>

      {/* Reticle marks, bottom-right — a small nod to a capture viewport. */}
      <svg
        className="absolute bottom-8 right-8 size-24 text-white/15"
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
