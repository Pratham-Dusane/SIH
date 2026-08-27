'use client';

/**
 * Backend Registry — PRD §7.6.
 *
 * This page replaces the old trained-model registry (M1–M5). Those models were
 * never built: Phase 4 uses a hosted general-purpose VLM plus Google Earth
 * Engine, with **no fine-tuning of any kind**.
 *
 * When a judge asks "what exactly did you fine-tune?", this page must say
 * plainly: nothing — and point to §7.0. That disclosure is the first thing
 * rendered, above the cards, and it is read from the API rather than hardcoded.
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Boxes, CircleSlash, CloudOff, Loader2, Moon, RefreshCw,
  Sun, WifiOff,
} from 'lucide-react';

import TopNav from '@/components/layout/TopNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { fetchBackendHealth, fetchBackends } from '@/lib/api';
import { useStore } from '@/lib/store';
import type { BackendCard, BackendHealth, BackendRegistry } from '@/lib/types';

export default function BackendRegistryPage() {
  const { theme, toggleTheme } = useStore();
  const [registry, setRegistry] = useState<BackendRegistry | null>(null);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [reg, h] = await Promise.all([fetchBackends(), fetchBackendHealth()]);
      setRegistry(reg);
      setHealth(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <TopNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Backend Registry' },
        ]}
      />

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Boxes className="w-5 h-5 text-brand-500" />
              Backend Registry
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hosted services that serve the tool registry (PRD §7.6). No trained-model
              versions exist — see the disclosure below.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}
              className="gap-2 border-border">
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
              <span>Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={toggleTheme}
              className="gap-2 border-border">
              {theme === 'dark'
                ? <Sun className="w-4 h-4 text-amber-400" />
                : <Moon className="w-4 h-4 text-slate-700" />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </Button>
          </div>
        </div>

        {/* ── R1 disclosure. Deliberately the first thing on the page. ── */}
        {registry && (
          <Card className="bg-amber-500/5 border-amber-500/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-500">
                <AlertTriangle className="w-4 h-4" />
                Requirement R1 — Not Attempted
              </CardTitle>
              <CardDescription className="text-xs">
                What was fine-tuned on remote-sensing data:{' '}
                <span className="font-mono font-bold text-foreground">
                  {registry.fine_tuning.fine_tuned_components.length === 0
                    ? 'nothing'
                    : registry.fine_tuning.fine_tuned_components.join(', ')}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs leading-relaxed text-foreground/90">
                {registry.fine_tuning.statement}
              </p>
              <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                Reference: PRD {registry.fine_tuning.prd_reference}
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── Live readiness ── */}
        {health && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusTile
              label="VLM Gateway"
              ok={health.vlm.configured}
              headline={
                health.vlm.model
                  ? `${health.vlm.vlm_backend} · ${health.vlm.model}`
                  : health.vlm.vlm_backend
              }
              reason={health.vlm.reason}
            />
            <StatusTile
              label="Google Earth Engine"
              ok={health.gee.gee_initialized}
              headline={health.gee.project ?? 'no project configured'}
              reason={health.gee.reason}
            />
            <StatusTile
              label="Tool Availability"
              ok={health.unavailable_tools.length === 0}
              headline={`${health.registered_tools - health.unavailable_tools.length} of ${health.registered_tools} available`}
              reason={
                health.unavailable_tools.length === 0
                  ? 'every registered tool can run'
                  : `unavailable: ${health.unavailable_tools.join(', ')}`
              }
            />
          </div>
        )}

        {health?.offline_mode && (
          <Card className="bg-sky-500/5 border-sky-500/40">
            <CardContent className="py-3 flex items-start gap-2">
              <WifiOff className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
              <p className="text-xs text-foreground/90">
                <span className="font-semibold">Offline evaluation mode is on.</span>{' '}
                Every backend below that is not offline-capable returns a structured{' '}
                <span className="font-mono">NOT_EVALUATED_OFFLINE</span> result instead of
                calling out (PRD §11.5). This is correct for the ISRO/SAC offline
                container and wrong for a live demo.
              </p>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="bg-destructive/5 border-destructive/40">
            <CardContent className="py-3 flex items-start gap-2">
              <CloudOff className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-destructive">
                  Could not reach the backend registry.
                </p>
                <p className="text-muted-foreground font-mono mt-1">{error}</p>
                <p className="text-muted-foreground mt-1">
                  Is the API running on{' '}
                  <span className="font-mono">
                    {process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080'}
                  </span>
                  ?
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {loading && !registry && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading backend cards…
          </div>
        )}

        {/* ── Backend cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {registry?.backends.map((b) => (
            <BackendCardView key={b.name} card={b} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusTile({ label, ok, headline, reason }: {
  label: string; ok: boolean; headline: string; reason: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">{label}</p>
          <Badge
            className={
              ok
                ? 'bg-confidence-high/15 text-confidence-high text-[10px]'
                : 'bg-amber-500/15 text-amber-500 text-[10px]'
            }
          >
            {ok ? 'READY' : 'UNAVAILABLE'}
          </Badge>
        </div>
        <p className="text-sm font-mono text-foreground truncate" title={headline}>
          {headline}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug">{reason}</p>
      </CardContent>
    </Card>
  );
}

function BackendCardView({ card }: { card: BackendCard }) {
  const isDeterministic = card.backend_id === null;

  return (
    <Card className="bg-card border-border hover:border-brand-500/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-8 h-7 rounded bg-brand-500/20 text-brand-500 font-mono text-xs font-bold shrink-0">
              {card.backend_id ?? 'DET'}
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold truncate">{card.name}</CardTitle>
              <CardDescription className="text-xs font-mono truncate"
                title={card.provider_configured ?? card.provider}>
                {card.provider_configured ?? card.provider}
              </CardDescription>
            </div>
          </div>
          <Badge
            className={
              card.active
                ? 'bg-confidence-high/15 text-confidence-high text-[10px] shrink-0'
                : 'bg-amber-500/15 text-amber-500 text-[10px] shrink-0'
            }
          >
            {card.active ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3 border-b border-border/50 pb-1">
            <span className="text-muted-foreground shrink-0">Adaptation:</span>
            <span className="text-foreground text-right">{card.adaptation}</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/50 pb-1">
            <span className="text-muted-foreground shrink-0">Offline capable:</span>
            <span
              className={
                card.offline_capable
                  ? 'text-confidence-high font-mono'
                  : 'text-amber-500 font-mono flex items-center gap-1'
              }
            >
              {card.offline_capable ? 'yes' : <><CircleSlash className="w-3 h-3" />no</>}
            </span>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/50 pb-1">
            <span className="text-muted-foreground shrink-0">Status:</span>
            <span className="text-foreground text-right font-mono text-[11px]">
              {card.status_reason}
            </span>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">
            Serves Tools
          </p>
          <div className="flex flex-wrap gap-1">
            {card.serves_tools.map((t) => (
              <Badge key={t} variant="outline"
                className="text-[10px] font-mono bg-secondary/50 border-border">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        <p
          className={`text-[11px] leading-snug rounded px-2 py-1.5 ${
            isDeterministic
              ? 'text-confidence-high/90 bg-confidence-high/5'
              : 'text-muted-foreground bg-secondary/40'
          }`}
        >
          {card.notes}
        </p>
      </CardContent>
    </Card>
  );
}
