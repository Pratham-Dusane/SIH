'use client';

/**
 * CoverageGlobe — where this workspace has actually looked.
 *
 * Markers are derived from the WGS84 bounds of real ingested scenes, not a
 * decorative preset. Scenes whose footprints fall within ~0.5° of each other
 * are merged into one cluster, and marker *radius* encodes how many scenes that
 * cluster holds. cobe paints every marker with a single global colour, so size
 * is the only honest density channel available here.
 *
 * A scene with no georeferencing contributes nothing: benchmark PNGs have no
 * location, and inventing one would put a fabricated pin on a map.
 *
 * cobe draws to a WebGL canvas and exposes no hit-testing, so each cluster also
 * gets an invisible HTML hit target positioned over its marker every frame by
 * `project()` below. That is what makes a marker hoverable and clickable — the
 * canvas itself cannot be.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import createGlobe, { type COBEOptions } from 'cobe';
import { useMotionValue, useSpring } from 'framer-motion';

import { cn } from '@/lib/utils';
import type { AnalyticsSceneSummary } from '@/lib/types';

const MOVEMENT_DAMPING = 1400;

/** Upper bound on the rendered globe, in CSS pixels. */
const MAX_GLOBE_PX = 420;

/** Cluster radius in degrees — roughly 55 km at the equator. */
const CLUSTER_DEG = 0.5;

export interface CoverageCluster {
  lat: number;
  lng: number;
  /** Number of scenes whose footprint centre falls in this cluster. */
  count: number;
  /** Total queries answered across those scenes. */
  queries: number;
  /** Admin label, when the backend resolved one — used for the click-through filter. */
  district?: string;
  state?: string;
}

/**
 * Collapse scene centroids into density clusters.
 *
 * Takes the analytics scene rows rather than raw scenes: those carry the
 * district label and query count that a marker needs to describe itself.
 */
export function clusterScenes(scenes: AnalyticsSceneSummary[]): CoverageCluster[] {
  const clusters: CoverageCluster[] = [];

  for (const scene of scenes ?? []) {
    const b = scene.bounds_wgs84;
    if (!b || b.length !== 4) continue;

    const lng = (Number(b[0]) + Number(b[2])) / 2;
    const lat = (Number(b[1]) + Number(b[3])) / 2;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const queries = Number(scene.query_count) || 0;
    const near = clusters.find(
      (c) => Math.abs(c.lat - lat) < CLUSTER_DEG && Math.abs(c.lng - lng) < CLUSTER_DEG,
    );
    if (near) {
      // Running mean keeps the marker at the centre of its cluster.
      near.lat = (near.lat * near.count + lat) / (near.count + 1);
      near.lng = (near.lng * near.count + lng) / (near.count + 1);
      near.count += 1;
      near.queries += queries;
      near.district ??= scene.district ?? undefined;
      near.state ??= scene.state ?? undefined;
    } else {
      clusters.push({
        lat, lng, count: 1, queries,
        district: scene.district ?? undefined,
        state: scene.state ?? undefined,
      });
    }
  }

  return clusters.sort((a, b) => b.count - a.count);
}

/**
 * Project a lat/lng onto the canvas for cobe's current rotation.
 *
 * cobe centres the point whose longitude satisfies `phi = -lng - π/2`, so the
 * angle about the polar axis is `lng + phi + π/2`; `theta` then tilts the globe
 * about the screen-horizontal axis. `z <= 0` means the point is on the far side
 * and its hit target must be switched off — otherwise a marker in Peru would be
 * clickable while India faces the viewer.
 */
export function project(
  lat: number, lng: number, phi: number, theta: number,
): { x: number; y: number; visible: boolean } {
  const latRad = (lat * Math.PI) / 180;
  const a = (lng * Math.PI) / 180 + phi + Math.PI / 2;

  const x = Math.cos(latRad) * Math.sin(a);
  const y0 = Math.sin(latRad);
  const z0 = Math.cos(latRad) * Math.cos(a);

  const y = y0 * Math.cos(theta) - z0 * Math.sin(theta);
  const z = y0 * Math.sin(theta) + z0 * Math.cos(theta);

  return { x, y, visible: z > 0 };
}

export default function CoverageGlobe({
  scenes,
  className,
  dark = true,
}: {
  scenes: AnalyticsSceneSummary[];
  className?: string;
  dark?: boolean;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const phiRef = useRef(0);
  const thetaRef = useRef(0.3);
  const pointerInteracting = useRef<number | null>(null);
  const draggedRef = useRef(false);
  // Mirror of hovered state in a ref so the onRender frame loop can read it
  // without triggering a re-render or a config rebuild.
  const hoveredRef = useRef<number | null>(null);

  const [hovered, setHovered] = useState<number | null>(null);

  // Rendered size of the (square) globe, in CSS pixels.
  //
  // This was measured once at mount and on window resize. On the dashboard the
  // card's height is settled by async content that lands *after* mount, so the
  // first measurement was 0, cobe's loop never started, and the markers were
  // never positioned - the globe looked fine only because a stale frame had
  // already been painted. A ResizeObserver tracks the box for real.
  const [size, setSize] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      // Width drives the square; height only caps it, and only when it is
      // actually known. The card this sits in is a flex/grid child whose
      // resolved height is routinely 0 on the first layout pass, and a globe
      // that renders nothing is far worse than one that is clipped a little.
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const next = Math.floor(Math.min(w || MAX_GLOBE_PX,
                                       h > 0 ? h : MAX_GLOBE_PX,
                                       MAX_GLOBE_PX));
      setSize((prev) => (next > 0 && next !== prev ? next : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  const r = useMotionValue(0);
  const rs = useSpring(r, { mass: 1, damping: 30, stiffness: 100 });

  const clusters = useMemo(() => clusterScenes(scenes), [scenes]);
  const maxCount = clusters.reduce((m, c) => Math.max(m, c.count), 0);

  // Focus the globe on the densest cluster so the first paint shows coverage
  // rather than an empty ocean.
  const focus = clusters[0];
  const theta = focus ? (focus.lat * Math.PI) / 180 : 0.3;
  thetaRef.current = theta;

  const config = useMemo<COBEOptions>(() => ({
    width: 800,
    height: 800,
    onRender: () => {},
    devicePixelRatio: 2,
    phi: 0,
    theta,
    dark: dark ? 1 : 0,
    diffuse: 1.2,
    mapSamples: 16000,
    mapBrightness: dark ? 3.4 : 1.2,
    baseColor: dark ? [0.16, 0.18, 0.22] : [0.92, 0.9, 0.87],
    markerColor: [250 / 255, 99 / 255, 23 / 255],
    glowColor: dark ? [0.1, 0.14, 0.2] : [0.98, 0.96, 0.93],
    markers: clusters.map((c) => ({
      location: [c.lat, c.lng] as [number, number],
      // Size grows with density but stays legible for a single scene.
      size: 0.035 + 0.055 * (maxCount <= 1 ? 0 : (c.count - 1) / (maxCount - 1)),
    })),
  }), [clusters, maxCount, dark, theta]);

  const goToDistrict = useCallback((cluster: CoverageCluster, e: React.MouseEvent) => {
    // Stop the click from reaching the canvas, which would reset the drag
    // tracking and interfere with the navigation intent.
    e.stopPropagation();
    // A drag that ends over a marker must not count as a click.
    if (draggedRef.current) return;
    const label = cluster.district
      ? `${cluster.district}${cluster.state ? `, ${cluster.state}` : ''}`
      : null;
    router.push(label
      ? `/historical?district=${encodeURIComponent(label)}`
      : '/historical');
  }, [router]);

  useEffect(() => {
    // Nothing to draw into yet - wait for the ResizeObserver above.
    if (!canvasRef.current || size <= 0) return;

    // The globe must be drawn into a SQUARE box. cobe renders a square buffer,
    // so a non-square CSS box both distorts the sphere and shifts every
    // projected marker off its pixel by half the difference between the axes.
    canvasRef.current.style.width = `${size}px`;
    canvasRef.current.style.height = `${size}px`;
    if (overlayRef.current) {
      overlayRef.current.style.width = `${size}px`;
      overlayRef.current.style.height = `${size}px`;
    }

    // Start rotated to the densest cluster's longitude.
    phiRef.current = focus ? -((focus.lng * Math.PI) / 180) - Math.PI / 2 : 0;

    const globe = createGlobe(canvasRef.current, {
      ...config,
      width: size * 2,
      height: size * 2,
      onRender: (state) => {
        // Pause auto-rotation when the user is dragging OR hovering a marker.
        if (!pointerInteracting.current && hoveredRef.current === null) {
          phiRef.current += 0.0035;
        }
        state.phi = phiRef.current + rs.get();
        state.width = size * 2;
        state.height = size * 2;

        // Move the hit targets with the globe. Done by mutating style directly
        // rather than through React state — this runs every frame.
        const radius = size / 2;
        for (let i = 0; i < clusters.length; i += 1) {
          const el = markerRefs.current[i];
          if (!el) continue;
          const c = clusters[i];
          const { x, y, visible } = project(c.lat, c.lng, state.phi, thetaRef.current);
          if (!visible) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            continue;
          }
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          el.style.transform =
            `translate(-50%, -50%) translate(${radius + x * radius}px, ${radius - y * radius}px)`;
        }
      },
    });

    const el = canvasRef.current;
    const raf = setTimeout(() => { if (el) el.style.opacity = '1'; }, 0);

    return () => {
      clearTimeout(raf);
      globe.destroy();
    };
  }, [config, rs, focus, clusters, size]);

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current;
      // Raise the threshold so a normal click with tiny jitter is not mistaken
      // for a drag (the old value of 3 was too sensitive).
      if (Math.abs(delta) > 6) draggedRef.current = true;
      r.set(r.get() + delta / MOVEMENT_DAMPING);
    }
  };

  const active = hovered !== null ? clusters[hovered] : null;

  return (
    <div className={cn('relative flex h-full w-full flex-col', className)}>
      <div className="relative flex-1 overflow-hidden">
        <div ref={boxRef} className="relative flex size-full items-center justify-center">
          <canvas
            ref={canvasRef}
            className="cursor-grab opacity-0 transition-opacity duration-500"
            onPointerDown={(e) => {
              pointerInteracting.current = e.clientX;
              draggedRef.current = false;
              if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
            }}
            onPointerUp={() => {
              pointerInteracting.current = null;
              if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
            }}
            onPointerOut={() => {
              pointerInteracting.current = null;
              if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
            }}
            onMouseMove={(e) => updateMovement(e.clientX)}
            onTouchMove={(e) => e.touches[0] && updateMovement(e.touches[0].clientX)}
          />

          {/* Hit targets, moved each frame by onRender above. */}
          <div ref={overlayRef} className="pointer-events-none absolute">
            {clusters.map((c, i) => (
              <button
                key={`${c.lat}-${c.lng}`}
                ref={(el) => { markerRefs.current[i] = el; }}
                onPointerDown={(e) => {
                  // Prevent the canvas from entering drag-tracking mode when
                  // the user clicks directly on a marker hit target.
                  e.stopPropagation();
                }}
                onMouseEnter={() => { setHovered(i); hoveredRef.current = i; }}
                onMouseLeave={() => {
                  setHovered((h) => (h === i ? null : h));
                  if (hoveredRef.current === i) hoveredRef.current = null;
                }}
                onFocus={() => { setHovered(i); hoveredRef.current = i; }}
                onBlur={() => {
                  setHovered((h) => (h === i ? null : h));
                  if (hoveredRef.current === i) hoveredRef.current = null;
                }}
                onClick={(e) => goToDistrict(c, e)}
                aria-label={
                  `${c.district ?? 'Unnamed site'}: ${c.count} scene${c.count === 1 ? '' : 's'}, `
                  + `${c.queries} quer${c.queries === 1 ? 'y' : 'ies'}. Open in historical scenes.`
                }
                style={{ opacity: 0 }}
                className="absolute left-0 top-0 size-7 cursor-pointer rounded-full outline-none
                           ring-[#fa6317]/0 transition-[box-shadow,background-color]
                           hover:bg-[#fa6317]/25 hover:ring-4 hover:ring-[#fa6317]/30
                           focus-visible:bg-[#fa6317]/25 focus-visible:ring-4
                           focus-visible:ring-[#fa6317]/50"
              />
            ))}
          </div>

          {/* Tooltip. Anchored to the panel rather than the marker so it never
              runs off the edge as the globe turns. */}
          {active && (
            <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 rounded-xl
                            border border-border bg-popover/95 px-3 py-2 shadow-lg backdrop-blur">
              <p className="truncate text-xs font-semibold text-foreground">
                {active.district
                  ? `${active.district}${active.state ? `, ${active.state}` : ''}`
                  : `${active.lat.toFixed(3)}, ${active.lng.toFixed(3)}`}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{active.count}</span>
                {` scene${active.count === 1 ? '' : 's'} · `}
                <span className="font-semibold text-foreground">{active.queries}</span>
                {` quer${active.queries === 1 ? 'y' : 'ies'} answered`}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                Click to filter historical scenes
              </p>
            </div>
          )}
        </div>

        {clusters.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
            <p className="max-w-[220px] text-xs leading-relaxed text-muted-foreground">
              No georeferenced scenes yet. Upload a GeoTIFF and its footprint
              appears here.
            </p>
          </div>
        )}
      </div>

      {/* Density legend — states plainly what the size ramp means. */}
      {clusters.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-1 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Scenes
            </span>
            {/* Marker radius is the density channel, so the legend shows radii. */}
            <span className="flex items-end gap-1.5">
              <span className="size-1.5 rounded-full bg-[#fa6317]" />
              <span className="size-2.5 rounded-full bg-[#fa6317]" />
              <span className="size-3.5 rounded-full bg-[#fa6317]" />
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              1–{maxCount}
            </span>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {clusters.length} {clusters.length === 1 ? 'site' : 'sites'}
          </span>
        </div>
      )}
    </div>
  );
}
