'use client';

// SatQuery AI - Annotation Right Rail Panel (Extensions PRD §5)
import { useState, useRef } from 'react';
import {
  MousePointer,
  Pencil,
  Square,
  Circle,
  MoveRight,
  MapPin,
  Type,
  Eraser,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  Plus,
  Undo,
  Redo,
  Download,
  Upload,
  Bot,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAnnotationStore } from './annotation-store';
import { AnnotationKind } from './types';

const TOOLS: { id: AnnotationKind; label: string; icon: typeof MousePointer }[] = [
  { id: 'select', label: 'Select (V)', icon: MousePointer },
  { id: 'freehand', label: 'Pen (P)', icon: Pencil },
  { id: 'rectangle', label: 'Rectangle (R)', icon: Square },
  { id: 'ellipse', label: 'Circle / Ellipse (C)', icon: Circle },
  { id: 'arrow', label: 'Arrow (A)', icon: MoveRight },
  { id: 'point', label: 'Point Pin', icon: MapPin },
  { id: 'text', label: 'Text Label (T)', icon: Type },
  { id: 'eraser', label: 'Eraser (E)', icon: Eraser },
];

const PALETTE = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#ffffff', // White
];

export default function AnnotationPanel({ scene }: { scene: any }) {
  const {
    layers,
    activeLayerId,
    activeTool,
    strokeColour,
    strokeWidth,
    filled,
    fillOpacity,
    attachedToAgent,
    setActiveLayerId,
    setActiveTool,
    setStrokeColour,
    setStrokeWidth,
    setFilled,
    setFillOpacity,
    setAttachedToAgent,
    createLayer,
    deleteLayer,
    updateLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    reorderLayers,
    duplicateLayer,
    undo,
    redo,
    historyIndex,
    history,
  } = useAnnotationStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  const handleExportGeoJSON = () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: layers.flatMap((l) =>
        l.shapes.map((s, idx) => ({
          type: 'Feature',
          properties: {
            layerId: l.id,
            layerName: l.name,
            author: l.author,
            kind: s.kind,
            badgeIndex: idx + 1,
            colour: s.colour || l.colour,
            label: s.label || s.text || '',
          },
          geometry: s.geo || {
            type: s.kind === 'point' ? 'Point' : 'Polygon',
            coordinates:
              s.kind === 'point'
                ? s.points[0]
                : [s.points.map(([x, y]) => [x, y])],
          },
        }))
      ),
    };

    const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations_${scene?.name || 'scene'}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportGeoJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
          const newLayer = createLayer(
            scene?.id || 'scene',
            file.name.replace('.geojson', ''),
            'user'
          );
          // Parse features into shapes
          json.features.forEach((feat: any) => {
            const geom = feat.geometry;
            if (!geom) return;
            if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
              useAnnotationStore.getState().addShapeToActiveLayer({
                kind: 'point',
                points: [[geom.coordinates[0], geom.coordinates[1]]],
                label: feat.properties?.label || '',
              });
            } else if (
              (geom.type === 'Polygon' || geom.type === 'LineString') &&
              Array.isArray(geom.coordinates)
            ) {
              const coords =
                geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates;
              const pts = coords.map((c: any) => [c[0], c[1]] as [number, number]);
              useAnnotationStore.getState().addShapeToActiveLayer({
                kind: geom.type === 'Polygon' ? 'polygon' : 'freehand',
                points: pts,
                label: feat.properties?.label || '',
              });
            }
          });
        }
      } catch (err) {
        alert('Invalid GeoJSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startRename = (layer: any) => {
    setEditingLayerId(layer.id);
    setEditNameValue(layer.name);
  };

  const saveRename = (layerId: string) => {
    if (editNameValue.trim()) {
      updateLayer(layerId, { name: editNameValue.trim() });
    }
    setEditingLayerId(null);
  };

  return (
    <div className="p-3.5 space-y-4 text-xs">
      {/* Undo / Redo Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={historyIndex <= 0}
            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="h-7 w-7 p-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            title="Redo (Ctrl+Y)"
          >
            <Redo className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAttachedToAgent(!attachedToAgent)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-all cursor-pointer',
              attachedToAgent
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted/40 border-border/60 text-muted-foreground'
            )}
            title="When active, the agent uses your drawing layers as visual context for answering questions"
          >
            <Bot className="w-3 h-3" />
            <span>Agent Context {attachedToAgent ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Tool Grid */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
          Drawing Tools
        </label>
        <div className="grid grid-cols-4 gap-1">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  'flex flex-col items-center justify-center p-2 rounded-xl border transition-all cursor-pointer gap-1',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40'
                )}
                title={tool.label}
              >
                <Icon className="w-4 h-4" strokeWidth={1.7} />
                <span className="text-[9px] font-medium truncate max-w-full">
                  {tool.id}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Color Palette */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
          Stroke Color & Style
        </label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setStrokeColour(color)}
              className={cn(
                'w-5 h-5 rounded-full border border-black/20 shadow-xs transition-transform cursor-pointer',
                strokeColour === color ? 'scale-125 ring-2 ring-primary ring-offset-1' : 'hover:scale-110'
              )}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            type="color"
            value={strokeColour}
            onChange={(e) => setStrokeColour(e.target.value)}
            className="w-5 h-5 rounded-full border-0 p-0 cursor-pointer overflow-hidden bg-transparent"
            title="Custom Hex Color"
          />
        </div>

        {/* Width slider */}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">Stroke Width</span>
          <div className="flex items-center gap-2 flex-1 max-w-[140px]">
            <input
              type="range"
              min="1"
              max="8"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
              className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
            />
            <span className="font-mono text-[10px] text-foreground w-4 text-right">
              {strokeWidth}px
            </span>
          </div>
        </div>

        {/* Fill toggle */}
        <div className="mt-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filled}
              onChange={(e) => setFilled(e.target.checked)}
              className="rounded border-border accent-primary cursor-pointer"
            />
            <span className="text-[10px] text-foreground">Fill Shape</span>
          </label>

          {filled && (
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min="0.05"
                max="0.9"
                step="0.05"
                value={fillOpacity}
                onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                className="w-16 accent-primary h-1 bg-muted rounded cursor-pointer"
              />
              <span className="text-[9px] font-mono text-muted-foreground">
                {Math.round(fillOpacity * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Layer Hierarchy / Management */}
      <div className="space-y-2 border-t border-border/50 pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Layers ({layers.length})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createLayer(scene?.id || 'scene')}
            className="h-6 px-2 text-[10px] gap-1 rounded-lg border-dashed"
          >
            <Plus className="w-3 h-3" />
            <span>New Layer</span>
          </Button>
        </div>

        {/* Layer list */}
        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-0.5">
          {layers.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic text-center py-4">
              No annotation layers yet. Click "New Layer" or select a drawing tool.
            </p>
          ) : (
            layers.map((layer, index) => {
              const isActive = activeLayerId === layer.id;
              const isAgent = layer.author === 'agent';

              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayerId(layer.id)}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer group',
                    isActive
                      ? 'bg-primary/10 border-primary/40 shadow-xs'
                      : 'bg-card/40 border-border/60 hover:bg-accent/40'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Layer color swatch */}
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: layer.colour }}
                    />

                    {editingLayerId === layer.id ? (
                      <input
                        autoFocus
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        onBlur={() => saveRename(layer.id)}
                        onKeyDown={(e) => e.key === 'Enter' && saveRename(layer.id)}
                        className="text-xs bg-background px-1.5 py-0.5 rounded border border-primary w-28 text-foreground"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => startRename(layer)}
                        className="truncate text-xs font-medium text-foreground"
                      >
                        {layer.name}
                      </span>
                    )}

                    {isAgent && (
                      <span className="text-[8px] uppercase tracking-wider font-bold px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-500 shrink-0">
                        Agent
                      </span>
                    )}

                    <span className="text-[9px] text-muted-foreground shrink-0 font-mono">
                      ({layer.shapes.length})
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisibility(layer.id);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                      title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                    >
                      {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(layer.id);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                      title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                    >
                      {layer.locked ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <Unlock className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLayer(layer.id);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
                      title="Duplicate Layer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLayer(layer.id);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Delete Layer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Export / Import GeoJSON */}
      <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportGeoJSON}
          className="h-8 gap-1.5 text-xs rounded-xl"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export GeoJSON</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="h-8 gap-1.5 text-xs rounded-xl"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Import GeoJSON</span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json"
          onChange={handleImportGeoJSON}
          className="hidden"
        />
      </div>
    </div>
  );
}
