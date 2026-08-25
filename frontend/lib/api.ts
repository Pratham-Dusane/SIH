// SatQuery AI - API Client (PRD §4.7)
import { QueryStreamEvent, QueryResult, Scene, DashboardStats } from './types';
import { mockScenes, mockDashboardStats, mockQueryResults, mockAbstentionResult } from './mocks';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080';
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== 'false';

import { auth } from './firebase';

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
): Promise<QueryResult> {
  if (USE_MOCKS) {
    // Simulate streaming with mock data
    const stages: QueryStreamEvent[] = [
      { type: 'stage', stage: 'classifying' },
      { type: 'stage', stage: 'validating' },
      { type: 'stage', stage: 'planning' },
    ];
    for (const evt of stages) {
      await new Promise((r) => setTimeout(r, 400));
      onEvent(evt);
    }

    const mockResult = mockQueryResults[0];
    for (const step of mockResult.trace.steps) {
      await new Promise((r) => setTimeout(r, 300));
      onEvent({
        type: 'step', id: step.id, tool: step.tool,
        status: 'running', reason: `Running ${step.tool}`,
      });
      await new Promise((r) => setTimeout(r, 500));
      onEvent({
        type: 'step', id: step.id, tool: step.tool,
        status: 'complete', summary: step.outputSummary,
        confidence: step.confidence, durationMs: step.durationMs,
      });
    }

    await new Promise((r) => setTimeout(r, 300));
    onEvent({ type: 'stage', stage: 'fusing' });
    await new Promise((r) => setTimeout(r, 500));
    onEvent({ type: 'result', payload: mockResult });
    return mockResult;
  }

  const res = await fetch(`${API_BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ scene_id: sceneId, query }),
  });
  if (!res.body) throw new Error('No stream');
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
      const event = JSON.parse(line.slice(6)) as QueryStreamEvent;
      onEvent(event);
      if (event.type === 'result') final = event.payload;
    }
  }
  if (!final) throw new Error('Stream ended without result');
  return final;
}

// ─── Scene APIs ───
export async function fetchScenes(): Promise<Scene[]> {
  if (USE_MOCKS) return mockScenes;
  const res = await fetch(`${API_BASE}/api/scenes`, { headers: await authHeader() });
  return res.json();
}

export async function fetchScene(id: string): Promise<Scene> {
  if (USE_MOCKS) return mockScenes.find((s) => s.id === id) || mockScenes[0];
  const res = await fetch(`${API_BASE}/api/scenes/${id}`, { headers: await authHeader() });
  return res.json();
}

export async function deleteScene(id: string): Promise<void> {
  if (USE_MOCKS) return;
  await fetch(`${API_BASE}/api/scenes/${id}`, { method: 'DELETE', headers: await authHeader() });
}

// ─── Dashboard ───
export async function fetchDashboardStats(): Promise<DashboardStats> {
  if (USE_MOCKS) return mockDashboardStats;
  const res = await fetch(`${API_BASE}/api/stats`, { headers: await authHeader() });
  return res.json();
}

// ─── Health ───
export async function fetchModelHealth(): Promise<{ status: 'healthy' | 'degraded' | 'down' }> {
  if (USE_MOCKS) return { status: 'healthy' };
  try {
    const res = await fetch(`${API_BASE}/api/health/models`);
    if (!res.ok) return { status: 'degraded' };
    return { status: 'healthy' };
  } catch {
    return { status: 'down' };
  }
}

// ─── Upload ───
export async function getSignedUploadUrl(filename: string, contentType: string, sceneRole: string) {
  if (USE_MOCKS) return { url: '#', path: `mock/${filename}` };
  const res = await fetch(`${API_BASE}/api/uploads/signed-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ filename, contentType, sceneRole }),
  });
  return res.json();
}

export async function confirmScene(objectPaths: string[], inputConfig: string, benchmarkMode: boolean) {
  if (USE_MOCKS) return mockScenes[0];
  const res = await fetch(`${API_BASE}/api/scenes/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ object_paths: objectPaths, input_config: inputConfig, benchmark_mode: benchmarkMode }),
  });
  return res.json();
}
