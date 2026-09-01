'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useInView } from 'framer-motion';
import {
  Satellite, Brain, Layers, GitCompareArrows,
  Eye, Upload, MessageSquare, FileCheck,
  ArrowRight, Radar, ScanEye, Network,
  ShieldCheck, Sparkles, Compass, CheckCircle2,
} from 'lucide-react';
import Image from 'next/image';
import { useStore } from '@/lib/store';
import CircularBackground from '@/components/landing/CircularBackground';
import AuroraBackground from '@/components/landing/AuroraBackground';
import AboutNav from '@/components/landing/AboutNav';
import Satellite3D from '@/components/landing/Satellite3D';

function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 35 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
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
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 25 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay }}
      className="glass-card rounded-3xl p-6 hover:scale-[1.02] transition-all space-y-3 border border-border/80 shadow-lg"
    >
      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
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
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 25 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay }}
      className="relative flex flex-col items-center text-center p-6 rounded-3xl glass-card border border-border/70 shadow-lg"
    >
      <div className="relative mb-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/25 shadow-inner">
          <Icon className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold flex items-center justify-center shadow-md">
          {step}
        </span>
      </div>
      <h4 className="text-sm font-bold text-foreground mb-1.5" style={{ fontFamily: 'var(--font-heading)' }}>
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
      {/* Background Ambience */}
      {mounted && isDark && <CircularBackground />}
      {mounted && !isDark && <AuroraBackground />}

      <AboutNav />

      {/* ─── SECTION 1: HERO (Full Viewport Height) ─── */}
      <section className="relative z-10 min-h-[calc(100vh-4rem)] flex items-center pt-24 pb-16 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-[1.15fr_0.95fr] items-center gap-8 lg:gap-12">
          {/* Left Column: Heading, Description, Actions */}
          <div className="space-y-6 text-left">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-md text-[11px] font-semibold tracking-widest uppercase text-primary font-mono shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
                ISRO SAC · Problem Statement #26167
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.08]"
              style={{ fontFamily: 'var(--font-bodoni-moda), "Bodoni Moda", "Times New Roman", serif' }}
            >
              SatQuery AI:
              <br />
              <span className="text-sky-500 dark:text-sky-400 italic">Decoding Earth</span>
              <br />
              <span className="text-foreground text-3xl sm:text-4xl lg:text-5xl font-normal tracking-normal font-sans">
                Through Natural Language.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-sm sm:text-base text-muted-foreground max-w-xl leading-relaxed"
            >
              An interactive vision-language orchestrator for multimodal remote sensing. Query satellite imagery, SAR backscatter, and bi-temporal change maps in plain English with auditable evidence grounding.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4 pt-2"
            >
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold text-sm hover:opacity-90 shadow-xl hover:shadow-2xl transition-all cursor-pointer"
              >
                Launch Workspace
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </button>

              <button
                onClick={() => {
                  const elem = document.getElementById('problem-section');
                  elem?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-border bg-card/80 text-sm font-semibold text-foreground hover:bg-card backdrop-blur-md transition-all cursor-pointer"
              >
                <Compass className="w-4 h-4 text-primary" strokeWidth={1.5} />
                Explore Architecture
              </button>
            </motion.div>
          </div>

          {/* Right Column: Interactive 3D Three.js Satellite Animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="w-full flex justify-center"
          >
            <Satellite3D />
          </motion.div>
        </div>
      </section>

      {/* ─── SECTION 2: THE PROBLEM STATEMENT (Full Viewport Height) ─── */}
      <RevealSection className="relative z-10 min-h-screen flex items-center py-20 px-6 lg:px-12">
        <div id="problem-section" className="max-w-5xl mx-auto w-full space-y-10">
          <div className="text-center space-y-3">
            <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold">
              The Remote Sensing Dilemma
            </span>
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Why Generic AI Fails on Earth Observation
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Remote sensing imagery spans multi-spectral bands, complex GeoTIFF projections, SAR polarizations, and multi-temporal baselines that standard computer vision cannot parse.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass-card rounded-3xl p-8 space-y-4 border border-rose-500/20 bg-rose-500/5">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Fragmented GIS Tools & Isolated Models
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Existing satellite AI solutions are developed as rigid, single-task silos (land-cover classification OR building detection OR change mapping). Non-GIS experts struggle with complex GDAL/QGIS pipelines and coordinate reference systems.
              </p>
            </div>

            <div className="glass-card rounded-3xl p-8 space-y-4 border border-amber-500/20 bg-amber-500/5">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2" style={{ fontFamily: 'var(--font-heading)' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Optical-SAR Ambiguity & Hallucinations
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Crucial disaster and infrastructure assessments require fusing optical reflectance with SAR radar geometry. Generic VLMs lack geospatial calibration, resulting in fabricated answers without visual evidence.
              </p>
            </div>
          </div>
        </div>
      </RevealSection>

      {/* ─── SECTION 3: THE PIPELINE ARCHITECTURE (Full Viewport Height) ─── */}
      <RevealSection className="relative z-10 min-h-screen flex items-center py-20 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto w-full space-y-10 text-center">
          <div className="space-y-3">
            <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold">
              The Agentic Solution
            </span>
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Rule DAG + VLM Multi-Stage Orchestration
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Every natural language query flows through automated task classification, raster compatibility gating, specialist tool execution, and calibrated evidence fusion.
            </p>
          </div>

          <div className="glass-card rounded-3xl p-8 lg:p-12 overflow-hidden shadow-2xl border border-border/80">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-center">
              {[
                { step: '01', icon: MessageSquare, label: 'Natural Query', desc: 'Free-form text query', color: 'text-primary' },
                { step: '02', icon: Brain, label: 'Task Classifier', desc: 'Intent & modality gating', color: 'text-purple-400' },
                { step: '03', icon: Network, label: 'DAG Planner', desc: 'Rule DAG or LLM plan', color: 'text-sky-400' },
                { step: '04', icon: ScanEye, label: 'Specialist Tools', desc: 'C++/Rasterio + GEE + VLM', color: 'text-amber-400' },
                { step: '05', icon: FileCheck, label: 'Grounded Output', desc: 'Calibrated score & trace', color: 'text-emerald-400' },
              ].map((item, i) => (
                <div key={item.step} className="flex flex-col items-center p-5 rounded-2xl bg-secondary/40 border border-border/70 space-y-2 h-full justify-between">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">{item.step}</span>
                    <item.icon className={`w-5 h-5 ${item.color}`} strokeWidth={1.5} />
                  </div>
                  <div className="text-center space-y-1">
                    <h4 className="text-xs font-bold text-foreground">{item.label}</h4>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <div className="w-full h-1 rounded-full bg-primary/20 overflow-hidden">
                    <div className="h-full bg-primary rounded-full w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </RevealSection>

      {/* ─── SECTION 4: CORE CAPABILITIES ─── */}
      <RevealSection className="relative z-10 min-h-screen flex items-center py-20 px-6 lg:px-12">
        <div className="max-w-6xl mx-auto w-full space-y-10">
          <div className="text-center space-y-3">
            <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold">
              Mission Specifications
            </span>
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Tailored for ISRO SAC Workflows
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
              From Cartosat-2S sub-meter resolution to Sentinel-1 SAR and bi-temporal LEVIR-CD pairs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={Eye}
              title="Single-Image VQA"
              description="Answer natural language queries regarding objects, counts, and spatial layout over optical and SAR tiles."
              delay={0}
            />
            <FeatureCard
              icon={Satellite}
              title="Captioning & Grounding"
              description="Generate rich descriptions and highlight requested spatial regions with grounded bounding boxes."
              delay={0.08}
            />
            <FeatureCard
              icon={GitCompareArrows}
              title="Bi-Temporal Change Analysis"
              description="Identify, describe, and localize surface changes between acquisitions from different timestamps."
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

      {/* ─── SECTION 5: FINAL CTA & FOOTER ─── */}
      <RevealSection className="relative z-10 py-24 px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6 glass-card rounded-[32px] p-10 sm:p-14 border border-border/80 shadow-2xl">
          <h2
            className="text-3xl sm:text-4xl font-bold text-foreground"
            style={{ fontFamily: 'var(--font-bodoni-moda), "Bodoni Moda", serif' }}
          >
            Ready to Explore the Workspace?
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Ingest satellite imagery, execute multimodal vision-language queries, and inspect full execution traces.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold text-sm hover:opacity-90 shadow-xl hover:shadow-2xl transition-all cursor-pointer"
          >
            Launch SatQuery AI
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </RevealSection>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/60 py-8 px-6 bg-card/40">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
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
