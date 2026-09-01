'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Satellite, Mail, Lock, AlertCircle, ArrowRight, ShieldCheck, Layers, Radar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Eyebrow, Pill, rise, stagger } from '@/components/ui/spectra';
import SceneReel from '@/components/ui/scene-reel';
import { useAuth } from '@/lib/auth-context';

/** Capability strip on the marketing half — copy only, no data calls. */
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
    'h-11 w-full rounded-pill border border-border bg-secondary/50 pl-10 pr-4 text-sm ' +
    'placeholder:text-muted-foreground/70 transition-shadow focus:outline-none ' +
    'focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500';

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
      {/* ── Left: the pitch ─────────────────────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-between">
        <SceneReel />
        <div className="grain pointer-events-none absolute inset-0" />

        <div className="relative z-10 flex items-center gap-3 p-10">
          <span className="grid size-9 place-items-center rounded-pill bg-ember-500/15 ring-1 ring-inset ring-ember-500/30">
            <Satellite className="size-[18px] text-ember-500" suppressHydrationWarning />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">
            SatQuery<span className="text-ember-500">.</span>
          </span>
        </div>

        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="relative z-10 max-w-xl px-10 pb-4"
        >
          <motion.div variants={rise}>
            <Eyebrow>ISRO / SAC · Problem Statement</Eyebrow>
          </motion.div>

          <motion.h1
            variants={rise}
            className="font-display mt-5 text-[clamp(2.25rem,4.2vw,3.5rem)] font-semibold leading-[1.03] tracking-[-0.03em]"
          >
            Ask satellite imagery
            <br />
            <span className="text-ember-500">a direct question.</span>
            <span
              aria-hidden
              className="ml-3 inline-block animate-[spin_9s_linear_infinite] align-middle text-[0.55em] text-ember-500"
            >
              ✳
            </span>
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-5 max-w-md text-[15px] leading-relaxed text-paper/60"
          >
            An agentic vision-language assistant that plans, measures and cites its
            work across optical and SAR scenes — and declines when the evidence
            will not carry the answer.
          </motion.p>

          <motion.div variants={rise} className="mt-8 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="group flex gap-3.5">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-pill bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_20px_-8px_rgba(0,0,0,0.8)] ring-1 ring-inset ring-white/12 backdrop-blur transition-transform duration-300 group-hover:-translate-y-0.5">
                  <Icon className="size-4 text-ember-400" suppressHydrationWarning />
                </span>
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-paper/50">{body}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <div className="relative z-10 flex flex-wrap items-center gap-2 p-10">
          <Pill tone="ember">Cartosat-2S</Pill>
          <Pill tone="brand">RISAT SAR</Pill>
          <Pill>Sentinel-1/2</Pill>
          <Pill>Google Earth Engine</Pill>
        </div>
      </section>

      {/* ── Right: the form ─────────────────────────────────────────────── */}
      <section className="flex items-center justify-center bg-background px-5 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          {/* Compact mark for the mobile layout, where the left panel is hidden. */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-9 place-items-center rounded-pill bg-ember-500/12">
              <Satellite className="size-[18px] text-ember-500" suppressHydrationWarning />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-[-0.02em]">
              SatQuery<span className="text-ember-500">.</span>
            </span>
          </div>

          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
            Sign in
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Continue to your remote-sensing workspace.
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/[0.07] p-3 text-xs text-destructive"
            >
              <AlertCircle className="mt-px size-4 shrink-0" suppressHydrationWarning />
              <span>{error}</span>
            </motion.div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="mt-6 h-11 w-full gap-3"
          >
            <svg className="size-4" viewBox="0 0 24 24" suppressHydrationWarning>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" suppressHydrationWarning />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" suppressHydrationWarning />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" suppressHydrationWarning />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" suppressHydrationWarning />
            </svg>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              or email
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-medium">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" suppressHydrationWarning />
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
              <label htmlFor="login-password" className="text-xs font-medium">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" suppressHydrationWarning />
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

            <Button
              type="submit"
              variant="ember"
              size="lg"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Signing in…' : 'Sign in'}
              <ArrowRight className="size-4" suppressHydrationWarning />
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Create workspace account
            </Link>
          </p>
        </motion.div>
      </section>
    </div>
  );
}
