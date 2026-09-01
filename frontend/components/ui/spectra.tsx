'use client';

/**
 * Shared presentation primitives in the Spectra idiom from commit a71c4b0.
 */

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={rise}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Eyebrow({
  children,
  className,
  tone = 'ember',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'ember' | 'brand' | 'muted';
}) {
  const dot =
    tone === 'ember'
      ? 'bg-amber-500'
      : tone === 'brand'
        ? 'bg-primary'
        : 'bg-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-medium uppercase',
        'tracking-[0.16em] text-slate-300 font-mono',
        className,
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      {children}
    </span>
  );
}

export function Pill({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'ember' | 'brand' | 'good' | 'warn' | 'bad';
}) {
  const tones = {
    neutral: 'bg-white/10 text-slate-200 border-white/15',
    ember: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    brand: 'bg-primary/15 text-sky-300 border-primary/30',
    good: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    bad: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1',
        'text-[11px] font-medium tracking-[-0.01em] backdrop-blur-md',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card',
        interactive &&
          'transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-primary/45',
        className,
      )}
    >
      {children}
    </div>
  );
}
