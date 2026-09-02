'use client';

// F5 Historical Scenes — Scenes Table (Extensions PRD §8)
import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MapPin, ArrowUpDown, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface SceneItem {
  id: string;
  name: string;
  district?: string;
  state?: string;
  input_config: string;
  modalities: string[];
  created_at: string;
  query_count: number;
  mean_confidence: number;
}

interface ScenesTableProps {
  scenes: SceneItem[];
}

export default function ScenesTable({ scenes }: ScenesTableProps) {
  const [sortField, setSortField] = useState<'created_at' | 'name' | 'query_count' | 'mean_confidence'>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sorted = [...scenes].sort((a, b) => {
    let vA = a[sortField];
    let vB = b[sortField];
    if (typeof vA === 'string') {
      return sortAsc ? (vA as string).localeCompare(vB as string) : (vB as string).localeCompare(vA as string);
    }
    return sortAsc ? (vA as number) - (vB as number) : (vB as number) - (vA as number);
  });

  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Card className="border-border/70 bg-card/60 backdrop-blur-xl shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <span>Indexed Historical Scenes ({scenes.length})</span>
          </CardTitle>
          <span className="text-[10px] text-muted-foreground font-mono">
            Page {page} of {totalPages}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/5 dark:bg-white/5 border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              <tr>
                <th
                  onClick={() => toggleSort('name')}
                  className="px-4 py-3 cursor-pointer hover:text-foreground"
                >
                  <div className="flex items-center gap-1">
                    <span>Scene Name</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="px-4 py-3">District / Administrative Area</th>
                <th className="px-4 py-3">Configuration</th>
                <th className="px-4 py-3">Modalities</th>
                <th
                  onClick={() => toggleSort('query_count')}
                  className="px-4 py-3 cursor-pointer hover:text-foreground"
                >
                  <div className="flex items-center gap-1">
                    <span>Queries</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('mean_confidence')}
                  className="px-4 py-3 cursor-pointer hover:text-foreground"
                >
                  <div className="flex items-center gap-1">
                    <span>Confidence</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('created_at')}
                  className="px-4 py-3 cursor-pointer hover:text-foreground"
                >
                  <div className="flex items-center gap-1">
                    <span>Ingest Date</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground italic">
                    No scenes found matching active filters.
                  </td>
                </tr>
              ) : (
                pageItems.map((scene) => (
                  <tr
                    key={scene.id}
                    className="hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <Link
                        href={`/scene/${scene.id}`}
                        className="hover:text-primary transition-colors inline-block max-w-[200px] truncate"
                      >
                        {scene.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="w-3 h-3 text-primary shrink-0" />
                        <span>{scene.district ? `${scene.district}, ${scene.state || 'India'}` : 'India'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/60 border border-border/50 uppercase">
                        {scene.input_config.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {scene.modalities?.join(', ') || 'OPTICAL'}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">
                      {scene.query_count}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-emerald-500 font-semibold">
                        {(scene.mean_confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">
                      {scene.created_at?.slice(0, 10) || '2026-08-28'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/scene/${scene.id}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-[11px] gap-1 rounded-lg text-primary hover:bg-primary/10 cursor-pointer"
                        >
                          <span>Analyze</span>
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border/50 text-xs">
            <span className="text-muted-foreground text-[10px]">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-7 px-2.5 text-xs rounded-lg"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-7 px-2.5 text-xs rounded-lg"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
