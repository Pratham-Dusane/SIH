'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  UploadCloud,
  FlaskConical,
  Boxes,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Satellite,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'New Scene', href: '/scene/new', icon: UploadCloud },
  { label: 'Benchmarks', href: '/benchmarks', icon: FlaskConical },
  { label: 'Backend Registry', href: '/models', icon: Boxes },
  { label: 'Settings', href: '/settings', icon: Settings },
];

import { useAuth } from '@/lib/auth-context';

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, activeWorkspace, signOutUser } = useAuth();

  const userDisplayName = user?.displayName || user?.email?.split('@')[0] || 'ISRO Analyst';
  const userInitials =
    userDisplayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'SA';

  const workspaceName = activeWorkspace?.name || 'SAC Workspace';

  return (
    <aside
      id="sidebar"
      className={cn(
        'relative flex h-screen flex-col bg-[var(--sidebar)]',
        'border-r border-sidebar-border transition-[width] duration-300 ease-out',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      {/* A single ember hairline down the edge — the reference's one warm accent
          against an otherwise monochrome chrome. */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-ember-500/25 to-transparent"
      />

      {/* Wordmark */}
      <div className="flex min-h-[76px] items-center gap-3 px-5 py-5">
        <div className="relative grid size-9 shrink-0 place-items-center rounded-pill bg-ember-500/12">
          <Satellite className="size-[18px] text-ember-500" />
          <span className="absolute inset-0 rounded-pill ring-1 ring-inset ring-ember-500/25" />
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col overflow-hidden"
          >
            <span className="font-display whitespace-nowrap text-[15px] font-semibold tracking-[-0.02em]">
              SatQuery
              <span className="text-ember-500">.</span>
            </span>
            <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Remote Sensing
            </span>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          const linkContent = (
            <Link
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-pill px-3 py-2.5',
                'text-sm font-medium tracking-[-0.01em] transition-colors duration-200',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
              )}
            >
              {/* Shared-layout pill slides between items instead of fading. */}
              {isActive && (
                <motion.span
                  layoutId="sidebar-active"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="weight absolute inset-0 rounded-pill border border-foreground/15 bg-card"
                />
              )}
              <Icon
                className={cn(
                  'relative size-[18px] shrink-0 transition-colors',
                  isActive
                    ? 'text-ember-500'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              />
              {!collapsed && <span className="relative whitespace-nowrap">{item.label}</span>}
              {!collapsed && isActive && (
                <span className="relative ml-auto size-1.5 rounded-full bg-ember-500" />
              )}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger className="w-full">
                  <span className="block">{linkContent}</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="border-border bg-popover">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>

      {/* Footer: identity + collapse */}
      <div className="space-y-2 border-t border-sidebar-border px-3 py-4">
        <div className={cn('flex items-center gap-3 px-2', collapsed && 'justify-center px-0')}>
          <Avatar className="size-8 shrink-0 ring-1 ring-border">
            <AvatarFallback className="bg-brand-500/15 text-[11px] font-semibold text-brand-500">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{userDisplayName}</p>
                <p className="truncate text-[10px] text-muted-foreground">{workspaceName}</p>
              </div>
              <Tooltip>
                <TooltipTrigger
                  id="btn-sign-out"
                  onClick={signOutUser}
                  className="grid size-7 cursor-pointer place-items-center rounded-pill text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="size-4" />
                </TooltipTrigger>
                <TooltipContent side="right" className="border-border bg-popover">
                  Sign out
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        <button
          id="btn-toggle-sidebar"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex w-full items-center justify-center rounded-pill py-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
    </aside>
  );
}
