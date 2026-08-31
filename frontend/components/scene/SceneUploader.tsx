'use client';

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, File as FileIcon, X, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface SceneUploaderProps {
  zone: string;
  label: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  benchmarkMode: boolean;
  colorAccent?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function SceneUploader({
  zone, label, accept, file, onFile, benchmarkMode, colorAccent,
}: SceneUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const f = fileList[0];
      const ext = f.name.split('.').pop()?.toLowerCase();

      // Extension validation
      if (!benchmarkMode && ext && !['tif', 'tiff'].includes(ext)) {
        setWarning(`${ext.toUpperCase()} files are only accepted in benchmark mode. Please upload GeoTIFF.`);
        return;
      }
      setWarning(null);

      // Simulate upload progress
      setUploadProgress(0);
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 30;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setTimeout(() => setUploadProgress(null), 500);
        }
        setUploadProgress(Math.min(progress, 100));
      }, 150);

      onFile(f);
    },
    [benchmarkMode, onFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div
      id={`uploader-${zone}`}
      className={cn(
        'h-60 w-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 bg-card/75 backdrop-blur-sm p-6 text-center shadow-sm',
        dragOver
          ? 'border-primary bg-primary/5 ring-4 ring-primary/10'
          : file
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : colorAccent || 'border-border hover:border-primary/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {!file ? (
        <div className="flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 shadow-inner">
            <UploadCloud className="w-6 h-6 text-primary" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
          <p className="text-xs text-muted-foreground">
            Drag and drop or click to browse
          </p>
          <span className="mt-2 text-[10px] font-mono px-2.5 py-1 rounded-full bg-secondary text-muted-foreground border border-border/50">
            {benchmarkMode ? '.tif, .tiff, .png, .jpg' : '.tif, .tiff (GeoTIFF)'}
          </span>
        </div>
      ) : (
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/80 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <FileIcon className="w-5 h-5 text-emerald-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
              <p className="text-[11px] text-muted-foreground">{formatSize(file.size)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFile(null);
                setUploadProgress(null);
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
          {uploadProgress !== null && (
            <div className="mt-3">
              <Progress value={uploadProgress} className="h-1.5 rounded-full" />
              <p className="text-[10px] text-muted-foreground mt-1 text-center font-mono">
                {Math.round(uploadProgress)}% uploaded
              </p>
            </div>
          )}
        </div>
      )}

      {warning && (
        <div className="flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-left">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={1.5} />
          <p className="text-xs text-amber-500">{warning}</p>
        </div>
      )}
    </div>
  );
}
