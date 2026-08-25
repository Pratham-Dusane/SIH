'use client';

import { Confidence } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ConfidenceMeterProps {
  confidence: Confidence;
}

const bandColor = {
  HIGH: 'bg-confidence-high text-confidence-high',
  MEDIUM: 'bg-confidence-medium text-confidence-medium',
  LOW: 'bg-confidence-low text-confidence-low',
};

const bandText = {
  HIGH: 'High Confidence',
  MEDIUM: 'Medium Confidence',
  LOW: 'Low Confidence',
};

export default function ConfidenceMeter({ confidence }: ConfidenceMeterProps) {
  const percent = Math.round(confidence.value * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">Confidence Score</span>
        <Tooltip>
          <TooltipTrigger>
            <span className={cn('font-bold cursor-help', bandColor[confidence.band].split(' ')[1])}>
              {percent}% ({confidence.band})
            </span>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border max-w-[260px] p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">{bandText[confidence.band]}</p>
            <p className="text-[11px] text-muted-foreground">{confidence.basis}</p>
            {confidence.contributions.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border/50">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Tool Contributions</p>
                {confidence.contributions.map((c, i) => (
                  <div key={i} className="flex justify-between text-[11px]">
                    <span className="font-mono text-foreground">{c.tool}</span>
                    <span className="text-muted-foreground">{(c.confidence * 100).toFixed(0)}% (w: {c.weight})</span>
                  </div>
                ))}
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full bg-secondary/80 rounded-full overflow-hidden flex">
        <div
          className={cn('h-full transition-all duration-500 rounded-full', bandColor[confidence.band].split(' ')[0])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
