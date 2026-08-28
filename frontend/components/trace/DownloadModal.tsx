'use client';

import { useState } from 'react';
import {
  Download, FileText, FileJson, FileCode,
  Map, Globe, Image, Package, Loader2, Check, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { auth } from '@/lib/firebase';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  endpoint: (queryId: string) => string;
  filename: (queryId: string) => string;
  mimeType: string;
  tier: 'primary' | 'geo' | 'data';
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'bundle',
    label: 'Full Bundle (ZIP)',
    description: 'All artifacts — PDF report, trace, answer, evidence layers',
    icon: <Package className="w-4 h-4" />,
    endpoint: (qid) => `${API_BASE}/api/queries/${qid}/export/bundle`,
    filename: (qid) => `satquery_${qid}.zip`,
    mimeType: 'application/zip',
    tier: 'primary',
  },
  {
    id: 'report',
    label: 'PDF Report',
    description: '7-section analysis report with evidence, trace & provenance',
    icon: <FileText className="w-4 h-4" />,
    endpoint: (qid) => `${API_BASE}/api/queries/${qid}/export/report`,
    filename: (qid) => `report_${qid}.pdf`,
    mimeType: 'application/pdf',
    tier: 'primary',
  },
  {
    id: 'trace',
    label: 'Trace JSON',
    description: 'Machine-readable execution audit (R11-graded)',
    icon: <FileJson className="w-4 h-4" />,
    endpoint: (qid) => `${API_BASE}/api/queries/${qid}/export/trace`,
    filename: (qid) => `trace_${qid}.json`,
    mimeType: 'application/json',
    tier: 'data',
  },
  {
    id: 'answer',
    label: 'Answer (Markdown)',
    description: 'Verbatim query, answer & confidence band',
    icon: <FileCode className="w-4 h-4" />,
    endpoint: (qid) => `${API_BASE}/api/queries/${qid}/export/answer`,
    filename: (qid) => `answer_${qid}.md`,
    mimeType: 'text/markdown',
    tier: 'data',
  },
];

const GEO_OPTIONS: ExportOption[] = [
  {
    id: 'geotiff',
    label: 'GeoTIFF',
    description: 'Geo-referenced raster mask — open in QGIS',
    icon: <Map className="w-4 h-4" />,
    endpoint: (qid) => `${API_BASE}/api/queries/${qid}/export/bundle`,
    filename: (qid) => `satquery_${qid}.zip`,
    mimeType: 'image/tiff',
    tier: 'geo',
  },
  {
    id: 'geojson',
    label: 'GeoJSON',
    description: 'Vector polygon — EPSG:4326, for web maps',
    icon: <Globe className="w-4 h-4" />,
    endpoint: (qid) => `${API_BASE}/api/queries/${qid}/export/bundle`,
    filename: (qid) => `satquery_${qid}.zip`,
    mimeType: 'application/geo+json',
    tier: 'geo',
  },
  {
    id: 'png',
    label: 'PNG Overlay',
    description: 'Semi-transparent RGBA mask overlay',
    icon: <Image className="w-4 h-4" />,
    endpoint: (qid) => `${API_BASE}/api/queries/${qid}/export/bundle`,
    filename: (qid) => `satquery_${qid}.zip`,
    mimeType: 'image/png',
    tier: 'geo',
  },
];

interface DownloadModalProps {
  queryId: string;
  compact?: boolean;
}

type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

export default function DownloadModal({ queryId, compact = false }: DownloadModalProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Record<string, DownloadStatus>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async (option: ExportOption) => {
    setStatus((s) => ({ ...s, [option.id]: 'downloading' }));
    setErrorMessage(null);

    try {
      const url = option.endpoint(queryId);
      const headers: Record<string, string> = {};

      try {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      } catch {
        // Fallback for local development without active token
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        let errDetail = `${res.status} ${res.statusText}`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) errDetail = errJson.detail;
        } catch {
          // ignore json parse error
        }
        throw new Error(errDetail);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = option.filename(queryId);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      setStatus((s) => ({ ...s, [option.id]: 'done' }));
      setTimeout(() => setStatus((s) => ({ ...s, [option.id]: 'idle' })), 2000);
    } catch (err) {
      console.error('Download error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Export failed: ${msg}`);
      setStatus((s) => ({ ...s, [option.id]: 'error' }));
      setTimeout(() => setStatus((s) => ({ ...s, [option.id]: 'idle' })), 4000);
    }
  };

  const tierStyles: Record<string, string> = {
    primary:
      'border-brand-500/30 bg-brand-500/5 hover:bg-brand-500/10 hover:border-brand-500/50',
    geo:
      'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/50',
    data:
      'border-border hover:bg-secondary/80 hover:border-border',
  };

  const StatusIcon = ({ id }: { id: string }) => {
    const s = status[id] || 'idle';
    if (s === 'downloading')
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />;
    if (s === 'done')
      return <Check className="w-3.5 h-3.5 text-emerald-500" />;
    if (s === 'error')
      return <X className="w-3.5 h-3.5 text-red-400" />;
    return <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            id="btn-download-exports"
            variant="outline"
            size="sm"
            className={
              compact
                ? 'h-7 text-[11px] gap-1.5 border-border hover:bg-secondary'
                : 'gap-2'
            }
          >
            <Download className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
            Download
          </Button>
        }
      />

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Export Analysis</DialogTitle>
          <DialogDescription>
            Choose a format to download. All artifacts are traceable to the execution audit log.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="p-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md">
            {errorMessage}
          </div>
        )}

        <div className="space-y-2 mt-2">
          {EXPORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => handleDownload(opt)}
              disabled={status[opt.id] === 'downloading'}
              className={`group flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border transition-all
                ${tierStyles[opt.tier]}
                disabled:opacity-60 disabled:cursor-wait cursor-pointer`}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-background/80 border border-border/60 shrink-0">
                {opt.icon}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-foreground">{opt.label}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">
                  {opt.description}
                </div>
              </div>
              <StatusIcon id={opt.id} />
            </button>
          ))}

          <div className="pt-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1.5 px-1">
              Geospatial Evidence Layers
            </div>
            <div className="grid grid-cols-3 gap-2">
              {GEO_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleDownload(opt)}
                  disabled={status[opt.id] === 'downloading'}
                  className={`group flex flex-col items-center gap-1.5 px-2 py-3 rounded-lg border transition-all
                    ${tierStyles[opt.tier]}
                    disabled:opacity-60 disabled:cursor-wait cursor-pointer`}
                >
                  <div className="flex items-center justify-center w-7 h-7 rounded-md bg-background/80 border border-border/60">
                    {opt.icon}
                  </div>
                  <div className="text-[11px] font-medium text-foreground">{opt.label}</div>
                  <div className="text-[9px] text-muted-foreground leading-tight text-center">
                    {opt.description}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
              Individual GeoTIFF, GeoJSON, and PNG evidence layers are packaged inside the Full Bundle ZIP.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
