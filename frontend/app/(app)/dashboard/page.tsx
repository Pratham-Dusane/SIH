'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Satellite, Search, BarChart3, ShieldAlert,
  UploadCloud, ExternalLink, RotateCcw, Trash2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import TopNav from '@/components/layout/TopNav';
import { fetchScenes, fetchDashboardStats } from '@/lib/api';
import { Scene, DashboardStats, Modality, InputConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Beams, Eyebrow, Panel, Stat } from '@/components/ui/spectra';

const ROWS_PER_PAGE = 10;

const modalityColor: Record<Modality, string> = {
  OPTICAL: 'bg-modality-optical/20 text-modality-optical border-modality-optical/30',
  MULTISPECTRAL: 'bg-modality-optical/20 text-modality-optical border-modality-optical/30',
  SAR: 'bg-modality-sar/20 text-modality-sar border-modality-sar/30',
  AMBIGUOUS: 'bg-muted text-muted-foreground border-border',
};

const configBadge: Record<InputConfig, { label: string; className: string }> = {
  SINGLE: { label: 'SINGLE', className: 'bg-brand-500/12 text-brand-500 border-brand-500/30' },
  CROSS_MODAL: { label: 'CROSS-MODAL', className: 'bg-modality-fused/12 text-modality-fused border-modality-fused/30' },
  BI_TEMPORAL: { label: 'BI-TEMPORAL', className: 'bg-ember-500/12 text-ember-500 border-ember-500/30' },
};

const statusBadge: Record<string, { className: string; label: string }> = {
  READY: { className: 'bg-confidence-high/15 text-confidence-high', label: 'Ready' },
  VALIDATING: { className: 'bg-confidence-medium/15 text-confidence-medium animate-pulse', label: 'Validating' },
  INCOMPATIBLE: { className: 'bg-confidence-low/15 text-confidence-low', label: 'Incompatible' },
  UPLOADING: { className: 'bg-brand-500/15 text-brand-500 animate-pulse', label: 'Uploading' },
  FAILED: { className: 'bg-confidence-low/15 text-confidence-low', label: 'Failed' },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [page, setPage] = useState(0);
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
        // No demo scenes on failure - an empty list that says why beats a
        // populated list of scenes that do not exist.
        setStats(null);
        setScenes([]);
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totalPages = Math.ceil(scenes.length / ROWS_PER_PAGE);
  const pagedScenes = scenes.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  const statCards = stats
    ? [
        {
          label: 'Scenes ingested',
          value: stats.scenesIngested,
          icon: Satellite,
          tone: 'brand' as const,
          tooltip: undefined as string | undefined,
        },
        {
          label: 'Queries answered',
          value: stats.queriesAnswered,
          icon: Search,
          tone: 'brand' as const,
          tooltip: undefined as string | undefined,
        },
        {
          label: 'Avg. confidence',
          value: `${(stats.averageConfidence * 100).toFixed(0)}%`,
          icon: BarChart3,
          tone: (stats.averageConfidence >= 0.75
            ? 'good'
            : stats.averageConfidence >= 0.45
              ? 'warn'
              : 'warn') as 'good' | 'warn',
          tooltip: undefined as string | undefined,
        },
        {
          label: 'Abstention rate',
          value: `${(stats.abstentionRate * 100).toFixed(0)}%`,
          icon: ShieldAlert,
          tone: 'ember' as const,
          tooltip: 'Abstention is a feature - the system declines when evidence is insufficient rather than guessing.',
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="grid-bg flex-1 space-y-7 overflow-y-auto p-6 lg:p-8">
        {/* Page heading */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Workspace overview</Eyebrow>
            <h1 className="font-display mt-2 text-[clamp(1.6rem,2.6vw,2.1rem)] font-semibold tracking-[-0.03em]">
              Scenes &amp; activity
            </h1>
          </div>
          <Link href="/scene/new">
            <Button variant="ember" className="gap-2">
              <UploadCloud className="size-4" />
              New scene
            </Button>
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-5">
                  <Skeleton className="mb-4 h-3 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))
            : statCards.map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Stat
                    label={card.label}
                    value={card.value}
                    tone={card.tone}
                    icon={<card.icon className="size-4" />}
                    hint={card.tooltip ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="mb-1 cursor-help text-[10px] text-muted-foreground underline decoration-dotted">
                            why?
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[240px] border-border bg-popover">
                          <p className="text-xs">{card.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : undefined}
                  />
                </motion.div>
              ))}
        </div>

        {/* Backend unreachable - distinguish this from a genuinely empty workspace */}
        {!loading && loadError && (
          <Card className="bg-destructive/5 border-destructive/40">
            <CardContent className="py-3 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-destructive">
                  Could not load scenes from the backend.
                </p>
                <p className="text-muted-foreground font-mono mt-1 break-all">{loadError}</p>
                <p className="text-muted-foreground mt-1">
                  This list is empty because the request failed - not because the
                  workspace is empty.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Start - shown when no scenes */}
        {!loading && !loadError && scenes.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Panel className="relative overflow-hidden">
              <Beams className="opacity-60" />
              <div className="relative p-10 text-center">
                <div className="mx-auto mb-5 grid size-14 place-items-center rounded-pill bg-ember-500/12 ring-1 ring-inset ring-ember-500/25">
                  <UploadCloud className="size-6 text-ember-500" />
                </div>
                <h3 className="font-display text-xl font-semibold tracking-[-0.025em]">
                  Upload your first scene
                </h3>
                <p className="mx-auto mt-2 mb-7 max-w-md text-sm leading-relaxed text-muted-foreground">
                  GeoTIFF for real analysis, or PNG/JPEG in benchmark mode. The
                  compatibility checklist runs before anything is queryable.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  {[
                    { label: 'Sentinel-2 Single', config: 'SINGLE' },
                    { label: 'S2 + S1 Pair', config: 'CROSS_MODAL' },
                    { label: 'Bi-temporal Pair', config: 'BI_TEMPORAL' },
                  ].map((preset) => (
                    <Link key={preset.config} href="/scene/new">
                      <Button
                        variant="outline"
                        className="transition-all"
                      >
                        {preset.label}
                      </Button>
                    </Link>
                  ))}
                </div>
              </div>
            </Panel>
          </motion.div>
        )}

        {/* Recent Scenes Table */}
        {scenes.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <h2 className="font-display text-base font-semibold tracking-[-0.02em]">
                    Recent scenes
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {scenes.length} ingested in this workspace
                  </p>
                </div>
                <Link href="/scene/new">
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <UploadCloud className="size-3.5" />
                    New scene
                  </Button>
                </Link>
              </div>
              <div className="border-t border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Scene Name</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Input Config</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Modalities</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Sensor / GSD</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Ingested</TableHead>
                      <TableHead className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Status</TableHead>
                      <TableHead className="text-right text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedScenes.map((scene) => (
                      <TableRow
                        key={scene.id}
                        className="border-border transition-colors hover:bg-foreground/[0.03]"
                      >
                        <TableCell className="font-display font-medium tracking-[-0.01em] text-foreground">
                          {scene.name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] font-mono', configBadge[scene.inputConfig].className)}
                          >
                            {configBadge[scene.inputConfig].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            {scene.modalities.map((m, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className={cn('text-[10px]', modalityColor[m])}
                              >
                                {m}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {scene.images[0]?.sensorHint || '-'} / {scene.images[0]?.gsdM ? `${scene.images[0].gsdM} m` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(scene.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px]', statusBadge[scene.status]?.className)}>
                            {statusBadge[scene.status]?.label || scene.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {scene.status === 'READY' && (
                              <Tooltip>
                                <TooltipTrigger className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-brand-500 transition-colors">
                                  <Link href={`/scene/${scene.id}`}>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent className="bg-card border-border">Open Workspace</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-modality-sar transition-colors">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </TooltipTrigger>
                              <TooltipContent className="bg-card border-border">Re-validate</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger className="h-7 w-7 p-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </TooltipTrigger>
                              <TooltipContent className="bg-card border-border">Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      Showing {page * ROWS_PER_PAGE + 1}-{Math.min((page + 1) * ROWS_PER_PAGE, scenes.length)} of {scenes.length}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="h-7 px-2"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={page === totalPages - 1}
                        className="h-7 px-2"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          </motion.div>
        )}
      </div>
    </div>
  );
}
