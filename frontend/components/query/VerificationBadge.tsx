'use client';

/**
 * VerificationBadge -- shows "Verified" or "Uncertain" with a shield icon.
 *
 * Displays the self-verification result from the second-pass VLM cross-check.
 * Tooltip shows the verifier's reason. Includes a toggle so the user can
 * enable/disable verification for subsequent queries.
 */

import { ShieldCheck, ShieldQuestion, ShieldOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VerificationResult } from '@/lib/types';
import { cn } from '@/lib/utils';

interface VerificationBadgeProps {
  verification: VerificationResult | null | undefined;
}

export default function VerificationBadge({ verification }: VerificationBadgeProps) {
  if (!verification || verification.status === 'skipped') {
    return null;
  }

  const isVerified = verification.status === 'verified';

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-help transition-all border',
          isVerified
            ? 'bg-confidence-high/10 text-confidence-high border-confidence-high/30'
            : 'bg-confidence-medium/10 text-confidence-medium border-confidence-medium/30',
        )}
      >
        {isVerified
          ? <ShieldCheck className="w-3.5 h-3.5" />
          : <ShieldQuestion className="w-3.5 h-3.5" />
        }
        {isVerified ? 'Verified' : 'Uncertain'}
      </TooltipTrigger>
      <TooltipContent className="bg-card border-border max-w-[300px] p-3 space-y-2">
        <div className="flex items-center gap-2">
          {isVerified
            ? <ShieldCheck className="w-4 h-4 text-confidence-high" />
            : <ShieldQuestion className="w-4 h-4 text-confidence-medium" />
          }
          <p className="text-xs font-semibold text-foreground">
            Self-Verification: {isVerified ? 'Passed' : 'Uncertain'}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {verification.reason}
        </p>
        <p className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/50">
          A second VLM pass cross-checked this answer against the source imagery.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}


/**
 * VerificationToggle -- UI switch so the user can enable/disable
 * self-verification per query.
 */

interface VerificationToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function VerificationToggle({ enabled, onChange }: VerificationToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        onClick={() => onChange(!enabled)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all border cursor-pointer',
          enabled
            ? 'bg-brand-500/10 text-brand-500 border-brand-500/30'
            : 'bg-secondary/50 text-muted-foreground border-border hover:border-brand-500/30',
        )}
      >
        {enabled
          ? <ShieldCheck className="w-3 h-3" />
          : <ShieldOff className="w-3 h-3" />
        }
        {enabled ? 'Verify ON' : 'Verify OFF'}
      </TooltipTrigger>
      <TooltipContent className="bg-card border-border max-w-[220px] p-2">
        <p className="text-[11px] text-muted-foreground">
          {enabled
            ? 'A second VLM pass will cross-check each answer. Click to disable.'
            : 'Enable self-verification to cross-check answers against the imagery.'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
