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
}

export default function TopNav({ breadcrumbs = [] }: TopNavProps) {
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
    const interval = setInterval(check, 30000); // Poll every 30s per PRD §4.2
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
      className="flex items-center justify-between h-14 px-6 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30 transition-colors"
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      {/* Right section (Model Status, Theme Toggle, Profile Avatar) */}
      <div className="flex items-center gap-3">
        {/* Model health */}
        <Tooltip>
          <TooltipTrigger>
            <div
              id="model-health-indicator"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60 border border-border/50 cursor-default"
            >
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="relative flex items-center justify-center w-2.5 h-2.5">
                <div className={cn('w-2 h-2 rounded-full', healthColor)} />
                {healthStatus === 'healthy' && (
                  <div className={cn('absolute w-2 h-2 rounded-full animate-ping opacity-30', healthColor)} />
                )}
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline font-medium">Models</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border">
            <p className="text-xs">{healthLabel}</p>
          </TooltipContent>
        </Tooltip>

        {/* Theme Toggle Button */}
        <Tooltip>
          <TooltipTrigger
            id="btn-theme-toggle"
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary/60 hover:bg-secondary border border-border/50 text-foreground transition-all cursor-pointer"
          >
            {mounted && theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700 dark:text-slate-300" />
            )}
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border">
            <p className="text-xs">{mounted && theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</p>
          </TooltipContent>
        </Tooltip>

        {/* User avatar */}
        <Avatar className="h-8 w-8 border border-brand-500/30">
          <AvatarFallback className="bg-brand-500/20 text-brand-500 text-xs font-semibold">
            SA
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
