'use client';

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, File as FileIcon, X, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
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
      }, 200);

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
    <Card
      id={`uploader-${zone}`}
      className={cn(
        'relative border-2 border-dashed transition-all duration-200 cursor-pointer bg-card',
        dragOver
          ? 'border-brand-500 bg-brand-500/5'
          : file
            ? 'border-confidence-high/40'
            : colorAccent || 'border-border hover:border-brand-500/40',
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

      <div className="p-6 min-h-[160px] flex flex-col items-center justify-center">
        {!file ? (
          <>
            <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6 text-brand-500" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">{label}</p>
            <p className="text-xs text-muted-foreground">
              Drag & drop or click to browse
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {benchmarkMode ? '.tif, .tiff, .png, .jpg' : '.tif, .tiff (GeoTIFF)'}
            </p>
          </>
        ) : (
          <div className="w-full">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-confidence-high/10 flex items-center justify-center shrink-0">
                <FileIcon className="w-5 h-5 text-confidence-high" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFile(null);
                  setUploadProgress(null);
                }}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {uploadProgress !== null && (
              <div className="mt-3">
                <Progress value={uploadProgress} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">{Math.round(uploadProgress)}% uploaded</p>
              </div>
            )}
          </div>
        )}

        {warning && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-md bg-confidence-medium/10 border border-confidence-medium/20">
            <AlertTriangle className="w-3.5 h-3.5 text-confidence-medium shrink-0" />
            <p className="text-xs text-confidence-medium">{warning}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
