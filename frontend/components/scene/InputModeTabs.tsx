'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import SceneUploader from './SceneUploader';
import { InputConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Image, Layers, Clock } from 'lucide-react';

function SimpleSwitch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        checked ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
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
    <div className="space-y-5">
      {/* Benchmark toggle - tightly grouped layout */}
      <Card className="bg-card border-border/80 shadow-sm rounded-2xl">
        <CardContent className="p-4 flex items-center gap-4">
          <SimpleSwitch
            id="benchmark-mode-toggle"
            checked={benchmarkMode}
            onChange={onBenchmarkChange}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              Benchmark Sample Mode
              {benchmarkMode && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-mono">
                  PNG/JPEG Allowed
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enable for public dataset samples (VRSBench / RSVQA / CDVQA). Relaxes GeoTIFF requirement.
            </p>
          </div>
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
        <TabsList className="bg-secondary/70 border border-border/80 grid w-full grid-cols-3 p-1 rounded-xl h-11">
          <TabsTrigger
            value="SINGLE"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg font-medium text-xs sm:text-sm gap-2"
          >
            <Image className="w-4 h-4" strokeWidth={1.5} />
            Single Image
          </TabsTrigger>
          <TabsTrigger
            value="CROSS_MODAL"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg font-medium text-xs sm:text-sm gap-2"
          >
            <Layers className="w-4 h-4" strokeWidth={1.5} />
            Cross-Modal Pair
          </TabsTrigger>
          <TabsTrigger
            value="BI_TEMPORAL"
            className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-lg font-medium text-xs sm:text-sm gap-2"
          >
            <Clock className="w-4 h-4" strokeWidth={1.5} />
            Bi-Temporal Pair
          </TabsTrigger>
        </TabsList>

        {/* Single Image */}
        <TabsContent value="SINGLE" className="mt-4">
          <SceneUploader
            zone="single"
            label="Upload Satellite Image"
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
              label="Optical / Multispectral Image"
              accept={acceptedExts}
              file={files.optical || null}
              onFile={(f) => handleFile('optical', f)}
              benchmarkMode={benchmarkMode}
              colorAccent="border-sky-500/40 hover:border-sky-500/60"
            />
            <SceneUploader
              zone="sar"
              label="SAR Image (Co-registered)"
              accept={acceptedExts}
              file={files.sar || null}
              onFile={(f) => handleFile('sar', f)}
              benchmarkMode={benchmarkMode}
              colorAccent="border-orange-500/40 hover:border-orange-500/60"
            />
          </div>
        </TabsContent>

        {/* Bi-Temporal */}
        <TabsContent value="BI_TEMPORAL" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SceneUploader
              zone="t1"
              label="T1 Image (Earlier Acquisition)"
              accept={acceptedExts}
              file={files.t1 || null}
              onFile={(f) => handleFile('t1', f)}
              benchmarkMode={benchmarkMode}
              colorAccent="border-emerald-500/40 hover:border-emerald-500/60"
            />
            <SceneUploader
              zone="t2"
              label="T2 Image (Later Acquisition)"
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
