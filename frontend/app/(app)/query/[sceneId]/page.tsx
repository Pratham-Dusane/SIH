'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Group, Panel, Separator } from 'react-resizable-panels';
import {
  Satellite, Send, Loader2, Terminal, Sparkles, ArrowRight,
  ChevronLeft, Crosshair, Layers, MapPinned, Eye, GripVertical,
  ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Activity,
  Cpu, Search, Sun, Moon, ArrowLeftRight,
} from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import EvidenceCanvas from '@/components/evidence/EvidenceCanvas';
import LayerControls from '@/components/evidence/LayerControls';
import AnswerCard from '@/components/query/AnswerCard';
import AbstentionNotice from '@/components/query/AbstentionNotice';
import { VerificationToggle } from '@/components/query/VerificationBadge';
import {
  PipelineStage, ToolStep, VerificationState,
} from '@/components/trace/PipelineVisualizer';
import { Scene, QueryStreamEvent } from '@/lib/types';
import { useStore } from '@/lib/store';
import { ApiError, fetchScene, streamQuery, fetchSceneSuggestions } from '@/lib/api';
import { suggestedQueries } from '@/lib/mocks';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

function toPipelineStage(stage: string): PipelineStage | null {
  const map: Record<string, PipelineStage> = {
    classifying: 'classifying',
    validating: 'validating',
    planning: 'planning',
    fusing: 'fusing',
    verifying: 'verifying',
  };
  return map[stage] || null;
}

function resolvePreviewUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/api/')) return `${API_BASE}${url}`;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return `${API_BASE}/api/files/${url.replace(/^\/+/, '')}`;
}

/* ─── Animated Cloud Layer Component ───────────────────────────── */
function CloudLayer({ delay, duration, opacity, top, scale, isDark }: {
  delay: number; duration: number; opacity: number; top: string; scale: number; isDark: boolean;
}) {
  return (
    <div
      className="absolute w-[200%] pointer-events-none select-none"
      style={{
        top,
        animation: `drift ${duration}s linear ${delay}s infinite`,
        opacity,
        transform: `scaleY(${scale})`,
      }}
    >
      <svg viewBox="0 0 1200 120" className={cn('w-full h-auto', isDark ? 'fill-white/[0.05]' : 'fill-slate-900/[0.03]')}>
        <path d="M0,60 Q150,20 300,55 T600,45 T900,65 T1200,50 L1200,120 L0,120Z" />
      </svg>
    </div>
  );
}

/* ─── Orbiting Satellite SVG ───────────────────────────────────── */
function OrbitingSatellite({ isDark }: { isDark: boolean }) {
  const primaryColor = isDark ? 'rgba(56,189,248,0.1)' : 'rgba(37,99,235,0.12)';
  const dotColor = isDark ? '#38bdf8' : '#2563eb';
  const secondaryColor = isDark ? 'rgba(168,85,247,0.08)' : 'rgba(124,58,237,0.08)';
  const dot2Color = isDark ? '#a855f7' : '#7c3aed';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600">
        <ellipse cx="500" cy="300" rx="420" ry="180" fill="none" stroke={primaryColor} strokeWidth="1" strokeDasharray="8 6" />
        <circle r="4" fill={dotColor} opacity="0.9">
          <animateMotion dur="18s" repeatCount="indefinite" path="M500,120 A420,180 0 1,1 499.9,120" />
        </circle>
        <circle r="4" fill="none" stroke={dotColor} strokeWidth="1" opacity="0.4">
          <animateMotion dur="18s" repeatCount="indefinite" path="M500,120 A420,180 0 1,1 499.9,120" />
          <animate attributeName="r" from="4" to="22" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 600" style={{ transform: 'rotate(-15deg) scale(1.1)' }}>
        <ellipse cx="500" cy="300" rx="380" ry="140" fill="none" stroke={secondaryColor} strokeWidth="1" strokeDasharray="6 8" />
        <circle r="3" fill={dot2Color} opacity="0.7">
          <animateMotion dur="24s" repeatCount="indefinite" path="M500,160 A380,140 0 1,1 499.9,160" />
        </circle>
      </svg>
    </div>
  );
}

/* ─── Crosshair Reticle Grid ──────────────────────────────────── */
function ReticleOverlay({ isDark }: { isDark: boolean }) {
  const lineColor = isDark ? 'bg-sky-400/25' : 'bg-blue-600/20';
  const circleColor = isDark ? 'border-sky-400/35' : 'border-blue-600/25';
  const bracketColor = isDark ? 'bg-white/10' : 'bg-slate-900/10';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32">
        <div className={cn('absolute top-0 left-1/2 w-px h-6', lineColor)} />
        <div className={cn('absolute bottom-0 left-1/2 w-px h-6', lineColor)} />
        <div className={cn('absolute left-0 top-1/2 h-px w-6', lineColor)} />
        <div className={cn('absolute right-0 top-1/2 h-px w-6', lineColor)} />
        <div className={cn('absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border', circleColor)} />
      </div>
      {[
        'top-[12%] left-[8%]',
        'top-[12%] right-[8%] rotate-90',
        'bottom-[12%] left-[8%] -rotate-90',
        'bottom-[12%] right-[8%] rotate-180',
      ].map((pos, i) => (
        <div key={i} className={cn('absolute w-8 h-8', pos)}>
          <div className={cn('absolute top-0 left-0 w-full h-px', bracketColor)} />
          <div className={cn('absolute top-0 left-0 h-full w-px', bracketColor)} />
        </div>
      ))}
    </div>
  );
}

/* ─── Floating Particles ──────────────────────────────────────── */
function FloatingParticles({ isDark }: { isDark: boolean }) {
  const particles = [
    { id: 1, left: '12%', top: '25%', size: 2.5, delay: 0, duration: 8 },
    { id: 2, left: '28%', top: '70%', size: 2, delay: 1.5, duration: 11 },
    { id: 3, left: '45%', top: '18%', size: 3, delay: 2.2, duration: 9 },
    { id: 4, left: '62%', top: '82%', size: 2, delay: 0.7, duration: 12 },
    { id: 5, left: '78%', top: '30%', size: 2.5, delay: 3, duration: 10 },
    { id: 6, left: '88%', top: '65%', size: 2, delay: 1.8, duration: 14 },
    { id: 7, left: '35%', top: '48%', size: 1.5, delay: 4, duration: 7 },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={cn('absolute rounded-full', isDark ? 'bg-sky-400/40' : 'bg-blue-600/30')}
          style={{ left: p.left, top: p.top, width: p.size, height: p.size }}
          animate={{
            y: [0, -35, 0],
            opacity: [0.2, 0.7, 0.2],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

/* ─── Mini Pipeline Visualizer (for split-screen left panel) ──── */
function MiniPipeline({
  currentStage,
  toolSteps,
  verification,
}: {
  currentStage: PipelineStage | null;
  toolSteps: ToolStep[];
  verification: VerificationState | null;
}) {
  const isPastClassify = currentStage != null && currentStage !== 'classifying';
  const isPastGate = isPastClassify && currentStage !== 'validating';
  const isFusing = currentStage === 'fusing';
  const isVerifying = currentStage === 'verifying';
  const isComplete = currentStage === 'complete';
  const isPastFuse = isComplete || isVerifying;

  const stages = [
    {
      label: 'Task Classifier & Modality Gate',
      active: currentStage === 'classifying' || currentStage === 'validating',
      done: isPastGate,
      desc: isPastGate ? 'Compatibility validated' : 'Classifying intent...',
    },
    {
      label: 'Specialist Model Execution',
      active: currentStage === 'planning' || currentStage === 'executing',
      done: isPastFuse,
      desc: toolSteps.length > 0
        ? `${toolSteps.filter(s => s.status === 'complete').length}/${toolSteps.length} tools completed`
        : 'Planning DAG...',
    },
    {
      label: 'Grounded Answer Fusion',
      active: isFusing,
      done: isPastFuse,
      desc: isPastFuse ? 'Numerics grounded' : 'Pending specialist completion',
    },
  ];

  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.12, type: 'spring', stiffness: 220 }}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs transition-all',
            s.done
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : s.active
                ? 'bg-sky-500/10 border-sky-500/30 shadow-lg shadow-sky-500/10'
                : 'bg-card/50 border-border/50 opacity-50'
          )}
        >
          <div className={cn(
            'w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono shrink-0',
            s.done
              ? 'bg-emerald-500/20 text-emerald-500'
              : s.active
                ? 'bg-sky-500/20 text-sky-500'
                : 'bg-muted/50 text-muted-foreground'
          )}>
            {s.done ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : s.active ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <span>{String(i + 1).padStart(2, '0')}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn(
              'font-semibold text-[11px]',
              s.done ? 'text-emerald-600 dark:text-emerald-300' : s.active ? 'text-sky-600 dark:text-sky-200' : 'text-muted-foreground'
            )}>
              {s.label}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{s.desc}</p>
          </div>
          {s.active && (
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping shrink-0" />
          )}
        </motion.div>
      ))}

      {/* Tool Steps Detail */}
      {toolSteps.length > 0 && (
        <div className="pl-3 space-y-1.5 border-l-2 border-sky-500/20 ml-3">
          {toolSteps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-[11px]"
            >
              {step.status === 'running' ? (
                <Loader2 className="w-3 h-3 text-sky-500 animate-spin shrink-0" />
              ) : step.status === 'complete' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : step.status === 'failed' ? (
                <XCircle className="w-3 h-3 text-rose-500 shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-border shrink-0" />
              )}
              <span className="font-mono text-foreground truncate">{step.tool}</span>
              {step.confidence != null && (
                <span className={cn(
                  'font-mono text-[10px] ml-auto shrink-0',
                  step.confidence >= 0.75 ? 'text-emerald-500' : step.confidence >= 0.45 ? 'text-amber-500' : 'text-rose-500'
                )}>
                  {(step.confidence * 100).toFixed(0)}%
                </span>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Verification */}
      {verification && verification.status !== 'skipped' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px]',
            verification.status === 'verified'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-300'
          )}
        >
          {verification.status === 'verified' ? (
            <ShieldCheck className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          <span className="font-mono text-[10px] uppercase font-bold">
            Verified: {verification.status}
          </span>
        </motion.div>
      )}
    </div>
  );
}

/* ================================================================
   MAIN PAGE COMPONENT
   ================================================================ */

export default function CinematicQueryPage() {
  const params = useParams();
  const router = useRouter();
  const sceneId = params?.sceneId as string;

  // Scene loading
  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Phase state: 'input' = Phase 1, 'analysis' = Phase 2
  const [phase, setPhase] = useState<'input' | 'analysis'>('input');

  // Query state
  const [query, setQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage | null>(null);
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);
  const [verificationState, setVerificationState] = useState<VerificationState | null>(null);
  const [verifyEnabled, setVerifyEnabled] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    activeScene, setActiveScene,
    turns, addTurn, updateLastTurn, setTurnResult, initLayers,
    theme, toggleTheme,
  } = useStore();

  const isDark = theme === 'dark';

  // Preview image URL
  const previewUrl = scene?.images?.[0]?.previewUrl
    ? resolvePreviewUrl(scene.images[0].previewUrl)
    : null;

  // Load scene
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchScene(sceneId)
      .then((s) => {
        if (cancelled) return;
        setScene(s);
        setActiveScene(s);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sceneId, setActiveScene]);

  // Load suggestions
  useEffect(() => {
    if (!scene) return;
    const defaults = suggestedQueries[scene.inputConfig] || [];
    setSuggestions(defaults);
    fetchSceneSuggestions(sceneId)
      .then((dynamic) => {
        if (dynamic && dynamic.length > 0) setSuggestions(dynamic);
      })
      .catch(() => {});
  }, [scene, sceneId]);

  // Auto-scroll on new turns
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, pipelineStage, toolSteps]);

  const handleSubmit = useCallback(async (q?: string) => {
    const text = (q || query).trim();
    if (!text || isStreaming || !scene) return;

    if (phase === 'input') {
      setPhase('analysis');
    }

    setQuery('');
    setIsStreaming(true);
    setPipelineStage(null);
    setToolSteps([]);
    setVerificationState(null);
    addTurn(text);

    try {
      const result = await streamQuery(
        scene.id,
        text,
        (event: QueryStreamEvent) => {
          if (event.type === 'stage') {
            const stage = toPipelineStage(event.stage);
            if (stage) setPipelineStage(stage);
          } else if (event.type === 'step') {
            setPipelineStage('executing');
            setToolSteps((prev) => {
              const existing = prev.findIndex((s) => s.id === event.id);
              const step: ToolStep = {
                id: event.id,
                tool: event.tool,
                status: event.status as ToolStep['status'],
                summary: event.summary,
                confidence: event.confidence,
                durationMs: event.durationMs,
                reason: event.reason,
              };
              if (existing >= 0) {
                const next = [...prev];
                next[existing] = step;
                return next;
              }
              return [...prev, step];
            });
          } else if (event.type === 'verification') {
            setVerificationState({
              status: event.status,
              reason: event.reason,
            });
          }
        },
        verifyEnabled,
      );

      setPipelineStage('complete');
      setTurnResult(result);
      initLayers(result.evidence);
    } catch (err) {
      updateLastTurn({
        isStreaming: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsStreaming(false);
    }
  }, [query, isStreaming, scene, phase, addTurn, setTurnResult, initLayers, updateLastTurn, verifyEnabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Enter' && !e.shiftKey && phase === 'input') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ─── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className={cn('flex items-center justify-center min-h-screen transition-colors', isDark ? 'bg-[#050811]' : 'bg-white')}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            className={cn('w-10 h-10 border-2 rounded-full border-t-transparent', isDark ? 'border-sky-400' : 'border-blue-600')}
          />
          <p className={cn('text-xs font-mono', isDark ? 'text-slate-400' : 'text-slate-600')}>Loading scene telemetry...</p>
        </motion.div>
      </div>
    );
  }

  // ─── Error ─────────────────────────────────────────────────
  if (loadError || !scene) {
    return (
      <div className={cn('flex items-center justify-center min-h-screen transition-colors', isDark ? 'bg-[#050811] text-white' : 'bg-white text-slate-900')}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 max-w-md"
        >
          <Satellite className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-lg font-bold">Scene not found</h2>
          <p className={cn('text-sm', isDark ? 'text-slate-400' : 'text-slate-600')}>{loadError || 'This scene does not exist.'}</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs text-sky-500 hover:text-sky-400">
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </motion.div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: Atmospheric Full-Screen Query Input
  // ═══════════════════════════════════════════════════════════
  if (phase === 'input') {
    // Exact requested: Black bg for dark mode, White bg for light mode
    const bgClass = isDark ? 'bg-[#050811] text-white' : 'bg-white text-slate-900';
    const gridOpacity = isDark ? 'opacity-20' : 'opacity-25';
    const gridLineColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
    const accentColor = isDark ? 'text-sky-400' : 'text-blue-600';
    const accentBg = isDark ? 'bg-sky-500' : 'bg-blue-600';
    const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';
    const inputBg = isDark
      ? 'bg-slate-950/60 border-white/15 shadow-2xl shadow-sky-500/10 backdrop-blur-2xl'
      : 'bg-white/80 border-slate-300/60 shadow-2xl shadow-slate-400/20 backdrop-blur-2xl';
    const chipBg = isDark
      ? 'border-white/10 bg-slate-950/40 backdrop-blur-xl hover:bg-white/[0.08] hover:border-sky-400/40 text-slate-300 hover:text-white'
      : 'border-slate-300/60 bg-white/70 backdrop-blur-xl hover:bg-white/90 hover:border-blue-500/60 text-slate-700 hover:text-slate-950 shadow-xs';

    return (
      <div className={cn('relative min-h-screen w-full overflow-hidden flex flex-col transition-colors duration-500', bgClass)}>
        {/* CSS for animations */}
        <style jsx global>{`
          @keyframes drift {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @keyframes shimmer {
            0%, 100% { opacity: 0.35; }
            50% { opacity: 0.7; }
          }
          @keyframes pulse-glow-dark {
            0%, 100% { box-shadow: 0 0 25px rgba(56,189,248,0.18), 0 0 70px rgba(56,189,248,0.06); }
            50% { box-shadow: 0 0 35px rgba(56,189,248,0.28), 0 0 90px rgba(56,189,248,0.12); }
          }
          @keyframes pulse-glow-light {
            0%, 100% { box-shadow: 0 8px 30px rgba(37,99,235,0.1), 0 0 60px rgba(37,99,235,0.04); }
            50% { box-shadow: 0 10px 40px rgba(37,99,235,0.18), 0 0 80px rgba(37,99,235,0.08); }
          }
        `}</style>

        {/* ── Hero Background Image: blackbg.jpg (dark) / whitebg.png (light) ── */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
          {/* The actual hero image, animated in */}
          <motion.img
            initial={{ scale: 1.15, opacity: 0 }}
            animate={{ scale: 1.05, opacity: 1 }}
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
            src={isDark ? '/blackbg.jpg' : '/whitebg.png'}
            alt=""
            className={cn(
              'w-full h-full object-cover transition-all duration-700',
              isDark
                ? 'opacity-70 contrast-[1.15] saturate-[1.1]'
                : 'opacity-60 contrast-105 saturate-90'
            )}
          />

          {/* Cinematic scrim: radial vignette + directional gradient */}
          <div className={cn(
            'absolute inset-0',
            isDark
              ? 'bg-[radial-gradient(ellipse_at_center,transparent_30%,#050811_85%)]'
              : 'bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(255,255,255,0.92)_85%)]'
          )} />

          {/* Top-to-bottom scrim for text readability */}
          <div className={cn(
            'absolute inset-0',
            isDark
              ? 'bg-gradient-to-b from-[#050811]/60 via-transparent to-[#050811]/90'
              : 'bg-gradient-to-b from-white/70 via-transparent to-white/85'
          )} />

          {/* Horizontal sweep for center focus */}
          <div className={cn(
            'absolute inset-0',
            isDark
              ? 'bg-gradient-to-r from-[#050811]/70 via-transparent to-[#050811]/70'
              : 'bg-gradient-to-r from-white/60 via-transparent to-white/60'
          )} />

          {/* Animated scan line — subtle CRT/satellite-telemetry feel */}
          <motion.div
            className={cn(
              'absolute left-0 right-0 h-px pointer-events-none',
              isDark ? 'bg-sky-400/15' : 'bg-blue-600/10'
            )}
            animate={{ top: ['0%', '100%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          />

          {/* Subtle noise / grain texture overlay for premium feel */}
          <div
            className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              backgroundSize: '128px 128px',
            }}
          />
        </div>

        {/* Technical Grid Overlay */}
        <div
          className={cn('absolute inset-0 z-[1] pointer-events-none', gridOpacity)}
          style={{
            backgroundImage:
              `linear-gradient(to right, ${gridLineColor} 1px, transparent 1px), linear-gradient(to bottom, ${gridLineColor} 1px, transparent 1px)`,
            backgroundSize: '54px 54px',
          }}
        />

        {/* Cloud Layers */}
        <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
          <CloudLayer delay={0} duration={45} opacity={0.6} top="18%" scale={1} isDark={isDark} />
          <CloudLayer delay={-15} duration={60} opacity={0.35} top="52%" scale={0.85} isDark={isDark} />
          <CloudLayer delay={-30} duration={55} opacity={0.45} top="76%" scale={1.2} isDark={isDark} />
        </div>

        {/* Orbiting Satellite Paths */}
        <div className="absolute inset-0 z-[3]">
          <OrbitingSatellite isDark={isDark} />
        </div>

        {/* Reticle Overlay */}
        <div className="absolute inset-0 z-[4]">
          <ReticleOverlay isDark={isDark} />
        </div>

        {/* Floating Particles */}
        <div className="absolute inset-0 z-[2]">
          <FloatingParticles isDark={isDark} />
        </div>

        {/* Atmospheric ambient glow */}
        <div className={cn(
          'absolute top-0 left-1/4 w-[650px] h-[400px] z-[2] pointer-events-none rounded-full blur-[130px]',
          isDark ? 'bg-sky-500/[0.05]' : 'bg-blue-600/[0.08]'
        )} style={{ animation: 'shimmer 8s ease-in-out infinite' }} />
        <div className={cn(
          'absolute bottom-0 right-1/4 w-[550px] h-[350px] z-[2] pointer-events-none rounded-full blur-[110px]',
          isDark ? 'bg-purple-500/[0.04]' : 'bg-indigo-500/[0.06]'
        )} style={{ animation: 'shimmer 10s ease-in-out 3s infinite' }} />

        {/* Top Navigation Bar */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 flex items-center justify-between px-6 py-4"
        >
          <Link
            href="/dashboard"
            className={cn('flex items-center gap-2 text-xs transition-colors', mutedText, isDark ? 'hover:text-white' : 'hover:text-slate-950')}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="font-mono font-medium">Dashboard</span>
          </Link>

          <div className={cn('flex items-center gap-3 text-[10px] font-mono', mutedText)}>
            <span className={cn('flex items-center gap-1.5 font-semibold', accentColor)}>
              <MapPinned className="w-3.5 h-3.5" />
              {scene.name}
            </span>
            <span className={cn('h-3 w-px', isDark ? 'bg-slate-700' : 'bg-slate-300')} />
            <span className={accentColor}>{scene.modalities.join(' + ')}</span>
            <span className={cn('h-3 w-px', isDark ? 'bg-slate-700' : 'bg-slate-300')} />
            <span>{scene.inputConfig.replace('_', '-')}</span>
            <span className={cn('h-3 w-px', isDark ? 'bg-slate-700' : 'bg-slate-300')} />

            {/* Theme Toggle Button */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-lg transition-all cursor-pointer shadow-xs border',
                isDark
                  ? 'bg-white/10 hover:bg-white/20 border-white/15'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
              )}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </motion.button>
          </div>
        </motion.div>

        {/* Main Content: Centered Query Input */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl space-y-8"
          >
            {/* Headline */}
            <div className="text-center space-y-3">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-mono font-semibold uppercase tracking-widest backdrop-blur-md',
                  isDark ? 'border-sky-400/30 bg-sky-500/10 text-sky-300' : 'border-blue-600/25 bg-blue-600/10 text-blue-700'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full animate-ping', isDark ? 'bg-sky-400' : 'bg-blue-600')} />
                AGENTIC QUERY ENGINE
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.6 }}
                className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold leading-tight tracking-tight"
                style={{ fontFamily: 'var(--font-bodoni-moda), "Bodoni Moda", "Times New Roman", serif' }}
              >
                Ask satellite imagery
                <br />
                <span className={cn('italic font-normal', accentColor)}>a direct question.</span>
              </motion.h1>
            </div>

            {/* The Input Box */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5 }}
              className={cn(
                'rounded-2xl border backdrop-blur-xl p-4 transition-all',
                isDark ? 'focus-within:border-sky-400/50' : 'focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20',
                inputBg
              )}
              style={{ animation: isDark ? 'pulse-glow-dark 4s ease-in-out infinite' : 'pulse-glow-light 4s ease-in-out infinite' }}
            >
              <div className={cn('flex items-center gap-2 px-2 pb-2 text-[10px] font-mono', mutedText)}>
                <Terminal className={cn('w-3 h-3', accentColor)} strokeWidth={1.5} />
                <span>query :: {scene.name} :: {scene.modalities.join('+')}</span>
              </div>
              <textarea
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What percentage of this area is covered by vegetation?"
                autoFocus
                rows={2}
                className={cn(
                  'w-full bg-transparent px-2 text-sm sm:text-base resize-none focus:outline-none leading-relaxed',
                  isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400 font-medium'
                )}
              />
              <div className="flex items-center justify-between pt-2 px-1">
                <span className={cn('text-[10px] font-mono', isDark ? 'text-slate-500' : 'text-slate-500')}>
                  Enter to send · Shift+Enter for newline
                </span>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleSubmit()}
                  disabled={!query.trim()}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md',
                    query.trim()
                      ? cn(accentBg, 'text-white', isDark ? 'shadow-sky-500/30 hover:bg-sky-400' : 'shadow-blue-600/30 hover:bg-blue-700')
                      : cn(isDark ? 'bg-white/10 text-slate-500' : 'bg-slate-200 text-slate-400', 'cursor-not-allowed')
                  )}
                >
                  <span>Analyze</span>
                  <Send className="w-3.5 h-3.5" strokeWidth={2} />
                </motion.button>
              </div>
            </motion.div>

            {/* Suggested Query Chips */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="space-y-3"
            >
              <div className={cn('flex items-center gap-2 justify-center text-[10px] font-mono font-semibold tracking-wider', mutedText)}>
                <Sparkles className={cn('w-3 h-3', accentColor)} />
                <span>SUGGESTED QUESTIONS</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.slice(0, 4).map((s, i) => (
                  <motion.button
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 + i * 0.07 }}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setQuery(s);
                      inputRef.current?.focus();
                    }}
                    className={cn('px-4 py-2 rounded-xl border text-xs transition-all cursor-pointer backdrop-blur-md', chipBg)}
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Bottom Status Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className={cn(
            'relative z-10 flex items-center justify-between px-6 py-3 text-[10px] font-mono border-t transition-colors',
            isDark ? 'text-slate-500 border-white/10' : 'text-slate-500 border-slate-200'
          )}
        >
          <span>SATQUERY AI · AGENTIC VISION-LANGUAGE ORCHESTRATOR</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            MODELS ONLINE
          </span>
        </motion.div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: Resizable Split-Screen Analysis Workspace
  // ═══════════════════════════════════════════════════════════
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col h-screen w-full overflow-hidden bg-background text-foreground"
    >
      {/* Top bar for Phase 2 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/60 backdrop-blur-md shrink-0"
      >
        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard"
            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2 text-xs">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="font-bold text-foreground">Analysis Workspace</span>
            <span className="text-muted-foreground font-mono">· {scene.name}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/60 text-[10px] font-mono text-muted-foreground">
            <ArrowLeftRight className="w-3 h-3 text-primary" />
            <span>Drag center line to resize</span>
          </div>
          <VerificationToggle enabled={verifyEnabled} onChange={setVerifyEnabled} />
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={toggleTheme}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-foreground transition-all cursor-pointer"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
          </motion.button>
        </div>
      </motion.div>

      {/* Resizable Split Panels using Group, Panel, Separator */}
      <div className="flex-1 min-h-0 w-full">
        <Group orientation="horizontal" className="h-full w-full">
          {/* ── LEFT PANEL: Pipeline + Conversation ──────────── */}
          <Panel defaultSize="38%" minSize="26%" maxSize="58%" className="h-full">
            <motion.div
              initial={{ x: -25, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col h-full bg-card/70 border-r border-border"
            >
              {/* Panel Header */}
              <div className="px-4 py-2.5 border-b border-border shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <h2 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">Query Console</h2>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {scene.modalities.join(' + ')} · {scene.inputConfig.replace('_', '-')}
                </span>
              </div>

              {/* Conversation Scroll Area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {turns.map((turn, i) => (
                  <div key={i} className="space-y-3">
                    {/* User query bubble */}
                    <div className="flex justify-end">
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="bg-primary/15 border border-primary/30 text-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[88%] shadow-xs"
                      >
                        <p className="text-xs leading-relaxed">{turn.query}</p>
                      </motion.div>
                    </div>

                    {/* Response */}
                    {turn.isStreaming ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-2"
                      >
                        <MiniPipeline
                          currentStage={pipelineStage}
                          toolSteps={toolSteps}
                          verification={verificationState}
                        />
                      </motion.div>
                    ) : turn.error ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-xl border border-destructive/40 bg-destructive/5 p-3"
                      >
                        <p className="text-xs font-semibold text-destructive">Query failed</p>
                        <p className="mt-1 text-[11px] font-mono text-muted-foreground break-all">{turn.error}</p>
                      </motion.div>
                    ) : turn.result ? (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                      >
                        {turn.result.abstained ? (
                          <AbstentionNotice result={turn.result} />
                        ) : (
                          <AnswerCard result={turn.result} />
                        )}
                      </motion.div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Multi-Turn Input at Bottom */}
              <div className="p-3 border-t border-border shrink-0">
                <div className="rounded-xl border border-border bg-background/80 backdrop-blur-md p-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-transparent transition-all shadow-xs">
                  <div className="flex items-center gap-1.5 px-2 pb-1 text-[10px] text-muted-foreground font-mono">
                    <Terminal className="w-3 h-3 text-primary" strokeWidth={1.5} />
                    <span>follow-up query</span>
                  </div>
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    placeholder="Ask a follow-up question..."
                    disabled={isStreaming}
                    rows={2}
                    className="w-full bg-transparent px-2 text-xs text-foreground placeholder:text-muted-foreground/70 resize-none focus:outline-none disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between pt-1 px-1">
                    <span className="text-[10px] text-muted-foreground/60 font-mono">Ctrl+Enter to send</span>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSubmit()}
                      disabled={!query.trim() || isStreaming}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                        query.trim() && !isStreaming
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'bg-muted text-muted-foreground cursor-not-allowed'
                      )}
                    >
                      {isStreaming ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          <span>Send</span>
                          <Send className="w-3 h-3" strokeWidth={2} />
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </Panel>

          {/* ── Resizable Separator Handle with arrows/grip ── */}
          <Separator className="group relative flex items-center justify-center w-2.5 hover:w-3.5 transition-all cursor-col-resize bg-border/40 hover:bg-primary/20 select-none">
            <div className="absolute inset-y-0 w-px bg-border group-hover:bg-primary/60 transition-colors" />
            <div className="relative z-10 flex flex-col items-center gap-0.5 p-1 rounded bg-card/90 border border-border/80 shadow-xs opacity-50 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" strokeWidth={1.5} />
            </div>
          </Separator>

          {/* ── RIGHT PANEL: Evidence Canvas ─────────────────── */}
          <Panel defaultSize="62%" minSize="42%" className="h-full">
            <motion.div
              initial={{ x: 25, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="relative h-full w-full"
            >
              <EvidenceCanvas scene={scene} />
              <div className="absolute bottom-4 left-4 z-20">
                <LayerControls />
              </div>

              {/* Telemetry HUD overlays on right panel */}
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-300"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>{scene.name}</span>
                <span className="text-slate-500">|</span>
                <span className="text-sky-400">{scene.modalities.join(' + ')}</span>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-400"
              >
                <Crosshair className="w-3 h-3 text-sky-400" />
                <span>EPSG:{scene.compatibility?.targetCrs || '32643'}</span>
              </motion.div>
            </motion.div>
          </Panel>
        </Group>
      </div>
    </motion.div>
  );
}
