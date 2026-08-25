// SatQuery AI - TypeScript Types (PRD §13.1)

export type InputConfig = 'SINGLE' | 'CROSS_MODAL' | 'BI_TEMPORAL';
export type Modality = 'OPTICAL' | 'MULTISPECTRAL' | 'SAR' | 'AMBIGUOUS';
export type SceneStatus = 'UPLOADING' | 'VALIDATING' | 'READY' | 'INCOMPATIBLE' | 'FAILED';
export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'NA';
export type ConfidenceBand = 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskType =
  | 'SINGLE_IMAGE_VQA' | 'SINGLE_IMAGE_CAPTIONING' | 'TEXT_GUIDED_GROUNDING'
  | 'CHANGE_DESCRIPTION' | 'CHANGE_VQA' | 'CHANGE_MAP_GENERATION'
  | 'CROSS_MODAL_ANALYSIS' | 'LAND_COVER_ANALYSIS' | 'UNSUPPORTED';

export interface BandStat {
  index: number; dtype: string; min: number; max: number;
  mean: number; std: number; description: string | null; label?: string;
}

export interface ImageMeta {
  role: 'single' | 'optical' | 'sar' | 't1' | 't2';
  filename: string;
  driver: string;
  width: number; height: number; bandCount: number;
  dtypes: string[];
  crs: string | null;
  transform: number[] | null;
  boundsWgs84: [number, number, number, number] | null;
  gsdM: number | null;
  nodata: number | null;
  georeferenced: boolean;
  acquiredAt: string | null;
  sensorHint: string | null;
  modality: Modality;
  modalityConfidence: number;
  modalityEvidence: string[];
  bandStats: BandStat[];
  previewUrl: string;
  thumbUrl: string;
}

export interface CompatibilityCheck {
  id: string; title: string; status: CheckStatus; detail: string; remedy?: string;
}

export interface CompatibilityReport {
  verdict: CheckStatus;
  checks: CompatibilityCheck[];
  targetCrs: string | null;
  targetGsdM: number | null;
  overlapFraction: number | null;
  coregShiftPx: number | null;
}

export interface Scene {
  id: string;
  workspaceId: string;
  name: string;
  inputConfig: InputConfig;
  status: SceneStatus;
  benchmarkMode: boolean;
  georeferenced: boolean;
  modalities: Modality[];
  images: ImageMeta[];
  compatibility: CompatibilityReport;
  cloudFraction?: number;
  createdAt: string;
}

export interface EvidenceLayer {
  id: string;
  type: 'mask' | 'boxes' | 'change_map' | 'heatmap' | 'points';
  label: string;
  colour: string;
  sourceStep: string;
  pngUrl?: string;
  geotiffUrl?: string;
  geojsonUrl?: string;
  boxes?: { bbox: [number, number, number, number]; score: number; label?: string }[];
  stats?: Record<string, number>;
}

export interface ConfidenceContribution { tool: string; confidence: number; weight: number; }

export interface Confidence {
  value: number; band: ConfidenceBand; basis: string;
  contributions: ConfidenceContribution[];
}

export interface TraceStep {
  id: string; tool: string; model: string | null;
  paramsRequested: Record<string, unknown>;
  paramsApplied: Record<string, unknown>;
  status: 'OK' | 'FAILED' | 'SKIPPED';
  durationMs: number; confidence: number;
  outputSummary: string; artifacts?: string[]; note?: string;
}

export interface ExecutionTrace {
  traceId: string; sceneId: string; query: string;
  startedAt: string; finishedAt: string; durationMs: number;
  status: 'COMPLETE' | 'REFUSED' | 'PARTIAL' | 'FAILED';
  task: { selected: TaskType; classifierConfidence: number; evidence: string[] };
  inputs: { inputConfig: InputConfig; images: Partial<ImageMeta>[]; compatibility: CompatibilityReport };
  plan: { backend: 'rules' | 'vertex' | 'local_llm'; stepCount: number };
  steps: TraceStep[];
  fusion: { mode: 'template' | 'llm'; groundingCheck: 'PASS' | 'FAIL'; unsupportedNumbers: string[] };
  confidence: Confidence;
  warnings: string[];
}

export interface QueryResult {
  queryId: string; sceneId: string; query: string;
  answer: string | null;
  abstained: boolean;
  refusal?: { problems: { code: string; detail: string; remedy: string }[] };
  evidence: EvidenceLayer[];
  confidence: Confidence;
  trace: ExecutionTrace;
  createdAt: string;
}

export type QueryStreamEvent =
  | { type: 'stage'; stage: 'classifying' | 'validating' | 'planning' | 'fusing' }
  | { type: 'plan'; plan: { task: TaskType; steps: { id: string; tool: string; reason: string }[] } }
  | { type: 'step'; id: string; tool: string; status: 'running' | 'complete' | 'skipped';
      params?: Record<string, unknown>; reason?: string; summary?: string;
      confidence?: number; durationMs?: number; note?: string }
  | { type: 'result'; payload: QueryResult }
  | { type: 'error'; message: string };

// Dashboard stats
export interface DashboardStats {
  scenesIngested: number;
  queriesAnswered: number;
  averageConfidence: number;
  abstentionRate: number;
}

// Preview metadata for geo mapping
export interface PreviewMeta {
  width: number;
  height: number;
  bounds_wgs84: [number, number, number, number];
  gsd_m: number;
  scale_factor: number;
}
