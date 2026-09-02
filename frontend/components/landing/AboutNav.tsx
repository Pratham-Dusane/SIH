'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Satellite, ArrowRight, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AboutNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Overview', href: '/about' },
    { label: 'Capabilities', href: '#capabilities' },
    { label: 'Applications', href: '#applications' },
    { label: 'Satellite Platform', href: '#satellite' },
  ];

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-slate-950/80 backdrop-blur-xl border-b border-white/10 py-3 shadow-2xl'
          : 'bg-transparent border-b border-white/10 py-4.5'
      )}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Technical Logo matching Image 1 */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/15 group-hover:border-sky-400/50 transition-colors">
              <Satellite className="w-4 h-4 text-sky-400 transition-transform group-hover:scale-110" />
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="text-base font-bold tracking-[0.12em] text-white uppercase font-mono"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                SATQUERY
              </span>
              <Crosshair className="w-3.5 h-3.5 text-sky-400/80 shrink-0" strokeWidth={1.5} />
            </div>
          </Link>

          <span className="hidden md:inline-block h-4 w-px bg-white/15" />
          <span className="hidden md:inline-block text-[10px] font-mono tracking-widest text-slate-400 uppercase">
            ISRO / SAC · SIH 2026
          </span>
        </div>

        {/* Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-mono tracking-wider text-slate-300">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  'hover:text-white transition-colors uppercase',
                  isActive && 'text-sky-400 font-semibold'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Action Button */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-sky-500/20 active:scale-95"
          >
            <span>Launch Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </header>
  );
}
