'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'New Scene', href: '/scene/new', icon: UploadCloud },
  { label: 'Benchmarks', href: '/benchmarks', icon: FlaskConical },
  { label: 'Model Registry', href: '/models', icon: Boxes },
  { label: 'Settings', href: '/settings', icon: Settings },
];

import { useAuth } from '@/lib/auth-context';

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { user, activeWorkspace, signOutUser } = useAuth();

  const userDisplayName = user?.displayName || user?.email?.split('@')[0] || 'ISRO Analyst';
  const userInitials = userDisplayName
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
        'flex flex-col h-screen bg-[var(--sidebar)] border-r border-sidebar-border transition-all duration-300 ease-in-out',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 min-h-[72px]">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-500/20 shrink-0">
          <Satellite className="w-5 h-5 text-brand-500" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold tracking-wide text-foreground whitespace-nowrap">
              SatQuery AI
            </span>
            <span className="text-[10px] text-muted-foreground tracking-wider uppercase whitespace-nowrap">
              Remote Sensing
            </span>
          </div>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          const linkContent = (
            <Link
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-brand-500/15 text-brand-500 shadow-sm shadow-brand-500/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              )}
            >
              <Icon
                className={cn(
                  'w-5 h-5 shrink-0 transition-colors',
                  isActive ? 'text-brand-500' : 'text-muted-foreground group-hover:text-foreground'
                )}
              />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger className="w-full">
                  <span className="block">{linkContent}</span>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-card border-border">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom: User + Collapse */}
      <div className="px-3 py-4 space-y-3">
        {/* User */}
        <div className={cn('flex items-center gap-3 px-3', collapsed && 'justify-center')}>
          <Avatar className="h-8 w-8 shrink-0 border border-brand-500/30">
            <AvatarFallback className="bg-brand-500/20 text-brand-500 text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{userDisplayName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{workspaceName}</p>
            </div>
          )}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger
                id="btn-sign-out"
                onClick={signOutUser}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 flex items-center justify-center cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-card border-border">
                Sign out
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          id="btn-toggle-sidebar"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
