'use client';

import { FlaskConical, Play, Award, BarChart2, CheckCircle2 } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

export default function BenchmarksPage() {
  return (
    <div className="flex flex-col h-full">
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Benchmarks' }]} />

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-brand-500" />
              Evaluation Harness & Benchmarks
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Offline-capable evaluation suite for RSVQA, VRSBench, CDVQA, and ISRO/SAC test splits (PRD §11)
            </p>
          </div>

          <Button className="bg-brand-500 hover:bg-brand-600 text-white gap-2">
            <Play className="w-4 h-4" />
            Run Evaluation Suite
          </Button>
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
