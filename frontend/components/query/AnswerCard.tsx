'use client';

import { ExternalLink, Download, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import ConfidenceMeter from '@/components/trace/ConfidenceMeter';
import { QueryResult, EvidenceLayer } from '@/lib/types';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface AnswerCardProps {
  result: QueryResult;
}

export default function AnswerCard({ result }: AnswerCardProps) {
  const { setTraceDrawerOpen } = useStore();

  // Simple markdown-style rendering for bold text
  const renderAnswer = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-foreground">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

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
    <Card className="bg-card/50 border-border">
      <CardContent className="p-3.5 space-y-3">
        {/* Answer text */}
        <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {result.answer ? renderAnswer(result.answer) : 'No answer produced.'}
        </div>

        {/* Evidence chips */}
        {evidenceList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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

        {/* Confidence */}
        <ConfidenceMeter confidence={result.confidence} />

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <div className="flex flex-wrap gap-1">
            {result.trace?.steps
              ?.filter((s) => s?.status === 'OK')
              ?.map((s) => (
                <Badge
                  key={s.id}
                  variant="outline"
                  className="text-[9px] font-mono border-border text-muted-foreground"
                >
                  {s.tool}
                </Badge>
              ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setTraceDrawerOpen(true)}
              className="text-[10px] text-brand-500 hover:text-brand-400 flex items-center gap-1 transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              View trace
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
