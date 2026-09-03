'use client';

// F5 Historical Scenes — KPI Row (Extensions PRD §8)
import { Database, HelpCircle, ShieldCheck, MapPin, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface KPIRowProps {
  data?: {
    total_scenes: number;
    total_queries: number;
    mean_confidence: number;
    abstention_rate: number;
    active_districts_count: number;
  };
}

export default function KPIRow({ data }: KPIRowProps) {
  const totalScenes = data?.total_scenes ?? 0;
  const totalQueries = data?.total_queries ?? 0;
  const meanConf = data?.mean_confidence ?? 0;
  const abstentionRate = data?.abstention_rate ?? 0;
  const activeDistricts = data?.active_districts_count ?? 0;

  const kpis = [
    {
      label: 'Scenes Analysed',
      tint: 'tint-brand',
      value: totalScenes.toLocaleString(),
      sub: 'Multi-sensor archive',
      icon: Database,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Queries Answered',
      tint: 'tint-violet',
      value: totalQueries.toLocaleString(),
      sub: 'Grounded findings',
      icon: HelpCircle,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Mean Confidence',
      tint: 'tint-emerald',
      value: `${(meanConf * 100).toFixed(1)}%`,
      sub: 'Ensemble verified',
      icon: ShieldCheck,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Districts Monitored',
      tint: 'tint-ember',
      value: activeDistricts.toString(),
      sub: 'Admin-2 boundary lookup',
      icon: MapPin,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {kpis.map((kpi, idx) => {
        const Icon = kpi.icon;
        return (
          <Card
            key={idx}
            className={`border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden ${kpi.tint}`}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {kpi.label}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
                    {kpi.value}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
              </div>
              <div className={`p-3 rounded-2xl ${kpi.bg} ${kpi.color} border border-black/5 dark:border-white/5`}>
                <Icon className="w-5 h-5" strokeWidth={1.8} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
