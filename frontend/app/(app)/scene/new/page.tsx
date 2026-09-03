'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Upload, Search, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import InputModeTabs from '@/components/scene/InputModeTabs';
import CompatibilityPanel from '@/components/scene/CompatibilityPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { InputConfig, Scene } from '@/lib/types';
import { CompatibilityError, confirmScene, setSceneDates, uploadSceneImage } from '@/lib/api';
import Link from 'next/link';

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
  const [benchmarkDataset, setBenchmarkDataset] = useState('');
  const [acquiredDates, setAcquiredDates] = useState<Record<string, string>>({});

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [compatFail, setCompatFail] = useState<CompatibilityError['report'] | null>(null);

  const handleFilesUploaded = (files: Record<string, File>) => {
    setUploadedFiles(files);
    setUploadError(null);
    setCompatFail(null);
  };

  const handleProceedToValidate = async () => {
    const entries = Object.entries(uploadedFiles).filter(([, f]) => Boolean(f));
    if (entries.length === 0) return;

    setUploading(true);
    setUploadError(null);
    setCompatFail(null);

    try {
      let sceneId: string | undefined;
      const uploaded: { role: string; originalFilename: string; objectPath: string; sceneId: string }[] = [];
      for (const [role, file] of entries) {
        setProgress(`Uploading ${file.name}...`);
        const result = await uploadSceneImage(file, role, sceneId);
        sceneId = result.sceneId;
        uploaded.push(result);
      }

      setProgress('Reading metadata and validating...');
      const scene = await confirmScene(
        uploaded,
        inputConfig,
        benchmarkMode,
        undefined, // named after the file; renamed inline on the scene page
        benchmarkMode ? benchmarkDataset.trim() || undefined : undefined,
      );

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

      <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full py-2">
          {/* Stepper Header */}
          <div className="flex items-center justify-center mb-8">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center">
                <div
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold tracking-wide transition-all shadow-sm',
                    i === currentStep
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 ring-2 ring-primary/40'
                      : i < currentStep
                        ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                        : 'bg-card text-muted-foreground border border-border/80'
                  )}
                >
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                    i === currentStep
                      ? 'bg-primary text-white'
                      : i < currentStep
                        ? 'bg-emerald-500 text-white'
                        : 'bg-muted text-muted-foreground'
                  )}>
                    {i < currentStep ? <Check className="w-3 h-3" strokeWidth={2} /> : i + 1}
                  </div>
                  <span>{step.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={cn(
                    'w-8 sm:w-16 h-0.5 mx-2 rounded-full',
                    i < currentStep ? 'bg-emerald-500/60' : 'bg-border'
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <InputModeTabs
                  inputConfig={inputConfig}
                  onConfigChange={setInputConfig}
                  benchmarkMode={benchmarkMode}
                  onBenchmarkChange={setBenchmarkMode}
                  onFilesChange={handleFilesUploaded}
                />

                {/* Metadata details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {benchmarkMode && (
                    <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-sm space-y-1.5">
                      <label htmlFor="bench-ds" className="block text-xs font-semibold text-foreground">
                        Benchmark Dataset <span className="text-muted-foreground font-normal">(VRSBench, RSVQA, CDVQA)</span>
                      </label>
                      <input
                        id="bench-ds"
                        type="text"
                        value={benchmarkDataset}
                        onChange={(e) => setBenchmarkDataset(e.target.value)}
                        placeholder="e.g. VRSBench"
                        className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  )}
                </div>

                {/* Acquisition Dates */}
                {hasFiles && !benchmarkMode && (
                  <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Acquisition Dates
                        {inputConfig === 'BI_TEMPORAL' && (
                          <span className="text-amber-500 font-normal"> (required for change detection)</span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Acquisition timestamps lock in metadata for temporal and index tools.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {Object.entries(uploadedFiles)
                        .filter(([, f]) => Boolean(f))
                        .map(([role, file]) => (
                          <label key={role} className="flex items-center gap-2 p-2 rounded-xl bg-secondary/40 border border-border/60">
                            <span className="text-xs font-medium text-foreground w-24 shrink-0">
                              {roleLabel(role)}
                            </span>
                            <input
                              type="date"
                              value={acquiredDates[role] ?? ''}
                              onChange={(e) =>
                                setAcquiredDates((d) => ({ ...d, [role]: e.target.value }))}
                              className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <span className="text-[10px] text-muted-foreground truncate ml-auto">
                              {file.name}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" strokeWidth={1.5} />
                    <div className="text-xs space-y-1">
                      <p className="font-semibold text-destructive">Upload failed</p>
                      <p className="font-mono text-muted-foreground break-all">{uploadError}</p>
                    </div>
                  </div>
                )}

                {compatFail && (
                  <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
                      <p className="text-sm font-semibold">Compatibility check failed</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      These inputs cannot be analysed together. The system refuses rather than producing an inaccurate result.
                    </p>
                    <ul className="space-y-1.5 pt-1">
                      {compatFail.checks.filter((c) => c.status === 'FAIL').map((c) => (
                        <li key={c.name} className="text-xs flex items-start gap-2">
                          <span className="font-mono text-destructive font-bold">{c.status}</span>
                          <span className="text-muted-foreground">- {c.name}: {c.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Submit button */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    {progress || (hasFiles ? 'Ready to validate imagery' : 'Upload imagery to continue')}
                  </span>
                  <Button
                    onClick={handleProceedToValidate}
                    disabled={!hasFiles || uploading}
                    className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 px-6 py-2.5 rounded-xl font-semibold gap-2 shadow-md"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        Validate Scene
                        <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Validate */}
            {currentStep === 1 && validatedScene && (
              <motion.div
                key="validate"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <CompatibilityPanel scene={validatedScene} />

                <div className="flex justify-between items-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(0)}
                    className="border-border rounded-xl px-5"
                  >
                    Back to Upload
                  </Button>
                  <Button
                    onClick={handleProceedToConfirm}
                    disabled={validatedScene.compatibility.verdict === 'FAIL'}
                    className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 px-6 rounded-xl font-semibold gap-2 shadow-md"
                  >
                    Confirm and Open Workspace
                    <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Confirm */}
            {currentStep === 2 && validatedScene && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="bg-card border-border/80 rounded-3xl shadow-lg max-w-xl mx-auto overflow-hidden">
                  <CardContent className="p-8 text-center space-y-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-500 shadow-inner">
                      <Check className="w-8 h-8" strokeWidth={2} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">Scene Validated and Ready</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        <strong className="text-foreground">{validatedScene.name}</strong> is ingested and ready for natural language analysis.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-left">
                      <div className="bg-secondary/50 rounded-xl p-3 border border-border/60">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Configuration</p>
                        <p className="text-xs font-semibold text-foreground mt-0.5">{validatedScene.inputConfig}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-xl p-3 border border-border/60">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Modalities</p>
                        <p className="text-xs font-semibold text-foreground mt-0.5">{validatedScene.modalities.join(', ')}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-xl p-3 border border-border/60">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Target CRS</p>
                        <p className="text-xs font-mono font-medium text-foreground mt-0.5">{validatedScene.compatibility.targetCrs || 'N/A'}</p>
                      </div>
                      <div className="bg-secondary/50 rounded-xl p-3 border border-border/60">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Target GSD</p>
                        <p className="text-xs font-mono font-medium text-foreground mt-0.5">{validatedScene.compatibility.targetGsdM ? `${validatedScene.compatibility.targetGsdM} m` : 'N/A'}</p>
                      </div>
                    </div>

                    <Link href={`/scene/${validatedScene.id}`} className="block pt-2">
                      <Button className="w-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 h-11 rounded-xl font-semibold gap-2 shadow-md">
                        Open Analysis Workspace
                        <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
