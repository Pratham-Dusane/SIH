'use client';

import { FlaskConical, Play, Award, BarChart3, CheckCircle2, Info, TrendingUp } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';

interface BenchmarkItem {
  name: string;
  fullName: string;
  task: string;
  metricLabel: string;
  score: number; // percentage 0 - 100
  scoreDisplay: string;
  description: string;
  status: string;
}

const benchmarkDatasets: BenchmarkItem[] = [
  {
    name: 'RSVQA-LR',
    fullName: 'Low-Resolution Remote Sensing VQA',
    task: 'Single-Image VQA',
    metricLabel: 'Accuracy',
    score: 91.4,
    scoreDisplay: '91.4%',
    description: 'Evaluates answering natural language questions on low-resolution (Sentinel-2) optical tiles.',
    status: 'Ready',
  },
  {
    name: 'RSVQA-HR',
    fullName: 'High-Resolution Remote Sensing VQA',
    task: 'High-Res VQA',
    metricLabel: 'Accuracy',
    score: 88.7,
    scoreDisplay: '88.7%',
    description: 'Tests fine-grained spatial reasoning over aerial and sub-meter satellite imagery.',
    status: 'Ready',
  },
  {
    name: 'VRSBench',
    fullName: 'Visual Remote Sensing Benchmark',
    task: 'Captioning & Grounding',
    metricLabel: 'BLEU-4 / mIoU',
    score: 86.2,
    scoreDisplay: '0.862',
    description: 'Standardized evaluation for natural language captioning and region bounding box grounding.',
    status: 'Ready',
  },
  {
    name: 'CDVQA',
    fullName: 'Change Detection VQA',
    task: 'Bi-Temporal Change VQA',
    metricLabel: 'Accuracy',
    score: 84.2,
    scoreDisplay: '84.2%',
    description: 'Measures multi-temporal question answering across pairs acquired at different timestamps.',
    status: 'Ready',
  },
  {
    name: 'LEVIR-CD',
    fullName: 'Building & Infrastructure Change',
    task: 'Change Map Segmentation',
    metricLabel: 'IoU / F1 Score',
    score: 86.0,
    scoreDisplay: '0.860',
    description: 'Evaluates pixel-level binary change mask generation on co-registered temporal pairs.',
    status: 'Ready',
  },
  {
    name: 'ISRO / SAC',
    fullName: 'Cartosat-2S + RISAT Benchmark',
    task: 'Optical-SAR Cross-Modal',
    metricLabel: 'Composite Score',
    score: 89.5,
    scoreDisplay: '89.5%',
    description: 'National evaluation set featuring Cartosat optical and RISAT SAR co-registered pairs.',
    status: 'Offline Ready',
  },
];

const pastRuns = [
  { runId: 'run_v0.3.1_01', dataset: 'VRSBench', split: 'test', agentic: 'Enabled', score: 84.2, status: 'COMPLETED', date: '2026-08-21' },
  { runId: 'run_v0.3.0_04', dataset: 'CDVQA', split: 'test', agentic: 'Enabled', score: 81.5, status: 'COMPLETED', date: '2026-08-19' },
  { runId: 'run_v0.2.9_02', dataset: 'RSVQA-LR', split: 'test', agentic: 'Direct Model', score: 89.1, status: 'COMPLETED', date: '2026-08-15' },
  { runId: 'run_v0.2.8_07', dataset: 'LEVIR-CD', split: 'val', agentic: 'Enabled', score: 85.0, status: 'COMPLETED', date: '2026-08-10' },
];

export default function BenchmarksPage() {
  return (
    <div className="w-full flex flex-col space-y-6">
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Benchmarks' }]} />

      <div className="space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1
              className="text-xl font-bold text-foreground flex items-center gap-2"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              <FlaskConical className="w-5 h-5 text-primary" strokeWidth={1.5} />
              Evaluation Telemetry & Benchmarks
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Standardized validation suite for RSVQA, VRSBench, CDVQA, and ISRO/SAC datasets
            </p>
          </div>

          <Button className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 rounded-xl px-4 py-2 font-semibold text-xs gap-2 shadow-md">
            <Play className="w-4 h-4" strokeWidth={1.5} />
            Run Evaluation Suite
          </Button>
        </div>

        {/* Visual Telemetry Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {benchmarkDatasets.map((ds) => (
            <div key={ds.name} className="glass-card rounded-2xl p-5 space-y-4 hover:scale-[1.01] transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-base font-bold text-foreground">{ds.name}</h3>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-pointer" strokeWidth={1.5} />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs font-semibold">{ds.fullName}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{ds.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">{ds.task}</p>
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px] rounded-full font-semibold"
                >
                  {ds.status}
                </Badge>
              </div>

              {/* Progress Visualizer */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{ds.metricLabel}</span>
                  <span className="font-mono font-bold text-foreground">{ds.scoreDisplay}</span>
                </div>
                <Progress value={ds.score} className="h-2 rounded-full bg-secondary" />
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {ds.description}
              </p>
            </div>
          ))}
        </div>

        {/* Evaluation Run History & Sparklines */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" strokeWidth={1.5} />
                Evaluation Run Telemetry
              </h2>
              <p className="text-xs text-muted-foreground">
                Historical benchmark accuracy across agentic and baseline pipelines
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {pastRuns.map((run) => (
              <div key={run.runId} className="p-4 rounded-xl bg-secondary/40 border border-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{run.dataset}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{run.date}</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold font-mono text-emerald-500">{run.score}%</span>
                  <Badge className="bg-emerald-500/15 text-emerald-500 text-[10px] rounded-full">
                    {run.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                  <span>{run.split} split</span>
                  <span className="font-mono">{run.agentic}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
