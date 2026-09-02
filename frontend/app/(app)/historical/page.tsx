'use client';

// SatQuery AI - Historical Scenes & Multi-Year Analytics Dashboard (Extensions PRD §8)
import { useEffect, useState, useCallback } from 'react';
import TopNav from '@/components/layout/TopNav';
import KPIRow from '@/features/historical/KPIRow';
import Filters from '@/features/historical/Filters';
import Charts from '@/features/historical/Charts';
import CoverageMap from '@/features/historical/CoverageMap';
import ScenesTable from '@/features/historical/ScenesTable';
import { Clock, Loader2, Database, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';

export default function HistoricalScenesPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [selectedConfig, setSelectedConfig] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedDistrict !== 'all') params.set('district', selectedDistrict);
      if (selectedConfig !== 'all') params.set('config', selectedConfig);

      const res = await fetch(`${API_BASE}/api/analytics/overview?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setError('Could not fetch historical analytics from backend.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load historical analytics');
    } finally {
      setLoading(false);
    }
  }, [selectedDistrict, selectedConfig]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleResetFilters = () => {
    setSelectedDistrict('all');
    setSelectedConfig('all');
    setSearchQuery('');
  };

  // Filter scenes by search keyword
  const filteredScenes = (data?.scenes || []).filter((s: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.district?.toLowerCase().includes(q) ||
      s.input_config?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4 pb-6">
      {/* TopNav */}
      <TopNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Historical Scenes & Analytics' },
        ]}
        extra={
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
            <Clock className="w-3.5 h-3.5" />
            <span>10-Year Satellite Archive</span>
          </div>
        }
      />

      {/* Main scrollable body */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        {/* Filters */}
        <Filters
          districts={data?.districts || []}
          selectedDistrict={selectedDistrict}
          onSelectDistrict={setSelectedDistrict}
          selectedConfig={selectedConfig}
          onSelectConfig={setSelectedConfig}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onReset={handleResetFilters}
        />

        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Aggregating historical scene records & analytics...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={loadData}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <KPIRow data={data?.kpis} />

            {/* Geographical Footprint Browser */}
            <CoverageMap scenes={filteredScenes} />

            {/* Recharts Multi-Year Analytics Grid */}
            <Charts data={data} />

            {/* Indexed Scenes Table */}
            <ScenesTable scenes={filteredScenes} />
          </>
        )}
      </div>
    </div>
  );
}
