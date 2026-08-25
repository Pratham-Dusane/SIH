'use client';

import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import SceneMetaCard from './SceneMetaCard';
import { Scene, CheckStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const statusIcon = {
  PASS: <CheckCircle2 className="w-4 h-4 text-confidence-high" />,
  WARN: <AlertTriangle className="w-4 h-4 text-confidence-medium" />,
  FAIL: <XCircle className="w-4 h-4 text-confidence-low" />,
  NA: <Info className="w-4 h-4 text-muted-foreground" />,
};

const verdictBadge: Record<string, { className: string; label: string }> = {
  PASS: { className: 'bg-confidence-high/15 text-confidence-high border-confidence-high/30', label: 'All Checks Passed' },
  WARN: { className: 'bg-confidence-medium/15 text-confidence-medium border-confidence-medium/30', label: 'Warnings — Proceed with Caution' },
  FAIL: { className: 'bg-confidence-low/15 text-confidence-low border-confidence-low/30', label: 'Validation Failed' },
};

interface CompatibilityPanelProps {
  scene: Scene;
}

export default function CompatibilityPanel({ scene }: CompatibilityPanelProps) {
  const { compatibility, images } = scene;
  const verdict = verdictBadge[compatibility.verdict] || verdictBadge.PASS;

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Compatibility Verdict</p>
            <Badge variant="outline" className={cn('text-sm font-medium', verdict.className)}>
              {verdict.label}
            </Badge>
          </div>
          {compatibility.overlapFraction != null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Spatial Overlap</p>
              <p className="text-lg font-bold text-foreground">{(compatibility.overlapFraction * 100).toFixed(1)}%</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image metadata + checklist */}
      <div className={cn(
        'grid gap-4',
        images.length > 1 ? 'grid-cols-1 lg:grid-cols-[1fr_auto_1fr]' : 'grid-cols-1 max-w-2xl mx-auto'
      )}>
        {/* Image 1 */}
        <SceneMetaCard image={images[0]} />

        {/* Checklist (for pairs) */}
        {images.length > 1 && (
          <div className="flex flex-col items-center justify-center">
            <Card className="bg-card border-border w-full lg:w-[280px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Compatibility Checks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4 pt-0">
                {compatibility.checks.map((check) => (
                  <div
                    key={check.id}
                    className={cn(
                      'flex items-start gap-2.5 p-2.5 rounded-lg transition-colors',
                      check.status === 'FAIL' ? 'bg-confidence-low/5' :
                      check.status === 'WARN' ? 'bg-confidence-medium/5' :
                      'bg-secondary/30'
                    )}
                  >
                    <div className="mt-0.5 shrink-0">{statusIcon[check.status]}</div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{check.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                        {check.detail}
                      </p>
                      {check.remedy && (
                        <p className="text-[10px] text-confidence-medium mt-1 italic">
                          💡 {check.remedy}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Image 2 (for pairs) */}
        {images.length > 1 && <SceneMetaCard image={images[1]} />}
      </div>

      {/* Single image checklist */}
      {images.length === 1 && compatibility.checks.length > 0 && (
        <Card className="bg-card border-border max-w-2xl mx-auto">
          <CardContent className="p-4 space-y-2">
            {compatibility.checks.map((check) => (
              <div key={check.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-secondary/30">
                {statusIcon[check.status]}
                <div>
                  <span className="text-xs font-medium text-foreground">{check.title}</span>
                  <span className="text-[11px] text-muted-foreground ml-2">{check.detail}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
