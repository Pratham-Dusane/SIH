'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Satellite, Search, BarChart3, ShieldAlert,
  UploadCloud, ExternalLink, MessageSquare, Clock,
  Sparkles, Layers,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import TopNav from '@/components/layout/TopNav';
import { fetchScenes, fetchDashboardStats } from '@/lib/api';
import { Scene, DashboardStats, Modality, InputConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const modalityColor: Record<Modality, string> = {
  OPTICAL: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  MULTISPECTRAL: 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  SAR: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  AMBIGUOUS: 'bg-muted text-muted-foreground border-border',
};

const configBadge: Record<InputConfig, { label: string; className: string }> = {
  SINGLE: { label: 'SINGLE', className: 'bg-blue-500/15 text-blue-500 border-blue-500/30' },
  CROSS_MODAL: { label: 'CROSS-MODAL', className: 'bg-purple-500/15 text-purple-500 border-purple-500/30' },
  BI_TEMPORAL: { label: 'BI-TEMPORAL', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
};

function confidenceColor(value: number) {
  if (value >= 0.75) return 'text-emerald-500';
  if (value >= 0.45) return 'text-amber-500';
  return 'text-rose-500';
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
          color: 'text-primary',
          bg: 'bg-primary/10',
        },
        {
          label: 'Queries Answered',
          value: stats.queriesAnswered,
          icon: Search,
          color: 'text-sky-500',
          bg: 'bg-sky-500/10',
        },
        {
          label: 'Avg. Confidence',
          value: `${(stats.averageConfidence * 100).toFixed(0)}%`,
          icon: BarChart3,
          color: confidenceColor(stats.averageConfidence),
          bg: 'bg-emerald-500/10',
        },
        {
          label: 'Abstention Rate',
          value: `${(stats.abstentionRate * 100).toFixed(0)}%`,
          icon: ShieldAlert,
          color: 'text-orange-500',
          bg: 'bg-orange-500/10',
          tooltip: 'Abstention is a feature: the system declines when evidence is insufficient rather than guessing.',
        },
      ]
    : [];

  return (
    <div className="w-full flex flex-col space-y-6">
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-card rounded-2xl p-5">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))
            : statCards.map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className="glass-card rounded-2xl p-5 hover:scale-[1.02] transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {card.label}
                      </p>
                      <div className={cn('p-2 rounded-xl', card.bg)}>
                        <card.icon className={cn('w-4 h-4', card.color)} strokeWidth={1.5} />
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <span
                        className={cn('text-3xl font-bold', card.color)}
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {card.value}
                      </span>
                      {card.tooltip && (
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="text-[10px] text-muted-foreground mb-1 cursor-help underline decoration-dotted">
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

        {/* Backend unreachable warning */}
        {!loading && loadError && (
          <div className="glass-card rounded-2xl p-4 border-destructive/40 bg-destructive/5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-destructive mt-0.5 shrink-0" strokeWidth={1.5} />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-destructive">
                  Could not load scenes from the backend.
                </p>
                <p className="text-muted-foreground font-mono break-all">{loadError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty State Banner */}
        {!loading && !loadError && scenes.length === 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="glass-card rounded-3xl p-10 text-center max-w-2xl mx-auto space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary mb-2 shadow-inner">
                <UploadCloud className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h2
                className="text-2xl font-bold text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Upload your first scene
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Ingest satellite imagery (GeoTIFF / TIFF or benchmark samples) to start asking questions with agentic remote sensing models.
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
                      className="border-border rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-medium text-xs sm:text-sm"
                    >
                      {preset.label}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Session Cards Grid / Carousel */}
        {scenes.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  className="text-lg font-bold text-foreground flex items-center gap-2"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  <MessageSquare className="w-5 h-5 text-primary" strokeWidth={1.5} />
                  Active Analysis Sessions
                </h2>
                <p className="text-xs text-muted-foreground">
                  Resume past scenes or inspect previous queries and evidence
                </p>
              </div>
              <Link href="/scene/new">
                <Button className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 rounded-xl px-4 py-2 font-semibold text-xs gap-1.5 shadow-md">
                  <UploadCloud className="w-4 h-4" strokeWidth={1.5} />
                  New Scene
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene, i) => (
                <motion.div
                  key={scene.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/scene/${scene.id}`} className="block group">
                    <div className="glass-card rounded-2xl p-5 hover:border-primary/50 transition-all space-y-3 relative overflow-hidden">
                      {/* Top Row: Scene Name & Badges */}
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
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0', configBadge[scene.inputConfig].className)}
                        >
                          {configBadge[scene.inputConfig].label}
                        </Badge>
                      </div>

                      {/* Preview Box / Modalities */}
                      <div className="h-28 rounded-xl bg-secondary/50 border border-border/60 flex items-center justify-center p-3 relative overflow-hidden">
                        {scene.images[0]?.previewUrl ? (
                          <div className="relative w-full h-full">
                            <img
                              src={scene.images[0].previewUrl}
                              alt={scene.name}
                              className="w-full h-full object-cover rounded-lg opacity-85 group-hover:opacity-100 transition-opacity"
                            />
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-muted-foreground/70">
                            <Layers className="w-6 h-6" strokeWidth={1.5} />
                            <span className="text-[10px] font-mono">
                              {scene.images[0]?.sensorHint || 'Satellite Imagery'}
                            </span>
                          </div>
                        )}

                        <div className="absolute bottom-2 left-2 flex gap-1">
                          {scene.modalities.map((m, idx) => (
                            <span
                              key={idx}
                              className={cn('text-[9px] font-semibold px-2 py-0.5 rounded-full border shadow-sm', modalityColor[m])}
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Footer Info & Resume Button */}
                      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {scene.images[0]?.gsdM ? `${scene.images[0].gsdM}m GSD` : 'Standard GSD'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-primary font-medium group-hover:underline">
                          Resume Session
                          <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
