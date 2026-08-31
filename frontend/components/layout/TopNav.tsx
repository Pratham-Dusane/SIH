'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Activity, Sun, Moon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fetchModelHealth } from '@/lib/api';
import { useStore } from '@/lib/store';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface TopNavProps {
  breadcrumbs?: Breadcrumb[];
  extra?: React.ReactNode;
}

export default function TopNav({ breadcrumbs = [], extra }: TopNavProps) {
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'degraded' | 'down'>('healthy');
  const { theme, setTheme, toggleTheme } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('satquery-theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
    } else {
      setTheme('light');
    }

    const check = async () => {
      const h = await fetchModelHealth();
      setHealthStatus(h.status);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [setTheme]);

  const healthColor = {
    healthy: 'bg-confidence-high',
    degraded: 'bg-confidence-medium',
    down: 'bg-confidence-low',
  }[healthStatus];

  const healthLabel = {
    healthy: 'All models loaded',
    degraded: 'Some models unavailable',
    down: 'Model server offline',
  }[healthStatus];

  return (
    <header
      id="topnav"
      className="sticky top-0 z-20 mb-3 h-14 px-5 rounded-2xl glass-panel flex items-center justify-between transition-colors shadow-sm gap-3"
    >
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm min-w-0 truncate">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5 truncate">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground font-medium transition-colors truncate"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground font-semibold truncate">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Optional Extra Action Widget (e.g. Acquisition Dates) */}
        {extra && (
          <div className="flex items-center">
            {extra}
          </div>
        )}

        {/* Model health */}
        <Tooltip>
          <TooltipTrigger>
            <div
              id="model-health-indicator"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 cursor-default"
            >
              <Activity className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />
              <div className="relative flex items-center justify-center w-2.5 h-2.5">
                <div className={cn('w-2 h-2 rounded-full', healthColor)} />
                {healthStatus === 'healthy' && (
                  <div className={cn('absolute w-2 h-2 rounded-full animate-ping opacity-30', healthColor)} />
                )}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline font-medium">Models</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{healthLabel}</p>
          </TooltipContent>
        </Tooltip>

        {/* Theme Toggle */}
        <Tooltip>
          <TooltipTrigger
            id="btn-theme-toggle"
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/10 text-foreground transition-all cursor-pointer"
          >
            {mounted && theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 transition-transform" strokeWidth={1.5} />
            ) : (
              <Moon className="w-4 h-4 text-slate-700 dark:text-slate-300 transition-transform" strokeWidth={1.5} />
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{mounted && theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</p>
          </TooltipContent>
        </Tooltip>

        {/* User avatar */}
        <Avatar className="h-8 w-8 border border-primary/30">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            SA
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
