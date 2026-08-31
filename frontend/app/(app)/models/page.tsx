'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle, Boxes, CircleSlash, CloudOff, Loader2, RefreshCw, WifiOff,
} from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { fetchBackendHealth, fetchBackends } from '@/lib/api';
import type { BackendCard, BackendHealth, BackendRegistry } from '@/lib/types';

export default function BackendRegistryPage() {
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
    <div className="w-full flex flex-col space-y-6">
      <TopNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Backend Registry' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-xl font-bold text-foreground flex items-center gap-2"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              <Boxes className="w-5 h-5 text-primary" strokeWidth={1.5} />
              Backend Registry
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hosted services and specialist modules serving the tool registry
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="gap-2 border-border rounded-xl"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" strokeWidth={1.5} />}
            <span>Refresh</span>
          </Button>
        </div>

        {/* Live readiness tiles */}
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
              headline={health.gee.project ?? 'No project configured'}
              reason={health.gee.reason}
            />
            <StatusTile
              label="Tool Availability"
              ok={health.unavailable_tools.length === 0}
              headline={`${health.registered_tools - health.unavailable_tools.length} of ${health.registered_tools} available`}
              reason={
                health.unavailable_tools.length === 0
                  ? 'All registered tools operational'
                  : `Unavailable: ${health.unavailable_tools.join(', ')}`
              }
            />
          </div>
        )}

        {health?.offline_mode && (
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-sky-500 mt-0.5 shrink-0" strokeWidth={1.5} />
            <p className="text-xs text-foreground/90 leading-relaxed">
              <span className="font-semibold">Offline evaluation mode is active.</span> Modules return structured offline responses for local evaluation containers.
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
            <CloudOff className="w-5 h-5 text-destructive mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="text-xs space-y-1">
              <p className="font-semibold text-destructive">Could not reach backend registry</p>
              <p className="text-muted-foreground font-mono">{error}</p>
            </div>
          </div>
        )}

        {/* Backend cards */}
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
    <div className="glass-card rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{label}</p>
        <Badge
          className={
            ok
              ? 'bg-emerald-500/15 text-emerald-500 text-[10px] rounded-full font-semibold'
              : 'bg-amber-500/15 text-amber-500 text-[10px] rounded-full font-semibold'
          }
        >
          {ok ? 'READY' : 'UNAVAILABLE'}
        </Badge>
      </div>
      <p className="text-sm font-mono font-semibold text-foreground truncate" title={headline}>
        {headline}
      </p>
      <p className="text-[11px] text-muted-foreground leading-snug">{reason}</p>
    </div>
  );
}

function BackendCardView({ card }: { card: BackendCard }) {
  const isDeterministic = card.backend_id === null;

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4 hover:scale-[1.01] transition-all">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center justify-center px-2.5 py-1 rounded-lg bg-secondary text-foreground font-mono text-xs font-bold border border-border/80 shrink-0">
            {card.backend_id ?? 'DET'}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground truncate">{card.name}</h3>
            <p className="text-xs font-mono text-muted-foreground truncate">
              {card.provider_configured ?? card.provider}
            </p>
          </div>
        </div>
        <Badge
          className={
            card.active
              ? 'bg-emerald-500/15 text-emerald-500 text-[10px] rounded-full shrink-0 font-semibold'
              : 'bg-amber-500/15 text-amber-500 text-[10px] rounded-full shrink-0 font-semibold'
          }
        >
          {card.active ? 'ACTIVE' : 'INACTIVE'}
        </Badge>
      </div>

      <div className="space-y-2 text-xs pt-1">
        <div className="flex justify-between gap-3 border-b border-border/40 pb-1.5">
          <span className="text-muted-foreground">Adaptation:</span>
          <span className="text-foreground font-medium text-right">{card.adaptation}</span>
        </div>
        <div className="flex justify-between gap-3 border-b border-border/40 pb-1.5">
          <span className="text-muted-foreground">Offline Capable:</span>
          <span className={card.offline_capable ? 'text-emerald-500 font-mono font-medium' : 'text-amber-500 font-mono'}>
            {card.offline_capable ? 'Yes' : 'No'}
          </span>
        </div>
        <div className="flex justify-between gap-3 border-b border-border/40 pb-1.5">
          <span className="text-muted-foreground">Status:</span>
          <span className="text-foreground font-mono text-[11px] text-right truncate max-w-[200px]">
            {card.status_reason}
          </span>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1.5">
          Serves Tools
        </p>
        <div className="flex flex-wrap gap-1.5">
          {card.serves_tools.map((t) => (
            <span
              key={t}
              className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-secondary text-muted-foreground border border-border/60"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground bg-secondary/40 p-2.5 rounded-xl border border-border/40">
        {card.notes}
      </p>
    </div>
  );
}
