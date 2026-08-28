'use client';

/**
 * TrafficLightBadge -- green/amber/red confidence indicator.
 *
 * Large colored circle with percentage text. Instantly readable under
 * demo pressure. Tooltip shows the basis explanation.
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Confidence } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TrafficLightBadgeProps {
  confidence: Confidence;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-11 h-11 text-xs',
  lg: 'w-14 h-14 text-sm',
};

const bgMap: Record<string, string> = {
  HIGH: 'bg-confidence-high shadow-confidence-high/30',
  MEDIUM: 'bg-confidence-medium shadow-confidence-medium/30',
  LOW: 'bg-confidence-low shadow-confidence-low/30',
};

const ringMap: Record<string, string> = {
  HIGH: 'ring-confidence-high/20',
  MEDIUM: 'ring-confidence-medium/20',
  LOW: 'ring-confidence-low/20',
};

export default function TrafficLightBadge({ confidence, size = 'md' }: TrafficLightBadgeProps) {
  const percent = Math.round(confidence.value * 100);

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          'rounded-full flex items-center justify-center font-bold text-white shadow-lg ring-4 cursor-help transition-all duration-500',
          sizeMap[size],
          bgMap[confidence.band] || bgMap.LOW,
          ringMap[confidence.band] || ringMap.LOW,
        )}
      >
        {percent}%
      </TooltipTrigger>
      <TooltipContent className="bg-card border-border max-w-[280px] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-3 h-3 rounded-full',
            bgMap[confidence.band]?.split(' ')[0] || 'bg-confidence-low',
          )} />
          <p className="text-xs font-semibold text-foreground">
            {confidence.band === 'HIGH' ? 'High' : confidence.band === 'MEDIUM' ? 'Medium' : 'Low'} Confidence
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">{confidence.basis}</p>
        {confidence.contributions.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border/50">
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Tool Contributions</p>
            {confidence.contributions.map((c, i) => (
              <div key={i} className="flex justify-between text-[11px]">
                <span className="font-mono text-foreground">{c.tool}</span>
                <span className="text-muted-foreground">{(c.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
