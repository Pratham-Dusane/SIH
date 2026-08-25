'use client';

import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { QueryResult } from '@/lib/types';

interface AbstentionNoticeProps {
  result: QueryResult;
}

export default function AbstentionNotice({ result }: AbstentionNoticeProps) {
  return (
    <Card className="bg-confidence-medium/5 border-confidence-medium/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-8 h-8 rounded-lg bg-confidence-medium/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-confidence-medium" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-confidence-medium">Cannot answer this query</p>

            {result.refusal?.problems.map((p, i) => (
              <div key={i} className="space-y-1">
                <p className="text-xs text-muted-foreground">{p.detail}</p>
                <div className="flex items-center gap-1.5 text-xs text-confidence-medium">
                  <ArrowRight className="w-3 h-3" />
                  <span>{p.remedy}</span>
                </div>
              </div>
            ))}

            <p className="text-[10px] text-muted-foreground italic mt-2">
              Abstention is a feature — the system declines when evidence is insufficient rather than guessing.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
