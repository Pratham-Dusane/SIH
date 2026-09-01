'use client';

import { FlaskConical, Play, Award, BarChart2 } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ParticleButton from '@/components/kokonutui/particle-button';
import { AreaChart } from '@/components/charts/area-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { Eyebrow, Panel } from '@/components/ui/spectra';

const benchmarkDatasets = [
  { name: 'RSVQA-LR', task: 'Single-Image VQA', metric: 'Accuracy (91.4%)', status: 'Ready' },
  { name: 'RSVQA-HR', task: 'High-Res VQA', metric: 'Accuracy (88.7%)', status: 'Ready' },
  { name: 'VRSBench', task: 'Caption / Grounding / VQA', metric: 'BLEU-4 / [email protected]', status: 'Ready' },
  { name: 'CDVQA', task: 'Bi-Temporal Change VQA', metric: 'Accuracy (84.2%)', status: 'Ready' },
  { name: 'LEVIR-CD', task: 'Change Map Segmentation', metric: 'IoU / F1 (0.86)', status: 'Ready' },
  { name: 'ISRO / SAC', task: 'Cartosat-2S + RISAT Benchmark', metric: 'Composite Score', status: 'Offline Ready' },
];

const pastRuns = [
  { runId: 'run_v0.3.1_01', dataset: 'VRSBench', split: 'test', agentic: 'Enabled', score: '0.842', status: 'COMPLETED', date: '2026-08-21' },
  { runId: 'run_v0.3.0_04', dataset: 'CDVQA', split: 'test', agentic: 'Enabled', score: '0.815', status: 'COMPLETED', date: '2026-08-19' },
  { runId: 'run_v0.2.9_02', dataset: 'RSVQA-LR', split: 'test', agentic: 'Disabled (Direct)', score: '0.891', status: 'COMPLETED', date: '2026-08-15' },
];

/** Composite score over the recorded runs — reads oldest → newest. */
const scoreTrend = [...pastRuns]
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((r) => ({ date: new Date(r.date), score: Number(r.score) }));

export default function BenchmarksPage() {
  return (
    <div className="flex flex-col h-full">
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Benchmarks' }]} />

      <div className="grid-bg flex-1 space-y-7 overflow-y-auto p-6 lg:p-8">
        <div className="flex items-center justify-between">
          <div>
            <Eyebrow>PRD §11 · Evaluation harness</Eyebrow>
            <h1 className="font-display mt-2 flex items-center gap-2.5 text-[clamp(1.6rem,2.6vw,2.1rem)] font-semibold tracking-[-0.03em]">
              <FlaskConical className="size-6 text-ember-500" />
              Benchmarks
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
              Offline-capable evaluation across RSVQA, VRSBench, CDVQA and the
              ISRO/SAC test splits.
            </p>
          </div>

          <ParticleButton variant="ember" size="lg" className="gap-2" successDuration={900}>
            <Play className="size-4" />
            Run evaluation suite
          </ParticleButton>
        </div>

        {/* Benchmark Datasets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {benchmarkDatasets.map((ds) => (
            <Card key={ds.name} className="bg-card border-border hover:border-brand-500/30 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">{ds.name}</CardTitle>
                  <Badge variant="outline" className="bg-confidence-high/15 text-confidence-high border-confidence-high/30 text-[10px]">
                    {ds.status}
                  </Badge>
                </div>
                <CardDescription className="text-xs">{ds.task}</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                  <span className="text-muted-foreground">Key Metric:</span>
                  <span className="font-mono text-brand-400 font-medium">{ds.metric}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Composite score trend — bklit AreaChart with its reveal animation. */}
        <Panel className="overflow-hidden">
          <div className="flex items-end justify-between px-5 pt-5">
            <div>
              <h2 className="font-display text-base font-semibold tracking-[-0.02em]">
                Composite score
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Across {scoreTrend.length} recorded evaluation runs
              </p>
            </div>
            <span className="font-display text-2xl font-semibold tabular-nums text-ember-500">
              {scoreTrend.length
                ? scoreTrend[scoreTrend.length - 1].score.toFixed(3)
                : '--'}
            </span>
          </div>
          <div className="px-2 pb-2">
            <AreaChart
              data={scoreTrend}
              xDataKey="date"
              aspectRatio="4 / 1"
              loadingLabel="Loading evaluation history"
            >
              <Grid />
              <Area
                dataKey="score"
                fill="var(--color-ember-500)"
                stroke="var(--color-ember-500)"
                fillOpacity={0.22}
              />
            </AreaChart>
          </div>
        </Panel>

        {/* Evaluation Run History */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Evaluation Run History</CardTitle>
            <CardDescription className="text-xs">
              Benchmark runs executed through the agentic controller vs direct tool calls
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Run ID</TableHead>
                  <TableHead className="text-muted-foreground">Dataset</TableHead>
                  <TableHead className="text-muted-foreground">Split</TableHead>
                  <TableHead className="text-muted-foreground">Agentic Mode</TableHead>
                  <TableHead className="text-muted-foreground">Score</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pastRuns.map((run) => (
                  <TableRow key={run.runId} className="border-border hover:bg-secondary/30">
                    <TableCell className="font-mono text-xs text-foreground">{run.runId}</TableCell>
                    <TableCell className="text-sm font-medium">{run.dataset}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.split}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] bg-brand-500/10 text-brand-500 border-brand-500/20">
                        {run.agentic}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-confidence-high font-bold">{run.score}</TableCell>
                    <TableCell>
                      <Badge className="bg-confidence-high/15 text-confidence-high text-[10px]">
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{run.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
