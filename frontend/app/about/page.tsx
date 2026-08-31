'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useInView } from 'framer-motion';
import {
  Satellite, Brain, Layers, GitCompareArrows,
  Eye, Upload, MessageSquare, FileCheck,
  ArrowRight, Radar, ScanEye, Network,
  ShieldCheck, Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import { useStore } from '@/lib/store';
import CircularBackground from '@/components/landing/CircularBackground';
import AuroraBackground from '@/components/landing/AuroraBackground';
import AboutNav from '@/components/landing/AboutNav';

function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function FeatureCard({ icon: Icon, title, description, delay = 0 }: {
  icon: React.ElementType; title: string; description: string; delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 25 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay }}
      className="glass-card rounded-2xl p-6 hover:scale-[1.02] transition-all space-y-3"
    >
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
        <Icon className="w-6 h-6" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}

function StepCard({ step, icon: Icon, title, description, delay = 0 }: {
  step: number; icon: React.ElementType; title: string; description: string; delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 25 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, delay }}
      className="relative flex flex-col items-center text-center p-4 rounded-2xl bg-card border border-border/70 shadow-sm"
    >
      <div className="relative mb-3">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-inner">
          <Icon className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold flex items-center justify-center shadow-md">
          {step}
        </span>
      </div>
      <h4 className="text-sm font-bold text-foreground mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h4>
      <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">{description}</p>
    </motion.div>
  );
}

export default function AboutPage() {
  const router = useRouter();
  const { theme } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && theme === 'dark';

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-100/50 dark:bg-[#060b19]">
      {/* Background */}
      {mounted && isDark && <CircularBackground />}
      {mounted && !isDark && <AuroraBackground />}

      <AboutNav />

      {/* Hero */}
      <section className="relative z-10 pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-card/80 backdrop-blur-md text-xs font-semibold tracking-wider uppercase text-muted-foreground shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
              Problem Statement #26167 | ISRO SAC
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.1]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            SatQuery AI:
            <br />
            <span className="gradient-text">Interactive Remote Sensing</span>
            <br />
            <span className="text-muted-foreground text-3xl sm:text-4xl">Through Natural Language</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            Ask questions about satellite imagery in plain English. The agentic system coordinates specialist models across optical, SAR, and temporal image pairs with verifiable visual evidence.
          </motion.p>
        </div>
      </section>

      {/* The Problem */}
      <RevealSection className="relative z-10 py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="glass-card rounded-3xl p-8 sm:p-10 space-y-4">
            <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
              The Problem
            </h2>
            <div className="space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <p>
                Most existing remote sensing solutions operate as isolated applications for single tasks (land-cover classification, object detection, or change mapping). Non-experts find it difficult to navigate complex GIS workflows and sensor configurations.
              </p>
              <p>
                Crucial remote sensing questions require joint reasoning across optical and SAR modalities or bi-temporal dates. Generic VLMs lack remote sensing sensor adaptation and reliable evidence grounding.
              </p>
            </div>
          </div>
        </div>
      </RevealSection>

      {/* The Solution: Pipeline Architecture */}
      <RevealSection className="relative z-10 py-12 px-6">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Agentic Pipeline Architecture
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
            Dynamic query routing, model validation, and structured evidence synthesis
          </p>

          <div className="glass-card rounded-3xl p-8 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-xs">
              {[
                { icon: MessageSquare, label: 'Natural Language\nQuery', color: 'text-primary' },
                { icon: Brain, label: 'Agentic\nController', color: 'text-purple-400' },
                { icon: Network, label: 'Model\nRegistry', color: 'text-blue-400' },
                { icon: ScanEye, label: 'Specialist\nTools', color: 'text-amber-400' },
                { icon: FileCheck, label: 'Evidence\nResponse', color: 'text-emerald-400' },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-secondary/50 border border-border/70 min-w-[110px]">
                    <item.icon className={`w-5 h-5 ${item.color}`} strokeWidth={1.5} />
                    <span className="text-[11px] font-medium text-foreground whitespace-pre-line text-center leading-tight">
                      {item.label}
                    </span>
                  </div>
                  {i < 4 && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground/50 hidden sm:block" strokeWidth={1.5} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </RevealSection>

      {/* Capabilities */}
      <RevealSection className="relative z-10 py-12 px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
              Core Capabilities
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Built for ISRO SAC remote sensing workflows
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Eye}
              title="Single-Image VQA"
              description="Answer natural language queries regarding objects, counts, and spatial layout over optical and SAR tiles."
              delay={0}
            />
            <FeatureCard
              icon={Satellite}
              title="Captioning and Grounding"
              description="Generate rich descriptions and highlight requested spatial regions with grounded bounding boxes."
              delay={0.08}
            />
            <FeatureCard
              icon={GitCompareArrows}
              title="Bi-Temporal Change Analysis"
              description="Identify, describe, and localize surface changes between acquisitions from different dates."
              delay={0.16}
            />
            <FeatureCard
              icon={Layers}
              title="Optical-SAR Cross-Modal Fusion"
              description="Extract complementary structural and spectral details from co-registered optical and SAR imagery."
              delay={0.24}
            />
            <FeatureCard
              icon={Brain}
              title="Agentic Orchestration"
              description="Automatically classify queries, validate image inputs, execute specialized tools, and synthesize answers."
              delay={0.32}
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Verifiable Evidence"
              description="Confidence estimation, auditable execution traces, spatial overlays, and downloadable reports."
              delay={0.4}
            />
          </div>
        </div>
      </RevealSection>

      {/* How It Works */}
      <RevealSection className="relative z-10 py-12 px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
              How It Works
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Three steps to satellite intelligence</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StepCard
              step={1}
              icon={Upload}
              title="1. Ingest Imagery"
              description="Upload single, cross-modal, or bi-temporal imagery in GeoTIFF format (or public benchmark formats)."
              delay={0}
            />
            <StepCard
              step={2}
              icon={MessageSquare}
              title="2. Query Naturally"
              description="Ask in plain language. The agent orchestrates the necessary specialist tool workflow."
              delay={0.1}
            />
            <StepCard
              step={3}
              icon={FileCheck}
              title="3. Inspect Evidence"
              description="Receive answers backed by spatial overlays, confidence meters, and execution timelines."
              delay={0.2}
            />
          </div>
        </div>
      </RevealSection>

      {/* Final CTA */}
      <RevealSection className="relative z-10 py-20 px-6">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
            Ready to Explore the Workspace?
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Ingest satellite imagery and test multimodal vision-language queries.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold text-sm hover:opacity-90 shadow-lg transition-all cursor-pointer"
          >
            Launch SatQuery AI
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </RevealSection>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/60 py-8 px-6 bg-card/40">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/isro.svg" alt="ISRO" width={28} height={28} className="h-6 w-auto dark:invert" />
            <Image src="/sac.png" alt="SAC" width={28} height={28} className="h-6 w-auto dark:invert" />
          </div>
          <p className="text-xs text-muted-foreground">
            SatQuery AI | Indian Space Research Organisation (ISRO) | Space Applications Centre (SAC) | SIH 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
