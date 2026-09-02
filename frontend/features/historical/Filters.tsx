'use client';

// F5 Historical Scenes — Filter Bar (Extensions PRD §8)
import { Search, Filter, RotateCcw, Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FiltersProps {
  districts: string[];
  selectedDistrict: string;
  onSelectDistrict: (d: string) => void;
  selectedConfig: string;
  onSelectConfig: (c: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onReset: () => void;
}

export default function Filters({
  districts,
  selectedDistrict,
  onSelectDistrict,
  selectedConfig,
  onSelectConfig,
  searchQuery,
  onSearchChange,
  onReset,
}: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-border/70 bg-card/60 backdrop-blur-xl shadow-sm">
      {/* Left: Search & Selects */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
        {/* Search input */}
        <div className="relative min-w-[200px] flex-1 max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search scene name, satellite..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-xl bg-background/80 border border-border/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* District selector */}
        <div className="relative">
          <select
            value={selectedDistrict}
            onChange={(e) => onSelectDistrict(e.target.value)}
            aria-label="Filter by district"
            className="pl-3 pr-8 py-1.5 text-xs rounded-xl bg-background/80 border border-border/80 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
          >
            <option value="all">All Districts ({districts.length || 'All India'})</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>

        {/* Input config selector */}
        <div className="relative">
          <select
            value={selectedConfig}
            onChange={(e) => onSelectConfig(e.target.value)}
            aria-label="Filter by scene configuration"
            className="pl-3 pr-8 py-1.5 text-xs rounded-xl bg-background/80 border border-border/80 text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer appearance-none"
          >
            <option value="all">All Configurations</option>
            <option value="SINGLE">Single Scene</option>
            <option value="CROSS_MODAL">Cross-Modal (Optical+SAR)</option>
            <option value="BI_TEMPORAL">Bi-Temporal Pair</option>
          </select>
          <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Right: Reset */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="h-8 px-2.5 rounded-xl text-xs gap-1.5 border-border/80 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </Button>
      </div>
    </div>
  );
}
