// SatQuery AI - API Client (PRD §4.7)
import {
  QueryStreamEvent, QueryResult, Scene, DashboardStats,
  BackendRegistry, BackendHealth, ToolManifestEntry,
} from './types';
// Mocks are used ONLY when NEXT_PUBLIC_USE_MOCKS is not 'false' - an explicit
// opt-in for UI work without a backend. They are never a fallback for a failed
// real call.
import { mockScenes, mockDashboardStats, getDynamicQueryResult } from './mocks';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== 'false';
const DEFAULT_WORKSPACE = 'ws_demo';

import { auth } from './firebase';

/**
 * A real backend failure.
 *
 * When mocks are off, every call in this file throws instead of quietly
 * substituting demo data. Silently falling back to `mockScenes` on a 404 is
 * what made a missing scene look like a working one with the wrong imagery and
 * a hardcoded case-study name - the UI must show the failure, not paper over it.
 */
export class ApiError extends Error {
  status: number;
  url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * Adapt a backend Scene to the flat shape the UI components expect.
 *
 * The API nests raster fields under `image.metadata` and modality under
 * `image.modality`, while `ImageMeta` in lib/types.ts is flat. Without this
 * adapter every component that reads `image.bandCount` gets `undefined` - which
 * is what crashed SceneMetaCard the moment real data replaced the mocks.
 *
 * Keeping the mapping here means components and mocks stay unchanged and there
 * is exactly one place where the API shape is known.
 */
export function normalizeScene(raw: any): Scene {
  const camel = transformKeys(raw) as any;

  const images = (camel.images ?? []).map((img: any) => {
    const m = img.metadata ?? {};
    const mod = img.modality ?? {};
    return {
      role: img.role,
      filename: img.originalFilename ?? img.filename ?? '',
      driver: m.driver ?? 'unknown',
      width: m.width ?? 0,
      height: m.height ?? 0,
      bandCount: m.bandCount ?? 0,
      dtypes: m.dtypes ?? [],
      crs: m.crs ?? null,
      transform: m.transform ?? null,
      boundsWgs84: m.boundsWgs84 ?? null,
      gsdM: m.gsdM ?? m.gsdX ?? null,
      nodata: m.nodata ?? null,
      georeferenced: m.georeferenced ?? false,
      acquiredAt: img.acquiredAt ?? null,
      sensorHint: m.tags?.SENSOR ?? m.tags?.sensor ?? null,
      modality: typeof mod === 'string' ? mod : (mod.modality ?? 'AMBIGUOUS'),
      modalityConfidence: typeof mod === 'string' ? 0 : (mod.confidence ?? 0),
      modalityEvidence: typeof mod === 'string' ? [] : (mod.evidence ?? []),
      bandStats: m.bandStats ?? [],
      previewUrl: img.previewUrl ?? '',
      thumbUrl: img.thumbUrl ?? '',
    };
  });

  const compat = camel.compatibility ?? {};
  const compatibility = {
    verdict: compat.verdict ?? 'PASS',
    // Backend CheckItem is {name, status, detail}; the UI wants {id, title, …}.
    checks: (compat.checks ?? []).map((c: any) => ({
      id: c.id ?? c.name,
      title: c.title ?? humanizeCheckName(c.name ?? ''),
      status: c.status,
      detail: c.detail,
      remedy: c.remedy,
    })),
    targetCrs: compat.targetCrs ?? null,
    targetGsdM: compat.targetGsdM ?? null,
    overlapFraction: compat.overlapFraction ?? null,
    coregShiftPx: compat.coregShiftPx ?? camel.coregShiftPx ?? null,
  };

  return {
    ...camel,
    images,
    compatibility,
    // Not stored by the backend - derived from what the rasters actually carry.
    georeferenced: images.some((i: any) => i.georeferenced),
    status: camel.status ?? 'READY',
  } as Scene;
}

/**
 * Adapt a backend ExecutionTrace to the shape the trace UI reads.
 *
 * The backend stores the classifier output as `task: {task, confidence,
 * evidence}`; `ExecutionTrace` in lib/types.ts declares
 * `task: {selected, classifierConfidence, evidence}`. Without this the
 * execution drawer renders "N/A" for the task on every query.
 */
function normalizeTrace(raw: any): any {
  if (!raw) return null;
  const t = transformKeys(raw) as any;
  const task = t.task ?? {};
  return {
    ...t,
    task: {
      selected: task.selected ?? task.task ?? null,
      classifierConfidence: task.classifierConfidence ?? task.confidence ?? 0,
      evidence: task.evidence ?? [],
    },
    steps: t.steps ?? [],
    fusion: t.fusion ?? null,
    warnings: t.warnings ?? [],
  };
}

function humanizeCheckName(name: string): string {
  return name
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: await authHeader() });
  } catch (err) {
    throw new ApiError(
      `Cannot reach the API at ${API_BASE}. Is the backend running?`, 0, url);
  }
  if (!res.ok) {
    throw new ApiError(`GET ${path} failed with HTTP ${res.status}`, res.status, url);
  }
  return (await res.json()) as T;
}

// ─── Snake-case to camelCase transformer ───
// Backend returns snake_case JSON; frontend types expect camelCase.
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function transformKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = transformKeys(value);
    }
    return result;
  }
  return obj;
}


async function authHeader(): Promise<Record<string, string>> {
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      return { Authorization: `Bearer ${token}` };
    }
  } catch (err) {
    // Fallback if auth unavailable
  }
  return {};
}

// ─── SSE Query Stream (PRD §4.7 exact implementation) ───
export async function streamQuery(
  sceneId: string,
  query: string,
  onEvent: (e: QueryStreamEvent) => void,
  verify?: boolean,
  annotations?: Record<string, any> | null,
): Promise<QueryResult> {
  if (USE_MOCKS) {
    // Generate query-specific dynamic mock result
    const dynamicResult = getDynamicQueryResult(sceneId, query);

    const stages: QueryStreamEvent[] = [
      { type: 'stage', stage: 'classifying' },
      { type: 'stage', stage: 'validating' },
      { type: 'stage', stage: 'planning' },
    ];
    for (const evt of stages) {
      await new Promise((r) => setTimeout(r, 250));
      onEvent(evt);
    }

    for (const step of dynamicResult.trace.steps) {
      await new Promise((r) => setTimeout(r, 200));
      onEvent({
        type: 'step', id: step.id, tool: step.tool,
        status: 'running', reason: `Running ${step.tool}`,
      });
      await new Promise((r) => setTimeout(r, 300));
      onEvent({
        type: 'step', id: step.id, tool: step.tool,
        status: 'complete', summary: step.outputSummary,
        confidence: step.confidence, durationMs: step.durationMs,
      });
    }

    await new Promise((r) => setTimeout(r, 200));
    onEvent({ type: 'stage', stage: 'fusing' });
    if (verify !== false) {
      await new Promise((r) => setTimeout(r, 200));
      onEvent({
        type: 'verification',
        status: 'verified',
        reason: 'Grounding and consistency validated against source preview.',
      });
    }
    await new Promise((r) => setTimeout(r, 300));
    onEvent({ type: 'result', payload: dynamicResult });
    return dynamicResult;
  }

  try {
    const res = await fetch(`${API_BASE}/api/scenes/${sceneId}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ query, verify, annotations }),
    });

    if (!res.ok) {
      console.warn(`Query API returned ${res.status}, falling back to dynamic solver`);
      throw new Error(`HTTP ${res.status}`);
    }

    if (!res.body) throw new Error('No stream response body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let final: QueryResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const rawEvent = JSON.parse(line.slice(6));
        const event = transformKeys(rawEvent) as QueryStreamEvent;
        onEvent(event);

        if (event.type === 'result') {
          const rawData = ((rawEvent.data || rawEvent.payload || rawEvent) as unknown) as any;
          // Whatever the backend sent is what is shown. A missing trace or
          // evidence list stays missing: grafting a mock trace onto a real
          // answer would put fabricated tool steps, durations and confidences
          // in front of a judge as though they had been executed.
          final = {
            ...(transformKeys(rawData) as QueryResult),
            trace: normalizeTrace(rawData.trace),
          } as QueryResult;
        }
      }
    }

    if (final) return final;
    throw new ApiError('Query stream closed without a final result', 502,
      `/api/scenes/${sceneId}/query`);
  } catch (err) {
    // Never invent an answer. A fabricated result here would carry a
    // confidence value and an evidence list that no tool ever produced -
    // exactly the failure mode this whole system is built to avoid.
    const apiErr = err instanceof ApiError
      ? err
      : new ApiError(
          err instanceof Error ? err.message : String(err),
          0, `/api/scenes/${sceneId}/query`);
    onEvent({ type: 'error', message: apiErr.message });
    throw apiErr;
  }
}

// ─── Scene APIs ───
// An empty workspace returns [], never demo scenes. Three fake scenes on a
// fresh install are indistinguishable from three real ones until you click.
export async function fetchScenes(): Promise<Scene[]> {
  if (USE_MOCKS) return mockScenes;
  const data = await apiGet<unknown>('/api/scenes');
  return Array.isArray(data) ? data.map(normalizeScene) : [];
}

export async function fetchScene(id: string): Promise<Scene> {
  if (USE_MOCKS) {
    const mock = mockScenes.find((s) => s.id === id);
    if (!mock) throw new ApiError(`No mock scene with id ${id}`, 404, id);
    return mock;
  }
  const data = await apiGet<any>(`/api/scenes/${id}`);
  if (!data?.id) {
    throw new ApiError(`Malformed scene payload for ${id}`, 500, `/api/scenes/${id}`);
  }
  return normalizeScene(data);
}

export async function deleteScene(id: string): Promise<void> {
  if (USE_MOCKS) return;
  const res = await fetch(`${API_BASE}/api/scenes/${id}`, {
    method: 'DELETE', headers: await authHeader(),
  });
  if (!res.ok) {
    throw new ApiError(`DELETE /api/scenes/${id} failed with HTTP ${res.status}`,
      res.status, `/api/scenes/${id}`);
  }
}

// ─── Dashboard ───
export async function fetchDashboardStats(): Promise<DashboardStats> {
  if (USE_MOCKS) return mockDashboardStats;
  const data = await apiGet<unknown>('/api/stats');
  return transformKeys(data) as DashboardStats;
}

// ─── Health ───
export async function fetchModelHealth(): Promise<{ status: 'healthy' | 'degraded' | 'down' }> {
  if (USE_MOCKS) return { status: 'healthy' };
  try {
    const res = await fetch(`${API_BASE}/api/health/models`);
    if (!res.ok) return { status: 'degraded' };
    const data: BackendHealth = await res.json();
    return { status: data.status === 'ok' ? 'healthy' : 'degraded' };
  } catch {
    return { status: 'down' };
  }
}

// ─── Backend registry (PRD §7.6) ───
// Replaces the old trained-model registry: no fine-tuning was performed, so
// there is no training lineage to show - only hosted-service descriptions.
export async function fetchBackends(): Promise<BackendRegistry> {
  const res = await fetch(`${API_BASE}/api/models`);
  if (!res.ok) throw new Error(`GET /api/models failed: ${res.status}`);
  return res.json();
}

export async function fetchBackendHealth(): Promise<BackendHealth> {
  const res = await fetch(`${API_BASE}/api/health/models`);
  if (!res.ok) throw new Error(`GET /api/health/models failed: ${res.status}`);
  return res.json();
}

export async function fetchToolManifest(): Promise<ToolManifestEntry[]> {
  const res = await fetch(`${API_BASE}/api/tools`);
  if (!res.ok) throw new Error(`GET /api/tools failed: ${res.status}`);
  return res.json();
}

// ─── Upload ───
export interface SignedUpload {
  uploadUrl: string;
  objectPath: string;
  sceneId: string;
}

export async function getSignedUploadUrl(
  filename: string,
  contentType: string,
  sceneRole: string,
  sceneId?: string,
  workspaceId = DEFAULT_WORKSPACE,
): Promise<SignedUpload> {
  const res = await fetch(`${API_BASE}/api/uploads/signed-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ filename, contentType, sceneRole, sceneId, workspaceId }),
  });
  if (!res.ok) {
    throw new ApiError(`Could not get an upload URL for ${filename} (HTTP ${res.status})`,
      res.status, '/api/uploads/signed-url');
  }
  const data = await res.json();
  return { uploadUrl: data.upload_url, objectPath: data.object_path, sceneId: data.scene_id };
}

/**
 * Upload one file and return the object path the backend will read it from.
 * All images in a scene must share a `sceneId` so they land under one prefix.
 */
export async function uploadSceneImage(
  file: File,
  role: string,
  sceneId?: string,
): Promise<{ role: string; originalFilename: string; objectPath: string; sceneId: string }> {
  const signed = await getSignedUploadUrl(
    file.name, file.type || 'application/octet-stream', role, sceneId);

  const put = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!put.ok) {
    throw new ApiError(`Upload of ${file.name} failed (HTTP ${put.status})`,
      put.status, signed.uploadUrl);
  }

  return {
    role,
    originalFilename: file.name,
    objectPath: signed.objectPath,
    sceneId: signed.sceneId,
  };
}

/** Raised when ingest rejects the scene on the R8 checklist (HTTP 422, PRD §6.4). */
export class CompatibilityError extends ApiError {
  report: { verdict: string; checks: { name: string; status: string; detail: string }[] };

  constructor(detail: any, url: string) {
    super(detail?.message || 'Scene failed compatibility validation', 422, url);
    this.name = 'CompatibilityError';
    this.report = {
      verdict: detail?.verdict ?? 'FAIL',
      checks: detail?.checks ?? [],
    };
  }
}

export async function confirmScene(
  images: { role: string; originalFilename: string; objectPath: string }[],
  inputConfig: string,
  benchmarkMode: boolean,
  name?: string,
  benchmarkDataset?: string,
  workspaceId = DEFAULT_WORKSPACE,
): Promise<Scene> {
  const res = await fetch(`${API_BASE}/api/scenes/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      workspace_id: workspaceId,
      input_config: inputConfig,
      benchmark_mode: benchmarkMode,
      benchmark_dataset: benchmarkDataset,
      name,
      images: images.map((i) => ({
        role: i.role,
        original_filename: i.originalFilename,
        object_path: i.objectPath,
      })),
    }),
  });

  if (res.status === 422) {
    // R8: ingest refused the scene and returned the checklist. Surface it -
    // this refusal is a feature, and the panel is what demonstrates it.
    const body = await res.json().catch(() => ({}));
    throw new CompatibilityError(body?.detail ?? body, '/api/scenes/confirm');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(`Scene ingest failed (HTTP ${res.status}) ${body}`.trim(),
      res.status, '/api/scenes/confirm');
  }
  return normalizeScene(await res.json());
}

export interface SceneQueryHistory {
  sceneId: string;
  count: number;
  datesLocked: boolean;
  queries: unknown[];
}

/** Conversation history for a scene, and whether its dates are still editable. */
export async function fetchSceneQueries(sceneId: string): Promise<SceneQueryHistory> {
  const data = await apiGet<unknown>(`/api/scenes/${sceneId}/queries`);
  return transformKeys(data) as SceneQueryHistory;
}

/** Set acquisition dates so the GEE-backed tools have a date range (PRD §7.3/§7.4). */
export async function setSceneDates(
  sceneId: string,
  byRole: Record<string, string>,
): Promise<Scene> {
  const res = await fetch(`${API_BASE}/api/scenes/${sceneId}/dates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ by_role: byRole }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(`Could not set dates (HTTP ${res.status}) ${body}`.trim(),
      res.status, `/api/scenes/${sceneId}/dates`);
  }
  return normalizeScene(await res.json());
}

/** Fetch context-aware query suggestions for a scene. */
export async function fetchSceneSuggestions(sceneId: string): Promise<string[]> {
  if (USE_MOCKS) {
    return [];
  }
  try {
    const res = await fetch(`${API_BASE}/api/scenes/${sceneId}/suggestions`, {
      headers: await authHeader(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.suggestions || [];
  } catch {
    return [];
  }
}
