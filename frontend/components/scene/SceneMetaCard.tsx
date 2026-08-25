'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BandInspector from './BandInspector';
import { ImageMeta, Modality } from '@/lib/types';
import { formatGsd } from '@/lib/geo';
import { cn } from '@/lib/utils';

const modalityStyles: Record<Modality, string> = {
  OPTICAL: 'bg-modality-optical/15 text-modality-optical border-modality-optical/30',
  MULTISPECTRAL: 'bg-modality-optical/15 text-modality-optical border-modality-optical/30',
  SAR: 'bg-modality-sar/15 text-modality-sar border-modality-sar/30',
  AMBIGUOUS: 'bg-confidence-medium/15 text-confidence-medium border-confidence-medium/30',
};

interface SceneMetaCardProps {
  image: ImageMeta;
}

export default function SceneMetaCard({ image }: SceneMetaCardProps) {
  const [showBands, setShowBands] = useState(false);

  const rows = [
    { label: 'Driver / Format', value: image.driver },
    { label: 'Size', value: `${image.width} × ${image.height} px` },
    { label: 'Bands', value: image.bandCount.toString() },
    { label: 'Data Type', value: image.dtypes[0] },
    { label: 'CRS', value: image.crs || 'None (non-georeferenced)' },
    { label: 'GSD', value: formatGsd(image.gsdM) },
    {
      label: 'Bounds (WGS84)',
      value: image.boundsWgs84
        ? `${image.boundsWgs84[1].toFixed(5)}°N, ${image.boundsWgs84[0].toFixed(5)}°E → ${image.boundsWgs84[3].toFixed(5)}°N, ${image.boundsWgs84[2].toFixed(5)}°E`
        : 'N/A',
    },
    { label: 'Acquisition', value: image.acquiredAt ? new Date(image.acquiredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown' },
    { label: 'NoData', value: image.nodata != null ? String(image.nodata) : 'None' },
  ];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {image.role.toUpperCase()}
            </p>
            <CardTitle className="text-sm font-medium truncate">{image.filename}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-[10px]', modalityStyles[image.modality])}>
              {image.modality}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {(image.modalityConfidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-0 p-4 pt-0">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
            <span className="text-[11px] text-muted-foreground">{row.label}</span>
            <span className="text-[11px] text-foreground font-mono text-right max-w-[60%] truncate">
              {row.value}
            </span>
          </div>
        ))}

        {/* Band Inspector toggle */}
        <button
          onClick={() => setShowBands(!showBands)}
          className="flex items-center gap-1.5 mt-2 text-xs text-brand-500 hover:text-brand-400 transition-colors"
        >
          {showBands ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {showBands ? 'Hide' : 'Inspect'} Bands ({image.bandCount})
        </button>

        {showBands && <BandInspector bands={image.bandStats} />}
      </CardContent>
    </Card>
  );
}
