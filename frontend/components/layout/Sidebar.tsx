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
  Clock,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'New Scene', href: '/scene/new', icon: UploadCloud },
  { label: 'Historical Scenes', href: '/historical', icon: Clock },
  { label: 'Benchmarks', href: '/benchmarks', icon: FlaskConical },
  { label: 'Backend Registry', href: '/models', icon: Boxes },
  { label: 'Settings', href: '/settings', icon: Settings },
];

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
        'fixed left-4 top-4 bottom-4 rounded-3xl glass-sidebar shadow-2xl flex flex-col z-30 transition-all duration-300 ease-in-out overflow-hidden',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 min-h-[68px]">
        <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
            <Satellite className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span
              className="text-base font-bold tracking-tight text-foreground whitespace-nowrap"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              SatQuery AI
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase whitespace-nowrap">
              Remote Sensing
            </span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/60" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          const linkContent = (
            <Link
              id={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 group relative',
                isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4 shrink-0 transition-colors',
                  isActive
                    ? 'text-white dark:text-slate-900'
                    : 'text-muted-foreground group-hover:text-foreground'
                )}
                strokeWidth={1.5}
              />
              {!collapsed && (
                <span className="whitespace-nowrap font-medium text-xs sm:text-sm">{item.label}</span>
              )}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger className="w-full">
                  <span className="block">{linkContent}</span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.href}>{linkContent}</div>;
        })}
      </nav>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/60" />

      {/* Bottom User and Collapse */}
      <div className="px-3 py-3.5 space-y-2">
        <div className={cn(
          'flex items-center gap-3 px-2 py-1.5 rounded-2xl transition-colors',
          collapsed ? 'justify-center' : 'hover:bg-black/5 dark:hover:bg-white/10'
        )}>
          <Avatar className="h-8 w-8 shrink-0 border border-primary/30">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{userDisplayName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{workspaceName}</p>
            </div>
          )}
          {!collapsed && (
            <Tooltip>
              <TooltipTrigger
                id="btn-sign-out"
                onClick={signOutUser}
                className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-xl hover:bg-destructive/10 flex items-center justify-center cursor-pointer"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.5} />
              </TooltipTrigger>
              <TooltipContent side="right">
                Sign out
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <button
          id="btn-toggle-sidebar"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" strokeWidth={1.5} /> : <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />}
        </button>
      </div>
    </aside>
  );
}
