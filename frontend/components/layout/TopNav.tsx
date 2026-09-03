'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Settings, Sun, Moon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/auth-context';

interface Breadcrumb {
  label: string;
  href?: string;
  /** Render this instead of the label — used for the editable scene title. */
  node?: React.ReactNode;
}

interface TopNavProps {
  breadcrumbs?: Breadcrumb[];
  extra?: React.ReactNode;
}

export default function TopNav({ breadcrumbs = [], extra }: TopNavProps) {
  const { theme, setTheme, toggleTheme } = useStore();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('satquery-theme') as 'light' | 'dark' | null;
    setTheme(saved ?? 'light');
  }, [setTheme]);

  // Avatar initials came from a hardcoded "SA". Derived from the signed-in
  // user, the same way the sidebar does it, so the two never disagree.
  const displayName =
    user?.displayName || user?.email?.split('@')[0] || 'ISRO Analyst';
  const initials =
    displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    || 'SA';

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
            {crumb.node ? (
              crumb.node
            ) : crumb.href ? (
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

        {/* Settings */}
        <Tooltip>
          {/* Base UI's Trigger composes via `render`, not `asChild`, so the
              real <Link> keeps middle-click and open-in-new-tab. */}
          <TooltipTrigger
            render={<Link href="/settings" aria-label="Settings" />}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all"
          >
            <Settings className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Settings</p>
          </TooltipContent>
        </Tooltip>

        {/* Theme Toggle */}
        {mounted && (
          <Tooltip>
            <TooltipTrigger
              id="btn-theme-toggle"
              onClick={toggleTheme}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Switch to {theme === 'dark' ? 'light' : 'dark'} mode</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* User avatar */}
        <Avatar className="h-8 w-8 border border-primary/30">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
