'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Satellite, Search, BarChart3, ShieldAlert,
  UploadCloud, ExternalLink, RotateCcw, Trash2,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const ROWS_PER_PAGE = 10;

const modalityColor: Record<Modality, string> = {
  OPTICAL: 'bg-modality-optical/20 text-modality-optical border-modality-optical/30',
  MULTISPECTRAL: 'bg-modality-optical/20 text-modality-optical border-modality-optical/30',
  SAR: 'bg-modality-sar/20 text-modality-sar border-modality-sar/30',
  AMBIGUOUS: 'bg-muted text-muted-foreground border-border',
};

const configBadge: Record<InputConfig, { label: string; className: string }> = {
  SINGLE: { label: 'SINGLE', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  CROSS_MODAL: { label: 'CROSS-MODAL', className: 'bg-modality-fused/15 text-modality-fused border-modality-fused/30' },
  BI_TEMPORAL: { label: 'BI-TEMPORAL', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

const statusBadge: Record<string, { className: string; label: string }> = {
  READY: { className: 'bg-confidence-high/15 text-confidence-high', label: 'Ready' },
  VALIDATING: { className: 'bg-confidence-medium/15 text-confidence-medium animate-pulse', label: 'Validating' },
  INCOMPATIBLE: { className: 'bg-confidence-low/15 text-confidence-low', label: 'Incompatible' },
  UPLOADING: { className: 'bg-brand-500/15 text-brand-500 animate-pulse', label: 'Uploading' },
  FAILED: { className: 'bg-confidence-low/15 text-confidence-low', label: 'Failed' },
};

function confidenceColor(value: number) {
  if (value >= 0.75) return 'text-confidence-high';
  if (value >= 0.45) return 'text-confidence-medium';
  return 'text-confidence-low';
}

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

  useEffect(() => {
    Promise.all([fetchDashboardStats(), fetchScenes()]).then(([s, sc]) => {
      setStats(s);
      setScenes(sc);
      setLoading(false);
    });
  }, []);

  const totalPages = Math.ceil(scenes.length / ROWS_PER_PAGE);
  const pagedScenes = scenes.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  const statCards = stats
    ? [
        {
          label: 'Scenes Ingested',
          value: stats.scenesIngested,
          icon: Satellite,
          color: 'text-brand-500',
          bg: 'bg-brand-500/10',
        },
        {
          label: 'Queries Answered',
          value: stats.queriesAnswered,
          icon: Search,
          color: 'text-modality-optical',
          bg: 'bg-modality-optical/10',
        },
        {
          label: 'Avg. Confidence',
          value: `${(stats.averageConfidence * 100).toFixed(0)}%`,
          icon: BarChart3,
          color: confidenceColor(stats.averageConfidence),
          bg: stats.averageConfidence >= 0.75
            ? 'bg-confidence-high/10'
            : stats.averageConfidence >= 0.45
              ? 'bg-confidence-medium/10'
              : 'bg-confidence-low/10',
        },
        {
          label: 'Abstention Rate',
          value: `${(stats.abstentionRate * 100).toFixed(0)}%`,
          icon: ShieldAlert,
          color: 'text-modality-sar',
          bg: 'bg-modality-sar/10',
          tooltip: 'Abstention is a feature — the system declines when evidence is insufficient rather than guessing.',
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      <TopNav breadcrumbs={[{ label: 'Dashboard' }]} />

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="bg-card border-border">
                  <CardContent className="p-5">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))
            : statCards.map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="bg-card border-border hover:border-brand-500/30 transition-colors">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {card.label}
                        </p>
                        <div className={cn('p-2 rounded-lg', card.bg)}>
                          <card.icon className={cn('w-4 h-4', card.color)} />
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <span className={cn('text-2xl font-bold', card.color)}>
                          {card.value}
                        </span>
                        {card.tooltip && (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-[10px] text-muted-foreground mb-1 cursor-help underline decoration-dotted">
                                why?
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="bg-card border-border max-w-[240px]">
                              <p className="text-xs">{card.tooltip}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
        </div>

        {/* Quick Start - shown when no scenes */}
        {!loading && scenes.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="bg-gradient-to-br from-brand-900/40 to-card border-brand-500/20">
              <CardContent className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/15 mb-4">
                  <UploadCloud className="w-8 h-8 text-brand-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Upload your first scene</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Start by uploading satellite imagery — GeoTIFF for real analysis,
                  or PNG/JPEG for benchmark samples.
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
                        className="border-brand-500/30 hover:bg-brand-500/10 hover:border-brand-500/50 transition-all"
                      >
                        {preset.label}
                      </Button>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Recent Scenes Table */}
        {scenes.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">Recent Scenes</CardTitle>
                  <Link href="/scene/new">
                    <Button size="sm" className="bg-brand-500 hover:bg-brand-600 text-white gap-1.5">
                      <UploadCloud className="w-3.5 h-3.5" />
                      New Scene
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Scene Name</TableHead>
                      <TableHead className="text-muted-foreground">Input Config</TableHead>
                      <TableHead className="text-muted-foreground">Modalities</TableHead>
                      <TableHead className="text-muted-foreground">Sensor / GSD</TableHead>
                      <TableHead className="text-muted-foreground">Ingested</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedScenes.map((scene) => (
                      <TableRow
                        key={scene.id}
                        className="border-border hover:bg-secondary/30 transition-colors"
                      >
                        <TableCell className="font-medium text-foreground">
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
                          {scene.images[0]?.sensorHint || '—'} / {scene.images[0]?.gsdM ? `${scene.images[0].gsdM} m` : 'N/A'}
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
                      Showing {page * ROWS_PER_PAGE + 1}–{Math.min((page + 1) * ROWS_PER_PAGE, scenes.length)} of {scenes.length}
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
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
