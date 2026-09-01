'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Satellite, Mail, Lock, AlertCircle, ArrowRight, ShieldCheck, Layers, Radar, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Eyebrow, Pill, rise, stagger } from '@/components/ui/spectra';
import SceneReel from '@/components/ui/scene-reel';
import { useAuth } from '@/lib/auth-context';

/** Capability strip on the marketing half from commit a71c4b0 */
const HIGHLIGHTS = [
  { icon: Layers, title: 'Multimodal by design', body: 'Optical, multispectral and SAR, validated against each other before a single question is asked.' },
  { icon: Radar, title: 'Every answer traced', body: 'Each figure links back to the tool that measured it. Nothing is asserted that was not computed.' },
  { icon: ShieldCheck, title: 'Refuses when it should', body: 'Incompatible inputs are rejected with a remedy, not answered with a guess.' },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle, signInWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      setLoading(true);
      setError(null);
      await signInWithEmail(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const field =
    'h-11 w-full rounded-full border border-slate-200 bg-slate-50/90 pl-10 pr-4 text-sm text-slate-900 ' +
    'placeholder:text-slate-400 transition-shadow focus:outline-none focus:bg-white ' +
    'focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500';

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr] bg-white">
      {/* ── Left: the dark pitch (Image 2) ─────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-slate-950 text-slate-100 lg:flex lg:flex-col lg:justify-between p-10 select-none">
        <SceneReel />

        {/* Brand Mark */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid w-9 h-9 place-items-center rounded-full bg-amber-500/15 ring-1 ring-inset ring-amber-500/30">
              <Satellite className="w-[18px] h-[18px] text-amber-500" suppressHydrationWarning />
            </span>
            <span
              className="text-[17px] font-bold tracking-tight text-white"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              SatQuery<span className="text-amber-500">.</span>
            </span>
          </div>

          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors glass-panel px-3.5 py-1.5 rounded-full border border-white/10"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </Link>
        </div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="relative z-10 max-w-xl pb-4 my-auto space-y-6"
        >
          <motion.div variants={rise}>
            <Eyebrow tone="ember">ISRO / SAC · Problem Statement #26167</Eyebrow>
          </motion.div>

          <motion.h1
            variants={rise}
            className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight text-white"
            style={{ fontFamily: 'var(--font-bodoni-moda), "Bodoni Moda", serif' }}
          >
            Ask satellite imagery
            <br />
            <span className="text-amber-400 italic font-normal">a direct question.</span>
            <span
              aria-hidden
              className="ml-3 inline-block animate-[spin_9s_linear_infinite] align-middle text-[0.55em] text-amber-400"
            >
              ✳
            </span>
          </motion.h1>

          <motion.p
            variants={rise}
            className="max-w-md text-sm sm:text-base leading-relaxed text-slate-300"
          >
            An agentic vision-language assistant that plans, measures and cites its
            work across optical and SAR scenes — and declines when the evidence
            will not carry the answer.
          </motion.p>

          <motion.div variants={rise} className="space-y-4 pt-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="group flex gap-3.5 items-start">
                <span className="mt-0.5 grid w-8 h-8 shrink-0 place-items-center rounded-xl bg-white/[0.08] border border-white/15 shadow-sm backdrop-blur-md transition-transform duration-300 group-hover:-translate-y-0.5">
                  <Icon className="w-4 h-4 text-amber-400" suppressHydrationWarning />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs leading-relaxed text-slate-400 mt-0.5">{body}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <Pill tone="ember">Cartosat-2S</Pill>
          <Pill tone="brand">RISAT SAR</Pill>
          <Pill>Sentinel-1/2</Pill>
          <Pill>Google Earth Engine</Pill>
        </div>
      </section>

      {/* ── Right: the form in pure white background (Image 2) ────────── */}
      <section className="flex items-center justify-center bg-white text-slate-900 px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm space-y-6"
        >
          {/* Mobile Top Header */}
          <div className="flex items-center justify-between lg:hidden mb-6">
            <div className="flex items-center gap-2.5">
              <span className="grid w-8 h-8 place-items-center rounded-full bg-amber-500/15 ring-1 ring-inset ring-amber-500/30">
                <Satellite className="w-4 h-4 text-amber-500" suppressHydrationWarning />
              </span>
              <span className="text-base font-bold tracking-tight text-slate-900">
                SatQuery<span className="text-amber-500">.</span>
              </span>
            </div>
            <Link href="/" className="text-xs text-slate-500 hover:text-slate-900">
              Home
            </Link>
          </div>

          <div className="space-y-1.5">
            <h2
              className="text-2xl font-bold tracking-tight text-slate-900"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Sign In
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Continue to your remote sensing workspace.
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" suppressHydrationWarning />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Google Sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-11 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-3 font-medium text-xs sm:text-sm text-slate-700 shadow-sm transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" suppressHydrationWarning>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" suppressHydrationWarning />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" suppressHydrationWarning />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" suppressHydrationWarning />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" suppressHydrationWarning />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">
              or email
            </span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-medium text-slate-700">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" suppressHydrationWarning />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="analyst@isro.gov.in"
                  required
                  className={field}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-xs font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" suppressHydrationWarning />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={field}
                />
              </div>
            </div>

            {/* Orange/Amber Sign in Button matching 'a direct question' */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              {loading ? 'Signing in…' : 'Sign in'}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} suppressHydrationWarning />
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 pt-2">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="font-semibold text-slate-900 hover:underline underline-offset-4"
            >
              Create workspace account
            </Link>
          </p>
        </motion.div>
      </section>
    </div>
  );
}
