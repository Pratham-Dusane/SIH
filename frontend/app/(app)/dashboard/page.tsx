'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Satellite, UploadCloud, MessageSquare, Clock,
  Layers, ArrowRight, Sparkles, MapPinned, Globe2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import TopNav from '@/components/layout/TopNav';
import CoverageGlobe from '@/components/dashboard/CoverageGlobe';
import { useStore } from '@/lib/store';
import { fetchScenes, fetchDashboardStats, fetchAnalyticsOverview } from '@/lib/api';
import { Scene, DashboardStats, Modality, InputConfig, AnalyticsSceneSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const modalityColor: Record<Modality, string> = {
  OPTICAL: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
  MULTISPECTRAL: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',
  SAR: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',
  AMBIGUOUS: 'bg-muted text-muted-foreground border-border',
};

const configBadge: Record<InputConfig, { label: string; className: string }> = {
  SINGLE: { label: 'SINGLE', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-200 border-sky-500/25' },
  CROSS_MODAL: { label: 'CROSS-MODAL', className: 'bg-purple-500/10 text-purple-700 dark:text-purple-200 border-purple-500/25' },
  BI_TEMPORAL: { label: 'BI-TEMPORAL', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 border-emerald-500/25' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function DashboardPage() {
  const { theme } = useStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  // Globe rows come from the analytics endpoint, which is the only payload
  // carrying the district label and query count a marker needs to describe
  // itself. A failure there leaves the globe empty rather than the page broken.
  const [coverage, setCoverage] = useState<AnalyticsSceneSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchDashboardStats(), fetchScenes()])
      .then(([s, sc]) => {
        if (cancelled) return;
        setStats(s);
        setScenes(sc);
      })
      .catch((err) => {
        if (cancelled) return;
        setStats(null);
        setScenes([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetchAnalyticsOverview()
      .then((o) => { if (!cancelled) setCoverage(o.scenes ?? []); })
      .catch(() => { if (!cancelled) setCoverage([]); });

    return () => { cancelled = true; };
  }, []);

  const featuredScene = scenes[0];

  return (
    <div className="w-full flex flex-col space-y-6 pb-6">
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="space-y-6">
        {/* Mission Control Hero Banner */}
        {!loading && !loadError && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="tint-brand glass-card rounded-[32px] border border-border/80 overflow-hidden shadow-2xl transition-all"
          >
            <div className="grid lg:grid-cols-[1.45fr_1fr] items-stretch">
              {/* Left Column: Heading & Description */}
              <div className="p-6 sm:p-7 lg:p-8 flex flex-col justify-between space-y-5">
                <div>
                  <div className="flex items-center justify-between gap-3 mb-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary font-mono shadow-sm">
                      <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                      Mission Control
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      Live ops nominal
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold font-mono">
                      Earth intelligence
                    </p>
                    <h1
                      className="text-2xl sm:text-3xl lg:text-[2.05rem] xl:text-[2.35rem] font-bold tracking-tight text-foreground leading-[1.15] whitespace-normal lg:whitespace-nowrap"
                      style={{ fontFamily: 'var(--font-bodoni-moda), "Bodoni Moda", "Times New Roman", serif' }}
                    >
                      Ask the satellite what matters most.
                    </h1>
                  </div>

                  <p className="mt-3.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    Detect change, reason over multimodal evidence, and ground every answer in satellite imagery, SAR structure, and traceable agent workflows.
                  </p>
                </div>
              </div>

              {/* Right Column: Agent Pipeline (Frosted Glass Panel matching dark/light mode) */}
              <div className="p-6 sm:p-8 flex flex-col justify-center border-t lg:border-t-0 lg:border-l border-border/70 bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-lg border border-border/80 space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold font-mono">
                      Agent Pipeline
                    </span>
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-500 font-mono">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Active
                    </div>
                  </div>

                  {/* 4 Pipeline Stages */}
                  <div className="relative px-1 py-1">
                    {/* Connecting Line */}
                    <div className="absolute left-[12%] right-[12%] top-[20px] h-[2px] bg-gradient-to-r from-purple-500 via-sky-500 to-emerald-500 opacity-40" />

                    <div className="relative grid grid-cols-4 gap-2 sm:gap-3">
                      {[
                        { label: 'Classify', icon: '1', ring: 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30' },
                        { label: 'Validate', icon: '2', ring: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30' },
                        { label: 'Route', icon: '3', ring: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30' },
                        { label: 'Verify', icon: '4', ring: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' },
                      ].map((stage) => (
                        <div key={stage.label} className="flex flex-col items-center">
                          <div className={cn(
                            'relative z-10 flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border text-xs sm:text-sm font-bold shadow-sm backdrop-blur-md',
                            stage.ring
                          )}>
                            {stage.icon}
                          </div>
                          <span className="mt-2 text-center text-[10px] sm:text-[11px] font-medium text-muted-foreground">
                            {stage.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Scene Mini Badge */}
                  {featuredScene && (
                    <div className="rounded-xl border border-border/70 bg-black/5 dark:bg-white/5 p-3 text-xs space-y-1.5 shadow-inner">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPinned className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
                          <span className="truncate font-semibold text-foreground text-xs">{featuredScene.name}</span>
                        </div>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-500 shrink-0 font-mono">
                          High confidence
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <span>{featuredScene.inputConfig.replace('_', ' / ')}</span>
                        <span>{featuredScene.modalities.join(' - ')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Active Analysis Sessions & Mission Brief */}
        {scenes.length > 0 && (
          <div className="grid xl:grid-cols-[1.5fr_0.85fr] gap-6">
            {/* Left: Active Analysis Sessions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
                    <MessageSquare className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Active Analysis Sessions
                  </h2>
                  <p className="text-xs text-muted-foreground">Resume prior missions or inspect live evidence and outputs.</p>
                </div>
                <Link href="/scene/new">
                  <Button className="rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 px-4 py-2 font-semibold text-xs gap-1.5 shadow-md cursor-pointer">
                    <UploadCloud className="w-4 h-4" strokeWidth={1.5} />
                    New Scene
                  </Button>
                </Link>
              </div>

              {/* Fixed at two card rows; the rest scrolls rather than pushing
                  the page down as the workspace grows. */}
              <div className="grid max-h-[27rem] grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid-cols-2">
                {scenes.map((scene, i) => (
                  <motion.div
                    key={scene.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Link href={`/query/${scene.id}`} className="block group">
                      <div className="glass-card rounded-2xl p-4 hover:border-primary/40 transition-all space-y-3 relative overflow-hidden h-full">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                              {scene.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                              <Clock className="w-3 h-3" strokeWidth={1.5} />
                              <span>{formatDate(scene.createdAt)}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className={cn('text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0', configBadge[scene.inputConfig].className)}>
                            {configBadge[scene.inputConfig].label}
                          </Badge>
                        </div>

                        <div className="h-28 rounded-xl bg-black/5 dark:bg-white/5 border border-border/70 relative overflow-hidden">
                          {scene.images[0]?.previewUrl ? (
                            <div className="relative w-full h-full">
                              <img
                                src={scene.images[0].previewUrl}
                                alt={scene.name}
                                className="w-full h-full object-cover rounded-lg opacity-90 group-hover:opacity-100 transition-opacity"
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-1.5 text-muted-foreground/80">
                              <Layers className="w-6 h-6" strokeWidth={1.5} />
                              <span className="text-[10px] font-mono">{scene.images[0]?.sensorHint || 'Satellite Imagery'}</span>
                            </div>
                          )}

                          <div className="absolute bottom-2 left-2 flex gap-1.5 flex-wrap">
                            {scene.modalities.map((m, idx) => (
                              <span key={idx} className={cn('text-[9px] font-semibold px-2 py-0.5 rounded-full border shadow-sm', modalityColor[m])}>
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border/60 text-xs">
                          <span className="text-[11px] text-muted-foreground font-mono">
                            {scene.images[0]?.gsdM ? `${scene.images[0].gsdM}m GSD` : 'Standard GSD'}
                          </span>
                          <span className="inline-flex items-center gap-1 text-primary font-medium group-hover:underline">
                            Open mission
                            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Right: where this workspace has actually looked */}
            <div className="tint-ember glass-card flex flex-col rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    className="flex items-center gap-2 text-sm font-bold text-foreground"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    <Globe2 className="h-4 w-4 text-primary" strokeWidth={1.5} />
                    Coverage
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Footprints of every georeferenced scene, by density.
                  </p>
                </div>
              </div>

              <div className="mt-2 min-h-0 flex-1">
                <CoverageGlobe scenes={coverage} dark={theme === 'dark'} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
