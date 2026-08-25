'use client';

import { Boxes, Cpu, CheckCircle2, FileJson, Layers, Sun, Moon } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';

const models = [
  {
    id: 'M1',
    name: 'RS-CLIP Dual Encoder',
    version: 'v0.2.0',
    base: 'open_clip ViT-B/16 (laion2b)',
    adaptation: 'BigEarthNet.txt (Sentinel-1 SAR + Sentinel-2 MS)',
    tools: ['rs_classify', 'retrieval', 'sar_optical_fuse'],
    status: 'ACTIVE',
  },
  {
    id: 'M2',
    name: 'RS-VLM Multi-Task VLM',
    version: 'v0.3.1',
    base: 'Qwen2-VL-7B-Instruct',
    adaptation: 'LoRA r=32 on attention + MLP, visual.merger fine-tuned',
    tools: ['rs_vqa', 'rs_caption', 'change_describe', 'change_vqa'],
    status: 'ACTIVE',
  },
  {
    id: 'M3',
    name: 'RS-Ground',
    version: 'v0.1.0',
    base: 'Grounding DINO Swin-T',
    adaptation: 'Fine-tuned on VRSBench referring expressions',
    tools: ['rs_ground'],
    status: 'ACTIVE',
  },
  {
    id: 'M4',
    name: 'RS-Change',
    version: 'v0.2.0',
    base: 'Siamese U-Net (EfficientNet-b0)',
    adaptation: 'Trained on LEVIR-CD + S2Looking + OSCD',
    tools: ['change_detect'],
    status: 'ACTIVE',
  },
  {
    id: 'M5',
    name: 'RS-Fusion Head',
    version: 'v0.2.0',
    base: 'MLP over M1 dual embeddings',
    adaptation: 'BigEarthNet S1+S2 19-class multilabel',
    tools: ['sar_optical_fuse'],
    status: 'ACTIVE',
  },
];

export default function ModelRegistryPage() {
  const { theme, toggleTheme } = useStore();

  return (
    <div className="flex flex-col h-full">
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Model Registry' }]} />

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Boxes className="w-5 h-5 text-brand-500" />
              Specialist Model Registry
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Remote-sensing adapted specialist models (M1–M5) registered for agentic tool execution (PRD §2.3 & §7.7)
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="gap-2 border-border"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </Button>
        </div>

        {/* Model Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {models.map((m) => (
            <Card key={m.id} className="bg-card border-border hover:border-brand-500/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-7 h-7 rounded bg-brand-500/20 text-brand-500 font-mono text-xs font-bold">
                      {m.id}
                    </span>
                    <div>
                      <CardTitle className="text-base font-semibold">{m.name}</CardTitle>
                      <CardDescription className="text-xs font-mono">{m.version}</CardDescription>
                    </div>
                  </div>
                  <Badge className="bg-confidence-high/15 text-confidence-high text-[10px]">
                    {m.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between border-b border-border/50 pb-1">
                    <span className="text-muted-foreground">Base Architecture:</span>
                    <span className="font-mono text-foreground">{m.base}</span>
                  </div>
                  <div className="flex justify-between border-b border-border/50 pb-1">
                    <span className="text-muted-foreground">Domain Adaptation:</span>
                    <span className="text-foreground text-right max-w-[60%]">{m.adaptation}</span>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">Serves Tools</p>
                  <div className="flex flex-wrap gap-1">
                    {m.tools.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px] font-mono bg-secondary/50 border-border">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
