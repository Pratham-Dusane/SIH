'use client';

import { cn } from '@/lib/utils';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

interface ToolNode {
  id: string;
  label: string;
  description: string;
}

interface Swimlane {
  title: string;
  badge: string;
  color: string;
  bgColor: string;
  badgeColor: string;
  tools: ToolNode[];
}

const SWIMLANES: Swimlane[] = [
  {
    title: 'Deterministic Geo Tools',
    badge: '100% Offline · C++/Rasterio',
    color: 'border-emerald-500/40 hover:border-emerald-500/60',
    bgColor: 'bg-emerald-500/5',
    badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    tools: [
      { id: 'spectral_index', label: 'spectral_index', description: 'NDVI / NDWI / NDBI indices' },
      { id: 'sar_water_mask', label: 'sar_water_mask', description: 'Otsu dB radar thresholding' },
      { id: 'geo_stats', label: 'geo_stats', description: 'Surface area (m², ha, km²)' },
      { id: 'coreg_check', label: 'coreg_check', description: 'Phase correlation alignment' },
    ],
  },
  {
    title: 'GEE Cloud Services',
    badge: 'Cloud Earth Engine',
    color: 'border-sky-500/40 hover:border-sky-500/60',
    bgColor: 'bg-sky-500/5',
    badgeColor: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    tools: [
      { id: 'rs_classify', label: 'rs_classify', description: 'DynamicWorld land-cover models' },
      { id: 'change_detect', label: 'change_detect', description: 'Bi-temporal spectral difference' },
      { id: 'sar_sentinel1_grd', label: 'sar_sentinel1_grd', description: 'Sentinel-1 GRD amplitude fetch' },
    ],
  },
  {
    title: 'Vision-Language Gateway',
    badge: 'Hosted Multimodal VLM',
    color: 'border-purple-500/40 hover:border-purple-500/60',
    bgColor: 'bg-purple-500/5',
    badgeColor: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
    tools: [
      { id: 'rs_vqa', label: 'rs_vqa', description: 'Remote sensing visual QA' },
      { id: 'rs_caption', label: 'rs_caption', description: 'Dense scene captioning' },
      { id: 'rs_ground', label: 'rs_ground', description: 'Text-guided region grounding' },
      { id: 'change_describe', label: 'change_describe', description: 'Bi-temporal change description' },
    ],
  },
];

const PIPELINE_STAGES = [
  'User Query',
  'Task Classifier',
  'Input Compatibility Gate',
  'Rule DAG Planner',
];

interface PipelineTopologyProps {
  selectedTool: string | null;
  onSelectTool: (toolId: string) => void;
  className?: string;
}

export default function PipelineTopology({ selectedTool, onSelectTool, className }: PipelineTopologyProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Top Horizontal Ingestion Flow */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-secondary/80 border border-border/80 text-[11px] font-semibold font-mono text-foreground whitespace-nowrap shadow-sm">
              <span className="text-primary mr-1 font-bold">{i + 1}.</span>
              {stage}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" strokeWidth={1.5} />
            )}
          </div>
        ))}
      </div>

      {/* Swimlane Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
        {SWIMLANES.map((lane) => (
          <div
            key={lane.title}
            className={cn(
              'rounded-2xl border p-3.5 space-y-3 transition-all',
              lane.color,
              lane.bgColor
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
              <h4 className="text-xs font-bold text-foreground truncate">{lane.title}</h4>
              <span className={cn(
                'text-[8px] font-semibold px-2 py-0.5 rounded-full border shrink-0 font-mono',
                lane.badgeColor
              )}>
                {lane.badge}
              </span>
            </div>

            <div className="space-y-1.5">
              {lane.tools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => onSelectTool(tool.id)}
                  className={cn(
                    'w-full text-left p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2',
                    selectedTool === tool.id
                      ? 'bg-primary/15 border-primary text-foreground shadow-md ring-1 ring-primary/40'
                      : 'bg-background/70 border-border/60 hover:border-primary/40 hover:bg-background/90 text-muted-foreground'
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold text-foreground truncate flex items-center gap-1.5">
                      {selectedTool === tool.id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                      {tool.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate leading-tight">
                      {tool.description}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground opacity-60 shrink-0">
                    inspect
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Grounded Synthesis Node */}
      <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
        <div className="px-4 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-xs font-semibold text-primary font-mono shadow-sm flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
          Grounded Multimodal Synthesis & Evidence Layer GeoTIFF Export
        </div>
      </div>
    </div>
  );
}
