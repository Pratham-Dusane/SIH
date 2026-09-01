'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Settings, Minus, Maximize2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useStore } from '@/lib/store';
import CircularBackground from '@/components/landing/CircularBackground';

export default function SoftgateLanding() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { setTheme } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme('dark');
  }, [setTheme]);

  const handleLaunch = () => {
    if (user) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-center items-center overflow-hidden bg-[#060b19]">
      {/* Background Interactive Circular Dots Animation */}
      {mounted && <CircularBackground />}

      {/* Simulated Webpage behind the floating window */}
      <div
        className="absolute inset-4 sm:inset-12 rounded-3xl border border-slate-800/40 opacity-25 blur-[2px] pointer-events-none overflow-hidden flex flex-col"
        aria-hidden="true"
      >
        <div className="h-12 border-b border-white/10 bg-slate-900/20 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-600/40" />
            <div className="w-24 h-4 rounded-full bg-slate-700/20" />
          </div>
          <div className="flex gap-4">
            <div className="w-16 h-4 rounded-full bg-slate-700/20" />
            <div className="w-16 h-4 rounded-full bg-slate-700/20" />
          </div>
        </div>
        <div className="flex-1 p-8 grid grid-cols-3 gap-6">
          <div className="rounded-2xl bg-slate-800/15 border border-white/5 p-6" />
          <div className="rounded-2xl bg-slate-800/15 border border-white/5 p-6" />
          <div className="rounded-2xl bg-slate-800/15 border border-white/5 p-6" />
          <div className="col-span-3 rounded-2xl bg-slate-800/15 border border-white/5 p-8" />
        </div>
      </div>

      {/* Centered Mac Window Softgate with High Frosted Translucency */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-3xl mx-4 my-8 rounded-3xl border border-white/20 bg-slate-950/30 backdrop-blur-3xl shadow-2xl overflow-hidden"
      >
        {/* Mac Terminal Header Bar */}
        <div className="px-6 py-4 border-b border-white/15 flex items-center justify-between bg-white/[0.04]">
          {/* Traffic Lights */}
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] border border-[#e0443e] inline-block shadow-sm" />
            <span className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-[#dea123] inline-block shadow-sm" />
            <span className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-[#1aab29] inline-block shadow-sm" />
          </div>

          <div className="flex items-center gap-3 text-slate-300 text-xs">
            <Settings className="w-4 h-4 hover:text-white cursor-pointer transition-colors" strokeWidth={1.5} />
            <Minus className="w-4 h-4 hover:text-white cursor-pointer transition-colors" strokeWidth={1.5} />
            <Maximize2 className="w-3.5 h-3.5 hover:text-white cursor-pointer transition-colors" strokeWidth={1.5} />
          </div>
        </div>

        {/* Window Content */}
        <div className="p-8 sm:p-12">
          {/* Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/20 bg-white/10 text-[11px] font-semibold tracking-widest uppercase text-slate-200 mb-8 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-primary" strokeWidth={1.5} />
            ISRO SAC | SIH 2026 | AGENTIC REMOTE SENSING AI
          </div>

          {/* Headline */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.08] text-white mb-6 drop-shadow-sm"
            style={{ fontFamily: 'var(--font-bodoni-moda), "Bodoni Moda", "Times New Roman", serif' }}
          >
            SatQuery AI:
            <br />
            <span className="text-slate-100">Decode Earth</span>
            <br />
            <span className="text-slate-400 font-medium">From Space.</span>
          </h1>

          {/* Description */}
          <p className="text-sm sm:text-base text-slate-200 max-w-xl leading-relaxed mb-8 drop-shadow-sm">
            Enterprise-grade inspection for high-stakes remote sensing analysis. Ask multimodal queries over optical, SAR, and bi-temporal imagery through natural language.
          </p>

          {/* Action Row */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={handleLaunch}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-slate-100 shadow-lg hover:shadow-xl transition-all cursor-pointer"
              >
                Explore Live Workspace
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </button>

              <button
                onClick={() => router.push('/about')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/25 bg-white/10 text-sm font-semibold text-white hover:bg-white/20 backdrop-blur-md transition-all cursor-pointer"
              >
                Learn More
              </button>
            </div>

            {/* Auth status message directly below the buttons */}
            {!authLoading && (
              <p className="text-[11px] font-medium tracking-wider text-slate-400 uppercase pt-1">
                {user
                  ? 'AUTHENTICATED SESSION DETECTED. YOU WILL CONTINUE TO DASHBOARD.'
                  : 'GUEST SESSION - READY FOR DEMO.'}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
