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
import { mockScenes } from '@/lib/mocks';
import Link from 'next/link';

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

  const handleFilesUploaded = (files: Record<string, File>) => {
    setUploadedFiles(files);
  };

  const handleProceedToValidate = () => {
    // Mock: use a matching scene from mocks
    const mockScene = mockScenes.find((s) => s.inputConfig === inputConfig) || mockScenes[0];
    setValidatedScene(mockScene);
    setCurrentStep(1);
  };

  const handleProceedToConfirm = () => {
    setCurrentStep(2);
  };

  const hasFiles = Object.keys(uploadedFiles).length > 0;

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

              <div className="flex justify-end mt-6">
                <Button
                  onClick={handleProceedToValidate}
                  disabled={!hasFiles}
                  className="bg-brand-500 hover:bg-brand-600 text-white gap-2"
                >
                  Validate
                  <ArrowRight className="w-4 h-4" />
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
