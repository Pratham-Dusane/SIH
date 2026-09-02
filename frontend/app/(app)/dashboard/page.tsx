'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Satellite, Search, BarChart3, ShieldAlert,
  UploadCloud, ExternalLink, MessageSquare, Clock,
  Layers, ArrowRight, Sparkles, Radar, ShieldCheck,
  Orbit, Flame, FolderOpen, MapPinned,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import TopNav from '@/components/layout/TopNav';
import { fetchScenes, fetchDashboardStats } from '@/lib/api';
import { Scene, DashboardStats, Modality, InputConfig } from '@/lib/types';
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

function confidenceColor(value: number) {
  if (value >= 0.75) return 'text-emerald-600 dark:text-emerald-400';
  if (value >= 0.45) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
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
    return () => { cancelled = true; };
  }, []);

  const statCards = stats
    ? [
      {
        label: 'Scenes Ingested',
        value: stats.scenesIngested,
        icon: Satellite,
        color: 'text-sky-600 dark:text-sky-400',
        bg: 'bg-sky-500/10',
        badge: 'ACTIVE AOIs',
      },
      {
        label: 'Queries Answered',
        value: stats.queriesAnswered,
        icon: Search,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-500/10',
        badge: 'ORCHESTRATED',
      },
      {
        label: 'Avg. Confidence',
        value: `${(stats.averageConfidence * 100).toFixed(0)}%`,
        icon: BarChart3,
        color: confidenceColor(stats.averageConfidence),
        bg: 'bg-emerald-500/10',
        badge: 'CALIBRATED',
      },
      {
        label: 'Abstention Rate',
        value: `${(stats.abstentionRate * 100).toFixed(0)}%`,
        icon: ShieldAlert,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
        tooltip: 'Abstention is deliberate: the agent declines when evidence is insufficient rather than guessing.',
        badge: 'GUARDRAILS ON',
      },
    ]
    : [];

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
            className="glass-card rounded-[32px] border border-border/80 overflow-hidden shadow-2xl transition-all"
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

        {/* 4 Metric Telemetry Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-card rounded-2xl p-6 space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))
            : statCards.map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-3 hover:scale-[1.01] transition-all">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {card.label}
                    </p>
                    <div className={cn('p-2 rounded-xl shadow-sm', card.bg)}>
                      <card.icon className={cn('w-4 h-4', card.color)} strokeWidth={1.5} />
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span
                      className={cn('text-3xl font-bold tracking-tight', card.color)}
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {card.value}
                    </span>
                    {card.tooltip && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="text-[10px] text-muted-foreground cursor-help underline decoration-dotted mb-1">
                            info
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px]">
                          <p className="text-xs">{card.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
        </div>

        {/* Error State */}
        {!loading && loadError && (
          <div className="glass-card rounded-2xl p-5 border-destructive/40 bg-destructive/5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-destructive mt-0.5 shrink-0" strokeWidth={1.5} />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-destructive">Could not load scenes from backend</p>
                <p className="text-muted-foreground font-mono break-all">{loadError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !loadError && scenes.length === 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="glass-card rounded-3xl p-10 text-center max-w-2xl mx-auto space-y-5 border border-border/80">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary shadow-inner">
                <UploadCloud className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                Upload your first earth-analysis mission
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Ingest GeoTIFFs, bi-temporal pairs, or benchmark datasets and start asking grounded remote-sensing questions with agentic analysis.
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                {[
                  { label: 'Sentinel-2 Single Image', config: 'SINGLE' },
                  { label: 'S2 + S1 Cross-Modal Pair', config: 'CROSS_MODAL' },
                  { label: 'Bi-Temporal Change Pair', config: 'BI_TEMPORAL' },
                ].map((preset) => (
                  <Link key={preset.config} href="/scene/new">
                    <Button
                      variant="outline"
                      className="border-border rounded-xl bg-background/80 hover:bg-primary/5 hover:border-primary/40 text-xs sm:text-sm font-medium"
                    >
                      {preset.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {/* Right: Mission Brief & Safety */}
            <div className="space-y-4">
              <div className="glass-card rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
                    <FolderOpen className="w-4 h-4 text-primary" strokeWidth={1.5} />
                    Mission Brief
                  </h3>
                  <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                    MODES
                  </Badge>
                </div>

                <div className="space-y-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 border border-border/60 px-3.5 py-2.5">
                    <span>Single-image VQA</span>
                    <span className="font-semibold text-foreground font-mono">Ready</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 border border-border/60 px-3.5 py-2.5">
                    <span>Change analysis</span>
                    <span className="font-semibold text-foreground font-mono">Ready</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-black/5 dark:bg-white/5 border border-border/60 px-3.5 py-2.5">
                    <span>Optical + SAR fusion</span>
                    <span className="font-semibold text-foreground font-mono">Ready</span>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
                    <ShieldCheck className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
                    Safety & Verification
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Evidence grounding</span>
                    <span className="font-semibold text-emerald-500 font-mono">92%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-purple-500 via-sky-500 to-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">Abstain on weak signal</span>
                    <span className="font-semibold text-amber-500 font-mono">Enabled</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
