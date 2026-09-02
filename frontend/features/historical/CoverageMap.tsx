'use client';

// F5 Historical Scenes — Coverage Map (Extensions PRD §8)
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MapPin, Globe } from 'lucide-react';
import Link from 'next/link';

interface SceneFootprint {
  id: string;
  name: string;
  district?: string;
  state?: string;
  input_config: string;
  bounds_wgs84?: number[];
  created_at: string;
}

interface CoverageMapProps {
  scenes: SceneFootprint[];
}

export default function CoverageMap({ scenes }: CoverageMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Geographical Scene Coverage (India)
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[280px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <span>Geographical Scene Archive Coverage</span>
          </CardTitle>
          <span className="text-[10px] text-muted-foreground font-mono">
            {scenes.length} footprints indexed
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-[280px] relative bg-[#090e1a] overflow-hidden">
        {/* Interactive Scene footprint list representation */}
        <div className="w-full h-full p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 overflow-y-auto">
          {scenes.map((s) => {
            const isBiTemporal = s.input_config === 'BI_TEMPORAL';
            const isCrossModal = s.input_config === 'CROSS_MODAL';
            const badgeColor = isBiTemporal
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
              : isCrossModal
              ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
              : 'bg-blue-500/10 text-blue-500 border-blue-500/20';

            return (
              <Link
                key={s.id}
                href={`/scene/${s.id}`}
                className="p-3 rounded-xl border border-border/60 bg-card/40 hover:bg-card hover:border-primary/50 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeColor}`}>
                      {s.input_config.replace('_', ' ')}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {s.created_at.slice(0, 10)}
                    </span>
                  </div>
                  <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {s.name}
                  </h4>
                </div>

                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                  <MapPin className="w-3 h-3 text-primary shrink-0" />
                  <span className="truncate">{s.district ? `${s.district}, ${s.state || 'India'}` : 'India Scene'}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
