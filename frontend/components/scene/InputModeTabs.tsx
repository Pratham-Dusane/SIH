'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import SceneUploader from './SceneUploader';
import { InputConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Image, Layers, Clock } from 'lucide-react';

// We need the Switch component - let me use a simple toggle
function SimpleSwitch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        checked ? 'bg-brand-500' : 'bg-muted-foreground/30'
      )}
    >
      <span className={cn(
        'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
        checked ? 'translate-x-[18px]' : 'translate-x-1'
      )} />
    </button>
  );
}

interface InputModeTabsProps {
  inputConfig: InputConfig;
  onConfigChange: (config: InputConfig) => void;
  benchmarkMode: boolean;
  onBenchmarkChange: (v: boolean) => void;
  onFilesChange: (files: Record<string, File>) => void;
}

export default function InputModeTabs({
  inputConfig,
  onConfigChange,
  benchmarkMode,
  onBenchmarkChange,
  onFilesChange,
}: InputModeTabsProps) {
  const [files, setFiles] = useState<Record<string, File>>({});

  const handleFile = (zone: string, file: File | null) => {
    const next = { ...files };
    if (file) next[zone] = file;
    else delete next[zone];
    setFiles(next);
    onFilesChange(next);
  };

  const acceptedExts = benchmarkMode
    ? '.tif,.tiff,.png,.jpg,.jpeg'
    : '.tif,.tiff';

  return (
    <div className="space-y-4">
      {/* Benchmark toggle */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Benchmark Sample Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This is a sample from a public benchmark (VRSBench / RSVQA / CDVQA).
              Enabling relaxes the format gate to PNG/JPEG and disables geo-dependent features.
            </p>
          </div>
          <SimpleSwitch
            id="benchmark-mode-toggle"
            checked={benchmarkMode}
            onChange={onBenchmarkChange}
          />
        </CardContent>
      </Card>

      {/* Input mode tabs */}
      <Tabs
        value={inputConfig}
        onValueChange={(v) => {
          onConfigChange(v as InputConfig);
          setFiles({});
          onFilesChange({});
        }}
      >
        <TabsList className="bg-secondary border border-border grid w-full grid-cols-3">
          <TabsTrigger value="SINGLE" className="data-[state=active]:bg-brand-500/20 data-[state=active]:text-brand-500 gap-1.5">
            <Image className="w-3.5 h-3.5" />
            Single Image
          </TabsTrigger>
          <TabsTrigger value="CROSS_MODAL" className="data-[state=active]:bg-modality-fused/20 data-[state=active]:text-modality-fused gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Cross-Modal Pair
          </TabsTrigger>
          <TabsTrigger value="BI_TEMPORAL" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Bi-Temporal Pair
          </TabsTrigger>
        </TabsList>

        {/* Single Image */}
        <TabsContent value="SINGLE" className="mt-4">
          <SceneUploader
            zone="single"
            label="Upload Image"
            accept={acceptedExts}
            file={files.single || null}
            onFile={(f) => handleFile('single', f)}
            benchmarkMode={benchmarkMode}
          />
        </TabsContent>

        {/* Cross-Modal */}
        <TabsContent value="CROSS_MODAL" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SceneUploader
              zone="optical"
              label="Optical / Multispectral"
              accept={acceptedExts}
              file={files.optical || null}
              onFile={(f) => handleFile('optical', f)}
              benchmarkMode={benchmarkMode}
              colorAccent="border-modality-optical/40 hover:border-modality-optical/60"
            />
            <SceneUploader
              zone="sar"
              label="SAR"
              accept={acceptedExts}
              file={files.sar || null}
              onFile={(f) => handleFile('sar', f)}
              benchmarkMode={benchmarkMode}
              colorAccent="border-modality-sar/40 hover:border-modality-sar/60"
            />
          </div>
        </TabsContent>

        {/* Bi-Temporal */}
        <TabsContent value="BI_TEMPORAL" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SceneUploader
              zone="t1"
              label="Time 1 (earlier)"
              accept={acceptedExts}
              file={files.t1 || null}
              onFile={(f) => handleFile('t1', f)}
              benchmarkMode={benchmarkMode}
              colorAccent="border-emerald-500/40 hover:border-emerald-500/60"
            />
            <SceneUploader
              zone="t2"
              label="Time 2 (later)"
              accept={acceptedExts}
              file={files.t2 || null}
              onFile={(f) => handleFile('t2', f)}
              benchmarkMode={benchmarkMode}
              colorAccent="border-emerald-500/40 hover:border-emerald-500/60"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
