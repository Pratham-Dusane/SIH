'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Upload, Search, ArrowRight } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import InputModeTabs from '@/components/scene/InputModeTabs';
import CompatibilityPanel from '@/components/scene/CompatibilityPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { InputConfig, Scene } from '@/lib/types';
import { CompatibilityError, confirmScene, setSceneDates, uploadSceneImage } from '@/lib/api';
import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';

function roleLabel(role: string): string {
  switch (role) {
    case 't1': return 'T1 (earlier)';
    case 't2': return 'T2 (later)';
    case 'optical': return 'Optical';
    case 'sar': return 'SAR';
    case 'single': return 'Image';
    default: return role;
  }
}

const steps = [
  { label: 'Upload', icon: Upload },
  { label: 'Validate', icon: Search },
  { label: 'Confirm', icon: Check },
];

export default function NewScenePage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [inputConfig, setInputConfig] = useState<InputConfig>('SINGLE');
  const [benchmarkMode, setBenchmarkMode] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File>>({});
  const [validatedScene, setValidatedScene] = useState<Scene | null>(null);
  const [sceneName, setSceneName] = useState('');
  const [benchmarkDataset, setBenchmarkDataset] = useState('');
  // Acquisition dates, per image role. Collected here because the Earth Engine
  // tools query the catalog by AOI + date range, and they are locked once the
  // scene has been queried - so upload is the moment to get them right.
  const [acquiredDates, setAcquiredDates] = useState<Record<string, string>>({});

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [compatFail, setCompatFail] =
    useState<CompatibilityError['report'] | null>(null);

  const handleFilesUploaded = (files: Record<string, File>) => {
    setUploadedFiles(files);
    setUploadError(null);
    setCompatFail(null);
  };

  /**
   * Upload every file, then ingest. The scene that comes back is the real one
   * from the backend - its name, CRS, GSD and compatibility verdict are read
   * from the raster, never from a fixture.
   */
  const handleProceedToValidate = async () => {
    const entries = Object.entries(uploadedFiles).filter(([, f]) => Boolean(f));
    if (entries.length === 0) return;

    setUploading(true);
    setUploadError(null);
    setCompatFail(null);

    try {
      // All images of a scene must share one scene id so they land under the
      // same storage prefix; the first upload mints it.
      let sceneId: string | undefined;
      const uploaded: { role: string; originalFilename: string;
                        objectPath: string; sceneId: string }[] = [];
      for (const [role, file] of entries) {
        setProgress(`Uploading ${file.name}…`);
        const result = await uploadSceneImage(file, role, sceneId);
        sceneId = result.sceneId;
        uploaded.push(result);
      }

      setProgress('Reading metadata and validating…');
      const scene = await confirmScene(
        uploaded,
        inputConfig,
        benchmarkMode,
        sceneName.trim() || undefined,
        benchmarkMode ? benchmarkDataset.trim() || undefined : undefined,
      );

      // Apply acquisition dates before anything can query the scene.
      const byRole = Object.fromEntries(
        Object.entries(acquiredDates).filter(([role, v]) =>
          v && uploaded.some((u) => u.role === role)),
      );
      const finalScene = Object.keys(byRole).length > 0
        ? await setSceneDates(scene.id, byRole)
        : scene;

      setValidatedScene(finalScene);
      setCurrentStep(1);
    } catch (err) {
      if (err instanceof CompatibilityError) {
        // R8 refusal - show the checklist rather than a generic error.
        setCompatFail(err.report);
      } else {
        setUploadError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const handleProceedToConfirm = () => {
    setCurrentStep(2);
  };

  const hasFiles = Object.values(uploadedFiles).some(Boolean);
  const firstFileName = Object.values(uploadedFiles).find(Boolean)?.name;

  return (
    <div className="flex flex-col h-full">
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'New Scene' }]} />

      <div className="flex-1 p-6 overflow-y-auto">
        {/* Stepper */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((step, i) => (
            <div key={step.label} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
                  i === currentStep
                    ? 'bg-brand-500/20 text-brand-500 ring-1 ring-brand-500/40'
                    : i < currentStep
                      ? 'bg-confidence-high/15 text-confidence-high'
                      : 'bg-secondary text-muted-foreground'
                )}
              >
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  i === currentStep
                    ? 'bg-brand-500 text-white'
                    : i < currentStep
                      ? 'bg-confidence-high text-white'
                      : 'bg-muted-foreground/30 text-muted-foreground'
                )}>
                  {i < currentStep ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn(
                  'w-12 h-0.5 mx-2',
                  i < currentStep ? 'bg-confidence-high' : 'bg-border'
                )} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Upload */}
          {currentStep === 0 && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <InputModeTabs
                inputConfig={inputConfig}
                onConfigChange={setInputConfig}
                benchmarkMode={benchmarkMode}
                onBenchmarkChange={setBenchmarkMode}
                onFilesChange={handleFilesUploaded}
              />

              {/* Scene name - defaults to the first uploaded filename so the
                  scene is identifiable, instead of a generic timestamp. */}
              <div className="mt-6 max-w-xl">
                <label htmlFor="scene-name"
                  className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Scene name <span className="font-normal">(optional)</span>
                </label>
                <input
                  id="scene-name"
                  type="text"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  placeholder={firstFileName
                    ? firstFileName.replace(/\.[^.]+$/, '')
                    : 'Named after the uploaded file if left blank'}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                             placeholder:text-muted-foreground/60 focus:outline-none
                             focus:ring-1 focus:ring-brand-500"
                />
                {benchmarkMode && (
                  <div className="mt-3">
                    <label htmlFor="bench-ds"
                      className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Benchmark dataset <span className="font-normal">(e.g. VRSBench, RSVQA, CDVQA)</span>
                    </label>
                    <input
                      id="bench-ds"
                      type="text"
                      value={benchmarkDataset}
                      onChange={(e) => setBenchmarkDataset(e.target.value)}
                      placeholder="VRSBench"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                                 placeholder:text-muted-foreground/60 focus:outline-none
                                 focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                )}
              </div>

              {/* Acquisition dates — required by the Earth Engine tools, and
                  locked once the scene has been queried, so collect them now. */}
              {hasFiles && !benchmarkMode && (
                <div className="mt-4 max-w-xl rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-xs font-medium text-foreground">
                    Acquisition date{Object.keys(uploadedFiles).length > 1 ? 's' : ''}
                    {inputConfig === 'BI_TEMPORAL' && (
                      <span className="text-amber-500"> — required for change detection</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 mb-2.5">
                    Earth Engine queries its catalog by area <em>and</em> date.
                    Without these, <span className="font-mono">change_detect</span> and
                    <span className="font-mono"> rs_classify</span> refuse rather than
                    guess a window. These cannot be changed after the first query.
                  </p>
                  <div className="space-y-2">
                    {Object.entries(uploadedFiles)
                      .filter(([, f]) => Boolean(f))
                      .map(([role, file]) => (
                        <label key={role} className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground w-28 shrink-0">
                            {roleLabel(role)}
                          </span>
                          <input
                            type="date"
                            value={acquiredDates[role] ?? ''}
                            onChange={(e) =>
                              setAcquiredDates((d) => ({ ...d, [role]: e.target.value }))}
                            className="rounded border border-border bg-background px-2 py-1
                                       text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                          />
                          <span className="text-[10px] text-muted-foreground truncate">
                            {file.name}
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="mt-4 max-w-xl rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-xs font-semibold text-destructive">Upload failed</p>
                  <p className="mt-1 text-[11px] font-mono text-muted-foreground break-all">
                    {uploadError}
                  </p>
                </div>
              )}

              {compatFail && (
                <div className="mt-4 max-w-xl rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    Compatibility check failed - scene rejected (R8)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These inputs cannot be analysed together. The system refuses rather
                    than producing a meaningless result.
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {compatFail.checks.filter((c) => c.status === 'FAIL').map((c) => (
                      <li key={c.name} className="text-xs">
                        <span className="font-mono text-destructive">{c.status}</span>
                        <span className="text-muted-foreground"> · {c.name} - {c.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 mt-6">
                {progress && (
                  <span className="text-xs text-muted-foreground">{progress}</span>
                )}
                <Button
                  onClick={handleProceedToValidate}
                  disabled={!hasFiles || uploading}
                  className="bg-brand-500 hover:bg-brand-600 text-white gap-2"
                >
                  {uploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</>
                    : <>Validate<ArrowRight className="w-4 h-4" /></>}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Validate */}
          {currentStep === 1 && validatedScene && (
            <motion.div
              key="validate"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <CompatibilityPanel scene={validatedScene} />

              <div className="flex justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStep(0)}
                  className="border-border"
                >
                  Back
                </Button>
                <Button
                  onClick={handleProceedToConfirm}
                  disabled={validatedScene.compatibility.verdict === 'FAIL'}
                  className="bg-brand-500 hover:bg-brand-600 text-white gap-2"
                >
                  Confirm & Open Workspace
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Confirm */}
          {currentStep === 2 && validatedScene && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="bg-card border-border max-w-2xl mx-auto">
                <CardContent className="p-8 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-confidence-high/15 mb-4">
                    <Check className="w-8 h-8 text-confidence-high" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">Scene Ready</h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    <strong>{validatedScene.name}</strong> has been validated and is ready for analysis.
                  </p>

                  <div className="grid grid-cols-2 gap-4 mb-6 text-left">
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Input Configuration</p>
                      <p className="text-sm font-medium">{validatedScene.inputConfig}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Modalities</p>
                      <p className="text-sm font-medium">{validatedScene.modalities.join(', ')}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">CRS</p>
                      <p className="text-sm font-medium">{validatedScene.compatibility.targetCrs || 'N/A'}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">GSD</p>
                      <p className="text-sm font-medium">{validatedScene.compatibility.targetGsdM ? `${validatedScene.compatibility.targetGsdM} m` : 'N/A'}</p>
                    </div>
                  </div>

                  <Link href={`/scene/${validatedScene.id}`}>
                    <Button className="bg-brand-500 hover:bg-brand-600 text-white gap-2">
                      Open Workspace
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
