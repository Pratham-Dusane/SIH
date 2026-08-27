# SatQuery AI - Product Requirements Document
### Agentic Vision-Language Assistant for Multimodal Remote Sensing | ISRO / SAC Problem Statement
**Version:** 1.0  
**Audience:** Coding Agent / Developer  
**Stack:** Next.js · FastAPI · Google Cloud · PyTorch · Qwen2-VL · rasterio · Remote-sensing model zoo  

problem stmt-
SatQuery AI - An Interactive Vision-Language Assistant for Multimodal Remote Sensing Image Analysis through Text Queries

Remote-sensing AI today ships as isolated single-task apps (land-cover classification, object detection, VQA, change detection). Each demands that the user already understands satellite-data characteristics, GIS workflows, model selection and task parameters. A non-expert cannot ask a plain question and get a trustworthy answer.

Worse, most operational questions cannot be answered from one optical image. Evidence is spread across observations: optical/multispectral carries spectral and contextual information, SAR carries structural information and sees through cloud at night, and only multitemporal pairs reveal change. A general-purpose LLM or VLM without remote-sensing adaptation cannot do any of this reliably.

Objective
Build an agentic, query-driven assistant that accepts single images, co-registered optical-SAR pairs, and bi-temporal pairs, interprets a natural-language query, validates the inputs, selects and executes the right remote-sensing specialist models, fuses their outputs, and returns an evidence-grounded answer with an auditable execution trace.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Repository Structure](#3-repository-structure)
4. [Phase 1 - Frontend Foundation](#4-phase-1--frontend-foundation)
5. [Phase 2 - Authentication & Workspace Management](#5-phase-2--authentication--workspace-management)
6. [Phase 3 - Ingestion, Validation & Geospatial Pre-processing](#6-phase-3--ingestion-validation--geospatial-pre-processing)
7. [Phase 4 - Remote-Sensing Adaptation (Mandatory)](#7-phase-4--remote-sensing-adaptation-mandatory)
8. [Phase 5 - Specialist Tool Registry](#8-phase-5--specialist-tool-registry)
9. [Phase 6 - Agentic Controller](#9-phase-6--agentic-controller)
10. [Phase 7 - Evidence, Outputs & Reporting](#10-phase-7--evidence-outputs--reporting)
11. [Phase 8 - Evaluation Harness & Benchmarks](#11-phase-8--evaluation-harness--benchmarks)
12. [Phase 9 - Advanced & Differentiating Features](#12-phase-9--advanced--differentiating-features)
13. [Data Models](#13-data-models)
14. [API Reference](#14-api-reference)
15. [Environment Variables](#15-environment-variables)
16. [Implementation Order](#16-implementation-order)
17. [Deployment & Hosting on Google Cloud (do this last)](#17-deployment--hosting-on-google-cloud-do-this-last)

---

## 1. Project Overview

### 1.1 Product Name
**SatQuery AI** - An Interactive Agentic Vision-Language Assistant for Multimodal Remote-Sensing Image Analysis

### 1.2 Mission Statement
SatQuery AI is not a single fine-tuned VLM with a chat box in front of it. It is an **agentic controller over a registry of remote-sensing specialist models**. It reads the query, inspects the actual rasters, decides which specialists can answer it, runs them in sequence, fuses their outputs into one answer, attaches pixel-level and geo-referenced evidence, estimates confidence, and emits an auditable execution trace of exactly which model ran with which parameters. Every claim it makes is traceable to a tool output.

### 1.3 Core Problem Statement
Operational remote-sensing questions ("did built-up area grow here?", "which of these dark regions is water and which is shadow?") require multiple sensors, multiple dates, and multiple specialist models. Existing solutions are single-task, expert-only, and give ungrounded answers. Non-experts are locked out of their own data.

### 1.4 Target Users
- **Disaster response / agriculture / forestry officers** - ask operational questions in plain language, need an answer and a map, not a model zoo
- **Urban planning & infrastructure analysts** - need before/after change evidence with quantified area
- **GIS analysts** - need the specialist model output, the parameters used, and a GeoTIFF/GeoJSON they can pull into QGIS
- **Evaluators (ISRO/SAC)** - need reproducible benchmark scores and a visible execution trace, not internal reasoning text

### 1.5 Mandatory Requirement Compliance Map

Every row here is graded. A copilot must not mark a phase complete until its row is satisfied.

| # | Mandatory requirement | Implemented by | Section |
|---|----------------------|----------------|---------|
| # | Mandatory requirement | Implemented by | Section |
|---|----------------------|----------------|---------|
| R1 | At least one visual/VL component fine-tuned on BigEarthNet.txt or open-source RS data | **Not attempted — disclosed.** Phase 4 was replaced with hosted general-purpose VLMs (GPT-4V / Gemini Pro Vision / Claude vision) + Google Earth Engine, with no fine-tuning. See 7.0 for the explicit trade-off rationale. | 7 |
| R2 | Single-image VQA (mandatory) | `rs_vqa` tool -> hosted VLM API | 8.3.1 |
| R3 | One additional single-image task (captioning OR grounding) | **Both** built: `rs_caption` -> hosted VLM API, `rs_ground` -> hosted VLM API (box parsed from text, no dedicated detector) | 8.3.2, 8.3.3 |
| R4 | Change description OR change-VQA from bi-temporal pair (mandatory) | **Both** built: `change_describe`, `change_vqa` -> hosted VLM API | 8.3.5, 8.3.6 |
| R5 | Spatial change map where reference masks available (optional) | `change_detect` -> Google Earth Engine (NDVI/NDBI differencing + prebuilt change algorithms), exported as GeoTIFF | 8.3.4 |
| R6 | Cross-modal optical-SAR complementary extraction | `sar_optical_fuse` -> deterministic index/backscatter agreement only (no learned fusion head); Sentinel-1 GRD via GEE where in-catalog | 8.3.7 |
| R7 | Agentic selection, sequencing, execution of tools | `agent/` controller: classifier -> gate -> planner -> executor -> fusion | 9 |
| R8 | Input count/modality/format/metadata/compatibility validation | `services/ingest/compatibility_checker.py` + `InputGate` | 6.4, 9.3 |
| R9 | Only permitted task parameters configurable | Pydantic `extra="forbid"` param schemas + registry whitelist | 8.4 |
| R10 | Combine textual + spatial outputs, estimate confidence, return visual evidence | `agent/fusion.py`, `agent/confidence.py`, `services/evidence/` | 9.6, 9.7, 10.1 |
| R11 | Auditable execution summary (task, model/tool names, key parameters) | `ExecutionTrace` written to Firestore + downloadable JSON | 9.8 |
| R12 | GeoTIFF/TIFF support; PNG/JPEG only for prescribed benchmarks | `raster_reader.py` format gate with `benchmark_mode` flag | 6.2, 6.7 |
| R13 | Interactive GUI/web app, downloadable reports | Next.js workspace + PDF/JSON/GeoTIFF/GeoJSON export | 4, 10.4 |

**R1 is knowingly unmet in this version.** This was a deliberate scope trade-off (speed + real GEE-backed product value over a training pipeline), not an oversight — see 7.0. Do not word-game this in the submission; state it as not attempted.

### 1.6 Non-Negotiable Design Rules

These constrain every implementation decision downstream. Do not violate them for convenience.

1. **No ungrounded claims.** The answer synthesizer may only restate facts that appear in tool outputs. Any number in the final answer must be traceable to a tool result (enforced programmatically in `agent/fusion.py`, see 9.6).
2. **The planner LLM is not the perception system — MODIFIED, PARTIALLY VIOLATED.** This rule is upheld for the planner itself (it still receives metadata only) and for the deterministic + GEE tools (which take AOI bounds/dates, never raw pixels — GEE queries its own catalog, not the uploaded raster). It is **knowingly broken** for the VLM-backed tools (`rs_vqa`, `rs_caption`, `rs_ground`, `change_describe`, `change_vqa`), which now send preview pixels to a hosted general-purpose VLM. This is the direct cause of the R1 failure above; do not paper over it.
3. **Offline-capable evaluation.** The ISRO/SAC evaluation set may be run in an environment without external API access. Every path required for evaluation must work with `PLANNER_BACKEND=local` (rule-based + local classifier). Cloud LLM planning is an enhancement, never a dependency. **GEE and the hosted VLM API are both online, quota-limited services and cannot run in the `--network none` offline eval container (17.14).** Every tool that depends on either must declare `offline_capable=False` in its `ToolSpec` (8.1) and degrade to a stated `NOT_EVALUATED_OFFLINE` result rather than fail the run — see 11.5 for the required dual-path handling this now demands.
4. **Geospatial truth is preserved end-to-end.** CRS, transform, and nodata travel with every intermediate array. Masks are exported in the source CRS. Areas are computed from the actual pixel size, never assumed to be 10 m.
5. **Local-first development.** Phases 1-9 must run on a laptop with `STORAGE_BACKEND=local` and `DB_BACKEND=sqlite`. GCP is a deployment target added at the end (Section 17), not a build prerequisite.

---

## 2. Architecture Overview

```
+---------------------------------------------------------------------+
|                        FRONTEND (Next.js 14)                        |
|  Scene Upload . Compatibility Panel . Query Console . Evidence      |
|  Canvas . Execution Trace . Confidence . Report Export              |
+---------------------------+-----------------------------------------+
                            | HTTPS REST + SSE (token/step streaming)
+---------------------------v-----------------------------------------+
|                     API GATEWAY (FastAPI, CPU)                      |
|            Cloud Run . auth . scenes . query . reports              |
+--+-----------+-------------+---------------+----------------+-------+
   |           |             |               |                |
   v           v             v               v                v
 Firestore   Cloud        AGENTIC         VLM GATEWAY       Cloud Tasks
 (sessions,  Storage      CONTROLLER      (FastAPI, CPU;    (async jobs:
  traces)    (rasters,    classifier ->   thin wrapper       eval runs,
             masks,       gate ->         over hosted        batch)
             previews)    planner ->      GPT-4V / Gemini /
                          executor ->     Claude vision)
                          fusion
                             |
                             v
                DETERMINISTIC GEO TOOLS + GOOGLE EARTH ENGINE
                (rasterio/numpy/skimage: indices, backscatter,
                 co-registration, areas; GEE: Dynamic World /
                 ESA WorldCover land cover, Sentinel-1 GRD,
                 NDVI/NDBI time-series change)
```

### 2.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript | SSR, file-based routing, React ecosystem |
| Styling | Tailwind CSS + shadcn/ui | Speed, consistent primitives |
| Geo display | react-leaflet + `ImageOverlay` + GeoJSON layers | Georeferenced overlays without a tile server |
| Non-geo display | HTML canvas viewer | Benchmark PNG/JPEG have no CRS |
| Bi-temporal UI | react-compare-slider | Swipe compare for T1/T2 |
| Charts | Recharts | Confidence bars, class distributions, change stats |
| State | Zustand | Simple scene/query store, no boilerplate |
| API | FastAPI (Python 3.11) | Async, Pydantic validation, Python ML ecosystem |
| Auth | Firebase Auth | Google OAuth, minimal setup |
| Metadata DB | Firestore (SQLite locally) | Flexible docs, real-time trace streaming |
| Object storage | Google Cloud Storage (local FS in dev) | Large GeoTIFFs |
| Raster I/O | rasterio + GDAL, numpy, scikit-image | Industry standard geospatial stack |
| VLM | Hosted API (GPT-4V / Gemini 1.5-2.0 Pro Vision / Claude vision) | No training loop; strong out-of-the-box fluency; swapped in behind the same `ToolResult` contract |
| Geospatial analysis | Google Earth Engine (`earthengine-api`, `ee.Initialize()`) | Global Dynamic World / ESA WorldCover land cover, Sentinel-1 GRD backscatter, NDVI/NDBI differencing — real classification/change without training anything |
| Change (reference) | GEE pre-built change algorithms + NDVI/NDBI differencing | Won't match a trained Siamese U-Net's IoU on a labeled benchmark, but is a defensible real-world result |
| Async jobs | Cloud Tasks -> Cloud Run Jobs | Batch eval, long inference |
| Eval logs | BigQuery | Benchmark run history, leaderboards |
| Reports | WeasyPrint (HTML->PDF, pure Python) | No Node dependency in the backend image |

### 2.2 Request Lifecycle (single query)

1. User uploads 1 or 2 rasters -> frontend requests a signed upload URL -> uploads directly to GCS (or local disk in dev).
2. `POST /api/scenes/confirm` -> backend opens each raster with rasterio, extracts metadata, detects modality, generates 8-bit preview PNGs and a thumbnail.
3. Backend runs the **compatibility check** (pair type, CRS, overlap, GSD ratio, co-registration shift) and returns a `CompatibilityReport`. The UI renders it as a pass/warn/fail panel before any query is allowed.
4. User types a natural-language query -> `POST /api/query` (SSE stream opens).
5. **Task classifier** maps query + input configuration to a `TaskType`.
6. **Input gate** verifies the task is executable with the provided inputs; if not, returns a structured refusal naming exactly what is missing.
7. **Planner** emits a JSON `ExecutionPlan` referencing only registry tools and whitelisted parameters.
8. **Executor** runs the plan as a small DAG, streaming step events to the UI, passing artifacts (masks, boxes, embeddings) between steps.
9. **Fusion** composes the final answer from tool outputs only; **confidence** aggregates per-tool confidences; low aggregate confidence triggers abstention wording.
10. Answer + evidence layers + `ExecutionTrace` are persisted; UI renders overlays, confidence, and the trace timeline; report/export endpoints become available.

### 2.3 Backend Inventory

| ID | Component | Backend | Serves tools | Where | Offline-capable? |
|----|-----------|---------|--------------|-------|-------------------|
| V1 | Hosted VLM (GPT-4V / Gemini Pro Vision / Claude vision) | Third-party API, RS-analyst system prompt (reused from old 7.3 `SYSTEM`) | `rs_vqa`, `rs_caption`, `rs_ground`, `change_describe`, `change_vqa` | vlm-gateway | **No** |
| G1 | Google Earth Engine — Dynamic World / ESA WorldCover | `ee.Initialize()` + service account | `rs_classify`-equivalent land-cover stats | backend (CPU, online) | **No** |
| G2 | Google Earth Engine — Sentinel-1 GRD, Sentinel-2 NDVI/NDBI + prebuilt change algorithms | `ee.Initialize()` + service account | `change_detect` | backend (CPU, online) | **No** |
| - | Deterministic geo tools | rasterio/numpy/skimage | `spectral_index`, `sar_water_mask`, `geo_stats`, `coreg_check` | backend (CPU) | **Yes** |

**R1 is not satisfied by any of the above** — none of these involve fine-tuning or RS-specific adaptation. This table replaces the old M1-M5 inventory; there are no `model_card.json` training lineages to show a judge for R1.

### 2.4 Local-First Development Contract

`core/config.py` exposes two switches that every other module must respect:

```python
STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")   # local | gcs
DB_BACKEND      = os.getenv("DB_BACKEND", "sqlite")       # sqlite | firestore
```

`core/storage.py` defines a `Storage` protocol (`put`, `get`, `signed_url`, `exists`, `delete`) with `LocalStorage` and `GCSStorage` implementations. `core/db.py` does the same for documents. **No module outside `core/` may import `google.cloud.*` directly.** This is what keeps Section 17 a deployment step instead of a rewrite.

---

## 3. Repository Structure

```
satquery-ai/
├── frontend/                          # Next.js 14 application
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── dashboard/page.tsx         # Scene library + recent queries
│   │   ├── scene/
│   │   │   ├── new/page.tsx           # Upload + compatibility wizard
│   │   │   └── [sceneId]/
│   │   │       ├── page.tsx           # Analysis workspace (canvas + chat)
│   │   │       └── trace/[queryId]/page.tsx
│   │   ├── benchmarks/page.tsx        # Eval runs + leaderboard
│   │   └── api/                       # thin BFF routes only
│   ├── components/
│   │   ├── ui/                        # shadcn primitives
│   │   ├── scene/
│   │   │   ├── SceneUploader.tsx
│   │   │   ├── InputModeTabs.tsx      # single | cross-modal | bi-temporal
│   │   │   ├── CompatibilityPanel.tsx
│   │   │   ├── BandInspector.tsx
│   │   │   └── SceneMetaCard.tsx
│   │   ├── query/
│   │   │   ├── QueryConsole.tsx
│   │   │   ├── SuggestedQueries.tsx
│   │   │   ├── AnswerCard.tsx
│   │   │   └── AbstentionNotice.tsx
│   │   ├── evidence/
│   │   │   ├── EvidenceCanvas.tsx     # leaflet ImageOverlay + layers
│   │   │   ├── BoxLayer.tsx
│   │   │   ├── MaskLayer.tsx
│   │   │   ├── ChangeMapLayer.tsx
│   │   │   ├── SwipeCompare.tsx
│   │   │   └── LayerControls.tsx
│   │   ├── trace/
│   │   │   ├── ExecutionTimeline.tsx
│   │   │   ├── ToolStepCard.tsx
│   │   │   └── ConfidenceMeter.tsx
│   │   └── layout/{Sidebar.tsx,TopNav.tsx}
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── api.ts                     # typed API client + SSE helper
│   │   ├── geo.ts                     # pixel<->latlng, bounds helpers
│   │   ├── store.ts                   # zustand scene/query store
│   │   └── types.ts
│   └── public/
│
├── backend/                           # FastAPI orchestration API (CPU)
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── scenes.py
│   │   ├── uploads.py
│   │   ├── query.py                   # SSE streaming endpoint
│   │   ├── tools.py                   # registry introspection
│   │   ├── reports.py
│   │   └── benchmarks.py
│   ├── agent/
│   │   ├── controller.py              # top-level orchestration
│   │   ├── task_classifier.py
│   │   ├── input_gate.py
│   │   ├── planner.py                 # LLM planner + rule-based fallback
│   │   ├── plan_schema.py
│   │   ├── executor.py                # DAG runner
│   │   ├── fusion.py                  # grounded answer synthesis
│   │   ├── confidence.py
│   │   └── trace.py
│   ├── tools/
│   │   ├── base.py                    # Tool ABC + ToolSpec
│   │   ├── registry.py
│   │   ├── rs_vqa.py
│   │   ├── rs_caption.py
│   │   ├── rs_ground.py
│   │   ├── rs_classify.py
│   │   ├── change_detect.py
│   │   ├── change_describe.py
│   │   ├── change_vqa.py
│   │   ├── sar_optical_fuse.py
│   │   ├── spectral_index.py
│   │   ├── sar_water_mask.py
│   │   ├── geo_stats.py
│   │   └── coreg_check.py
│   ├── services/
│   │   ├── ingest/
│   │   │   ├── raster_reader.py
│   │   │   ├── modality_detector.py
│   │   │   ├── compatibility_checker.py
│   │   │   ├── preprocessor.py
│   │   │   └── preview.py
│   │   ├── evidence/
│   │   │   ├── overlay_renderer.py
│   │   │   ├── geo_export.py          # GeoTIFF + GeoJSON writers
│   │   │   └── stats.py
│   │   ├── inference/
│   │   │   └── model_client.py        # HTTP client to model-server
│   │   └── reporting/
│   │       ├── report_builder.py
│   │       └── templates/report.html
│   ├── core/
│   │   ├── config.py
│   │   ├── storage.py                 # local | gcs
│   │   ├── db.py                      # sqlite | firestore
│   │   ├── auth.py
│   │   └── logging.py
│   ├── models/                        # Pydantic schemas
│   │   ├── scene.py
│   │   ├── query.py
│   │   ├── plan.py
│   │   └── trace.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── model-server/                      # GPU inference service
│   ├── server.py                      # FastAPI: /vqa /caption /ground /change /classify /fuse
│   ├── loaders.py                     # lazy singleton model loading
│   ├── adapters/
│   │   ├── rs_clip.py                 # M1
│   │   ├── rs_vlm.py                  # M2 (vLLM or transformers)
│   │   ├── rs_ground.py               # M3
│   │   ├── rs_change.py               # M4
│   │   └── rs_fusion.py               # M5
│   ├── preprocessing.py               # modality-aware tensor prep
│   ├── Dockerfile
│   └── requirements.txt
│
├── training/                          # Phase 4 - RS adaptation
│   ├── data/
│   │   ├── bigearthnet.py             # BigEarthNet.txt dataset
│   │   ├── rsvqa.py
│   │   ├── vrsbench.py
│   │   ├── cdvqa.py
│   │   └── change_pairs.py            # LEVIR-CD / S2Looking / OSCD
│   ├── train_rsclip.py                # M1 contrastive + SAR stem
│   ├── train_vlm_lora.py              # M2 LoRA SFT
│   ├── train_grounding.py             # M3
│   ├── train_change.py                # M4
│   ├── train_fusion_head.py           # M5
│   ├── export_model_card.py
│   └── configs/*.yaml
│
├── eval/                              # Phase 8 - benchmarks
│   ├── run_benchmark.py               # CLI entrypoint
│   ├── metrics/{vqa.py,caption.py,grounding.py,change.py}
│   ├── adapters/{vrsbench.py,rsvqa.py,cdvqa.py,isro_sac.py}
│   ├── normalize.py                   # score normalisation + composite
│   └── reports/
│
├── infra/                             # GCP config (Section 17)
│   ├── cloudrun-api.yaml
│   ├── cloudrun-model.yaml
│   ├── firestore.rules
│   ├── storage.cors.json
│   └── deploy.sh
│
├── notebooks/                         # demonstration notebooks (deliverable)
│   ├── 01_ingest_and_validate.ipynb
│   ├── 02_rs_adaptation_demo.ipynb
│   └── 03_agentic_end_to_end.ipynb
│
├── docker-compose.yml                 # local: backend + model-server + minio
└── .github/workflows/deploy.yml
```

---

## 4. Phase 1 - Frontend Foundation

Build the UI shell first. Every page must render with mock data before any backend exists. Put mocks in `frontend/lib/mocks.ts` and gate them with `NEXT_PUBLIC_USE_MOCKS=true`.

### 4.1 Design System Setup

**Install dependencies:**
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app
npx shadcn@latest init
npx shadcn@latest add button card badge tabs toast dialog sheet skeleton slider tooltip progress separator scroll-area
npm install zustand recharts lucide-react framer-motion
npm install leaflet react-leaflet @types/leaflet
npm install react-compare-slider
npm install firebase
```

**Tailwind config** - extend with SatQuery brand + semantic tokens in `tailwind.config.ts`:
```typescript
theme: {
  extend: {
    colors: {
      brand: {
        50:  '#e6f7ff',
        500: '#0ea5b7',   // satellite teal
        600: '#0b8697',
        900: '#063b45',
      },
      modality: {
        optical: '#38bdf8',
        sar:     '#f59e0b',
        fused:   '#a855f7',
      },
      confidence: {
        high:   '#16a34a',   // >= 0.75
        medium: '#d97706',   // 0.45 - 0.75
        low:    '#dc2626',   // < 0.45
      },
      evidence: {
        box:     '#22d3ee',
        mask:    '#a3e635',
        change:  '#ef4444',
        nochange:'#3f3f46',
      },
    },
  },
}
```

**Global rule:** modality colour is used consistently everywhere - a SAR band chip, a SAR-sourced evidence layer and a SAR tool step in the trace all use `modality.sar`. This is how a judge visually understands that two sensors contributed to one answer.

### 4.2 Layout Components

#### `components/layout/Sidebar.tsx`
- SatQuery AI logo (top left)
- Navigation: Dashboard, New Scene, Benchmarks, Model Registry, Settings
- Each item: `lucide-react` icon + label, active-state highlight
- Bottom: user avatar + workspace name + sign out
- Collapsible to icon-only (`useState`)
- Icons: `LayoutDashboard`, `UploadCloud`, `FlaskConical`, `Boxes`, `Settings`, `LogOut`

#### `components/layout/TopNav.tsx`
- Breadcrumb: `Dashboard > Scene > scene-name`
- Right: model-server health dot (green/amber/red, polls `GET /api/health/models` every 30 s), user avatar
- Props: `breadcrumbs: {label, href}[]`

### 4.3 Dashboard Page (`app/dashboard/page.tsx`)

**Top stats row - 4 cards:**
1. Scenes Ingested (count)
2. Queries Answered (count)
3. Average Confidence (0-1 shown as %, coloured by `confidence.*` tokens)
4. Abstention Rate (% of queries where the agent declined - a low number is not automatically good; tooltip explains that abstention is a feature)

**Recent Scenes table:**
Columns: Scene Name | Input Config | Modalities | Sensor/GSD | Ingested | Status | Actions
- Input Config badge: `SINGLE`, `CROSS_MODAL`, `BI_TEMPORAL`
- Modalities: small chips coloured by `modality.*` (`OPTICAL`, `SAR`, `MS`)
- Status: `READY` (green), `VALIDATING` (amber animated), `INCOMPATIBLE` (red)
- Actions: Open Workspace, Re-validate, Delete
- Paginated, 10 rows/page, shadcn `Table`

**Quick Start card:** shown only when scene count is 0 - "Upload your first scene" with three example presets (Sentinel-2 single, S2+S1 pair, bi-temporal pair) that load bundled sample GeoTIFFs from `public/samples/`.

### 4.4 New Scene Page (`app/scene/new/page.tsx`)

Three-step wizard with a stepper header: Upload -> Validate -> Confirm.

#### Step 1 - Input Mode + Upload (`components/scene/InputModeTabs.tsx`)

Three tabs, each rendering a different uploader arrangement:

| Tab | Zones | Accepts |
|-----|-------|---------|
| **Single Image** | 1 zone | `.tif`, `.tiff` (GeoTIFF). `.png`/`.jpg` **only** when the "Benchmark sample" switch is on |
| **Cross-Modal Pair** | 2 zones, labelled `Optical / Multispectral` and `SAR` | GeoTIFF each |
| **Bi-Temporal Pair** | 2 zones, labelled `Time 1 (earlier)` and `Time 2 (later)` | GeoTIFF each, plus optional acquisition-date inputs |

`components/scene/SceneUploader.tsx`:
- Drag-and-drop dashed area, per-zone
- On file select: show filename, size, and a client-side warning if extension is not TIFF while benchmark mode is off
- Upload via signed URL with an `XMLHttpRequest` progress bar (fetch cannot report upload progress)
- After upload completes, call `POST /api/scenes/confirm` and move to Step 2

**Benchmark sample switch:** a labelled toggle reading *"This is a sample from a public benchmark (VRSBench / RSVQA / CDVQA)"*. Turning it on relaxes the format gate to PNG/JPEG and disables all geo-dependent features (area in m², GeoTIFF export, map view) with an inline explanation. This is the *only* path by which non-GeoTIFF input enters the system (R12).

#### Step 2 - Compatibility Panel (`components/scene/CompatibilityPanel.tsx`)

Renders the `CompatibilityReport` returned by the backend. Layout: two metadata columns (one per image) with a check-list between them.

**Per-image metadata card (`SceneMetaCard.tsx`):**
- Detected modality chip + detector confidence
- Driver / size (W×H) / band count / dtype
- CRS (e.g. `EPSG:32643`) and GSD in metres
- Bounds (lat/lon, rounded to 5 dp)
- Acquisition date if present in tags
- NoData value
- `BandInspector.tsx`: expandable list of bands with min/max/mean and an assigned semantic label where inferable (`B04 Red`, `VV`, `VH`)

**Check list** (each row: icon + title + one-line detail):
- CRS match / reprojection required
- Spatial overlap percentage
- GSD ratio (flag if > 2×)
- Dimension compatibility after resampling
- Co-registration shift in pixels (bi-temporal and cross-modal only)
- Modality expectation (cross-modal must be exactly one optical + one SAR)

Each row is `PASS` (green check), `WARN` (amber, proceed with note), or `FAIL` (red, blocks querying). A `FAIL` disables the Confirm button and shows exactly which condition failed and what the user can do.

#### Step 3 - Confirm
- Summary: input config, modalities, common CRS, effective GSD, overlap area
- Preview thumbnails (and a swipe compare for pairs)
- "Open Workspace" button -> `/scene/[sceneId]`

### 4.5 Analysis Workspace (`app/scene/[sceneId]/page.tsx`)

The core screen. Three-pane layout, resizable:

```
+----------------------------------+------------------------+
|                                  |  QUERY CONSOLE         |
|        EVIDENCE CANVAS           |  (chat transcript)     |
|   (leaflet map or canvas)        |                        |
|                                  |  [answer cards]        |
|   layer controls (bottom-left)   |  [confidence meter]    |
|   opacity slider, layer toggles  |  [input box]           |
+----------------------------------+------------------------+
|  EXECUTION TRACE (collapsible bottom drawer)               |
|  classify -> gate -> plan -> tool steps -> fuse            |
+------------------------------------------------------------+
```

#### `components/evidence/EvidenceCanvas.tsx`
- If the scene is georeferenced: `react-leaflet` `MapContainer` with `CRS.EPSG3857`, an `ImageOverlay` for the preview PNG placed at the scene's WGS84 bounds, and a light basemap underneath at 30% opacity so the analyst has geographic context.
- If `benchmark_mode` (no CRS): plain `<canvas>` viewer with pan/zoom via pointer events. **Same component, branch on `scene.georeferenced`.**
- Layer stack, rendered bottom to top: base image -> secondary image (SAR or T2) -> masks -> change map -> boxes -> labels.
- `LayerControls.tsx`: per-layer visibility toggle + one global opacity slider + a "base image" selector for pairs (`Optical | SAR` or `T1 | T2`).
- `SwipeCompare.tsx`: for bi-temporal scenes, a swipe handle over the two previews using `react-compare-slider`.
- Clicking a box or mask region scrolls the query console to the answer card that produced it and highlights it. Evidence and text are always linked in both directions.

#### `components/query/QueryConsole.tsx`
- Chat transcript of `{query, answer, evidence, confidence, traceId}` turns
- Input box with `Cmd+Enter` submit
- `SuggestedQueries.tsx`: chips whose contents depend on the input configuration - this teaches the user what the system can do:
  - SINGLE: "Describe the land cover and major objects in this image", "Highlight the water body in the north", "How many buildings are visible?"
  - CROSS_MODAL: "Use the optical and SAR images together to identify built-up and water-covered regions", "Which dark regions in the optical image are water rather than shadow?"
  - BI_TEMPORAL: "What changed between these two dates and where?", "Has the built-up area increased, decreased, or remained unchanged?"
- While a query streams, render step chips live as SSE events arrive (`classifying`, `validating`, `planning`, `tool:rs_ground`, `fusing`).

#### `components/query/AnswerCard.tsx`
- Answer text (markdown)
- Inline evidence chips - clicking one flashes the corresponding canvas layer
- Quantified results table when present (area in ha/km², counts, percentages)
- `ConfidenceMeter.tsx`: horizontal bar, colour from `confidence.*`, with a hover breakdown of per-tool confidences
- Footer row: "Tools used: `rs_classify`, `sar_water_mask`, `geo_stats`" + "View trace" + "Export"

#### `components/query/AbstentionNotice.tsx`
When the agent abstains, do **not** render an answer card. Render an amber notice: what was asked, why it could not be answered (missing modality / insufficient confidence / incompatible inputs), and a concrete suggested action ("upload the co-registered SAR image to answer this"). Abstention is a first-class UI state, not an error toast.

### 4.6 Execution Trace UI (`components/trace/ExecutionTimeline.tsx`)

Bottom drawer, collapsed by default, expands to a horizontal timeline. This is a graded artifact (R11) - make it legible.

Each `ToolStepCard.tsx` shows:
- Step index and tool name (monospace)
- Model ID + version (`M2 rs-vlm-qwen2vl-lora@v0.3.1`)
- Parameters actually applied (the whitelisted set, JSON, collapsible)
- Duration in ms
- Per-step confidence
- Output summary (one line: "3 boxes", "mask 12.4% positive", "answer: 'yes'")
- Input arrows showing which prior step's artifact it consumed

Header row of the drawer: classified task, input configuration, planner backend used (`local` | `vertex`), total wall time, aggregate confidence, and a "Download trace JSON" button.

### 4.7 API Client + Store

`lib/api.ts` - typed wrappers over every endpoint in Section 14, plus an SSE helper:

```typescript
export async function streamQuery(
  sceneId: string,
  query: string,
  onEvent: (e: QueryStreamEvent) => void,
): Promise<QueryResult> {
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
```

`lib/store.ts` - Zustand store holding `activeScene`, `layers` (visibility/opacity), `turns`, `activeTraceId`. Layer visibility must survive new queries so an analyst can stack evidence from several questions.

---

## 5. Phase 2 - Authentication & Workspace Management

### 5.1 Firebase Auth Setup

**Developer setup instructions:**
1. Go to https://console.firebase.google.com
2. Create a project named `satquery-prod`
3. Authentication -> Sign-in methods -> enable Google and Email/Password
4. Project Settings -> General -> Your apps -> Add web app -> copy the config object
5. Place the values in `.env.local` (Section 15)

**`lib/firebase.ts`:**
```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
```

**Backend verification (`core/auth.py`):**
```python
from fastapi import Depends, HTTPException, Header
from firebase_admin import auth as fb_auth

async def current_user(authorization: str = Header(None)) -> dict:
    if os.getenv("AUTH_DISABLED") == "true":          # local dev + eval runs
        return {"uid": "local-dev", "workspace_id": "local"}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        return fb_auth.verify_id_token(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(401, "Invalid token")
```

`AUTH_DISABLED=true` is mandatory for the offline evaluation path - the benchmark runner must never need a browser login.

### 5.2 Auth Pages
**Login** (`app/(auth)/login/page.tsx`): centered card, "Continue with Google" primary, email/password secondary, redirect to `/dashboard` on success, toast on error.  
**Middleware** (`middleware.ts`): protect `/dashboard`, `/scene`, `/benchmarks`; redirect unauthenticated users to `/login`.

### 5.3 Workspace Model
On first login, create a workspace: name (required), organisation type (dropdown: Government/ISRO, Research, Academic, Commercial, Individual), default AOI region (optional).

Firestore: `workspaces/{workspaceId}` -> `{ name, orgType, ownerId, members: [uid], defaultRegion, createdAt }`

Every scene, query and trace is scoped to a workspace. Users only see their workspace's scenes.

---

## 6. Phase 3 - Ingestion, Validation & Geospatial Pre-processing

This phase is what separates SatQuery AI from a chatbot with an image upload. Requirement R8 is graded here.

### 6.1 Upload Flow

**Frontend -> Storage (direct upload, bypassing FastAPI):**
1. Frontend calls `POST /api/uploads/signed-url` with `{ filename, contentType, sceneRole }` where `sceneRole ∈ {single, optical, sar, t1, t2}`
2. Backend returns a signed PUT URL (15-min expiry) plus the object path
3. Frontend PUTs the file directly to storage with a progress bar
4. Frontend calls `POST /api/scenes/confirm` with all uploaded object paths + declared input config
5. Backend ingests, validates, previews and returns the `CompatibilityReport`

**`core/storage.py` (backend abstraction - dev uses local disk):**
```python
from abc import ABC, abstractmethod
from datetime import timedelta
from pathlib import Path

class Storage(ABC):
    @abstractmethod
    def signed_upload_url(self, path: str, content_type: str) -> str: ...
    @abstractmethod
    def local_path(self, path: str) -> str:
        """Return a filesystem path rasterio/GDAL can open. Downloads if remote."""
    @abstractmethod
    def put_file(self, local: str, path: str) -> str: ...
    @abstractmethod
    def public_url(self, path: str) -> str: ...

class LocalStorage(Storage):
    def __init__(self, root: str = "./_data"):
        self.root = Path(root); self.root.mkdir(parents=True, exist_ok=True)

    def signed_upload_url(self, path: str, content_type: str) -> str:
        # Dev only: the frontend PUTs to our own passthrough endpoint
        return f"{os.environ['API_BASE_URL']}/api/uploads/local/{path}"

    def local_path(self, path: str) -> str:
        return str(self.root / path)

    def put_file(self, local: str, path: str) -> str:
        dest = self.root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(local, dest)
        return str(dest)

    def public_url(self, path: str) -> str:
        return f"{os.environ['API_BASE_URL']}/api/files/{path}"

class GCSStorage(Storage):
    def __init__(self, bucket: str):
        from google.cloud import storage as gcs
        self.bucket = gcs.Client().bucket(bucket)

    def signed_upload_url(self, path: str, content_type: str) -> str:
        return self.bucket.blob(path).generate_signed_url(
            version="v4", expiration=timedelta(minutes=15),
            method="PUT", content_type=content_type,
        )

    def local_path(self, path: str) -> str:
        cache = Path("/tmp/satquery") / path
        if not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            self.bucket.blob(path).download_to_filename(cache)
        return str(cache)
```

Object key convention: `workspaces/{workspaceId}/scenes/{sceneId}/{role}/{filename}`. Derived artifacts go under `.../derived/{queryId}/{artifactName}`.

### 6.2 Raster Reader (`services/ingest/raster_reader.py`)

**Purpose:** open any accepted input and extract complete, honest metadata. Never guess a value that is absent - return `None` and let the compatibility checker decide.

```python
import rasterio
from rasterio.warp import transform_bounds
import numpy as np

ALLOWED_GEO = {".tif", ".tiff"}
ALLOWED_BENCHMARK = {".png", ".jpg", ".jpeg"}

def read_metadata(path: str, benchmark_mode: bool = False) -> dict:
    ext = Path(path).suffix.lower()
    if ext in ALLOWED_BENCHMARK and not benchmark_mode:
        raise UnsupportedFormat(
            f"{ext} is accepted only for prescribed public benchmark samples. "
            "Upload GeoTIFF/TIFF, or enable benchmark mode."
        )
    if ext not in ALLOWED_GEO | ALLOWED_BENCHMARK:
        raise UnsupportedFormat(f"Unsupported format {ext}. Expected GeoTIFF/TIFF.")

    with rasterio.open(path) as src:
        georeferenced = src.crs is not None and src.transform.is_rectilinear
        bounds_wgs84 = None
        if georeferenced:
            bounds_wgs84 = list(transform_bounds(src.crs, "EPSG:4326", *src.bounds))

        band_stats = []
        for i in range(1, src.count + 1):
            arr = src.read(i, out_shape=(min(src.height, 512), min(src.width, 512)))
            arr = arr.astype("float64")
            if src.nodata is not None:
                arr = np.where(arr == src.nodata, np.nan, arr)
            band_stats.append({
                "index": i,
                "dtype": str(src.dtypes[i - 1]),
                "min": float(np.nanmin(arr)), "max": float(np.nanmax(arr)),
                "mean": float(np.nanmean(arr)), "std": float(np.nanstd(arr)),
                "description": src.descriptions[i - 1],
            })

        return {
            "driver": src.driver,
            "width": src.width, "height": src.height, "band_count": src.count,
            "dtypes": [str(d) for d in src.dtypes],
            "crs": src.crs.to_string() if src.crs else None,
            "transform": list(src.transform)[:6],
            "bounds_native": list(src.bounds) if georeferenced else None,
            "bounds_wgs84": bounds_wgs84,
            "gsd_x": abs(src.transform.a) if georeferenced else None,
            "gsd_y": abs(src.transform.e) if georeferenced else None,
            "nodata": src.nodata,
            "georeferenced": georeferenced,
            "tags": src.tags(),
            "band_stats": band_stats,
        }
```

**GSD in metres:** if the CRS is geographic (degrees, e.g. EPSG:4326), convert with `gsd_m ≈ gsd_deg * 111320 * cos(lat_center)` for x and `gsd_deg * 110540` for y. Store both `gsd_native` and `gsd_m`. Every area computation downstream uses `gsd_m`.

### 6.3 Modality Detector (`services/ingest/modality_detector.py`)

**Purpose:** decide whether a raster is OPTICAL (RGB), MULTISPECTRAL, or SAR. The user's declared role is a hint, not the truth - a mislabelled upload must be caught here, not discovered by a model producing nonsense.

**Scored heuristics (evidence-based, each contributes to a score in [0,1]):**

```python
SAR_TAG_HINTS   = ("sar", "risat", "sentinel-1", "s1a", "s1b", "radar", "vv", "vh", "hh", "hv")
OPT_TAG_HINTS   = ("cartosat", "sentinel-2", "s2a", "s2b", "landsat", "resourcesat", "liss", "msi")

def detect_modality(meta: dict) -> dict:
    evidence, sar_score, opt_score = [], 0.0, 0.0
    tag_blob = " ".join(f"{k}={v}" for k, v in meta["tags"].items()).lower()
    desc_blob = " ".join(d or "" for d in
                         [b["description"] for b in meta["band_stats"]]).lower()

    # 1. Metadata tags are the strongest signal when present
    if any(h in tag_blob or h in desc_blob for h in SAR_TAG_HINTS):
        sar_score += 0.5; evidence.append("SAR platform/polarisation keyword in metadata")
    if any(h in tag_blob for h in OPT_TAG_HINTS):
        opt_score += 0.5; evidence.append("Optical platform keyword in metadata")

    # 2. Band count: S1 GRD = 1-2 bands; S2 = 10-13; Cartosat pan = 1; RGB = 3
    n = meta["band_count"]
    if n in (1, 2):
        sar_score += 0.2; evidence.append(f"{n} band(s) consistent with SAR polarisations")
    elif n == 3:
        opt_score += 0.25; evidence.append("3 bands consistent with RGB optical")
    elif n >= 4:
        opt_score += 0.35; evidence.append(f"{n} bands consistent with multispectral")

    # 3. Statistical signature: SAR amplitude is right-skewed with speckle;
    #    optical reflectance is comparatively symmetric.
    b0 = meta["band_stats"][0]
    if b0["std"] > 0 and b0["mean"] > 0:
        cv = b0["std"] / b0["mean"]                    # coefficient of variation
        if cv > 0.8:
            sar_score += 0.25; evidence.append(f"High coefficient of variation ({cv:.2f}) indicates speckle")
        elif cv < 0.5:
            opt_score += 0.15; evidence.append(f"Low coefficient of variation ({cv:.2f}) indicates optical reflectance")

    # 4. dtype: SAR products are commonly float32; optical commonly uint8/uint16
    if meta["dtypes"][0].startswith("float"):
        sar_score += 0.1
    elif meta["dtypes"][0] in ("uint8", "uint16"):
        opt_score += 0.1

    modality = "SAR" if sar_score > opt_score else ("MULTISPECTRAL" if n >= 4 else "OPTICAL")
    conf = abs(sar_score - opt_score) / max(sar_score + opt_score, 1e-6)
    return {"modality": modality, "confidence": round(min(conf, 1.0), 3), "evidence": evidence}
```

If `confidence < 0.35`, mark the detection `AMBIGUOUS` and surface a UI prompt asking the user to confirm the modality. Never silently proceed on an ambiguous modality - a SAR image processed as optical produces confident nonsense, which is the worst possible failure mode for this system.

### 6.4 Compatibility Checker (`services/ingest/compatibility_checker.py`)

**Purpose:** requirement R8. Verify number, modality, format, metadata and compatibility of the supplied images *before* any model runs.

```python
from rasterio.warp import transform_bounds
from skimage.registration import phase_cross_correlation

FAIL, WARN, PASS = "FAIL", "WARN", "PASS"

def check_compatibility(images: list[dict], declared_config: str) -> dict:
    checks = []

    # --- C1: image count matches declared configuration -------------------
    expected = {"SINGLE": 1, "CROSS_MODAL": 2, "BI_TEMPORAL": 2}[declared_config]
    checks.append(_mk("image_count", PASS if len(images) == expected else FAIL,
                      f"{len(images)} image(s) provided, {expected} expected for {declared_config}"))

    # --- C2: modality expectation ----------------------------------------
    mods = [i["modality"]["modality"] for i in images]
    if declared_config == "CROSS_MODAL":
        has_sar = "SAR" in mods
        has_opt = any(m in ("OPTICAL", "MULTISPECTRAL") for m in mods)
        checks.append(_mk("modality_pairing", PASS if (has_sar and has_opt) else FAIL,
                          f"Detected {mods}; cross-modal analysis requires one SAR and one optical/multispectral image"))
    elif declared_config == "BI_TEMPORAL":
        same = mods[0] == mods[1]
        checks.append(_mk("modality_pairing", PASS if same else WARN,
                          f"Detected {mods}; bi-temporal comparison is most reliable with matching modalities"))

    if len(images) == 2:
        a, b = images
        geo_both = a["georeferenced"] and b["georeferenced"]

        # --- C3: CRS ------------------------------------------------------
        if geo_both:
            same_crs = a["crs"] == b["crs"]
            checks.append(_mk("crs_match", PASS if same_crs else WARN,
                              f"{a['crs']} vs {b['crs']}" + ("" if same_crs else " - image 2 will be reprojected to image 1")))
        else:
            checks.append(_mk("crs_match", WARN, "One or both images lack a CRS; geographic outputs disabled"))

        # --- C4: spatial overlap -----------------------------------------
        if geo_both:
            ov = _overlap_fraction(a, b)
            status = PASS if ov >= 0.90 else (WARN if ov >= 0.50 else FAIL)
            checks.append(_mk("spatial_overlap", status, f"{ov*100:.1f}% of image 1 footprint is covered by image 2"))

            # --- C5: GSD ratio -------------------------------------------
            r = max(a["gsd_m"], b["gsd_m"]) / max(min(a["gsd_m"], b["gsd_m"]), 1e-9)
            status = PASS if r <= 2.0 else (WARN if r <= 4.0 else FAIL)
            checks.append(_mk("gsd_ratio", status,
                              f"{a['gsd_m']:.2f} m vs {b['gsd_m']:.2f} m (ratio {r:.2f}); "
                              f"coarser image will be resampled to {min(a['gsd_m'], b['gsd_m']):.2f} m"))

        # --- C6: co-registration -----------------------------------------
        shift, err = _estimate_shift(a, b)          # phase correlation on 512x512 downsample
        status = PASS if shift <= 2.0 else (WARN if shift <= 8.0 else FAIL)
        checks.append(_mk("co_registration", status,
                          f"Estimated misregistration {shift:.2f} px (normalised error {err:.3f})"))

    verdict = FAIL if any(c["status"] == FAIL for c in checks) else \
              (WARN if any(c["status"] == WARN for c in checks) else PASS)
    return {"verdict": verdict, "checks": checks,
            "target_crs": images[0].get("crs"),
            "target_gsd_m": min([i["gsd_m"] for i in images if i.get("gsd_m")], default=None)}

def _estimate_shift(a: dict, b: dict) -> tuple[float, float]:
    """Grayscale, downsample to 512x512, percentile-stretch both, phase correlate."""
    ga, gb = _gray_512(a), _gray_512(b)
    (dy, dx), err, _ = phase_cross_correlation(ga, gb, upsample_factor=4)
    scale = max(a["width"], a["height"]) / 512.0
    return float(np.hypot(dy, dx) * scale), float(err)
```

**Rule:** a `FAIL` verdict blocks querying entirely and the API returns HTTP 422 with the checklist. A `WARN` is allowed through but is copied verbatim into the `ExecutionTrace` and shown as a caveat on every answer produced from that scene. Never let a warning silently disappear between validation and answer.

### 6.5 Preprocessor (`services/ingest/preprocessor.py`)

**Purpose:** turn heterogeneous rasters into model-ready tensors without destroying geospatial truth.

```python
def prepare(meta: dict, arr: np.ndarray, modality: str) -> np.ndarray:
    """Return float32 HxWx3 in [0,1], appropriate to the modality."""
    if modality == "SAR":
        # 1. amplitude/intensity -> dB
        db = 10.0 * np.log10(np.clip(arr, 1e-6, None))
        # 2. clip to the physically meaningful backscatter range
        db = np.clip(db, -25.0, 5.0)
        # 3. speckle reduction (preserve edges: median beats mean here)
        db = np.stack([median_filter(b, size=3) for b in db])
        # 4. normalise
        out = (db + 25.0) / 30.0
        # 5. 1 band -> grayscale RGB; 2 bands (VV,VH) -> [VV, VH, VV/VH ratio]
        if out.shape[0] == 1:
            out = np.repeat(out, 3, axis=0)
        elif out.shape[0] == 2:
            ratio = np.clip(out[0] - out[1] + 0.5, 0, 1)
            out = np.stack([out[0], out[1], ratio])
    else:
        # Optical/MS: per-band 2-98 percentile stretch is robust to
        # dark water and bright cloud, unlike min-max.
        bands = []
        for b in arr:
            lo, hi = np.nanpercentile(b, [2, 98])
            bands.append(np.clip((b - lo) / max(hi - lo, 1e-6), 0, 1))
        out = np.stack(bands)
        out = _select_rgb(out, meta)   # B04,B03,B02 for S2; first 3 otherwise
    return out.astype("float32").transpose(1, 2, 0)

**Pair alignment (`align_pair`):** reproject image B into image A's CRS and grid with `rasterio.warp.reproject` (`Resampling.bilinear` for optical, `Resampling.nearest` for SAR to avoid smearing speckle statistics), crop both to the intersection of their bounds, then resample both to the finer GSD. Return both arrays plus the shared `transform` and `crs` - **every downstream mask inherits this transform.**

**Tiling for large scenes:** if `width*height > 4096*4096`, tile into 1024×1024 with 128 px overlap. Store the tile grid on the scene. Tools that support tiling (`change_detect`, `rs_classify`, `sar_water_mask`) run per tile and mosaic; tools that do not (`rs_vqa`, `rs_caption`) run on a downsampled full view plus, when the query mentions a region, the relevant tile. Record which strategy was used in the trace.

### 6.6 Preview Generator (`services/ingest/preview.py`)

For each image produce:
- `preview.png` - 1024 px long edge, 8-bit, modality-appropriate stretch (this is what the canvas displays)
- `thumb.png` - 256 px
- `preview_meta.json` - `{width, height, bounds_wgs84, gsd_m, scale_factor}` so the frontend can map pixel coordinates to lat/lng

`lib/geo.ts` mirrors this mapping on the client:
```typescript
export function pixelToLatLng(x: number, y: number, m: PreviewMeta): [number, number] {
  const [w, s, e, n] = m.bounds_wgs84;
  return [n - (y / m.height) * (n - s), w + (x / m.width) * (e - w)];
}
```

### 6.7 Benchmark Ingest Adapter

Benchmark samples (VRSBench, RSVQA, CDVQA) arrive as PNG/JPEG with no CRS. `benchmark_mode=true` on the scene:
- skips CRS/overlap/GSD checks (records them as `N/A`, not `PASS` - do not fake a pass)
- sets `georeferenced=false`, disabling GeoTIFF/GeoJSON export and all area-in-m² outputs
- keeps co-registration checking for CDVQA pairs (pixel shift is still meaningful)
- tags the scene `source: benchmark:{dataset}` so eval runs are separable from user scenes in BigQuery

---

## 7. Phase 4 - Generic VLM API + Google Earth Engine (No Fine-Tuning)

### 7.0 Why this path, and what it honestly costs

This replaces the original M1-M5 fine-tuning phase with hosted general models plus a real geospatial product (Google Earth Engine). Recorded here so nobody re-derives it under deadline pressure and forgets the trade-off:

**What this buys:**
- An end-to-end agent in days, not weeks — no training loop, no dataset curation, no GPU rental.
- Strong out-of-the-box fluency for captioning/VQA-style output from GPT-4V/Gemini/Claude — likely beats a homemade QLoRA model on fluency and some presence/counting questions.
- GEE gives real, non-fabricated geospatial analysis (land cover, SAR, change) — a legitimate product decision independent of grading.

**What this fails:**
- **R1 outright.** Design Rule 2 says perception must come from RS-adapted models, and Design Rule 2 (1.6) is explicitly the boundary the problem statement draws in its opening line. A generic VLM looking at raw preview pixels is exactly the disqualified architecture. There is no honest framing that satisfies R1 — report it as **not attempted**.
- **Design Rule 3, for the VLM and GEE tools only.** Both are online, quota-limited services (GEE additionally needs `ee.Initialize()` via a service account). Neither can run inside the `--network none` offline ISRO/SAC eval container (17.14, 11.5). The deterministic tools built in Phase 3 remain the only offline-capable perception path.
- **Data control.** Preview PNGs are sent to a third-party API. Confirm this is acceptable under ISRO/SAC data-handling rules before relying on it for the live demo — this could be a hard blocker, not a preference.

**What still holds:** Design Rule 2 is only broken by the five VLM-backed tools. The GEE-backed tools (`rs_classify`-equivalent, `change_detect`) take AOI bounds and dates, never the uploaded pixel array, so they're closer in spirit to the deterministic tools than to a perception model — they just aren't offline-capable.

### 7.1 VLM Tool Wrappers

`rs_vqa`, `rs_caption`, `rs_ground`, `change_describe`, `change_vqa` become thin wrappers around a hosted vision API. The `ToolResult` shape (8.1) is unchanged, so nothing downstream in the agent (executor, fusion, trace, confidence) needs to know the backend changed.

```python
# services/inference/vlm_gateway.py
SYSTEM = """You are a remote-sensing imagery analyst. You are shown satellite or aerial
imagery (optical, multispectral, or SAR) and must answer strictly from what is visible.
State uncertainty explicitly. Never invent counts, areas, or coordinates you cannot
verify from the image. When asked to locate something, respond with a normalised
bounding box in the form (x1,y1),(x2,y2) with values in [0,1]."""
# (reused near-verbatim from the original 7.3 training-template SYSTEM string,
#  since the RS-analyst framing is still the right prompt even unfine-tuned)

async def vlm_call(images: list[bytes], instruction: str, backend: str = "gemini") -> dict:
    client = {"gemini": gemini_client, "gpt4v": openai_client,
              "claude": anthropic_client}[backend]
    resp = await client.vision_complete(
        system=SYSTEM, images=images, instruction=instruction, temperature=0.0)
    return {"text": resp.text, "raw": resp}
```

```python
class RSVQATool(Tool):
    name = "rs_vqa"
    accepts = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    produces = ["text"]
    model_id = "V1"          # hosted VLM, not a trained model — see 2.3

    async def run(self, ctx, p: RSVQAParams) -> ToolResult:
        imgs = ctx.model_ready_images()
        out = await vlm_call(imgs, p.question, backend=ctx.vlm_backend)
        # No self-consistency sampling by default (cost); confidence is a
        # heuristic on response hedging language, NOT a calibrated score —
        # label it honestly in confidence_basis, never present it as equivalent
        # to the old self-consistency signal.
        conf = heuristic_confidence(out["text"])
        return ToolResult(tool=self.name, model_id="V1", model_version=ctx.vlm_backend,
                          text=out["text"], facts={"answer": out["text"], "question": p.question},
                          confidence=conf,
                          confidence_basis="heuristic hedging-language score on a hosted, "
                                          "unadapted VLM response — not self-consistency")
```

`rs_caption`, `change_describe`, `change_vqa` follow the same pattern with the task-specific instruction templates carried over unchanged from the old 7.3 `TEMPLATES` dict. `change_describe` still injects `change_detect` facts when available (unchanged behaviour from old 8.3.5) — that quantitative anchoring is even more important now since the narrative half is unadapted.

`rs_ground`: no dedicated grounding model exists anymore. The VLM is asked directly for a normalised bounding box in the fixed `(x1,y1),(x2,y2)` format and parsed. If parsing fails or the box is out of range, return `confidence=0.0` and `text="No region matching '<phrase>' could be located"` rather than guessing — same honest-negative contract as the old M3 fallback path (old 8.3.3).

### 7.2 Google Earth Engine Setup

```python
# core/gee.py
import ee

def init_gee():
    creds = ee.ServiceAccountCredentials(
        os.environ["GEE_SERVICE_ACCOUNT"], os.environ["GEE_KEY_PATH"])
    ee.Initialize(creds)
```

Requires a GCP service account with Earth Engine API access, enrolled in a registered EE project. This is a startup-time dependency for any GEE-backed tool; if `init_gee()` fails, those tools mark themselves unavailable and the input gate (9.3) reports it as a missing capability, not a crash.

### 7.3 Land Cover via GEE (replaces `rs_classify`)

```python
class LandCoverTool(Tool):
    name = "rs_classify"
    accepts = ["SINGLE", "CROSS_MODAL"]
    produces = ["stats"]
    model_id = "G1"

    async def run(self, ctx, p) -> ToolResult:
        aoi = ee.Geometry.Rectangle(ctx.scene.bounds_wgs84())   # metadata only, not pixels
        dw = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
              .filterBounds(aoi).filterDate(ctx.scene.acquired_start, ctx.scene.acquired_end)
              .select("label").mode())
        stats = dw.reduceRegion(ee.Reducer.frequencyHistogram(), aoi, scale=10, maxPixels=1e9)
        hist = stats.getInfo()["label"]
        return ToolResult(tool=self.name, model_id="G1",
                          facts={"class_fractions": normalise_histogram(hist)},
                          text=render_landcover_summary(hist),
                          confidence=0.7,
                          confidence_basis="Dynamic World global product, not scene-specific — "
                                          "treat as a reference classification, not a measurement "
                                          "of the exact uploaded raster")
```

Falls back to ESA WorldCover if Dynamic World has no coverage for the date range. This queries GEE's catalog for the scene's AOI, not the uploaded pixels — it does not violate Design Rule 2, only Design Rule 3 (online-only).

### 7.4 Change Detection via GEE (replaces M4 `change_detect`)

NDVI/NDBI time-series differencing over the AOI/date range, plus GEE's built-in change detectors where applicable:

```python
class ChangeDetectTool(Tool):
    name = "change_detect"
    accepts = ["BI_TEMPORAL"]
    produces = ["mask", "map", "stats"]
    model_id = "G2"

    async def run(self, ctx, p: ChangeDetectParams) -> ToolResult:
        aoi = ee.Geometry.Rectangle(ctx.scene.bounds_wgs84())
        t1 = s2_composite(aoi, ctx.scene.t1_date)
        t2 = s2_composite(aoi, ctx.scene.t2_date)
        ndvi_diff = t2.normalizedDifference(["B8","B4"]).subtract(
                    t1.normalizedDifference(["B8","B4"])).abs()
        mask = ndvi_diff.gt(p.threshold)
        # export mask.tif via ee.batch export, poll, download to local artifact store
        ...
        return ToolResult(tool=self.name, model_id="G2", facts={...},
                          confidence=..., confidence_basis="NDVI/NDBI differencing threshold, "
                          "not a trained detector — expect lower IoU than a labeled-benchmark model")
```

**Honest expectation, stated in the tool description the planner reads:** this will not match a trained Siamese U-Net's IoU on a labeled benchmark (11.2), but is defensible on real, unlabeled queries.

### 7.5 SAR via GEE Sentinel-1 GRD

Where the AOI/date range is covered by GEE's Sentinel-1 GRD collection, `sar_water_mask` and `spectral_index`-equivalent SAR analysis can use GEE's already-processed backscatter directly, skipping the local dB conversion pipeline (old 6.5) for that path. **This is optional acceleration, not a replacement** — the deterministic local dB pipeline (built in Phase 3, offline-capable) remains the primary and only offline path, and is mandatory whenever the scene is a user-uploaded RISAT/other-non-catalog raster GEE doesn't host.

### 7.6 Backend Registry & Cards

Replace `model_card.json` (old 7.7) with `backend_card.json` — no training lineage exists to record:

```json
{
  "backend_id": "V1",
  "name": "vlm-gateway",
  "provider": "gemini-1.5-pro-vision",
  "adaptation": "none — hosted general-purpose model, no fine-tuning",
  "serves_tools": ["rs_vqa", "rs_caption", "rs_ground", "change_describe", "change_vqa"],
  "offline_capable": false,
  "notes": "R1 is not satisfied by this backend."
}
```

`GET /api/models` (14) now returns these instead of trained-model cards. When a judge asks "what exactly did you fine-tune?", this page must say plainly: nothing, and point to 7.0.

---

## 8. Phase 5 - Specialist Tool Registry

### 8.1 Tool Interface (`tools/base.py`)

Every capability is a `Tool`. The agent may only ever invoke tools; it cannot call a model directly. This is what makes R7/R9/R11 enforceable rather than aspirational.

```python
from abc import ABC, abstractmethod
from pydantic import BaseModel, ConfigDict
from typing import Literal, Type

InputConfig = Literal["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]

class ToolParams(BaseModel):
    """Base for all tool parameter models. extra='forbid' is the R9 enforcement point:
    a planner that invents a parameter gets a validation error, not silent behaviour."""
    model_config = ConfigDict(extra="forbid")

class ToolResult(BaseModel):
    tool: str
    model_id: str | None = None
    model_version: str | None = None
    text: str | None = None                 # human-readable finding
    facts: dict = {}                        # machine-checkable values used by fusion
    artifacts: dict = {}                    # {"mask": path, "boxes": [...], "geojson": path}
    confidence: float                       # [0,1]
    confidence_basis: str                   # how it was computed - shown in the UI
    duration_ms: int = 0
    warnings: list[str] = []

class Tool(ABC):
    name: str
    description: str                         # read by the planner - write it for an LLM
    accepts: list[InputConfig]
    required_modalities: list[str]           # e.g. ["SAR"] or ["OPTICAL|MULTISPECTRAL","SAR"]
    params_model: Type[ToolParams]
    produces: list[str]                      # "text" | "mask" | "boxes" | "map" | "stats"
    model_id: str | None = None

    @abstractmethod
    async def run(self, ctx: "ExecutionContext", params: ToolParams) -> ToolResult: ...

    def can_run(self, scene) -> tuple[bool, str]:
        if scene.input_config not in self.accepts:
            return False, f"{self.name} requires {self.accepts}, scene is {scene.input_config}"
        for req in self.required_modalities:
            if not any(m in req.split("|") for m in scene.modalities):
                return False, f"{self.name} requires a {req} image; scene has {scene.modalities}"
        return True, ""
```

### 8.2 Registry (`tools/registry.py`)

```python
REGISTRY: dict[str, Tool] = {}

def register(tool_cls):
    t = tool_cls()
    REGISTRY[t.name] = t
    return tool_cls

def registry_manifest() -> list[dict]:
    """Serialised for the planner prompt AND exposed at GET /api/tools."""
    return [{
        "name": t.name, "description": t.description, "accepts": t.accepts,
        "required_modalities": t.required_modalities, "produces": t.produces,
        "params_schema": t.params_model.model_json_schema(),
    } for t in REGISTRY.values()]
```

**Full registry:**

| Tool | Backend | Accepts | Produces | Purpose | Offline? |
|------|---------|---------|----------|---------|----------|
| `rs_vqa` | V1 hosted VLM | SINGLE, CROSS_MODAL, BI_TEMPORAL | text | Answer a question about imagery (R2) | No |
| `rs_caption` | V1 hosted VLM | SINGLE | text | Land-cover / scene description (R3) | No |
| `rs_ground` | V1 hosted VLM (box parsed from text) | SINGLE, CROSS_MODAL | boxes, geojson | Text-guided region grounding (R3) | No |
| `rs_classify` | G1 GEE (Dynamic World / ESA WorldCover) | SINGLE, CROSS_MODAL | stats | Land-cover class fractions for the AOI | No |
| `change_detect` | G2 GEE (NDVI/NDBI diff + prebuilt algos) | BI_TEMPORAL | mask, map, stats | Change map + area (R5) | No |
| `change_describe` | V1 hosted VLM | BI_TEMPORAL | text | Natural-language change description (R4) | No |
| `change_vqa` | V1 hosted VLM | BI_TEMPORAL | text | Question answering over a temporal pair (R4) | No |
| `sar_optical_fuse` | Deterministic only (GEE Sentinel-1 where in-catalog) | CROSS_MODAL | stats, mask, text | Joint optical+SAR extraction via agreement, no learned fusion (R6) | **Yes**, if not using GEE path |
| `spectral_index` | - | SINGLE, CROSS_MODAL, BI_TEMPORAL | mask, stats | NDVI / NDWI / NDBI / NDMI | Yes |
| `sar_water_mask` | - (GEE optional) | SINGLE, CROSS_MODAL, BI_TEMPORAL | mask, stats | Otsu backscatter thresholding | Yes |
| `geo_stats` | - | any | stats | Convert any mask to area / % / counts | Yes |
| `coreg_check` | - | CROSS_MODAL, BI_TEMPORAL | stats | On-demand re-validation of alignment | Yes |

**Rule:** deterministic tools (`spectral_index`, `sar_water_mask`, `geo_stats`, `coreg_check`) are preferred over learned tools whenever they can answer the sub-question. They are exact, fast, explainable, and their outputs are the strongest possible evidence. The planner prompt states this preference explicitly.

**New rule for this version:** every `Tool` subclass must set `offline_capable: bool` on its `ToolSpec` (8.1). The input gate (9.3) and the offline eval harness (11.5) both read it — this is what lets the ISRO/SAC offline path degrade gracefully instead of crashing on the VLM/GEE tools.

### 8.3 Tool Implementations

#### 8.3.1 `rs_vqa` (`tools/rs_vqa.py`) - **mandatory R2**

```python
class RSVQAParams(ToolParams):
    question: str

@register
class RSVQATool(Tool):
    name = "rs_vqa"
    description = ("Answer a natural-language question about the imagery using the "
                   "vision-language model. Works on one image, "
                   "an optical-SAR pair, or a bi-temporal pair.")
    accepts = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities = []
    params_model = RSVQAParams
    produces = ["text"]
    model_id = "V1"
    offline_capable = False

    async def run(self, ctx, p: RSVQAParams) -> ToolResult:
        imgs = ctx.model_ready_images()
        out = await vlm_call(imgs, p.question, backend=ctx.vlm_backend)
        conf = heuristic_confidence(out["text"])
        return ToolResult(
            tool=self.name, model_id="V1", model_version=ctx.vlm_backend,
            text=out["text"], facts={"answer": out["text"], "question": p.question},
            confidence=round(conf, 3),
            confidence_basis="heuristic hedging-language score on a hosted, "
                             "unadapted VLM response — not self-consistency",
        )
```

#### 8.3.2 `rs_caption` - single-image captioning (R3)
Same shape as 8.3.1 using V1, `accepts=["SINGLE"]`, params `{detail: Literal["brief","standard","detailed"] = "standard"}`. `detail` maps to fixed prompt variants from 7.1.

#### 8.3.3 `rs_ground` - text-guided grounding (R3)

V1 is asked directly for a normalised box `(x1,y1),(x2,y2)` in text and parsed; there is no separate detector model (M3). Confidence is the VLM's self-reported certainty language, heuristically scored, not a detector's softmax — label this difference explicitly in `confidence_basis` so a judge doesn't mistake it for calibrated detector output. Zero boxes above threshold returns `confidence=0.0` and `text="No region matching '<phrase>' could be located"`.

#### 8.3.4 `change_detect` (R5)

Uses Google Earth Engine (G2) for NDVI/NDBI time-series differencing over the AOI/date range (7.4):

```python
class ChangeDetectParams(ToolParams):
    threshold: float = Field(0.5, ge=0.05, le=0.95)

@register
class ChangeDetectTool(Tool):
    name = "change_detect"
    accepts = ["BI_TEMPORAL"]
    produces = ["mask", "map", "stats"]
    model_id = "G2"
    offline_capable = False

    async def run(self, ctx, p: ChangeDetectParams) -> ToolResult:
        aoi = ee.Geometry.Rectangle(ctx.scene.bounds_wgs84())
        t1 = s2_composite(aoi, ctx.scene.t1_date)
        t2 = s2_composite(aoi, ctx.scene.t2_date)
        ndvi_diff = t2.normalizedDifference(["B8","B4"]).subtract(
                    t1.normalizedDifference(["B8","B4"])).abs()
        mask = ndvi_diff.gt(p.threshold)
        return ToolResult(tool=self.name, model_id="G2", facts={"changed_fraction": ...},
                          confidence=0.6, confidence_basis="NDVI/NDBI differencing threshold, "
                          "not a trained detector — expect lower IoU than a labeled-benchmark model")
```

When the input is bi-temporal but **not** co-registered within tolerance, this tool refuses rather than producing a garbage mask: registration error is indistinguishable from real change.

#### 8.3.5 `change_describe` (R4)
Hosted VLM (V1) with both images and the change-description template. Injects `change_detect` facts into the prompt when available (`ctx.prior("change_detect")`).

#### 8.3.6 `change_vqa` (R4)
Hosted VLM (V1), both images, change-VQA template. Same confidence method as `rs_vqa`.

#### 8.3.7 `sar_optical_fuse` (R6)

```python
class FuseParams(ToolParams):
    targets: list[Literal["water","built_up","vegetation","bare_soil","all"]] = ["all"]
    agreement_only: bool = False

async def run(self, ctx, p: FuseParams) -> ToolResult:
    opt, sar = ctx.image("optical"), ctx.image("sar")   # or GEE-fetched equivalents, 7.5
    # No learned fusion stream — M1/M5 no longer exist. Two deterministic
    # evidence streams only, same as before minus the learned prior.
    ndwi = normalized_difference(opt, "GREEN", "NIR")
    ndbi = normalized_difference(opt, "SWIR", "NIR")
    sar_db = to_db(sar.array)
    water_sar = sar_db < otsu_threshold(sar_db)
    built_sar = sar_db > np.percentile(sar_db, 90)
    water_agree = (ndwi > 0.0) & water_sar
    built_agree = (ndbi > 0.0) & built_sar
    water_conflict = (ndwi > 0.0) & ~water_sar
    facts = {"water_fraction_optical": float((ndwi > 0).mean()),
             "water_fraction_sar": float(water_sar.mean()),
             "water_fraction_agreed": float(water_agree.mean()),
             "built_fraction_agreed": float(built_agree.mean()),
             "conflict_fraction": float(water_conflict.mean())}
    text = render_fusion_summary(facts)
    return ToolResult(tool=self.name, model_id=None, facts=facts,
                      artifacts={"water_mask": ..., "built_mask": ..., "conflict_mask": ...},
                      text=text, confidence=agreement_confidence(water_agree, ndwi, water_sar),
                      confidence_basis="inter-sensor agreement fraction — fully deterministic, "
                                      "offline-capable, no learned prior")
```

Confidence is based solely on inter-sensor agreement fraction across target classes.

#### 8.3.8 Deterministic geo tools

```python
class SpectralIndexParams(ToolParams):
    index: Literal["NDVI","NDWI","NDBI","NDMI"]
    threshold: float | None = Field(None, ge=-1.0, le=1.0)   # None -> Otsu

class GeoStatsParams(ToolParams):
    mask_ref: str                              # artifact key from a prior step
    units: Literal["m2","ha","km2","percent"] = "ha"
```

```python
def mask_area(mask: np.ndarray, gsd_x_m: float, gsd_y_m: float, units="ha") -> float:
    m2 = float(mask.sum()) * gsd_x_m * gsd_y_m
    return {"m2": m2, "ha": m2 / 10_000, "km2": m2 / 1_000_000,
            "percent": 100.0 * mask.mean()}[units]
```

`geo_stats` refuses on non-georeferenced scenes and returns percentage only, with a warning. Never report hectares for a benchmark PNG.

### 8.4 Parameter Whitelisting (R9)

Enforced in three layers so no single mistake opens the gate:

1. **Schema:** `ToolParams.model_config = ConfigDict(extra="forbid")` - unknown keys raise `ValidationError`.
2. **Range:** every numeric parameter carries `ge`/`le`; every string choice is a `Literal`. There are no free-text parameters except the user's own `question`/`phrase`, which are passed as data, never concatenated into system prompts.
3. **Audit:** `executor.py` records `params_requested` and `params_applied` separately in the trace. If they differ (rejected or defaulted keys), the difference is logged as a `warning` and shown in the trace UI.

```python
def bind_params(tool: Tool, requested: dict) -> tuple[ToolParams, list[str]]:
    warnings = []
    try:
        return tool.params_model(**requested), warnings
    except ValidationError as e:
        rejected = {err["loc"][0] for err in e.errors()}
        cleaned = {k: v for k, v in requested.items() if k not in rejected}
        warnings.append(f"Rejected non-permitted or invalid parameters: {sorted(rejected)}")
        return tool.params_model(**cleaned), warnings   # raises if a required field was rejected
```

---

## 9. Phase 6 - Agentic Controller

The graded novelty (R7). The controller is a five-stage pipeline, each stage independently testable and independently loggable.

```
query + scene
     |
     v
[1] TASK CLASSIFIER  ->  TaskType + target modality hints
     |
     v
[2] INPUT GATE       ->  executable? else structured refusal
     |
     v
[3] PLANNER          ->  ExecutionPlan (DAG of validated tool calls)
     |
     v
[4] EXECUTOR         ->  ToolResult[] (+ artifacts, streamed to UI)
     |
     v
[5] FUSION + CONFIDENCE -> Answer + evidence + ExecutionTrace
```

### 9.1 Controller (`agent/controller.py`)

```python
async def answer_query(scene: Scene, query: str, emit) -> QueryResult:
    trace = ExecutionTrace.start(scene_id=scene.id, query=query)

    await emit({"type": "stage", "stage": "classifying"})
    task = classify_task(query, scene)
    trace.task = task

    await emit({"type": "stage", "stage": "validating"})
    gate = input_gate(task, scene)
    trace.gate = gate
    if not gate.ok:
        trace.finish(status="REFUSED")
        return QueryResult.refusal(gate, trace)

    await emit({"type": "stage", "stage": "planning"})
    plan = await make_plan(task, query, scene)
    trace.plan = plan
    await emit({"type": "plan", "plan": plan.model_dump()})

    results = await execute_plan(plan, scene, trace, emit)

    await emit({"type": "stage", "stage": "fusing"})
    answer = await fuse(query, task, results, scene)
    confidence = aggregate_confidence(results, plan)

    if confidence.value < ABSTAIN_THRESHOLD:
        answer = abstain(answer, confidence, results)

    trace.finish(status="COMPLETE", confidence=confidence)
    return QueryResult(answer=answer, evidence=collect_evidence(results),
                       confidence=confidence, trace=trace)
```

### 9.2 Task Classifier (`agent/task_classifier.py`)

**TaskType enum** (this is the value reported in the execution summary):

```python
class TaskType(str, Enum):
    SINGLE_VQA            = "SINGLE_IMAGE_VQA"
    SINGLE_CAPTION        = "SINGLE_IMAGE_CAPTIONING"
    SINGLE_GROUNDING      = "TEXT_GUIDED_GROUNDING"
    CHANGE_DESCRIPTION    = "CHANGE_DESCRIPTION"
    CHANGE_VQA            = "CHANGE_VQA"
    CHANGE_MAP            = "CHANGE_MAP_GENERATION"
    CROSS_MODAL_ANALYSIS  = "CROSS_MODAL_ANALYSIS"
    LAND_COVER_ANALYSIS   = "LAND_COVER_ANALYSIS"
    UNSUPPORTED           = "UNSUPPORTED"
```

**Two-stage classification. Rules first, model second.**

```python
GROUNDING_CUES = ("highlight", "locate", "where is", "mark the", "show me the",
                  "point out", "outline", "find the", "which region")
CHANGE_CUES    = ("change", "changed", "increase", "decrease", "before", "after",
                  "between these", "over time", "grown", "expanded", "new")
CAPTION_CUES   = ("describe", "caption", "what do you see", "summarise", "overview")
CROSS_CUES     = ("both", "optical and sar", "sar and optical", "using both",
                  "combine", "together", "complementary", "fuse")

def classify_task(query: str, scene: Scene) -> TaskClassification:
    q = query.lower().strip()
    cfg = scene.input_config
    evidence = []

    # The input configuration constrains the space before the text is even read.
    if cfg == "BI_TEMPORAL":
        if any(c in q for c in ("map", "where exactly", "show the change area")):
            t = TaskType.CHANGE_MAP
        elif q.endswith("?") or any(q.startswith(w) for w in
                                    ("has ", "did ", "is ", "are ", "how many", "what is", "which")):
            t = TaskType.CHANGE_VQA
        else:
            t = TaskType.CHANGE_DESCRIPTION
        evidence.append(f"bi-temporal input restricts task space; matched {t.value}")

    elif cfg == "CROSS_MODAL":
        t = (TaskType.CROSS_MODAL_ANALYSIS
             if any(c in q for c in CROSS_CUES) or not q.endswith("?")
             else TaskType.SINGLE_VQA)
        evidence.append("cross-modal pair supplied")

    else:  # SINGLE
        if any(c in q for c in GROUNDING_CUES):   t = TaskType.SINGLE_GROUNDING
        elif any(c in q for c in CAPTION_CUES):   t = TaskType.SINGLE_CAPTION
        elif q.endswith("?"):                     t = TaskType.SINGLE_VQA
        else:                                     t = TaskType.SINGLE_CAPTION

    conf = rule_confidence(q, t)
    if conf < 0.6 and PLANNER_BACKEND != "local":
        t, conf, why = llm_classify(query, cfg, [e.value for e in TaskType])
        evidence.append(f"rule confidence {conf:.2f} below threshold; LLM classifier: {why}")

    return TaskClassification(task=t, confidence=conf, evidence=evidence)
```

**Design note:** the rules are not a stopgap for a missing model. Task classification here is genuinely low-entropy - the input configuration already eliminates most of the space - and a deterministic classifier is faster, free, offline-capable, and auditable. The LLM is the fallback for the ambiguous minority, which is the inverse of the usual arrangement and is the right way round for an evaluated system.

### 9.3 Input Gate (`agent/input_gate.py`) - R8

```python
TASK_REQUIREMENTS = {
    TaskType.SINGLE_VQA:           {"configs": ["SINGLE","CROSS_MODAL","BI_TEMPORAL"], "modalities": []},
    TaskType.SINGLE_CAPTION:       {"configs": ["SINGLE"], "modalities": []},
    TaskType.SINGLE_GROUNDING:     {"configs": ["SINGLE","CROSS_MODAL"], "modalities": []},
    TaskType.CHANGE_DESCRIPTION:   {"configs": ["BI_TEMPORAL"], "modalities": []},
    TaskType.CHANGE_VQA:           {"configs": ["BI_TEMPORAL"], "modalities": []},
    TaskType.CHANGE_MAP:           {"configs": ["BI_TEMPORAL"], "modalities": []},
    TaskType.CROSS_MODAL_ANALYSIS: {"configs": ["CROSS_MODAL"], "modalities": ["SAR","OPTICAL|MULTISPECTRAL"]},
    TaskType.LAND_COVER_ANALYSIS:  {"configs": ["SINGLE","CROSS_MODAL"], "modalities": []},
}

def input_gate(tc: TaskClassification, scene: Scene) -> GateResult:
    req = TASK_REQUIREMENTS[tc.task]
    problems = []

    if scene.input_config not in req["configs"]:
        problems.append(Problem(
            code="WRONG_INPUT_CONFIG",
            detail=f"'{tc.task.value}' needs {req['configs']}, you supplied {scene.input_config}",
            remedy=REMEDY[tc.task],   # e.g. "Upload a second image acquired at a different date."
        ))

    for need in req["modalities"]:
        if not any(m in need.split("|") for m in scene.modalities):
            problems.append(Problem("MISSING_MODALITY",
                f"This task needs a {need} image; the scene contains {scene.modalities}",
                "Upload the co-registered SAR image for this area."))

    if scene.compatibility.verdict == "FAIL":
        problems.append(Problem("INCOMPATIBLE_INPUTS",
            "; ".join(c["detail"] for c in scene.compatibility.checks if c["status"] == "FAIL"),
            "Re-upload images covering the same area, or co-register them before upload."))

    if tc.task in (TaskType.CHANGE_MAP, TaskType.CHANGE_DESCRIPTION) and scene.coreg_shift_px > 8.0:
        problems.append(Problem("POOR_CO_REGISTRATION",
            f"Misregistration of {scene.coreg_shift_px:.1f} px would be indistinguishable "
            "from real change", "Co-register the pair to within ~2 px."))

    warnings = [c["detail"] for c in scene.compatibility.checks if c["status"] == "WARN"]
    return GateResult(ok=not problems, problems=problems, warnings=warnings)
```

**Refusals are structured, never a generic apology.** The UI renders `problem.detail` plus `problem.remedy`. A refusal that tells the user exactly which image is missing is a better product than a hallucinated answer, and evaluators can see the gate firing correctly in the trace.

### 9.4 Planner (`agent/planner.py`)

**Plan schema (`agent/plan_schema.py`):**
```python
class PlanStep(BaseModel):
    id: str                                    # "s1"
    tool: str                                  # must exist in REGISTRY
    params: dict = {}                          # validated against tool.params_model
    inputs: dict[str, str] = {}                # {"mask_ref": "s1.artifacts.mask"}
    reason: str                                # one line, shown in the trace UI

class ExecutionPlan(BaseModel):
    task: TaskType
    steps: list[PlanStep] = Field(min_length=1, max_length=8)
    backend: Literal["rules", "vertex", "local_llm"]

    @field_validator("steps")
    def validate_steps(cls, steps):
        seen = set()
        for s in steps:
            if s.tool not in REGISTRY:
                raise ValueError(f"Unknown tool '{s.tool}'")
            for ref in s.inputs.values():
                if ref.split(".")[0] not in seen:
                    raise ValueError(f"Step {s.id} references an unproduced artifact {ref}")
            seen.add(s.id)
        return steps
```

**Rule-based planner (default; the only one used in offline evaluation):**

```python
def plan_rules(task: TaskType, query: str, scene: Scene) -> ExecutionPlan:
    S = lambda i, tool, params, reason, inputs=None: PlanStep(
        id=f"s{i}", tool=tool, params=params, reason=reason, inputs=inputs or {})

    if task == TaskType.SINGLE_VQA:
        steps = [S(1, "rs_vqa", {"question": query}, "Direct VQA on the supplied image")]
        # If the question asks about area or extent, add a deterministic measurement
        # so the answer carries a number the VLM did not invent.
        if any(k in query.lower() for k in ("how much", "area", "extent", "percentage", "coverage")):
            steps += [S(2, "spectral_index", {"index": _index_for(query)},
                        "Quantify extent with a deterministic spectral index"),
                      S(3, "geo_stats", {"mask_ref": "s2.artifacts.mask", "units": "ha"},
                        "Convert the index mask to area", {"mask_ref": "s2.artifacts.mask"})]

    elif task == TaskType.SINGLE_CAPTION:
        steps = [S(1, "rs_classify", {}, "Land-cover probabilities as factual anchor"),
                 S(2, "rs_caption", {"detail": "standard"}, "Generate scene description")]

    elif task == TaskType.SINGLE_GROUNDING:
        steps = [S(1, "rs_ground", {"phrase": extract_phrase(query)},
                   "Locate the region referred to in the query"),
                 S(2, "geo_stats", {"mask_ref": "s1.artifacts.boxes", "units": "ha"},
                   "Measure the located region", {"mask_ref": "s1.artifacts.boxes"})]

    elif task in (TaskType.CHANGE_DESCRIPTION, TaskType.CHANGE_MAP):
        steps = [S(1, "coreg_check", {}, "Confirm the pair is aligned before differencing"),
                 S(2, "change_detect", {}, "Produce the binary change map"),
                 S(3, "geo_stats", {"mask_ref": "s2.artifacts.mask", "units": "ha"},
                   "Quantify changed area", {"mask_ref": "s2.artifacts.mask"}),
                 S(4, "change_describe", {}, "Describe the change, anchored on measured statistics")]

    elif task == TaskType.CHANGE_VQA:
        steps = [S(1, "change_detect", {}, "Measure change to anchor the answer"),
                 S(2, "change_vqa", {"question": query}, "Answer the temporal question")]
        if _asks_direction(query):        # "increased, decreased or unchanged?"
            steps.insert(1, S(0, "spectral_index", {"index": "NDBI"},
                              "Signed built-up index difference gives the direction of change"))
            steps = _resequence(steps)     # ids must read s1..sN in execution order

    elif task == TaskType.CROSS_MODAL_ANALYSIS:
        steps = [S(1, "coreg_check", {}, "Confirm optical and SAR are co-registered"),
                 S(2, "sar_optical_fuse", {"targets": _targets_from(query)},
                   "Joint optical-SAR extraction with inter-sensor agreement"),
                 S(3, "geo_stats", {"mask_ref": "s2.artifacts.water_mask", "units": "ha"},
                   "Quantify agreed water extent", {"mask_ref": "s2.artifacts.water_mask"}),
                 S(4, "rs_vqa", {"question": query},
                   "Phrase the finding as an answer to the user's question")]

    else:  # LAND_COVER_ANALYSIS
        steps = [S(1, "rs_classify", {}, "19-class land-cover probabilities"),
                 S(2, "rs_caption", {"detail": "detailed"}, "Narrative land-cover description")]

    return ExecutionPlan(task=task, steps=steps, backend="rules")
```

**LLM planner (enhancement, `PLANNER_BACKEND=vertex`):** used when the rule planner's task confidence is low or the query is compound ("describe the scene *and* tell me if the water grew"). It receives the registry manifest and **scene metadata only - never pixels** (Design Rule 2).

```python
PLANNER_SYSTEM = """You plan remote-sensing analysis workflows. You do not look at imagery.
You select tools from a registry and order them.

Rules:
1. Output ONLY a JSON object: {"steps":[{"id","tool","params","inputs","reason"}]}.
2. Use only tools from the provided registry. Use only parameters in each tool's schema.
3. Prefer deterministic tools (spectral_index, sar_water_mask, geo_stats) for anything
   measurable. Use learned models for interpretation and language.
4. Schedule measurement before description: a description step should be able to
   consume the facts a measurement step produced.
5. Maximum 8 steps. Do not add steps that cannot run on the given input configuration.
6. Never invent findings. You produce a plan, not an answer."""

async def plan_llm(task, query, scene) -> ExecutionPlan:
    payload = {
        "task": task.value, "query": query,
        "input_config": scene.input_config, "modalities": scene.modalities,
        "georeferenced": scene.georeferenced, "gsd_m": scene.gsd_m,
        "size": [scene.width, scene.height], "bands": scene.band_summary,
        "registry": registry_manifest(),
    }
    raw = await vertex_json(PLANNER_SYSTEM, json.dumps(payload), temperature=0.0)
    try:
        plan = ExecutionPlan(task=task, steps=json.loads(raw)["steps"], backend="vertex")
    except (json.JSONDecodeError, ValidationError) as e:
        log.warning("LLM plan rejected (%s); falling back to rules", e)
        return plan_rules(task, query, scene)          # never fail closed on planner error
    return plan
```

**Every LLM plan is validated against the registry before execution and silently falls back to rules on any violation.** The system therefore cannot be made to run an unregistered tool or an out-of-range parameter, no matter what the model emits.

### 9.5 Executor (`agent/executor.py`)

```python
async def execute_plan(plan, scene, trace, emit) -> dict[str, ToolResult]:
    ctx = ExecutionContext(scene=scene, models=ModelClient(), results={})
    for step in plan.steps:
        tool = REGISTRY[step.tool]

        ok, why = tool.can_run(scene)
        if not ok:
            trace.add_step(step, status="SKIPPED", note=why)
            await emit({"type": "step", "id": step.id, "tool": step.tool, "status": "skipped", "note": why})
            continue

        params, warns = bind_params(tool, _resolve_refs(step, ctx))
        await emit({"type": "step", "id": step.id, "tool": step.tool, "status": "running",
                    "params": params.model_dump(), "reason": step.reason})

        t0 = time.perf_counter()
        try:
            result = await asyncio.wait_for(tool.run(ctx, params), timeout=TOOL_TIMEOUTS[tool.name])
        except asyncio.TimeoutError:
            result = ToolResult(tool=tool.name, confidence=0.0,
                                confidence_basis="timeout", warnings=[f"timed out after {TOOL_TIMEOUTS[tool.name]}s"])
        except Exception as e:
            log.exception("tool %s failed", tool.name)
            result = ToolResult(tool=tool.name, confidence=0.0,
                                confidence_basis="error", warnings=[f"{type(e).__name__}: {e}"])

        result.duration_ms = int((time.perf_counter() - t0) * 1000)
        result.warnings += warns
        ctx.results[step.id] = result
        trace.add_step(step, status="OK" if result.confidence > 0 else "FAILED",
                       params_requested=step.params, params_applied=params.model_dump(),
                       result=result)
        await emit({"type": "step", "id": step.id, "tool": step.tool, "status": "complete",
                    "summary": _one_line(result), "confidence": result.confidence,
                    "duration_ms": result.duration_ms})
    return ctx.results
```

**A failed step never aborts the plan.** Later steps run with whatever is available, and fusion reports honestly on partial evidence. A change map that failed while the change description succeeded still produces a useful, correctly-hedged answer.

**Tool timeouts** (`TOOL_TIMEOUTS`): deterministic tools 30 s, `rs_ground` 60 s, `change_detect` 120 s (tiled), M2 tools 90 s.

### 9.6 Fusion - Grounded Answer Synthesis (`agent/fusion.py`)

Two modes, both constrained. Neither is allowed to introduce a fact.

**Mode A - template (default, offline-safe).** Each task has a renderer that reads `ToolResult.facts`:

```python
def render_change_answer(results, scene) -> str:
    cd = results.get("change_detect")
    gs = results.get("geo_stats")
    cdesc = results.get("change_describe")
    parts = []
    if cd:
        f = cd.facts
        parts.append(f"About {f['changed_fraction']*100:.1f}% of the overlapping area changed "
                     f"between the two acquisitions"
                     + (f" ({gs.facts['area_ha']:.1f} ha)." if gs else "."))
        parts.append(f"The change is distributed across {f['n_components']} distinct regions.")
        if f.get("direction_hint"):
            parts.append(f"Built-up signal indicates an overall {f['direction_hint']}.")
    if cdesc:
        parts.append(cdesc.text)
    return " ".join(parts)
```

**Mode B - LLM composition (`FUSION_BACKEND=vertex`)**, for fluency on compound queries. Given the query and a JSON dump of tool `facts` and `text`, with the instruction that it may only restate supplied content.

**Numeric grounding check - runs on both modes and is not optional:**

```python
NUM = re.compile(r"-?\d+(?:\.\d+)?")

def verify_grounded(answer: str, results: dict) -> tuple[bool, list[str]]:
    """Every number in the answer must be traceable to a tool output.
    Catches the exact failure this system exists to prevent: a fluent,
    plausible, invented statistic."""
    allowed = set()
    for r in results.values():
        for v in _walk_numbers(r.facts):
            allowed |= {f"{v:.0f}", f"{v:.1f}", f"{v:.2f}", f"{v*100:.0f}", f"{v*100:.1f}"}
        if r.text:
            allowed |= set(NUM.findall(r.text))
    unsupported = [n for n in NUM.findall(answer)
                   if n not in allowed and not _is_year_or_ordinal(n)]
    return not unsupported, unsupported

# On failure: fall back to Mode A rendering and record the event in the trace.
```

### 9.7 Confidence & Abstention (`agent/confidence.py`)

```python
TOOL_WEIGHTS = {          # how much each tool's confidence matters to the final answer
    "rs_vqa": 1.0, "change_vqa": 1.0, "change_describe": 0.8, "rs_caption": 0.8,
    "rs_ground": 1.0, "change_detect": 0.9, "sar_optical_fuse": 1.0,
    "rs_classify": 0.6, "spectral_index": 0.3, "sar_water_mask": 0.3,
    "geo_stats": 0.1, "coreg_check": 0.2,   # deterministic: near-certain, low information
}

def aggregate_confidence(results, plan) -> Confidence:
    contrib = [(r.tool, r.confidence, TOOL_WEIGHTS.get(r.tool, 0.5))
               for r in results.values() if r.confidence > 0]
    if not contrib:
        return Confidence(value=0.0, band="LOW", basis="no tool produced a usable result",
                          contributions=[])
    num = sum(c * w for _, c, w in contrib)
    den = sum(w for _, _, w in contrib)
    value = num / den

    # A failed or skipped step in the plan reduces confidence proportionally:
    # answering from half the planned evidence should not look as certain as
    # answering from all of it.
    executed = len([r for r in results.values() if r.confidence > 0])
    value *= 0.7 + 0.3 * (executed / max(len(plan.steps), 1))

    # Any FAIL/WARN carried from ingest validation caps the ceiling.
    if any("misregistration" in w.lower() for r in results.values() for w in r.warnings):
        value = min(value, 0.5)

    band = "HIGH" if value >= 0.75 else ("MEDIUM" if value >= 0.45 else "LOW")
    return Confidence(value=round(value, 3), band=band,
                      basis=f"weighted mean over {len(contrib)} tools, "
                            f"{executed}/{len(plan.steps)} steps completed",
                      contributions=[{"tool": t, "confidence": c, "weight": w} for t, c, w in contrib])
```

**Abstention (`ABSTAIN_THRESHOLD = 0.35`):** the answer is replaced with an explicit statement of insufficient evidence, listing what *was* established (any high-confidence individual facts are still reported) and what would resolve the question. Evidence layers are still returned - the user keeps the mask even when the system will not commit to a verbal answer.

### 9.8 Execution Trace (`agent/trace.py`) - R11

The observable artifact the problem statement says will be evaluated. Internal reasoning text is deliberately excluded; only observable execution is recorded.

```json
{
  "trace_id": "trc_9f2c...",
  "scene_id": "scn_4a1b...",
  "query": "Use the optical and SAR images together to identify built-up and water-covered regions.",
  "started_at": "2026-02-11T07:41:02.113Z",
  "finished_at": "2026-02-11T07:41:19.884Z",
  "duration_ms": 17771,
  "status": "COMPLETE",
  "task": {
    "selected": "CROSS_MODAL_ANALYSIS",
    "classifier_confidence": 0.91,
    "evidence": ["cross-modal pair supplied", "query contains 'together'"]
  },
  "inputs": {
    "input_config": "CROSS_MODAL",
    "images": [
      {"role": "optical", "modality": "MULTISPECTRAL", "detector_confidence": 0.88,
       "crs": "EPSG:32643", "gsd_m": 2.0, "size": [4096, 4096], "bands": 4,
       "format": "GeoTIFF", "sensor_hint": "Cartosat-2S"},
      {"role": "sar", "modality": "SAR", "detector_confidence": 0.94,
       "crs": "EPSG:32643", "gsd_m": 2.5, "size": [3300, 3300], "bands": 1,
       "format": "GeoTIFF", "sensor_hint": "RISAT"}
    ],
    "compatibility": {"verdict": "PASS", "overlap": 0.97, "gsd_ratio": 1.25, "coreg_shift_px": 1.4}
  },
  "plan": {"backend": "rules", "step_count": 4},
  "steps": [
    {"id": "s1", "tool": "coreg_check", "model": null,
     "params_requested": {}, "params_applied": {},
     "status": "OK", "duration_ms": 412, "confidence": 0.97,
     "output_summary": "shift 1.4 px, overlap 97%"},
    {"id": "s2", "tool": "sar_optical_fuse", "model": null,
     "params_requested": {"targets": ["water", "built_up"]},
     "params_applied":   {"targets": ["water", "built_up"], "agreement_only": false},
     "status": "OK", "duration_ms": 8140, "confidence": 0.81,
     "output_summary": "water 11.3% agreed, built-up 24.8% agreed, conflict 2.1%",
     "artifacts": ["water_mask.tif", "built_mask.tif", "conflict_mask.tif"]},
    {"id": "s3", "tool": "geo_stats", "model": null,
     "params_requested": {"mask_ref": "s2.artifacts.water_mask", "units": "ha"},
     "params_applied":   {"mask_ref": "s2.artifacts.water_mask", "units": "ha"},
     "status": "OK", "duration_ms": 64, "confidence": 1.0,
     "output_summary": "1,842.6 ha water"},
    {"id": "s4", "tool": "rs_vqa", "model": "V1 gemini-1.5-pro-vision",
     "params_requested": {"question": "..."},
     "params_applied":   {"question": "..."},
     "status": "OK", "duration_ms": 9155, "confidence": 0.78,
     "output_summary": "answer produced (37 tokens)"}
  ],
  "fusion": {"mode": "template", "grounding_check": "PASS", "unsupported_numbers": []},
  "confidence": {"value": 0.83, "band": "HIGH",
                 "basis": "weighted mean over 4 tools, 4/4 steps completed"},
  "warnings": []
}
```

Stored at `traces/{traceId}` (Firestore) and as `trace.json` in the scene's derived artifacts. `GET /api/traces/{id}` returns it; the Download Trace button in the UI serves it directly.

---

## 10. Phase 7 - Evidence, Outputs & Reporting

### 10.1 Overlay Renderer (`services/evidence/overlay_renderer.py`)

Every visual artifact is produced in two forms: a **display PNG** (RGBA, transparent background, aligned to `preview.png`) and a **geo artifact** (GeoTIFF or GeoJSON in the source CRS).

```python
def render_mask_overlay(mask: np.ndarray, colour=(163, 230, 53), alpha=0.55) -> bytes:
    """Mask -> RGBA PNG sized to the preview, with a 1-px outline so thin
    features remain visible when the fill is semi-transparent."""
    h, w = mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[mask.astype(bool)] = (*colour, int(alpha * 255))
    edge = binary_dilation(mask, iterations=1) ^ mask.astype(bool)
    rgba[edge] = (*colour, 255)
    return encode_png(resize_to_preview(rgba))
```

Layer palette (must match the frontend `evidence.*` tokens): boxes `#22d3ee`, generic mask `#a3e635`, change `#ef4444`, water `#38bdf8`, built-up `#f59e0b`, cross-sensor conflict `#a855f7` with a hatch pattern.

### 10.2 Geo Export (`services/evidence/geo_export.py`)

```python
def write_mask_geotiff(mask: np.ndarray, transform, crs, out_path: str, nodata=0):
    profile = {"driver": "GTiff", "height": mask.shape[0], "width": mask.shape[1],
               "count": 1, "dtype": "uint8", "crs": crs, "transform": transform,
               "nodata": nodata, "compress": "deflate", "tiled": True,
               "blockxsize": 256, "blockysize": 256}
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(mask.astype("uint8"), 1)
        dst.update_tags(SATQUERY_TOOL=..., SATQUERY_TRACE=..., SATQUERY_MODEL=...)
```

Writing the trace id into the GeoTIFF tags means a mask opened in QGIS six months later still points back to the exact execution that produced it.

Mask -> polygon GeoJSON via `rasterio.features.shapes`, simplified with `shapely.simplify(tolerance=gsd_m/2)` and reprojected to EPSG:4326.

### 10.3 Result Rendering Contract

`QueryResult.evidence` is a list the frontend renders without special-casing:

```json
[{"id":"ev1","type":"mask","label":"Water (both sensors agree)","colour":"#38bdf8",
  "png_url":"...","geotiff_url":"...","geojson_url":"...","source_step":"s2",
  "stats":{"area_ha":1842.6,"fraction":0.113}},
 {"id":"ev2","type":"boxes","label":"Detected: 'the reservoir'","colour":"#22d3ee",
  "boxes":[{"bbox":[120,340,410,600],"score":0.83}],"source_step":"s1"}]
```

`type ∈ {mask, boxes, change_map, heatmap, points}`. Adding a tool that produces one of these needs zero frontend changes.

### 10.4 Report Builder (`services/reporting/report_builder.py`)

HTML template -> PDF with WeasyPrint (pure Python; no Node in the backend image).

```bash
pip install weasyprint jinja2
```

**Report structure:**
1. Cover - SatQuery AI, scene name, date, input configuration, thumbnail(s)
2. Query & Answer - verbatim query, final answer, confidence band with basis
3. Input Validation - the full compatibility checklist with pass/warn/fail icons
4. Evidence - each layer rendered over the preview, with its statistics table
5. Execution Summary - the trace table: step, tool, model@version, key parameters, duration, confidence
6. Model Provenance - the model card of every model that ran (base model, adaptation data, version)
7. Appendix - full metadata for each input image

```python
def build_report(query_result, scene, out_pdf: str):
    html = Template(open("templates/report.html").read()).render(
        scene=scene, result=query_result, trace=query_result.trace,
        model_cards=[registry_card(s.model) for s in query_result.trace.steps if s.model],
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    HTML(string=html, base_url=ARTIFACT_ROOT).write_pdf(out_pdf)
```

Sections 3, 5 and 6 exist specifically because R11 is graded on the observable execution summary. Do not trim them for aesthetics.

### 10.5 Download Bundle

`GET /api/queries/{id}/export/bundle` returns a ZIP:
```
satquery_{queryId}/
├── report.pdf
├── trace.json
├── answer.md
├── evidence/{water_mask.tif, water_mask.geojson, change_mask.tif, boxes.geojson, *.png}
└── inputs/{metadata.json, compatibility.json}
```
Individual endpoints exist for each artifact (Section 14) so QGIS users can pull a single GeoTIFF without downloading the bundle.

---

## 11. Phase 8 - Evaluation Harness & Benchmarks

Final scoring uses prescribed public benchmark test splits plus an undisclosed ISRO/SAC set. Build the harness early - it is the only objective signal on whether a training change helped.

### 11.1 Dataset Adapters (`eval/adapters/`)

Each adapter yields a uniform `EvalItem`:
```python
class EvalItem(BaseModel):
    item_id: str
    dataset: str
    task: TaskType
    images: list[str]                 # 1 or 2 paths
    input_config: InputConfig
    question: str | None = None
    reference: str | list[str] | dict # answer | captions | bbox | mask path
    qtype: str | None = None          # presence | count | comparison | rural_urban | ...
```

| Dataset | Split | Tasks scored |
|---------|-------|--------------|
| RSVQA-LR | test | VQA accuracy overall + per question type |
| RSVQA-HR | test set 1 & 2 | VQA accuracy |
| VRSBench | test | captioning (BLEU-4/METEOR/ROUGE-L/CIDEr), VQA accuracy, grounding [email protected] |
| CDVQA | test | change-VQA accuracy overall + per type |
| ISRO/SAC | provided | all applicable, using the official submission format |

### 11.2 Metrics (`eval/metrics/`)

```python
# vqa.py - normalise before comparing, or you lose points to formatting alone
def normalise_answer(a: str) -> str:
    a = a.lower().strip().rstrip(".")
    a = re.sub(r"\b(the|a|an)\b", " ", a)
    a = re.sub(r"\s+", " ", a).strip()
    return {"yes": "yes", "true": "yes", "no": "no", "false": "no"}.get(a, a)

def vqa_accuracy(preds, refs) -> float:
    return float(np.mean([normalise_answer(p) == normalise_answer(r) for p, r in zip(preds, refs)]))

# For RSVQA count questions, the reference is a bucket ("0","1-10","11-100",...).
# Map a numeric prediction into the bucket before comparing.
def bucketise_count(pred: str, buckets: list[str]) -> str: ...

# grounding.py
def iou(a, b) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    ua = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - inter
    return inter / ua if ua > 0 else 0.0

def acc_at(preds, refs, thr=0.5) -> float:
    return float(np.mean([iou(p, r) >= thr for p, r in zip(preds, refs)]))

# change.py - report IoU/F1, never accuracy (see 7.5)
def change_f1(pred_mask, gt_mask) -> dict:
    tp = float((pred_mask & gt_mask).sum())
    fp = float((pred_mask & ~gt_mask).sum())
    fn = float((~pred_mask & gt_mask).sum())
    p = tp / max(tp + fp, 1e-9); r = tp / max(tp + fn, 1e-9)
    return {"precision": p, "recall": r,
            "f1": 2*p*r/max(p+r, 1e-9), "iou": tp/max(tp+fp+fn, 1e-9)}
```

Captioning uses `pycocoevalcap` (BLEU, METEOR, ROUGE-L, CIDEr). Install with `pip install pycocoevalcap` (needs a JRE for METEOR - if unavailable, report the rest and mark METEOR `N/A` rather than substituting a different metric silently).

### 11.3 Runner (`eval/run_benchmark.py`)

```bash
python -m eval.run_benchmark \
  --dataset vrsbench --split test \
  --tasks caption,vqa,grounding \
  --through-agent true \
  --planner-backend local \
  --limit 0 \
  --out eval/reports/vrsbench_v0.3.1.json
```

**`--through-agent` is the important flag.** With `true`, every item goes through the full controller (classify -> gate -> plan -> execute -> fuse) exactly as a user query would. With `false`, it calls the tool directly. **Report both.** The delta tells you whether the agentic layer helps or hurts, which is the single most useful number you have for tuning it - and if orchestration is costing accuracy, you need to know before the judges do.

The runner writes per-item predictions (`predictions.jsonl`) alongside aggregate scores so failures can be inspected individually, and appends the run to BigQuery `satquery_eval.runs` when configured.

### 11.4 Score Normalisation & Composite (`eval/normalize.py`)

Scores are normalised before combining, as the problem statement requires.

```python
METRIC_RANGES = {          # (min, max) used for min-max normalisation to [0,1]
    "rsvqa_lr_acc":      (0.0, 1.0),
    "rsvqa_hr_acc":      (0.0, 1.0),
    "vrsbench_vqa_acc":  (0.0, 1.0),
    "vrsbench_cider":    (0.0, 2.0),     # CIDEr is unbounded in principle; 2.0 is a practical ceiling
    "vrsbench_bleu4":    (0.0, 1.0),
    "vrsbench_acc50":    (0.0, 1.0),
    "cdvqa_acc":         (0.0, 1.0),
    "change_iou":        (0.0, 1.0),
}

CAPABILITY_WEIGHTS = {     # mirrors the mandatory functional scope
    "single_vqa":       0.20,   # R2
    "single_extra":     0.15,   # R3 (caption + grounding averaged)
    "change":           0.25,   # R4/R5
    "cross_modal":      0.20,   # R6
    "agentic":          0.20,   # R7: routing accuracy + trace completeness
}

def composite(scores: dict) -> dict:
    n = {k: (min(max(v, lo), hi) - lo) / (hi - lo)
         for k, v in scores.items() for lo, hi in [METRIC_RANGES[k]]}
    caps = {
        "single_vqa":   mean(n["rsvqa_lr_acc"], n["rsvqa_hr_acc"], n["vrsbench_vqa_acc"]),
        "single_extra": mean(n["vrsbench_cider"], n["vrsbench_acc50"]),
        "change":       mean(n["cdvqa_acc"], n["change_iou"]),
        "cross_modal":  n.get("cross_modal_score", 0.0),
        "agentic":      n.get("routing_accuracy", 0.0),
    }
    return {"per_capability": caps,
            "composite": sum(caps[k] * w for k, w in CAPABILITY_WEIGHTS.items())}
```

**Agentic scoring (`routing_accuracy`)** needs its own labelled set, because no public benchmark measures it: hand-label 150 queries spanning all input configurations with the correct `TaskType` and the minimal required tool set. Score = 0.5 × task-classification accuracy + 0.3 × required-tools-present rate + 0.2 × trace-completeness rate (all mandatory trace fields populated). Keep this set in `eval/data/routing_set.jsonl` and treat it as a first-class benchmark - it is the direct measurement of R7.

**Cross-modal scoring** where no public benchmark exists: on BigEarthNet test, report fused mAP minus max(optical-only, SAR-only) mAP, normalised. A positive number is proof of genuine complementarity rather than a fusion layer that ignores one sensor.

### 11.5 ISRO/SAC Evaluation Mode

The evaluation set contains pre-georeferenced, co-registered **Cartosat-2S optical** and **RISAT SAR** pairs with undisclosed reference annotations. Prepare for it explicitly:

```bash
AUTH_DISABLED=true STORAGE_BACKEND=local DB_BACKEND=sqlite PLANNER_BACKEND=local \
python -m eval.run_benchmark --dataset isro_sac --manifest /eval/manifest.json \
  --through-agent true --out /eval/out/predictions.json
```

Hard requirements for this mode:
- **No network calls.** All weights on local disk; planner and fusion in `local`/`template` mode. Verify with a container run using `--network none` in CI.
- **VLM- and GEE-backed tools are excluded from this mode entirely** (`offline_capable=False`, 8.1). `rs_vqa`, `rs_caption`, `rs_ground`, `change_describe`, `change_vqa`, `rs_classify`, and the GEE path of `change_detect`/`sar_optical_fuse` must all return a structured `NOT_EVALUATED_OFFLINE` status rather than attempt a call. The offline submission is therefore scored only on the deterministic tools (`spectral_index`, `sar_water_mask`, `geo_stats`, `coreg_check`, and the deterministic half of `sar_optical_fuse`) plus routing/gating behaviour (R7/R8/R9/R11). State this limitation explicitly in the submission notes — do not let a judge discover it by the predictions going empty.
- **GeoTIFF-native.** Cartosat-2S and RISAT products arrive as GeoTIFF with real CRS; the PNG path must not be involved.
- **Sensor-specific preprocessing.** Cartosat-2S is very high resolution panchromatic/multispectral (sub-metre to ~2 m) - do not assume Sentinel-2's 10 m or its band order. RISAT is SAR; run the dB pipeline from 6.5. Both are far outside BigEarthNet's 10 m Sentinel resolution, so the tiling path in 6.5 will be exercised heavily: test it on large rasters before submission.
- **Emit the official submission format.** Wrap `predictions.json` with an adapter so the internal format never leaks into a submission file.
- **Trace for every item.** Store one trace per evaluation item; the execution summary is part of what is judged.

### 11.6 Performance Budget

| Path | Target (p50) | Hard ceiling |
|------|--------------|--------------|
| Scene ingest + validation (2 × 4096²) | 12 s | 45 s |
| Single-image VQA | 4 s | 15 s |
| Grounding | 6 s | 20 s |
| Bi-temporal change (detect + describe) | 20 s | 60 s |
| Cross-modal fusion | 15 s | 45 s |

Measure with the trace's own `duration_ms` fields - the instrumentation already exists, so there is no excuse for guessing. If a path exceeds its ceiling, the first lever is tile count, the second is `self_consistency` (3 -> 1), and the third is the 2B VLM.

---

## 12. Phase 9 - Advanced & Differentiating Features

Build these only after Section 16's MVP milestone is green.

### 12.1 Multi-Turn Scene Conversation
Keep the last N turns per scene. Resolve references ("and the *northern* one?", "what about at the other date?") by passing prior turns' `TaskType`, phrases and artifact ids to the classifier. Any previous evidence layer can be reused as a `mask_ref` input to a new plan, so a follow-up question can be *measured against* a previous answer instead of recomputed.

### 12.2 Region-of-Interest Follow-Up
User drags a rectangle on the canvas; it becomes an `roi` on the scene. All subsequent tools crop to it (recording the ROI in the trace). This is how a user drills from "describe the scene" into "now just this reservoir" without re-uploading.

### 12.3 Tile-Level Reasoning for Large Scenes
For scenes above the tiling threshold, run `rs_classify` per tile to build a coarse semantic grid, then answer spatial questions ("which part of the image has the most vegetation?") from the grid with a deterministic argmax over quadrants. Far more reliable than asking a VLM to reason about position in a downsampled 4096² image.

### 12.4 Cloud & No-Data Awareness
Compute a cloud fraction (brightness + NDSI heuristic on optical) and a no-data fraction during ingest. If cloud > 30% on an optical image in a cross-modal pair, the planner up-weights SAR evidence and the answer says so explicitly - *"the optical image is 41% cloud-covered, so the water extent below is derived primarily from SAR"*. This is the single most compelling live demo for the cross-modal requirement.

### 12.5 Explain-the-Route
A "Why these tools?" button rendering `PlanStep.reason` per step alongside the alternatives that were rejected by the gate and why. Turns the trace from an audit log into an explanation.

### 12.6 Batch Query Mode
Upload a CSV of queries against one scene (or one query against many scenes) -> Cloud Tasks -> results table + combined CSV/GeoPackage export. This is what an operational user actually needs and it reuses the eval runner.

### 12.7 Model Comparison Mode
Run the same query with the adapted model and the un-adapted base model side by side. Displays both answers with confidences. It is the clearest possible demonstration that R1 was satisfied - and it is roughly fifty lines of code because the tool contract already abstracts the backend.

### 12.8 QGIS-Ready Export & SDK
A `satquery` Python client (`upload_scene`, `query`, `get_trace`, `download_evidence`) plus a QGIS-friendly GeoPackage export bundling every evidence layer from a session into one file with styled layers.

### 12.9 Deterministic Replay
`POST /api/queries/{id}/replay` re-executes a stored plan against the same scene with fixed seeds and diffs the results. Anything non-reproducible is a bug; this endpoint finds it. Also the fastest way to regression-test a model version bump.

---

## 13. Data Models

### 13.1 TypeScript Types (`frontend/lib/types.ts`)

```typescript
export type InputConfig   = 'SINGLE' | 'CROSS_MODAL' | 'BI_TEMPORAL';
export type Modality      = 'OPTICAL' | 'MULTISPECTRAL' | 'SAR' | 'AMBIGUOUS';
export type SceneStatus   = 'UPLOADING' | 'VALIDATING' | 'READY' | 'INCOMPATIBLE' | 'FAILED';
export type CheckStatus   = 'PASS' | 'WARN' | 'FAIL' | 'NA';
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
```

### 13.2 Pydantic Schemas (`backend/models/`)

Mirror the TypeScript exactly (snake_case on the wire; the frontend client camel-cases in `lib/api.ts`). Key models: `ImageMeta`, `CompatibilityReport`, `Scene`, `TaskClassification`, `GateResult`, `PlanStep`, `ExecutionPlan`, `ToolResult`, `Confidence`, `ExecutionTrace`, `QueryResult`.

**Rule:** `models/` holds schemas only - no I/O, no model loading, no storage access. Anything importable by both the API and the eval harness lives here so the benchmark runner can construct a `Scene` without a web request.

### 13.3 Firestore Structure

```
workspaces/{workspaceId}
  - name, orgType, ownerId, members: string[], defaultRegion, createdAt

scenes/{sceneId}
  - workspace_id, name, input_config, status, benchmark_mode, georeferenced
  - modalities: string[]
  - images: [{role, filename, storage_path, ...ImageMeta}]
  - compatibility: {verdict, checks[], target_crs, target_gsd_m, overlap_fraction, coreg_shift_px}
  - roi: {x1,y1,x2,y2} | null
  - created_at, updated_at

queries/{queryId}
  - scene_id, workspace_id, query, task, status
  - answer, abstained, confidence: {value, band, basis, contributions[]}
  - evidence: [{id, type, label, colour, source_step, storage_paths{}}]
  - trace_id
  - created_at

traces/{traceId}
  - full ExecutionTrace document (9.8)

models/{modelId}
  - backend_card.json contents (7.6), one doc per backend (VLM provider / GEE dataset), `active: bool`
```

---

## 14. API Reference

```
POST   /api/uploads/signed-url            Get a signed PUT URL for one image
POST   /api/uploads/local/{path}          Dev-only passthrough upload (LocalStorage)
GET    /api/files/{path}                  Dev-only file serving (LocalStorage)

POST   /api/scenes/confirm                Ingest uploaded images -> metadata + CompatibilityReport
GET    /api/scenes                        List scenes for the workspace (paginated)
GET    /api/scenes/{id}                   Scene detail incl. per-image metadata
POST   /api/scenes/{id}/revalidate        Re-run modality + compatibility checks
POST   /api/scenes/{id}/roi               Set or clear the region of interest
DELETE /api/scenes/{id}                   Delete scene and all derived artifacts

POST   /api/query                         Run a query (SSE stream: stage/plan/step/result)
POST   /api/query/sync                    Same, non-streaming (used by the eval harness)
GET    /api/queries/{id}                  Stored QueryResult
GET    /api/scenes/{id}/queries           Conversation history for a scene
POST   /api/queries/{id}/replay           Deterministic replay of a stored plan

GET    /api/tools                         Tool registry manifest (name, schema, accepts)
GET    /api/models                        Backend cards (VLM provider, GEE datasets) — no trained-model versions exist
GET    /api/health/models                 VLM & GEE readiness check

GET    /api/traces/{id}                   Full ExecutionTrace JSON
GET    /api/queries/{id}/export/pdf       Report PDF
GET    /api/queries/{id}/export/bundle    ZIP: report + trace + evidence + inputs
GET    /api/evidence/{artifactId}.tif     Evidence GeoTIFF (source CRS)
GET    /api/evidence/{artifactId}.geojson Evidence GeoJSON (EPSG:4326)

POST   /api/benchmarks/runs               Launch a benchmark run (Cloud Task)
GET    /api/benchmarks/runs               Run history + composite scores
GET    /api/benchmarks/runs/{id}          Per-dataset, per-metric breakdown

POST   /api/batch                         Batch queries (CSV of queries or scenes)
GET    /api/batch/{id}                    Batch status + results
```

**VLM Gateway (internal, not public):**
```
POST /vqa {images[], question} -> {answer, raw_provider_response}
POST /caption {images[], detail} -> {caption}
POST /ground {image, phrase} -> {boxes[{bbox, score}]}
POST /change_describe {t1, t2} -> {description}
POST /change_vqa {t1, t2, question} -> {answer}
GET /health -> {vlm_backend, gee_initialized: bool}
```

**Google Earth Engine (via `core/gee.py`, not a separate service):**
```
land_cover(aoi, date_range) -> class_fractions histogram (Dynamic World / ESA WorldCover)
change_ndvi_ndbi(aoi, t1_date, t2_date) -> change mask + stats
sentinel1_grd(aoi, date_range) -> processed backscatter (where in-catalog)
```

---

## 15. Environment Variables

### Frontend (`.env.local`)
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_MAX_UPLOAD_MB=512
```

### Backend (`.env` locally; Secret Manager on Cloud Run)
```
# --- runtime switches (Design Rule 5) ---
STORAGE_BACKEND=local             # local | gcs
DB_BACKEND=sqlite                 # sqlite | firestore
PLANNER_BACKEND=local             # local | vertex
FUSION_BACKEND=template           # template | vertex
AUTH_DISABLED=true                # true only for local dev and offline evaluation

# --- local paths ---
LOCAL_STORAGE_ROOT=./_data
SQLITE_PATH=./_data/satquery.db
API_BASE_URL=http://localhost:8080

# --- VLM gateway ---
VLM_BACKEND=gemini                # gemini | gpt4v | claude
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# --- Google Earth Engine ---
GEE_SERVICE_ACCOUNT=satquery-gee@satquery-prod.iam.gserviceaccount.com
GEE_KEY_PATH=/secrets/gee-service-account.json
GEE_PROJECT=satquery-prod

# --- agent tuning ---
ABSTAIN_THRESHOLD=0.35
MAX_PLAN_STEPS=8
DEFAULT_SELF_CONSISTENCY=3
TILE_THRESHOLD_PX=16777216        # 4096*4096
TILE_SIZE=1024
TILE_OVERLAP=128

# --- GCP (Section 17; unused while STORAGE_BACKEND=local) ---
GCP_PROJECT_ID=satquery-prod
GCP_REGION=asia-south1
GCS_BUCKET_NAME=satquery-scenes-satquery-prod
GCS_MODELS_BUCKET=satquery-models-satquery-prod
FIRESTORE_DATABASE=(default)
VERTEX_AI_LOCATION=asia-south1
PLANNER_MODEL=gemini-2.0-flash
CLOUD_TASKS_QUEUE=satquery-jobs
WORKER_URL=
WORKER_SA_EMAIL=
BIGQUERY_DATASET=satquery_eval
GOOGLE_APPLICATION_CREDENTIALS=/secrets/service-account.json
```

---

## 16. Implementation Order

Build in this sequence so there is always something demoable. Do not reorder - later rows depend on the contracts established by earlier ones.

| Step | Deliverable | Demoable? |
|------|-------------|-----------|
| 1 | Frontend shell: routing, layout, dashboard, upload wizard on mocks | Yes - full UI clickable |
| 2 | FastAPI skeleton + `core/` abstractions (storage, db, config) + health | Yes - local upload works |
| 3 | Ingest: `raster_reader`, `modality_detector`, previews | Yes - real GeoTIFF metadata + band inspector |
| 4 | `compatibility_checker` + Compatibility Panel wired end-to-end | Yes - **R8 visibly satisfied** |
| 5 | Tool base/registry + deterministic tools (`spectral_index`, `sar_water_mask`, `geo_stats`, `coreg_check`) | Yes - real measured answers, no ML yet |
| 6 | VLM gateway skeleton wired to `rs_vqa`/`rs_caption` via hosted API (Gemini/GPT-4V/Claude) | Yes - VQA on satellite imagery, no GPU needed |
| 7 | Agent v1: classifier + gate + rule planner + executor + template fusion + trace | **MVP - R2/R3/R7/R8/R11 all demonstrable** |
| 8 | Evidence pipeline: overlays, GeoTIFF/GeoJSON export, canvas layers | Yes - visual evidence on the map |
| 9 | GEE setup (`core/gee.py`, service account) + `rs_classify` on Dynamic World/ESA WorldCover | Yes - real land-cover stats for an AOI, no training |
| 10 | `change_detect` via GEE NDVI/NDBI differencing + change map layer + swipe compare | Yes - **R5**, with the IoU caveat from 7.4 stated in the UI |
| 11 | `change_describe` + `change_vqa` via VLM gateway | Yes - **R4 satisfied**; **R1 explicitly marked not attempted** |
| 12 | `sar_optical_fuse` deterministic-only (agreement of NDWI/NDBI vs. SAR backscatter) + conflict layer | Yes - **R6 satisfied without a learned fusion head** |
| 13 | `rs_ground` via VLM box-parsing + box layer | Yes - **R3 fully satisfied**, honest confidence framing |
| 14 | Confidence + abstention + execution trace UI polish | Yes - trustworthy behaviour on display |
| 15 | Eval harness: RSVQA + VRSBench + CDVQA + routing set + composite | Yes - real numbers to quote |
| 16 | Report builder (PDF) + export bundle | Yes - downloadable deliverable |
| 17 | Auth + workspaces + Firestore migration | Yes - multi-user |
| 18 | Advanced features (12.1-12.9), starting with cloud-awareness and model comparison | Yes |
| 19 | **GCP deployment (Section 17)** | Yes - public URL |

**Step 7 is the MVP.** At that point the system is genuinely agentic end-to-end. Steps 9-13 turn it into a live-demo-ready product, but **do not claim they satisfy R1** — R1 is not attempted in this version (7.0). Say so in the submission rather than letting a judge find it.

**Demo script (rehearse this exact sequence):**
1. Upload a Cartosat-2S + RISAT pair -> Compatibility Panel shows CRS, GSD ratio, 1.4 px co-registration -> **input validation is visible**
2. Ask *"Use the optical and SAR images together to identify built-up and water-covered regions."* -> steps stream live -> water/built-up/conflict layers appear -> answer cites measured hectares
3. Point at the conflict layer: *"these pixels look like water in optical but bright in SAR - they are shadow, not water"* -> this is the cross-modal payoff in one sentence
4. Open the trace drawer -> tools, models with versions, parameters, durations, confidences
5. Switch to a bi-temporal pair -> *"Has the built-up area increased, decreased, or remained unchanged?"* -> change map + direction + quantified area
6. Ask something unanswerable with the given inputs -> structured refusal with a remedy -> **the system knows what it cannot do**
7. Download the PDF report -> backend provenance page states plainly: no fine-tuning was performed (7.6), and names which hosted VLM / GEE datasets were used.

---

## 17. Deployment & Hosting on Google Cloud (do this last)

Everything above runs locally with `STORAGE_BACKEND=local DB_BACKEND=sqlite`. Do this section only once the application works end-to-end on a laptop. Nothing here changes application code - only configuration.

### 17.1 Project Setup

```bash
# Install the gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth login
gcloud projects create satquery-prod --name="SatQuery AI"
gcloud config set project satquery-prod
gcloud billing projects link satquery-prod --billing-account=YOUR_BILLING_ID

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  cloudtasks.googleapis.com \
  secretmanager.googleapis.com \
  bigquery.googleapis.com \
  iam.googleapis.com \
  compute.googleapis.com
```

**Region:** use `asia-south1` (Mumbai) for storage, Firestore, Cloud Run API and Cloud Tasks - lowest latency for Indian users and evaluators.

### 17.2 Service Accounts & IAM

```bash
# API service account
gcloud iam service-accounts create satquery-api-sa --display-name="SatQuery API"
for role in roles/datastore.user roles/storage.objectAdmin \
            roles/cloudtasks.enqueuer roles/aiplatform.user \
            roles/secretmanager.secretAccessor roles/bigquery.dataEditor; do
  gcloud projects add-iam-policy-binding satquery-prod \
    --member="serviceAccount:satquery-api-sa@satquery-prod.iam.gserviceaccount.com" \
    --role="$role"
done
```

Use Workload Identity on Cloud Run - **never bake a key file into an image.** `GOOGLE_APPLICATION_CREDENTIALS` is for local development only.

### 17.3 Cloud Storage

```bash
gcloud storage buckets create gs://satquery-scenes-satquery-prod \
  --location=asia-south1 --uniform-bucket-level-access
gcloud storage buckets create gs://satquery-artifacts-satquery-prod \
  --location=asia-south1 --uniform-bucket-level-access
```

**CORS for browser uploads** - `infra/storage.cors.json`:
```json
[{
  "origin": ["https://satquery.vercel.app", "http://localhost:3000"],
  "method": ["GET", "PUT", "POST", "OPTIONS"],
  "responseHeader": ["Content-Type", "x-goog-resumable"],
  "maxAgeSeconds": 3600
}]
```
```bash
gcloud storage buckets update gs://satquery-scenes-satquery-prod \
  --cors-file=infra/storage.cors.json
```

**Lifecycle:** delete derived artifacts under `**/derived/**` after 30 days; keep source scenes. GeoTIFF evidence is cheap to regenerate from a stored trace, and this keeps costs flat.

### 17.4 Firestore

```bash
gcloud firestore databases create --location=asia-south1 --type=firestore-native
gcloud firestore indexes composite create \
  --collection-group=scenes --field-config field-path=workspace_id,order=ascending \
  --field-config field-path=created_at,order=descending
gcloud firestore indexes composite create \
  --collection-group=queries --field-config field-path=scene_id,order=ascending \
  --field-config field-path=created_at,order=descending
```

### 17.5 Artifact Registry & Images

```bash
gcloud artifacts repositories create satquery \
  --repository-format=docker --location=asia-south1
gcloud auth configure-docker asia-south1-docker.pkg.dev
```

### 17.6 Deploy the VLM Gateway (CPU, no GPU)

```bash
gcloud run deploy satquery-vlm-gateway \
  --source ./vlm-gateway \
  --region us-central1 \
  --cpu 2 --memory 2Gi \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 120 \
  --no-allow-unauthenticated \
  --service-account satquery-vlm-sa@satquery-prod.iam.gserviceaccount.com \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest \
  --set-env-vars=VLM_BACKEND=gemini
```

No GPU, no `--min-instances 1` requirement — it's a thin API wrapper, cold starts are cheap. Cost now scales with per-call VLM API pricing rather than idle GPU time; monitor it under 17.13 alongside GEE quota usage instead of GPU spend.

Grant the API permission to call it, same pattern as before:
```bash
gcloud run services add-iam-policy-binding satquery-vlm-gateway --region us-central1 \
  --member="serviceAccount:satquery-api-sa@satquery-prod.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

**GEE runs in-process inside the API service** (`core/gee.py`), not as a separate deployment — grant `satquery-api-sa` the Earth Engine service-account role and mount `GEE_KEY_PATH` as a secret.

### 17.7 Deploy the API (CPU)

**`infra/cloudrun-api.yaml`:**
```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: satquery-api
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "20"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 40
      timeoutSeconds: 600          # SSE streams for long change-detection queries
      containers:
        - image: asia-south1-docker.pkg.dev/satquery-prod/satquery/api:latest
          resources:
            limits: { cpu: "4", memory: "8Gi" }
```

```bash
gcloud run deploy satquery-api \
  --source ./backend \
  --region asia-south1 \
  --allow-unauthenticated \
  --cpu 4 --memory 8Gi \
  --min-instances 1 --max-instances 20 \
  --timeout 600 --concurrency 40 \
  --service-account satquery-api-sa@satquery-prod.iam.gserviceaccount.com \
  --set-env-vars=STORAGE_BACKEND=gcs,DB_BACKEND=firestore,AUTH_DISABLED=false,\
PLANNER_BACKEND=vertex,FUSION_BACKEND=template,\
GCP_PROJECT_ID=satquery-prod,GCP_REGION=asia-south1,\
GCS_BUCKET_NAME=satquery-scenes-satquery-prod,\
VERTEX_AI_LOCATION=asia-south1,PLANNER_MODEL=gemini-2.0-flash \
  --set-env-vars=MODEL_SERVER_URL=https://satquery-model-xxxxx.a.run.app
```

**`--timeout 600` and `cpu-throttling: false` both matter:** SSE connections stay open for the length of a query, and a throttled CPU stalls rasterio tiling between streamed events.

### 17.8 Cloud Tasks (batch & eval jobs)

```bash
gcloud tasks queues create satquery-jobs --location=asia-south1 \
  --max-concurrent-dispatches=5 --max-attempts=3
```

```python
from google.cloud import tasks_v2

def dispatch_job(kind: str, payload: dict):
    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(PROJECT_ID, REGION, "satquery-jobs")
    client.create_task(request={"parent": parent, "task": {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{WORKER_URL}/jobs/{kind}",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(payload).encode(),
            "oidc_token": {"service_account_email": WORKER_SA_EMAIL},
        },
        "dispatch_deadline": {"seconds": 1800},
    }})
```

Benchmark runs and batch queries go through this queue; interactive queries never do.

### 17.9 Vertex AI (planner LLM + training)

```python
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig

vertexai.init(project=os.environ["GCP_PROJECT_ID"], location=os.environ["VERTEX_AI_LOCATION"])
_planner = GenerativeModel(os.environ["PLANNER_MODEL"], system_instruction=PLANNER_SYSTEM)

async def vertex_json(system: str, payload: str, temperature: float = 0.0) -> str:
    resp = await _planner.generate_content_async(
        [payload],
        generation_config=GenerationConfig(temperature=temperature, max_output_tokens=1024,
                                           response_mime_type="application/json"),
    )
    return resp.text
```

`response_mime_type="application/json"` removes an entire class of parsing failures. The rule-planner fallback in 9.4 still applies - the planner is an enhancement, never a dependency (Design Rule 3).

### 17.10 Secrets

```bash
echo -n "value" | gcloud secrets create HF_TOKEN --data-file=-
gcloud run services update satquery-model --region us-central1 \
  --update-secrets=HF_TOKEN=HF_TOKEN:latest
```

Never commit `.env`. Add `.env`, `_data/`, `weights/`, `*.tif` to `.gitignore` before the first push - a stray GeoTIFF in git history is very hard to remove later.

### 17.11 Frontend Hosting

**Option A - Vercel (recommended for speed):**
```bash
cd frontend && vercel --prod
# Set NEXT_PUBLIC_API_BASE_URL to the Cloud Run API URL, plus the Firebase vars
```
Add the Vercel domain to the GCS CORS list (17.3) and to Firebase Auth authorised domains.

**Option B - Cloud Run (single-cloud):**
```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:20-slim
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
ENV PORT=8080
CMD ["node", "server.js"]
```
Requires `output: 'standalone'` in `next.config.js`.

```bash
gcloud run deploy satquery-web --source ./frontend --region asia-south1 --allow-unauthenticated
```

### 17.12 BigQuery (evaluation history)

```bash
bq --location=asia-south1 mk --dataset satquery-prod:satquery_eval
bq mk --table satquery-prod:satquery_eval.runs \
  run_id:STRING,dataset:STRING,split:STRING,model_versions:JSON,through_agent:BOOL,\
metrics:JSON,composite:FLOAT64,created_at:TIMESTAMP
bq mk --table satquery-prod:satquery_eval.items \
  run_id:STRING,item_id:STRING,task:STRING,prediction:STRING,reference:STRING,\
correct:BOOL,confidence:FLOAT64,tools_used:STRING,duration_ms:INT64
```

The Benchmarks page queries these tables. Per-item rows are what let you answer "which question types did we regress on?" after a model version bump - an aggregate score cannot.

### 17.13 Monitoring & Cost Control

**Alerts** (Cloud Monitoring): API 5xx rate > 2% over 5 min; model-server p95 latency > 60 s; Cloud Run instance count at max for > 10 min; daily spend above threshold.

**Structured logging** (`core/logging.py`): emit JSON with `trace_id`, `scene_id`, `tool`, `duration_ms`, `confidence` on every tool execution. Log-based metrics then give per-tool latency and confidence distributions without any extra instrumentation.

**Cost control:**
- The L4 model server is the dominant cost. Set `--min-instances 0` outside demo and evaluation windows and accept cold starts.
- Cap `--max-instances 3` on the GPU service - a runaway autoscale on GPUs is expensive fast.
- Budget alert at 50% / 90% / 100% of the allocation.
- `gcloud run services update satquery-model --min-instances 1` before a demo; set it back to 0 afterwards. Put both commands in `infra/demo-on.sh` and `infra/demo-off.sh` so nobody forgets at 2 a.m.

### 17.14 CI/CD (`.github/workflows/deploy.yml`)

```yaml
name: deploy
on:
  push: { branches: [main] }
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.DEPLOY_SA }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: pytest backend/tests -q
      - run: |
          gcloud run deploy satquery-api --source ./backend \
            --region asia-south1 --quiet
  offline-eval-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Design Rule 3 is a CI-enforced invariant, not a hope:
      # the eval path must complete with no network access.
      - run: |
          docker build -t satquery-eval -f eval/Dockerfile .
          # VLM- and GEE-backed tools self-report NOT_EVALUATED_OFFLINE (11.5);
          # this smoke test only exercises the deterministic tool path.
          docker run --network none satquery-eval \
            python -m eval.run_benchmark --dataset smoke --limit 5 --planner-backend local
```

### 17.15 Deployment Checklist

- [ ] All APIs enabled; billing linked
- [ ] Three GCS buckets created with uniform access; CORS applied to the scenes bucket
- [ ] Weights synced to the models bucket; `registry.json` lists the active version per model
- [ ] Firestore created in `asia-south1`; rules deployed; composite indexes built
- [ ] Model server deployed with GPU, `min-instances 1`, **not** publicly invokable
- [ ] API deployed with `STORAGE_BACKEND=gcs`, `DB_BACKEND=firestore`, `AUTH_DISABLED=false`
- [ ] API service account granted `run.invoker` on the model server
- [ ] `GET /api/health/models` returns all five models loaded
- [ ] Frontend deployed; `NEXT_PUBLIC_API_BASE_URL` points at the API; domain added to CORS and Firebase authorised domains
- [ ] End-to-end smoke test: upload a real GeoTIFF pair, run one query per input configuration, download the PDF and the trace JSON
- [ ] Offline evaluation container passes with `--network none`
- [ ] Budget alerts configured; `demo-off.sh` scheduled or diarised

---

*SatQuery AI PRD v1.0 - Agentic Vision-Language Assistant for Multimodal Remote Sensing - ISRO/SAC*
