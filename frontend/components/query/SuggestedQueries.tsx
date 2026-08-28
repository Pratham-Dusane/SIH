'use client';

import { useEffect, useState } from 'react';
import { Sparkles, HelpCircle } from 'lucide-react';
import { InputConfig } from '@/lib/types';
import { suggestedQueries } from '@/lib/mocks';
import { fetchSceneSuggestions } from '@/lib/api';

interface SuggestedQueriesProps {
  inputConfig: InputConfig;
  sceneId?: string;
  onSelect: (query: string) => void;
}

export default function SuggestedQueries({ inputConfig, sceneId, onSelect }: SuggestedQueriesProps) {
  const defaultQueries = suggestedQueries[inputConfig] || [];
  const [queries, setQueries] = useState<string[]>(defaultQueries);

  useEffect(() => {
    let cancelled = false;
    if (sceneId) {
      fetchSceneSuggestions(sceneId).then((dynamic) => {
        if (!cancelled && dynamic && dynamic.length > 0) {
          setQueries(dynamic);
        }
      }).catch(() => {
        // Fallback to static queries
      });
    }
    return () => {
      cancelled = true;
    };
  }, [sceneId, inputConfig]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Sparkles className="w-4 h-4 text-brand-500" />
        <p className="text-xs font-semibold text-foreground">Suggested Questions</p>
        <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
          <HelpCircle className="w-3 h-3" />
          Click to populate
        </span>
      </div>
      <div className="space-y-2">
        {queries.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-card/40 hover:border-brand-500/40 hover:bg-brand-500/5 text-sm text-muted-foreground hover:text-foreground transition-all group flex items-start gap-2"
          >
            <span className="text-brand-500/70 font-semibold text-xs shrink-0 mt-0.5 group-hover:text-brand-500">
              Try:
            </span>
            <span className="leading-snug">{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
