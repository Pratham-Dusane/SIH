'use client';

import { ExternalLink, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import Markdown from './Markdown';
import ConfidenceMeter from '@/components/trace/ConfidenceMeter';
import TrafficLightBadge from '@/components/trace/TrafficLightBadge';
import VerificationBadge from './VerificationBadge';
import { QueryResult, EvidenceLayer } from '@/lib/types';
import { useStore } from '@/lib/store';

interface AnswerCardProps {
  result: QueryResult;
}

export default function AnswerCard({ result }: AnswerCardProps) {

  // Simple markdown-style rendering for bold text
  const rawEvidence = result.evidence;
  const evidenceList: EvidenceLayer[] = Array.isArray(rawEvidence)
    ? rawEvidence
    : (rawEvidence && typeof rawEvidence === 'object')
      ? Object.entries(rawEvidence).map(([key, val], idx) => ({
          id: key,
          type: 'mask' as const,
          label: typeof val === 'string' ? val : key,
          colour: ['#38bdf8', '#f59e0b', '#10b981', '#a855f7'][idx % 4],
          sourceStep: key.split('.')[0] || 's1',
        }))
      : [];

  return (
    <Card className="bg-card/50 border-border shadow-sm">
      <CardContent className="p-3.5 space-y-3">
        {/* Header with TrafficLight & Verification */}
        <div className="flex items-center justify-between pb-1 border-b border-border/40">
          <div className="flex items-center gap-2">
            {result.confidence && (
              <TrafficLightBadge confidence={result.confidence} size="sm" />
            )}
            <span className="text-xs font-semibold text-foreground">Grounded Analysis</span>
          </div>
          {result.verification && (
            <VerificationBadge verification={result.verification} />
          )}
        </div>

        {/* Answer text - model replies are markdown, not plain text */}
        <div className="text-sm text-muted-foreground leading-relaxed">
          {result.answer
            ? <Markdown text={result.answer} />
            : 'No answer produced.'}
        </div>

        {/* Evidence chips */}
        {evidenceList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {evidenceList.map((ev) => (
              <button
                key={ev.id}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:brightness-125"
                style={{
                  backgroundColor: ev.colour + '15',
                  color: ev.colour,
                  border: `1px solid ${ev.colour}30`,
                }}
              >
                <Eye className="w-2.5 h-2.5" />
                {ev.label}
                {ev.stats?.area_ha != null && (
                  <span className="ml-1 opacity-70">{ev.stats.area_ha.toFixed(1)} ha</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Confidence Meter Details */}
        {result.confidence && (
          <ConfidenceMeter confidence={result.confidence} />
        )}

        {/* Footer with active specialist steps */}
        {result.trace?.steps && result.trace.steps.length > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
            <span className="text-[9px] uppercase tracking-wider">Specialists:</span>
            <div className="flex flex-wrap gap-1">
              {result.trace.steps
                .filter((s) => s?.status === 'OK')
                .map((s) => (
                  <Badge
                    key={s.id}
                    variant="outline"
                    className="text-[9px] font-mono border-border text-muted-foreground bg-secondary/30 py-0 px-1.5"
                  >
                    {s.tool}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
