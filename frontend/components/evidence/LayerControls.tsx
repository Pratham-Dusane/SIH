'use client';

import { Eye, EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function LayerControls() {
  const { turns, layers, setLayerVisibility, setLayerOpacity } = useStore();

  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const evidence = lastTurn?.result?.evidence || [];

  if (evidence.length === 0) return null;

  return (
    <Card className="bg-card/90 backdrop-blur-sm border-border p-3 min-w-[200px] max-w-[260px]">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
        Layers
      </p>
      <div className="space-y-2">
        {evidence.map((ev) => {
          const state = layers[ev.id] || { visible: true, opacity: 0.7 };
          return (
            <div key={ev.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLayerVisibility(ev.id, !state.visible)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {state.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: ev.colour }}
                />
                <span className={cn(
                  'text-[11px] flex-1 truncate',
                  state.visible ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {ev.label}
                </span>
              </div>
              {state.visible && (
                <div className="pl-6">
                  <Slider
                    value={[state.opacity * 100]}
                    onValueChange={(val: number | readonly number[]) => setLayerOpacity(ev.id, (Array.isArray(val) ? val[0] : (val as number)) / 100)}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
