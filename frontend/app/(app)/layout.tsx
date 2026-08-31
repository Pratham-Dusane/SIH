'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/auth-context';
import { useStore } from '@/lib/store';
import CircularBackground from '@/components/landing/CircularBackground';
import AuroraBackground from '@/components/landing/AuroraBackground';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('satquery-theme') as 'light' | 'dark' | null;
    if (saved) {
      setTheme(saved);
    }
  }, [setTheme]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isDark = mounted && theme === 'dark';

  return (
    <div className="h-screen w-full relative bg-background overflow-hidden flex">
      {/* Background Animated Layer */}
      {mounted && isDark && <CircularBackground />}
      {mounted && !isDark && <AuroraBackground />}

      {/* Floating Translucent Sidebar */}
      <Sidebar />

      {/* Main Content Area beside Sidebar */}
      <main className="h-screen flex-1 pl-[88px] sm:pl-[280px] pr-3 sm:pr-6 py-4 relative z-10 flex flex-col overflow-y-auto transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
