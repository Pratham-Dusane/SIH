// SatQuery AI - Mock Data (PRD §4 preamble)
// Gate with NEXT_PUBLIC_USE_MOCKS=true

import {
  Scene, QueryResult, DashboardStats, ImageMeta, CompatibilityReport,
  EvidenceLayer, Confidence, ExecutionTrace, TraceStep, InputConfig
} from './types';

// ─── Dashboard Stats ───
export const mockDashboardStats: DashboardStats = {
  scenesIngested: 47,
  queriesAnswered: 183,
  averageConfidence: 0.78,
  abstentionRate: 0.09,
};

// ─── Band Stats helpers ───
const opticalBands = [
  { index: 1, dtype: 'uint16', min: 0, max: 4500, mean: 1200, std: 650, description: 'B04 Red', label: 'B04 Red' },
  { index: 2, dtype: 'uint16', min: 0, max: 4800, mean: 1050, std: 580, description: 'B03 Green', label: 'B03 Green' },
  { index: 3, dtype: 'uint16', min: 0, max: 4200, mean: 880, std: 490, description: 'B02 Blue', label: 'B02 Blue' },
  { index: 4, dtype: 'uint16', min: 0, max: 5200, mean: 2400, std: 1100, description: 'B08 NIR', label: 'B08 NIR' },
];

const sarBands = [
  { index: 1, dtype: 'float32', min: 0.0001, max: 0.45, mean: 0.08, std: 0.072, description: 'VV', label: 'VV' },
  { index: 2, dtype: 'float32', min: 0.0001, max: 0.32, mean: 0.04, std: 0.038, description: 'VH', label: 'VH' },
];

// ─── Mock Images ───
const mockOpticalImage: ImageMeta = {
  role: 'optical',
  filename: 'sentinel2_bangalore_2025.tif',
  driver: 'GTiff',
  width: 4096, height: 4096, bandCount: 4,
  dtypes: ['uint16', 'uint16', 'uint16', 'uint16'],
  crs: 'EPSG:32643',
  transform: [10, 0, 500000, 0, -10, 1450000],
  boundsWgs84: [77.45, 12.85, 77.85, 13.25],
  gsdM: 10.0,
  nodata: 0,
  georeferenced: true,
  acquiredAt: '2025-11-15T05:30:00Z',
  sensorHint: 'Sentinel-2A',
  modality: 'MULTISPECTRAL',
  modalityConfidence: 0.95,
  modalityEvidence: ['Optical platform keyword in metadata', '4 bands consistent with multispectral'],
  bandStats: opticalBands,
  previewUrl: '/samples/preview_optical.png',
  thumbUrl: '/samples/thumb_optical.png',
};

const mockSarImage: ImageMeta = {
  role: 'sar',
  filename: 'sentinel1_bangalore_2025.tif',
  driver: 'GTiff',
  width: 3300, height: 3300, bandCount: 2,
  dtypes: ['float32', 'float32'],
  crs: 'EPSG:32643',
  transform: [10, 0, 500100, 0, -10, 1449900],
  boundsWgs84: [77.46, 12.86, 77.84, 13.24],
  gsdM: 10.0,
  nodata: null,
  georeferenced: true,
  acquiredAt: '2025-11-14T00:15:00Z',
  sensorHint: 'Sentinel-1A',
  modality: 'SAR',
  modalityConfidence: 0.94,
  modalityEvidence: ['SAR platform/polarisation keyword in metadata', '2 band(s) consistent with SAR polarisations', 'High coefficient of variation (0.90) indicates speckle'],
  bandStats: sarBands,
  previewUrl: '/samples/preview_sar.png',
  thumbUrl: '/samples/thumb_sar.png',
};

const mockT1Image: ImageMeta = {
  ...mockOpticalImage,
  role: 't1',
  filename: 'cartosat2s_ahmedabad_2024.tif',
  acquiredAt: '2024-03-10T05:00:00Z',
  sensorHint: 'Cartosat-2S',
  gsdM: 2.0,
  width: 8192, height: 8192,
  modality: 'OPTICAL',
  modalityConfidence: 0.88,
  bandStats: opticalBands.slice(0, 3),
  bandCount: 3,
};

const mockT2Image: ImageMeta = {
  ...mockT1Image,
  role: 't2',
  filename: 'cartosat2s_ahmedabad_2026.tif',
  acquiredAt: '2026-06-22T05:00:00Z',
};

const mockSingleImage: ImageMeta = {
  ...mockOpticalImage,
  role: 'single',
  filename: 'vrsbench_sample_0042.png',
};

// ─── Compatibility Reports ───
const crossModalCompatibility: CompatibilityReport = {
  verdict: 'PASS',
  checks: [
    { id: 'c1', title: 'Image Count', status: 'PASS', detail: '2 image(s) provided, 2 expected for CROSS_MODAL' },
    { id: 'c2', title: 'Modality Pairing', status: 'PASS', detail: 'Detected [MULTISPECTRAL, SAR]; cross-modal analysis requires one SAR and one optical/multispectral image' },
    { id: 'c3', title: 'CRS Match', status: 'PASS', detail: 'EPSG:32643 vs EPSG:32643' },
    { id: 'c4', title: 'Spatial Overlap', status: 'PASS', detail: '97.2% of image 1 footprint is covered by image 2' },
    { id: 'c5', title: 'GSD Ratio', status: 'PASS', detail: '10.00 m vs 10.00 m (ratio 1.00); no resampling required' },
    { id: 'c6', title: 'Co-Registration', status: 'PASS', detail: 'Estimated misregistration 1.40 px (normalised error 0.012)' },
  ],
  targetCrs: 'EPSG:32643',
  targetGsdM: 10.0,
  overlapFraction: 0.972,
  coregShiftPx: 1.4,
};

const biTemporalCompatibility: CompatibilityReport = {
  verdict: 'WARN',
  checks: [
    { id: 'c1', title: 'Image Count', status: 'PASS', detail: '2 image(s) provided, 2 expected for BI_TEMPORAL' },
    { id: 'c2', title: 'Modality Pairing', status: 'PASS', detail: 'Detected [OPTICAL, OPTICAL]; matching modalities for bi-temporal comparison' },
    { id: 'c3', title: 'CRS Match', status: 'PASS', detail: 'EPSG:32643 vs EPSG:32643' },
    { id: 'c4', title: 'Spatial Overlap', status: 'PASS', detail: '99.1% of image 1 footprint is covered by image 2' },
    { id: 'c5', title: 'GSD Ratio', status: 'PASS', detail: '2.00 m vs 2.00 m (ratio 1.00); no resampling required' },
    { id: 'c6', title: 'Co-Registration', status: 'WARN', detail: 'Estimated misregistration 3.20 px (normalised error 0.045)', remedy: 'Consider co-registering the pair to within ~2 px for reliable change detection' },
  ],
  targetCrs: 'EPSG:32643',
  targetGsdM: 2.0,
  overlapFraction: 0.991,
  coregShiftPx: 3.2,
};

const singleCompatibility: CompatibilityReport = {
  verdict: 'PASS',
  checks: [
    { id: 'c1', title: 'Image Count', status: 'PASS', detail: '1 image(s) provided, 1 expected for SINGLE' },
  ],
  targetCrs: 'EPSG:32643',
  targetGsdM: 10.0,
  overlapFraction: null,
  coregShiftPx: null,
};

// ─── Mock Scenes ───
export const mockScenes: Scene[] = [
  {
    id: 'scn_crossmodal_01',
    workspaceId: 'ws_demo',
    name: 'Bangalore Urban — Optical + SAR',
    inputConfig: 'CROSS_MODAL',
    status: 'READY',
    benchmarkMode: false,
    georeferenced: true,
    modalities: ['MULTISPECTRAL', 'SAR'],
    images: [mockOpticalImage, mockSarImage],
    compatibility: crossModalCompatibility,
    createdAt: '2026-08-20T10:30:00Z',
  },
  {
    id: 'scn_bitemporal_01',
    workspaceId: 'ws_demo',
    name: 'Ahmedabad Expansion — 2024 vs 2026',
    inputConfig: 'BI_TEMPORAL',
    status: 'READY',
    benchmarkMode: false,
    georeferenced: true,
    modalities: ['OPTICAL', 'OPTICAL'],
    images: [mockT1Image, mockT2Image],
    compatibility: biTemporalCompatibility,
    createdAt: '2026-08-18T14:15:00Z',
  },
  {
    id: 'scn_single_01',
    workspaceId: 'ws_demo',
    name: 'VRSBench Sample — Scene 0042',
    inputConfig: 'SINGLE',
    status: 'READY',
    benchmarkMode: true,
    georeferenced: false,
    modalities: ['OPTICAL'],
    images: [mockSingleImage],
    compatibility: singleCompatibility,
    createdAt: '2026-08-22T09:00:00Z',
  },
  {
    id: 'scn_validating_01',
    workspaceId: 'ws_demo',
    name: 'RISAT Pair — Processing',
    inputConfig: 'CROSS_MODAL',
    status: 'VALIDATING',
    benchmarkMode: false,
    georeferenced: true,
    modalities: ['OPTICAL', 'SAR'],
    images: [mockOpticalImage, mockSarImage],
    compatibility: { verdict: 'PASS', checks: [], targetCrs: null, targetGsdM: null, overlapFraction: null, coregShiftPx: null },
    createdAt: '2026-08-24T16:00:00Z',
  },
  {
    id: 'scn_incompatible_01',
    workspaceId: 'ws_demo',
    name: 'Failed Pair — No Overlap',
    inputConfig: 'BI_TEMPORAL',
    status: 'INCOMPATIBLE',
    benchmarkMode: false,
    georeferenced: true,
    modalities: ['OPTICAL', 'OPTICAL'],
    images: [mockT1Image, mockT2Image],
    compatibility: {
      verdict: 'FAIL',
      checks: [
        { id: 'c1', title: 'Image Count', status: 'PASS', detail: '2 image(s) provided, 2 expected for BI_TEMPORAL' },
        { id: 'c4', title: 'Spatial Overlap', status: 'FAIL', detail: '12.3% of image 1 footprint is covered by image 2', remedy: 'Upload images covering the same area' },
      ],
      targetCrs: 'EPSG:32643',
      targetGsdM: 2.0,
      overlapFraction: 0.123,
      coregShiftPx: null,
    },
    createdAt: '2026-08-19T11:00:00Z',
  },
];

// ─── Mock Trace Steps ───
const mockCrossModalTraceSteps: TraceStep[] = [
  {
    id: 's1', tool: 'coreg_check', model: null,
    paramsRequested: {}, paramsApplied: {},
    status: 'OK', durationMs: 412, confidence: 0.97,
    outputSummary: 'shift 1.4 px, overlap 97%',
  },
  {
    id: 's2', tool: 'sar_optical_fuse', model: 'M5 rs-fusion-head@v0.2.0',
    paramsRequested: { targets: ['water', 'built_up'] },
    paramsApplied: { targets: ['water', 'built_up'], agreement_only: false },
    status: 'OK', durationMs: 8140, confidence: 0.81,
    outputSummary: 'water 11.3% agreed, built-up 24.8% agreed, conflict 2.1%',
    artifacts: ['water_mask.tif', 'built_mask.tif', 'conflict_mask.tif'],
  },
  {
    id: 's3', tool: 'geo_stats', model: null,
    paramsRequested: { mask_ref: 's2.artifacts.water_mask', units: 'ha' },
    paramsApplied: { mask_ref: 's2.artifacts.water_mask', units: 'ha' },
    status: 'OK', durationMs: 64, confidence: 1.0,
    outputSummary: '1,842.6 ha water',
  },
  {
    id: 's4', tool: 'rs_vqa', model: 'M2 rs-vlm-qwen2vl-lora@v0.3.1',
    paramsRequested: { question: 'Use the optical and SAR images together to identify built-up and water-covered regions.' },
    paramsApplied: { question: 'Use the optical and SAR images together to identify built-up and water-covered regions.', max_new_tokens: 64, self_consistency: 3 },
    status: 'OK', durationMs: 9155, confidence: 0.78,
    outputSummary: 'answer produced (37 tokens)',
  },
];

// ─── Mock Evidence Layers ───
const mockEvidenceLayers: EvidenceLayer[] = [
  {
    id: 'ev1', type: 'mask', label: 'Water (both sensors agree)',
    colour: '#38bdf8', sourceStep: 's2',
    pngUrl: '/samples/preview_optical.png',
    stats: { area_ha: 1842.6, fraction: 0.113 },
  },
  {
    id: 'ev2', type: 'mask', label: 'Built-up (both sensors agree)',
    colour: '#f59e0b', sourceStep: 's2',
    pngUrl: '/samples/preview_optical.png',
    stats: { area_ha: 4048.2, fraction: 0.248 },
  },
  {
    id: 'ev3', type: 'mask', label: 'Optical-SAR Conflict',
    colour: '#a855f7', sourceStep: 's2',
    pngUrl: '/samples/preview_optical.png',
    stats: { area_ha: 342.8, fraction: 0.021 },
  },
];

// ─── Mock Confidence ───
const mockConfidence: Confidence = {
  value: 0.83,
  band: 'HIGH',
  basis: 'weighted mean over 4 tools, 4/4 steps completed',
  contributions: [
    { tool: 'coreg_check', confidence: 0.97, weight: 0.2 },
    { tool: 'sar_optical_fuse', confidence: 0.81, weight: 1.0 },
    { tool: 'geo_stats', confidence: 1.0, weight: 0.1 },
    { tool: 'rs_vqa', confidence: 0.78, weight: 1.0 },
  ],
};

// ─── Mock Execution Trace ───
export const mockTrace: ExecutionTrace = {
  traceId: 'trc_9f2c_demo',
  sceneId: 'scn_crossmodal_01',
  query: 'Use the optical and SAR images together to identify built-up and water-covered regions.',
  startedAt: '2026-08-20T11:41:02.113Z',
  finishedAt: '2026-08-20T11:41:19.884Z',
  durationMs: 17771,
  status: 'COMPLETE',
  task: {
    selected: 'CROSS_MODAL_ANALYSIS',
    classifierConfidence: 0.91,
    evidence: ['cross-modal pair supplied', "query contains 'together'"],
  },
  inputs: {
    inputConfig: 'CROSS_MODAL',
    images: [
      { role: 'optical', modality: 'MULTISPECTRAL', filename: 'sentinel2_bangalore_2025.tif' },
      { role: 'sar', modality: 'SAR', filename: 'sentinel1_bangalore_2025.tif' },
    ],
    compatibility: crossModalCompatibility,
  },
  plan: { backend: 'rules', stepCount: 4 },
  steps: mockCrossModalTraceSteps,
  fusion: { mode: 'template', groundingCheck: 'PASS', unsupportedNumbers: [] },
  confidence: mockConfidence,
  warnings: [],
};

// ─── Mock Query Results ───
export const mockQueryResults: QueryResult[] = [
  {
    queryId: 'qry_crossmodal_01',
    sceneId: 'scn_crossmodal_01',
    query: 'Use the optical and SAR images together to identify built-up and water-covered regions.',
    answer: 'Analysis of the co-registered optical (Sentinel-2) and SAR (Sentinel-1) imagery reveals:\n\n**Water bodies:** 11.3% of the scene (1,842.6 ha) is identified as water with agreement between both sensors. The water bodies are concentrated in the eastern portion of the scene.\n\n**Built-up area:** 24.8% of the scene (4,048.2 ha) is classified as built-up with inter-sensor agreement, predominantly in the central and western regions.\n\n**Conflict regions:** 2.1% of the scene (342.8 ha) shows disagreement — these regions appear dark in optical imagery but bright in SAR, indicating they are likely shadow or cloud shadow rather than water.',
    abstained: false,
    evidence: mockEvidenceLayers,
    confidence: mockConfidence,
    trace: mockTrace,
    createdAt: '2026-08-20T11:41:19.884Z',
  },
];

// ─── Mock Abstention ───
export const mockAbstentionResult: QueryResult = {
  queryId: 'qry_abstain_01',
  sceneId: 'scn_single_01',
  query: 'What changed between these two dates?',
  answer: null,
  abstained: true,
  refusal: {
    problems: [
      {
        code: 'WRONG_INPUT_CONFIG',
        detail: "'CHANGE_DESCRIPTION' needs [BI_TEMPORAL], you supplied SINGLE",
        remedy: 'Upload a second image acquired at a different date.',
      },
    ],
  },
  evidence: [],
  confidence: { value: 0, band: 'LOW', basis: 'no tool produced a usable result', contributions: [] },
  trace: {
    ...mockTrace,
    traceId: 'trc_abstain_demo',
    status: 'REFUSED',
    steps: [],
    confidence: { value: 0, band: 'LOW', basis: 'no tool produced a usable result', contributions: [] },
  },
  createdAt: '2026-08-22T09:05:00Z',
};

// ─── Suggested Queries by Input Config (§4.5) ───
export const suggestedQueries: Record<InputConfig, string[]> = {
  SINGLE: [
    'Describe the land cover and major objects in this image',
    'Highlight the water body in the north',
    'How many buildings are visible?',
  ],
  CROSS_MODAL: [
    'Use the optical and SAR images together to identify built-up and water-covered regions',
    'Which dark regions in the optical image are water rather than shadow?',
    'Compare the information from both sensors for this area',
  ],
  BI_TEMPORAL: [
    'What changed between these two dates and where?',
    'Has the built-up area increased, decreased, or remained unchanged?',
    'Describe the most significant changes visible between the two acquisitions',
  ],
};
