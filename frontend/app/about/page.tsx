'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Satellite, ArrowRight, ShieldCheck, Layers, Radar,
  Crosshair, Eye, GitCompareArrows, Brain, FileCheck,
  CheckCircle2, Sparkles, Database, Compass, Globe2,
} from 'lucide-react';
import AboutNav from '@/components/landing/AboutNav';
import Satellite3D from '@/components/landing/Satellite3D';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Applications Data (Image 2 top inspo)                             */
/* ------------------------------------------------------------------ */

interface ApplicationItem {
  id: string;
  tabLabel: string;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  imageSrc: string;
}

const APPLICATIONS: ApplicationItem[] = [
  {
    id: 'defense',
    tabLabel: 'Defense & Border',
    title: 'DEFENSE & BORDER RECONNAISSANCE',
    subtitle: 'All-weather surveillance and strategic perimeter monitoring',
    description:
      'Co-registered Optical and SAR intelligence penetrates camouflage, nighttime shadows, and adverse monsoon cloud cover to track perimeter movements, airfield activity, and forward infrastructure.',
    bullets: [
      'Sub-pixel co-registration across Cartosat-2S optical and RISAT SAR',
      'Automated change detection over runways, barracks, and forward roads',
      'Zero-hallucination visual evidence bounding boxes with audited traces',
    ],
    imageSrc: '/samples/preview_sar.png',
  },
  {
    id: 'agriculture',
    tabLabel: 'Agriculture & Forestry',
    title: 'AGRICULTURE & CROP HEALTH',
    subtitle: 'Multi-spectral vegetation index computation and yield estimation',
    description:
      'Deterministic NDVI, NDWI, and NDBI spectral analysis empowers regional agricultural monitoring, drought stress assessment, and automated canopy density estimation.',
    bullets: [
      'Calibrated Sentinel-2 and Landsat multi-band reflectance analysis',
      'DynamicWorld 10m automated crop vs forest segmentation via GEE',
      'Accurate surface area computation in hectares and square kilometers',
    ],
    imageSrc: '/samples/preview_optical.png',
  },
  {
    id: 'infrastructure',
    tabLabel: 'Infrastructure & Urban',
    title: 'INFRASTRUCTURE & URBAN EXPANSION',
    subtitle: 'Bi-temporal building segmentation and construction tracking',
    description:
      'Standardized LEVIR-CD and CDVQA pipelines automatically generate pixel-accurate binary change masks to quantify urban encroachment and public works progression over time.',
    bullets: [
      'Bi-temporal acquisition alignment and radiometric normalization',
      'Pixel-level binary change mask generation (IoU > 0.860)',
      'Natural language change description for urban planners',
    ],
    imageSrc: '/samples/thumb_optical.png',
  },
  {
    id: 'disaster',
    tabLabel: 'Disaster & Flood',
    title: 'DISASTER RESPONSE & FLOOD MAPPING',
    subtitle: 'Rapid SAR water mask segmentation and damage assessment',
    description:
      'Otsu adaptive thresholding on SAR backscatter operates through cloud cover to map inundated flood plains and deliver critical emergency relief coordinates.',
    bullets: [
      'Otsu dB radar backscatter thresholding (100% offline deterministic)',
      'Pre vs post-disaster flood perimeter overlay generation',
      'GeoTIFF raster export formatted for national GIS response',
    ],
    imageSrc: '/samples/preview_sar.png',
  },
  {
    id: 'environment',
    tabLabel: 'Environmental Monitoring',
    title: 'ENVIRONMENTAL & WATER BODIES',
    subtitle: 'Surface water depletion, deforestation, and coastline erosion',
    description:
      'Continuous Earth-observation telemetry tracks reservoir shrinkage, wetland preservation, and glacial lake expansion across high-altitude Himalayan sectors.',
    bullets: [
      'Long-term multi-temporal surface water body tracking',
      'NDWI water index diffing with calibrated confidence scores',
      'Automated spatial area reporting (m², hectares, km²)',
    ],
    imageSrc: '/samples/preview_optical.png',
  },
];

export default function AboutPage() {
  const [activeAppTab, setActiveAppTab] = useState('defense');
  const currentApp = APPLICATIONS.find((a) => a.id === activeAppTab) ?? APPLICATIONS[0];

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[#070b16] font-sans selection:bg-sky-500/20 selection:text-white">
      <AboutNav />

      {/* ─── SECTION 0: HERO (Image 1 Top Inspo with Scaled-Down Balanced Fonts) ── */}
      <section className="relative min-h-screen flex flex-col justify-between pt-24 pb-12 px-6 lg:px-16 overflow-hidden bg-[#070b16] text-white">
        {/* Technical Grid Background & Fine Crosshair Lines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Diagonal Angled Earth Background Image (Image 1 Right) */}
        <div
          className="absolute top-0 right-0 w-full lg:w-[60%] h-full pointer-events-none select-none overflow-hidden z-0"
          style={{
            clipPath: 'polygon(0 0, 100% 0, 100% 88%, 78% 100%, 0 100%)',
          }}
        >
          <Image
            src="/earth.jpg"
            alt="Earth Observation Horizon"
            fill
            priority
            className="object-cover object-center opacity-75 contrast-125 saturate-110 brightness-95"
          />
          {/* Subtle lighting scrims */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#070b16] via-[#070b16]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b16] via-transparent to-[#070b16]/30" />
        </div>

        {/* Top Technical Crosshair Header Line */}
        <div className="relative z-10 max-w-7xl mx-auto w-full pt-4">
          <div className="flex items-center gap-4 text-slate-400 text-xs font-mono tracking-widest uppercase">
            <span className="text-white font-bold flex items-center gap-2">
              <Crosshair className="w-3.5 h-3.5 text-sky-400" strokeWidth={1.5} />
              SATREV · SATQUERY AI
            </span>
            <div className="h-px flex-1 bg-white/15" />
            <span className="hidden sm:inline-block text-[10px] text-slate-400">
              NEW PERSPECTIVES FROM SPACE
            </span>
          </div>
        </div>

        {/* Hero Headline & Content (Scaled Down Clean Typography) */}
        <div className="relative z-10 max-w-7xl mx-auto w-full my-auto py-12 grid lg:grid-cols-[1.1fr_0.9fr] items-center gap-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            <div className="space-y-3.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-400/30 bg-sky-500/10 text-[10px] font-mono font-semibold uppercase tracking-widest text-sky-300 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                ISRO / SAC · Problem Statement #26167
              </div>

              <h1
                className="text-2xl sm:text-3xl lg:text-[2.2rem] font-bold text-white leading-[1.22] tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 mr-2.5 align-middle" />
                Earth-observation data and agentic intelligence made to understand the changing world.
              </h1>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 max-w-lg leading-relaxed">
              SatQuery AI orchestrates multi-sensor optical, polarimetric SAR, and bi-temporal Earth imagery through natural language queries with verifiable spatial evidence.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-1">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1b5cff] hover:bg-[#1548cc] text-white font-semibold text-xs transition-all shadow-lg shadow-blue-500/25 active:scale-95"
              >
                <span>Get started</span>
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </Link>

              <a
                href="#understand"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white font-medium text-xs backdrop-blur-md transition-all"
              >
                <span>Explore Architecture</span>
              </a>
            </div>

            <p className="text-[11px] text-slate-400 max-w-md leading-relaxed font-mono">
              SatQuery AI was developed for ISRO / SAC under SIH 2026 as an agentic vision-language assistant.
            </p>
          </motion.div>
        </div>

        {/* Hero Bottom Number Indicator [ 01 ] */}
        <div className="relative z-10 max-w-7xl mx-auto w-full flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400 font-mono">
          <div className="w-7 h-7 rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-white font-bold text-xs">
            01
          </div>
          <span className="tracking-widest uppercase text-[10px]">
            SCROLL TO EXPLORE ORBITAL TELEMETRY
          </span>
        </div>
      </section>

      {/* ─── SECTION 1: UNDERSTAND CHANGES OVER TIME (Image 1 White Section) ── */}
      <section id="understand" className="relative z-10 bg-white text-slate-900 py-20 px-6 lg:px-16 border-t border-slate-200">
        <div className="max-w-7xl mx-auto space-y-12">
          {/* Section Number & Title */}
          <div className="flex items-center gap-4 text-xs font-mono tracking-widest text-slate-500 uppercase border-b border-slate-200 pb-3">
            <span className="text-slate-900 font-bold">01 |</span>
            <span className="font-semibold text-slate-900">UNDERSTAND CHANGES OVER TIME</span>
          </div>

          {/* Big Editorial Quote */}
          <div className="max-w-4xl space-y-4">
            <h2
              className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-snug tracking-tight"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Single image is worth a thousand words, multi-temporal and cross-modal acquisitions tell the life-long story of changes over the place.
            </h2>
          </div>

          {/* Two-Column Editorial Copy */}
          <div className="grid md:grid-cols-2 gap-8 text-xs sm:text-sm text-slate-600 leading-relaxed">
            <div className="space-y-3.5">
              <p>
                SatQuery AI&apos;s Earth-Observation orchestrator gives remote sensing analysts the ability to grasp high-level spatial context, see bi-temporal land-cover progressions, and identify subtle surface anomalies across optical Sentinel-2, aerial, and Cartosat-2S tiles.
              </p>
              <p>
                We empower agricultural planning, disaster mitigation authorities, and defense intelligence organizations with audited visual proof and sub-pixel accuracy.
              </p>
            </div>
            <div className="space-y-3.5">
              <p>
                Complementary Synthetic Aperture Radar (SAR) eliminates atmospheric cloud cover and day/night illumination barriers, piercing through adverse monsoon weather to segment water bodies, ships, and flood perimeters with deterministic mathematical precision.
              </p>
              <p>
                Every answer is grounded in concrete raster statistics rather than black-box hallucination, ensuring strict mission-critical reliability.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 2: CORE CAPABILITIES & RESOLUTION (Image 1 Specs) ─── */}
      <section id="capabilities" className="relative z-10 bg-[#f8fafc] text-slate-900 py-16 px-6 lg:px-16 border-t border-slate-200">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Section Number & Title */}
          <div className="flex items-center gap-4 text-xs font-mono tracking-widest text-slate-500 uppercase border-b border-slate-200 pb-3">
            <span className="text-slate-900 font-bold">02 |</span>
            <span className="font-semibold text-slate-900">CORE CAPABILITIES & RESOLUTION</span>
          </div>

          {/* 3 Metric Columns with Big Bold Numbers */}
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-2.5">
              <p className="text-[11px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
                High-resolution imagery
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-bold font-mono text-slate-950">5 - 0.5</span>
                <span className="text-xs font-mono text-slate-500 uppercase">m GSD</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
                Sub-meter Cartosat-2S panchromatic and 10m Sentinel-2 multi-spectral radiometric calibration.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-2.5">
              <p className="text-[11px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
                Multi-Sensor Fusion
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-bold font-mono text-slate-950">Dual</span>
                <span className="text-xs font-mono text-slate-500 uppercase">Modality</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
                Joint optical spectral reflection and polarimetric SAR (VV / VH) radar backscatter reasoning.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-2.5">
              <p className="text-[11px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
                Deterministic Accuracy
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-bold font-mono text-emerald-600">89.4%</span>
                <span className="text-xs font-mono text-slate-500 uppercase">Score</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
                Standardized benchmark validation across RSVQA, VRSBench, CDVQA, and national ISRO/SAC sets.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 3: ANALYSIS READY DATA (Image 1 2x2 Grid) ─────────── */}
      <section className="relative z-10 bg-white text-slate-900 py-20 px-6 lg:px-16 border-t border-slate-200">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Section Number & Title */}
          <div className="flex items-center gap-4 text-xs font-mono tracking-widest text-slate-500 uppercase border-b border-slate-200 pb-3">
            <span className="text-slate-900 font-bold">03 |</span>
            <span className="font-semibold text-slate-900">ANALYSIS READY DATA</span>
          </div>

          <div className="grid lg:grid-cols-[1.1fr_1.9fr] gap-10 items-start">
            {/* Left Column: Description & Action */}
            <div className="space-y-5">
              <h3
                className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Analysis Ready Pipelines
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                SatQuery&apos;s automated ingest pipeline validates coordinate reference systems, checks sub-pixel co-registration, and extracts multi-band radiometric statistics before query execution.
              </p>
              <div>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1b5cff] hover:bg-[#1548cc] text-white font-semibold text-xs transition-all shadow-md shadow-blue-500/20"
                >
                  <span>Get Satellite Intelligence</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Right Column: 2x2 Grid of Outlined Cards */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all space-y-2.5 bg-white">
                <Database className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                <h4 className="text-sm font-bold text-slate-900">Raw Multi-Band Imagery</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Radiometric calibration and spectral index generation (NDVI, NDWI, NDBI) over multi-spectral tiles.
                </p>
                <span className="text-[11px] font-mono text-blue-600 font-semibold inline-block pt-1">
                  Read more →
                </span>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all space-y-2.5 bg-white">
                <Radar className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                <h4 className="text-sm font-bold text-slate-900">SAR Polarimetric Data</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Otsu thresholding and backscatter dB calibration for water body segmentation and all-weather detection.
                </p>
                <span className="text-[11px] font-mono text-blue-600 font-semibold inline-block pt-1">
                  Read more →
                </span>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all space-y-2.5 bg-white">
                <GitCompareArrows className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                <h4 className="text-sm font-bold text-slate-900">Bi-Temporal Change Vectors</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Pixel-level building and surface change segmentation across registered temporal acquisitions.
                </p>
                <span className="text-[11px] font-mono text-blue-600 font-semibold inline-block pt-1">
                  Read more →
                </span>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all space-y-2.5 bg-white">
                <Brain className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
                <h4 className="text-sm font-bold text-slate-900">Utilization of AI & ML</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Pydantic strict schema tool routing, calibrated confidence metrics, and verifiable visual grounding.
                </p>
                <span className="text-[11px] font-mono text-blue-600 font-semibold inline-block pt-1">
                  Read more →
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 4: APPLICATIONS (Image 2 Top Dark Split View) ─────── */}
      <section id="applications" className="relative z-10 bg-[#080c18] text-white py-20 px-6 lg:px-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Section Number & Title */}
          <div className="flex items-center gap-4 text-xs font-mono tracking-widest text-slate-400 uppercase border-b border-slate-800 pb-3">
            <span className="text-sky-400 font-bold">04 |</span>
            <span className="font-semibold text-white">APPLICATIONS & DOMAIN WORKFLOWS</span>
          </div>

          {/* Application Navigation Tabs */}
          <div className="flex items-center gap-2 flex-wrap border-b border-slate-800 pb-3">
            {APPLICATIONS.map((app) => (
              <button
                key={app.id}
                onClick={() => setActiveAppTab(app.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer font-mono',
                  activeAppTab === app.id
                    ? 'bg-[#1b5cff] text-white font-semibold shadow-lg shadow-blue-500/20'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white border border-white/5'
                )}
              >
                {app.tabLabel}
              </button>
            ))}
          </div>

          {/* Split Content: Left Text & Right Angled Image Card */}
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentApp.id}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 15 }}
                transition={{ duration: 0.3 }}
                className="space-y-5"
              >
                <div className="space-y-1.5">
                  <h3
                    className="text-xl sm:text-2xl font-bold text-white tracking-tight"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    {currentApp.title}
                  </h3>
                  <p className="text-xs font-mono text-sky-400">{currentApp.subtitle}</p>
                </div>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {currentApp.description}
                </p>

                <div className="space-y-2 pt-1">
                  {currentApp.bullets.map((b, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" strokeWidth={2} />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1b5cff] hover:bg-[#1548cc] text-white font-semibold text-xs transition-all shadow-md shadow-blue-500/20"
                  >
                    <span>Launch Domain Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Right: Angled Preview Image Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentApp.id}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.35 }}
                className="relative h-[280px] sm:h-[340px] rounded-3xl overflow-hidden border border-white/15 bg-slate-900 shadow-2xl"
                style={{
                  clipPath: 'polygon(0 0, 100% 0, 100% 85%, 85% 100%, 0 100%)',
                }}
              >
                <Image
                  src={currentApp.imageSrc}
                  alt={currentApp.title}
                  fill
                  className="object-cover contrast-115 saturate-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-[10px] font-mono text-slate-200">
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-white/20 backdrop-blur-md">
                    SENSOR TELEMETRY ACTIVE
                  </span>
                  <span className="text-sky-400 font-bold">EPSG:32643</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ─── SECTION 5: 3D SATELLITE PLATFORM (Floating Without Outer Box) ── */}
      <section id="satellite" className="relative z-10 bg-[#f8fafc] text-slate-900 py-20 px-6 lg:px-16 border-t border-slate-200">
        <div className="max-w-7xl mx-auto space-y-12">
          {/* Section Number & Title */}
          <div className="flex items-center gap-4 text-xs font-mono tracking-widest text-slate-500 uppercase border-b border-slate-200 pb-3">
            <span className="text-slate-900 font-bold">05 |</span>
            <span className="font-semibold text-slate-900">SATELLITE PLATFORM & SENSOR TOPOLOGY</span>
          </div>

          {/* Brand Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                CARTOSAT &amp; RISAT
              </h2>
              <p className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                Multi-Modal Remote Sensing Satellite Platform
              </p>
            </div>

            <div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1b5cff] hover:bg-[#1548cc] text-white font-semibold text-xs transition-all shadow-md"
              >
                <span>Launch 3D Explorer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Floating 3D Satellite on Left/Center (Box Removed) + Telemetry on Right */}
          <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-8 items-center">
            {/* Floating White 3D Satellite (Cleanly Integrated without outer box) */}
            <div className="w-full relative overflow-hidden flex items-center justify-center">
              <Satellite3D />
            </div>

            {/* Right Column: Mission Specs & Numbered Cards */}
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
                <span className="text-[10px] uppercase font-mono font-bold text-sky-600 tracking-wider">
                  Orbital Telemetry
                </span>
                <h4 className="text-sm font-bold text-slate-900">505 km Sun-Synchronous Orbit</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  97.4° orbital inclination delivering repeat sub-meter ground coverage with 10:30 AM local solar time equator crossing.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-start gap-3">
                  <span className="text-xs font-mono font-bold text-sky-600">01</span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Sub-Meter Optical Panchromatic</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      0.5m GSD high-resolution optical payload paired with 4 multispectral bands.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-start gap-3">
                  <span className="text-xs font-mono font-bold text-sky-600">02</span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Dual-Polarization C-Band SAR</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      VV and VH polarimetric radar backscatter providing all-weather night penetration.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm flex items-start gap-3">
                  <span className="text-xs font-mono font-bold text-sky-600">03</span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Agentic Vision-Language Layer</h5>
                    <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                      Strict Pydantic tool manifest execution with verifiable confidence grounding.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECTION 6: FOOTER (Clean Dark Space Finish) ─────────────── */}
      <footer className="relative z-10 bg-[#050811] text-white border-t border-slate-800 py-10 px-6 lg:px-16">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Image src="/isro.svg" alt="ISRO" width={32} height={32} className="h-7 w-auto invert" />
            <Image src="/sac.png" alt="SAC" width={32} height={32} className="h-7 w-auto invert" />
            <span className="text-xs font-mono text-slate-400 border-l border-slate-700 pl-4">
              SATQUERY AI · SIH 2026 #26167
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            <Link href="/benchmarks" className="hover:text-white transition-colors">Benchmarks</Link>
            <Link href="/models" className="hover:text-white transition-colors">Backend Registry</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
