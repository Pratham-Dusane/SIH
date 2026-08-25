'use client';

import { Sparkles } from 'lucide-react';
import { InputConfig } from '@/lib/types';
import { suggestedQueries } from '@/lib/mocks';

interface SuggestedQueriesProps {
  inputConfig: InputConfig;
  onSelect: (query: string) => void;
}

export default function SuggestedQueries({ inputConfig, onSelect }: SuggestedQueriesProps) {
  const queries = suggestedQueries[inputConfig] || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Sparkles className="w-4 h-4 text-brand-500" />
        <p className="text-xs font-medium">Suggested Questions</p>
      </div>
      <div className="space-y-2">
        {queries.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-brand-500/40 hover:bg-brand-500/5 text-sm text-muted-foreground hover:text-foreground transition-all"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
