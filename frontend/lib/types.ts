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
  /** Enhanced preview, present only after an accepted enhancement run. */
  enhancedUrl?: string | null;
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
  type: 'mask' | 'boxes' | 'change_map' | 'heatmap' | 'points' | 'annotation';
  label: string;
  colour: string;
  sourceStep: string;
  pngUrl?: string;
  geotiffUrl?: string;
  geojsonUrl?: string;
  annotationLayerId?: string;
  boxes?: { bbox: [number, number, number, number]; score: number; label?: string }[];
  stats?: Record<string, number>;
}

export interface ConfidenceContribution { tool: string; confidence: number; weight: number; }

export interface Confidence {
  value: number; band: ConfidenceBand; basis: string;
  contributions: ConfidenceContribution[];
}

export interface VerificationResult {
  status: 'verified' | 'uncertain' | 'skipped';
  reason: string;
  confidence_delta: number;
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
  verification?: VerificationResult;
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
  verification?: VerificationResult;
  createdAt: string;
}

export type QueryStreamEvent =
  | { type: 'stage'; stage: 'classifying' | 'validating' | 'planning' | 'fusing' }
  | { type: 'plan'; plan: { task: TaskType; steps: { id: string; tool: string; reason: string }[] } }
  | { type: 'step'; id: string; tool: string; status: 'running' | 'complete' | 'skipped';
      params?: Record<string, unknown>; reason?: string; summary?: string;
      confidence?: number; durationMs?: number; note?: string }
  | { type: 'verification'; status: 'verified' | 'uncertain' | 'skipped'; reason: string }
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

// ─── Phase 4: backend registry & health (PRD §7.6, §14) ───
// There are no trained-model cards any more. `BackendCard` describes a hosted
// service, and `r1_status` is always NOT_ATTEMPTED - nothing was fine-tuned.

export interface BackendCard {
  backend_id: string | null;
  name: string;
  provider: string;
  provider_configured?: string;
  vlm_backend?: string;
  gee_project?: string | null;
  adaptation: string;
  serves_tools: string[];
  offline_capable: boolean;
  notes: string;
  active: boolean;
  status_reason: string;
  r1_status: 'NOT_ATTEMPTED';
}

export interface FineTuningDisclosure {
  fine_tuned_components: string[];
  r1_status: 'NOT_ATTEMPTED';
  statement: string;
  prd_reference: string;
}

export interface BackendRegistry {
  backends: BackendCard[];
  fine_tuning: FineTuningDisclosure;
}

export interface VlmStatus {
  vlm_backend: string;
  provider: string | null;
  model: string | null;
  configured: boolean;
  reason: string;
  offline_capable: boolean;
  adaptation: string;
}

export interface GeeStatus {
  gee_initialized: boolean;
  reason: string;
  service_account: string | null;
  project: string | null;
  key_path_present: boolean;
  offline_capable: boolean;
}

export interface ToolHealth {
  registered: boolean;
  available: boolean;
  reason: string;
  offline_capable: boolean;
  model_id: string | null;
}

export interface BackendHealth {
  status: 'ok' | 'degraded';
  offline_mode: boolean;
  vlm: VlmStatus;
  gee: GeeStatus;
  registered_tools: number;
  unavailable_tools: string[];
  tools: Record<string, ToolHealth>;
}

export interface ToolManifestEntry {
  name: string;
  description: string;
  accepts: string[];
  required_modalities: string[];
  produces: string[];
  params_schema: Record<string, unknown>;
  offline_capable: boolean;
}

// ---------------------------------------------------------------------------
// Cross-scene assistant — Extensions PRD §8 (F5)
// ---------------------------------------------------------------------------

/** Workspace totals, computed from stored rows — never model-generated. */
export interface AssistantAggregates {
  sceneCount: number;
  queryCount: number;
  georeferencedScenes: number;
  byInputConfig: Record<string, number>;
  meanConfidence: number | null;
}

export interface AssistantResponse {
  answer: string;
  /** Scene ids the answer was retrieved from. */
  citations: string[];
  aggregates: AssistantAggregates;
  grounded: boolean;
  /** True when the model was unreachable and `answer` is the record dump. */
  degraded?: boolean;
  reason?: string | null;
  model?: string | null;
}

/** One scene row from the analytics overview (snake_case, as the API returns it). */
export interface AnalyticsSceneSummary {
  id: string;
  name: string;
  input_config: string;
  modalities: string[];
  created_at: string;
  district?: string | null;
  state?: string | null;
  unit_id?: string | null;
  query_count: number;
  mean_confidence: number;
  bounds_wgs84?: number[] | null;
  thumbnail_url?: string | null;
}

export interface AnalyticsOverview {
  kpis: Record<string, unknown>;
  scenes: AnalyticsSceneSummary[];
  districts: string[];
  [key: string]: unknown;
}
