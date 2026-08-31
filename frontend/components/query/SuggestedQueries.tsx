'use client';

import { useEffect, useState } from 'react';
import { Sparkles, HelpCircle, ArrowRight } from 'lucide-react';
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
        <Sparkles className="w-4 h-4 text-primary" strokeWidth={1.5} />
        <p className="text-xs font-semibold text-foreground">Suggested Questions</p>
        <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1">
          <HelpCircle className="w-3 h-3" strokeWidth={1.5} />
          Click to populate
        </span>
      </div>
      <div className="space-y-2">
        {queries.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="text-left w-full p-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 hover:text-foreground bg-white/60 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 rounded-xl transition-all flex items-center justify-between group shadow-xs cursor-pointer"
          >
            <span className="leading-snug pr-2">{q}</span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </div>
  );
}
