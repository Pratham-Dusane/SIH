'use client';

/**
 * Shared presentation primitives in the Spectra idiom.
 *
 * These are pure presentation — no data fetching, no API surface. Pages keep
 * their existing calls and simply render through these.
 */

import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------------------
 * Motion
 * ------------------------------------------------------------------------- */

/** Staggered rise — the reference reveals sections as a soft upward cascade. */
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

/* ---------------------------------------------------------------------------
 * Eyebrow — small uppercase label above a heading.
 * ------------------------------------------------------------------------- */

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
      ? 'bg-ember-500'
      : tone === 'brand'
        ? 'bg-brand-500'
        : 'bg-muted-foreground';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-[11px] font-medium uppercase',
        'tracking-[0.16em] text-muted-foreground',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dot)} />
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Pill — the reference's ubiquitous chip.
 * ------------------------------------------------------------------------- */

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
    neutral: 'bg-muted text-muted-foreground border-border',
    ember: 'bg-ember-500/12 text-ember-600 border-ember-500/30 dark:text-ember-300',
    brand: 'bg-brand-500/12 text-brand-600 border-brand-500/30 dark:text-brand-300',
    good: 'bg-confidence-high/12 text-confidence-high border-confidence-high/30',
    warn: 'bg-confidence-medium/12 text-confidence-medium border-confidence-medium/30',
    bad: 'bg-confidence-low/12 text-confidence-low border-confidence-low/30',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1',
        'text-[11px] font-medium tracking-[-0.01em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Panel — the soft-cornered surface the reference uses for every card.
 * ------------------------------------------------------------------------- */

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
        'weight rounded-2xl border border-border bg-card',
        interactive &&
          'transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-1 hover:border-ember-500/45 hover:weight-lg',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Ambient beams — a slow, low-contrast backdrop for hero surfaces.
 * Pure CSS transforms so it stays cheap and respects reduced-motion.
 * ------------------------------------------------------------------------- */

export function Beams({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div
        className="animate-drift absolute -top-1/3 left-1/4 h-[70vh] w-[70vh] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, rgba(250,99,23,0.20), transparent 65%)' }}
      />
      <div
        className="animate-drift absolute -bottom-1/3 right-1/5 h-[60vh] w-[60vh] rounded-full blur-[120px]"
        style={{
          background: 'radial-gradient(circle, rgba(27,92,255,0.22), transparent 65%)',
          animationDelay: '-7s',
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Stat — dashboard metric with an animated count-up.
 * ------------------------------------------------------------------------- */

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: string | number;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'ember' | 'good' | 'warn';
}) {
  const accent = {
    brand: 'text-brand-500 bg-brand-500/10',
    ember: 'text-ember-500 bg-ember-500/10',
    good: 'text-confidence-high bg-confidence-high/10',
    warn: 'text-confidence-medium bg-confidence-medium/10',
  }[tone];

  return (
    <Panel interactive className="group relative overflow-hidden p-5">
      {/* Accent hairline that widens on hover — a small reward for pointing. */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-5 top-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100',
          tone === 'ember' ? 'bg-ember-500' : 'bg-brand-500',
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        {icon && (
          <span className={cn('grid size-8 place-items-center rounded-pill', accent)}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums leading-none">
          {value}
        </span>
        {hint}
      </div>
    </Panel>
  );
}
