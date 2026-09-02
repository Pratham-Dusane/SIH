# SatQuery AI — Complete Platform Guide, Architecture & Presentation Walkthrough

> **The Definitive Team & Evaluator Manual**  
> *Everything you need to know about the platform, user flows, frontend UI, backend agent pipeline, tool ecosystem, extension features, and demo presentation script.*

---

## Table of Contents
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [End-to-End User Journey](#2-end-to-end-user-journey)
3. [Frontend Architecture & UI Walkthrough](#3-frontend-architecture--ui-walkthrough)
4. [Backend Architecture & 6-Stage Agent Pipeline](#4-backend-architecture--6-stage-agent-pipeline)
5. [The Tool Ecosystem & Grounded Verification](#5-the-tool-ecosystem--grounded-verification)
6. [Delivered Extension Features Deep Dive](#6-delivered-extension-features-deep-dive)
   - [F0: Shared Substrate & Spatial Indexing](#f0-shared-substrate--spatial-indexing)
   - [F1: Scene Enhancement Preprocessing](#f1-scene-enhancement-preprocessing)
   - [F2: Layered Vector Annotation & Agent Protocol](#f2-layered-vector-annotation--agent-protocol)
   - [F5: Historical Scenes Analytics Dashboard](#f5-historical-scenes-analytics-dashboard)
   - [F12: Location History & Context Research](#f12-location-history--context-research)
7. [Step-by-Step Live Demo Presentation Script](#7-step-by-step-live-demo-presentation-script)
8. [Anticipated Judge Q&A & Defenses](#8-anticipated-judge-qa--defenses)

---

## 1. Executive Summary & Problem Statement

### The Problem
- **Complex GIS Toolchains**: Analyzing satellite imagery traditionally requires specialized desktop GIS software (ArcGIS, QGIS), custom Python scripts (GDAL, Rasterio), and deep domain knowledge in remote sensing indices (NDVI, NDWI, NDBI).
- **Multi-Modal Data Silos**: Optical sensors (Sentinel-2, Landsat) fail under cloud cover and night. SAR sensors (Sentinel-1, RISAT) penetrate clouds and weather but suffer from speckle noise and are unintuitive for human interpretation. Fusing them is mathematically complex.
- **LLM / VLM Hallucination**: Off-the-shelf Vision-Language Models (VLMs) frequently hallucinate area numbers, hectare statistics, and change extents because they cannot perform calibrated pixel-level radiometric calculations.

### The SatQuery AI Solution
**SatQuery AI** is an **Agentic Earth Observation Intelligence Platform** that democratizes satellite analysis:
1. **Multi-Modal Native**: Ingests and cross-analyzes Single Optical, Synthetic Aperture Radar (SAR), Cross-Modal (Optical + SAR) pairs, and Bi-Temporal change pairs.
2. **Grounded Agentic Pipeline**: Converts natural-language questions into dynamic DAG execution plans combining deterministic computer-vision tools with vision-language models, enforcing **strict mathematical grounding** to eliminate hallucinations.
3. **Unified Analysis Workbench**: Interactive image canvas, instant image blending, vector annotation layers, scene enhancement, location context, and multi-year historical analytics.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SATQUERY AI PLATFORM                                 │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│  Multi-Modal Imagery     │    6-Stage Agent Pipeline   │   Unified Interactive UI      │
│  • Sentinel-2 Optical    │    1. Task Classification   │   • High-Performance Canvas   │
│  • Sentinel-1 SAR        │    2. Input Validation Gate │   • Split/Blend Dual Views    │
│  • Cross-Modal Pairs     │    3. Dynamic DAG Planning  │   • Unified 4-in-1 Right Rail │
│  • Bi-Temporal Change    │    4. Deterministic CV/VLM  │   • Live SSE Execution Trace  │
│  • GEE Ingest Adapter    │    5. Numerical Grounding   │   • Vector Annotation Overlay │
│  • Local GeoTIFF Upload  │    6. Self-Verification     │   • Real-Time Analytics Page  │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

---

## 2. End-to-End User Journey

Here is what happens step-by-step when a user visits the platform:

```
[1. Upload / Ingest Scene] ──> [2. Open Scene Workspace] ──> [3. Ask Question in Query Console]
                                            │                                │
                                            ▼                                ▼
                              [Interactive Canvas & Controls]    [Agent DAG Execution Pipeline]
                                            │                                │
                                            ▼                                ▼
                              [Toggle Right Rail Tools]          [Grounded Answer + Trace + Layers]
                               (Enhance / Annotate / Context)
```

### Step 1: Ingestion & Workspace Selection
1. The user navigates to `/dashboard` or `/scene/new`.
2. They upload a GeoTIFF raster (or fetch Sentinel imagery from Google Earth Engine).
3. The platform validates georeferencing, coordinate reference system (CRS), Ground Sample Distance (GSD), and modality.
4. The user sets acquisition dates and names the scene.

### Step 2: Interactive Analysis Workspace (`/scene/[sceneId]`)
- **Evidence Canvas (Left/Center)**: Displays the high-resolution satellite imagery with fluid zoom/pan, raster evidence overlays, and acquisition metadata.
- **Dual-Image Blending**: For Cross-Modal or Bi-Temporal pairs, a slider lets the user blend between Optical $\leftrightarrow$ SAR or Pre-Change $\leftrightarrow$ Post-Change.
- **Layer Controls**: Allows toggling visibility and opacity of AI-generated masks (e.g. water masks, change masks, bounding boxes).

### Step 3: Natural-Language Querying & Agent Execution
- The user types a question in the **Query Console** (e.g., *"How much water body area has changed between these dates?"* or *"Can you mark the highways in this image with arrows?"*).
- The system streams back the answer in real time via Server-Sent Events (SSE), visualizing each stage:
  - **Classifying** $\rightarrow$ **Planning** $\rightarrow$ **Running Tools** $\rightarrow$ **Fusing & Verifying** $\rightarrow$ **Complete Answer**.
- The answer displays an ensemble **Confidence Score**, **Confidence Basis**, and clickable evidence artifacts.
- The **Execution Trace Drawer** slides up to reveal every tool executed, parameter applied, execution duration in milliseconds, and intermediate outputs.

### Step 4: Specialized Right-Hand Tool Panels (Right Rail)
With a single click or keyboard shortcut (`Alt+1..4`), the user switches between:
- **`Alt+1` Query Console**: Multimodal conversational intelligence.
- **`Alt+2` Scene Enhancement (F1)**: Apply radiometric CLAHE, Brovey pansharpening, NLM speckle filter, or super-resolution with real-time SSIM quality gate readouts.
- **`Alt+3` Vector Annotations (F2)**: Draw custom vector shapes (polygons, rectangles, circles, arrows, points, text), inspect measurements in hectares, or view agent-drawn highlights.
- **`Alt+4` Location Context (F12)**: Research historical disaster annals, flood records, and infrastructure master plans for the scene's administrative district.

### Step 5: Multi-Year Historical Analytics (`/historical`)
- Displays real-time aggregated metrics across the entire multi-sensor archive.
- Interactive KPI cards, 6 distribution charts (scenes over time, task mix, tool usage, confidence trends, modality mix), spatial footprint browser, and searchable scenes table.

---

## 3. Frontend Architecture & UI Walkthrough

### Tech Stack
- **Framework**: Next.js 16 (Turbopack, App Router, React 19)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + Custom Dark Theme + Glassmorphic Design System
- **State Management**: Zustand (modular slices for workbench store, features store, annotation store)
- **Charts & Visualization**: Recharts (Area, Bar, Pie, Radar, Line) + SVG Canvas Overlays
- **Icons**: Lucide React

### Key Directory Structure
```
frontend/
├── app/
│   └── (app)/
│       ├── dashboard/page.tsx          # Workspace & recent scenes overview
│       ├── historical/page.tsx         # Multi-year historical analytics dashboard (F5)
│       ├── scene/
│       │   ├── [sceneId]/page.tsx      # Main workbench page
│       │   └── new/page.tsx            # Scene upload & GEE fetch wizard
├── components/
│   ├── layout/Sidebar.tsx              # Left navigation sidebar
│   ├── workbench/RightRail.tsx         # Unified 4-in-1 right tool panel container
│   ├── evidence/
│   │   ├── EvidenceCanvas.tsx          # High-performance canvas & raster renderer
│   │   └── LayerControls.tsx           # Floating overlay visibility & opacity controls
│   ├── query/
│   │   └── QueryConsole.tsx            # Streaming conversation console
│   └── trace/
│       ├── ExecutionTimeline.tsx       # Bottom drawer trace timeline
│       └── PipelineVisualizer.tsx      # Multi-stage execution pipeline pills
├── features/                           # Independent modular feature implementations
│   ├── console/register.tsx            # Core query console registration
│   ├── enhancement/                    # F1 Scene Enhancement panel & register
│   ├── annotation/                     # F2 Layered Vector Annotation canvas & store
│   ├── historical/                     # F5 Analytics charts & coverage map
│   ├── location_history/               # F12 Location Context panel & service
│   └── index.ts                        # Central feature registration barrel
└── lib/
    ├── registry.ts                     # Dynamic panel & nav registry (F0)
    ├── features-store.ts               # Feature capability Zustand slice
    └── store.ts                        # Core scene & query turns store
```

### The Modular Registry System (`lib/registry.ts`)
Each feature is **completely decoupled** from the shell:
- Features call `registerPanel({...})` or `registerNavItem({...})`.
- The shell inspects available features from `GET /api/features`.
- If a feature is disabled via backend config, its routes 404, its panel icons vanish, and its code contributes 0 overhead.

---

## 4. Backend Architecture & 6-Stage Agent Pipeline

### Backend Tech Stack
- **Framework**: FastAPI (Python 3.13)
- **Database**: SQLite with atomic document JSON storage (`core/db.py`)
- **Spatial Indexing**: Shapely `STRtree` (~820 Indian district boundaries in `core/geo/admin_lookup.py`)
- **Remote Sensing & Array Processing**: NumPy, Rasterio, SciPy, Pillow, OpenCV (optional)
- **Satellite Ingest**: Google Earth Engine API (`GEESource` in `core/imagery/base.py`)
- **Inference Gateway**: Multi-model VLM Gateway (`services/inference/vlm_gateway.py`) supporting Google Gemini, Claude, and local vision endpoints.

---

### The 6-Stage Agent Execution Pipeline

Every user query flows through a deterministic, 6-stage agentic lifecycle:

```
[User Query]
     │
     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: TASK CLASSIFICATION (task_classifier.py)                      │
│ Classifies query into 1 of 8 specialized task types:                   │
│ • SINGLE_IMAGE_VQA        • TEXT_GUIDED_GROUNDING                      │
│ • SINGLE_IMAGE_CAPTIONING • CHANGE_DESCRIPTION                         │
│ • CHANGE_VQA              • CHANGE_MAP_GENERATION                      │
│ • CROSS_MODAL_ANALYSIS    • LAND_COVER_ANALYSIS                        │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: INPUT VALIDATION GATE (input_gate.py)                         │
│ Verifies image modality, resolution, coregistration, and CRS.          │
│ Refuses queries with clear reasons rather than fabricating answers.    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: DYNAMIC DAG PLANNING (planner.py)                             │
│ Generates directed acyclic execution graph of CV & VLM tools.          │
│ e.g. rs_ground ──> annotate ──> geo_stats                              │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: TOOL EXECUTION & CACHING (executor.py & context.py)           │
│ Executes DAG steps with strict timeouts, caching intermediate arrays.  │
│ Emits live SSE progress events to the frontend.                        │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: NUMERICAL GROUNDING & FUSION (fusion.py)                      │
│ Strict verification: Checks if any number stated by VLM matches       │
│ measured tool outputs. Discards ungrounded hallucinations.             │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: SELF-VERIFICATION & CONFIDENCE (verifier.py)                  │
│ Computes weighted ensemble confidence score & basis.                   │
│ Emits final answer, evidence layers, and ExecutionTrace.               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. The Tool Ecosystem & Grounded Verification

SatQuery AI pairs high-level vision-language understanding with **pixel-exact, deterministic math tools**:

| Tool Name | Type | Modalities | What It Does | Produces |
| :--- | :--- | :--- | :--- | :--- |
| `spectral_index` | Deterministic CV | Optical | Computes NDVI (greenery), NDWI (water), NDBI (built-up), NDSI (snow) | Raster mask, index grid |
| `sar_water_mask` | Deterministic CV | SAR | Thresholds backscatter ($\sigma^0 < -15\text{ dB}$) with Otsu refinement | Binary water mask |
| `sar_optical_fuse` | Deterministic CV | Optical + SAR | Inter-sensor cross-validation (agreed water/built-up masks) | Agreed consensus mask |
| `coreg_check` | Deterministic CV | Dual / Temporal | Computes phase correlation & spatial offset between pair images | Registration error (px), OK flag |
| `change_detect` | Deterministic CV | Bi-Temporal | Log-ratio differencing + Otsu morphological thresholding | Binary change map |
| `geo_stats` | Deterministic Math | All | Converts binary masks/boxes to calibrated physical area ($\text{m}^2$, $\text{ha}$, $\text{km}^2$) | Area stats, percentages |
| `rs_ground` | Vision VLM | Optical / SAR | Detects bounding coordinates of natural-language query targets | Normalised box $[0, 1]$, GeoJSON |
| `rs_vqa` | Vision VLM | Optical / SAR | Visual reasoning over single scene | Contextual text answer |
| `change_vqa` | Vision VLM | Bi-Temporal | Answers temporal evolution questions anchored on change map | Temporal analysis text |
| `annotate` | Agent Vector | All | Draws vector shapes (arrows, rectangles, ellipses) directly onto canvas | Vector layer, SVG shapes |
| `location_history` | Contextual Research| All | Retrieves historical events, flood history, and master plan annals | Timeline, development summary |

### The Anti-Hallucination Grounding Rule
If a VLM generates text claiming *"The flooded area is 45.2 hectares"*, Stage 5 (`fusion.py`) extracts all numeric figures from the text and cross-references them against numbers computed by deterministic tools (`geo_stats`, `spectral_index`). If a number was **not produced by a deterministic measurement tool**, it is flagged as `UNSUPPORTED` and stripped or replaced with the verified tool measurement.

---

## 6. Delivered Extension Features Deep Dive

### F0: Shared Substrate & Spatial Indexing
- **Full GEE Source**: [backend/core/imagery/base.py](file:///c:/projects/SIH/backend/core/imagery/base.py) implements the `ImagerySource` protocol, querying Sentinel-2 Surface Reflectance and Sentinel-1 GRD imagery directly from Google Earth Engine.
- **AdminLookup Engine**: [backend/core/geo/admin_lookup.py](file:///c:/projects/SIH/backend/core/geo/admin_lookup.py) indexes all **820+ Indian district boundaries** (`india_districts.geojson`) in an in-memory `STRtree` spatial index, providing instant point-in-polygon resolution ($<1\text{ms}$) from image centroid coordinates.
- **Dynamic Feature Flags**: [backend/core/features.py](file:///c:/projects/SIH/backend/core/features.py) allows toggling features via environment variables (`FEATURE_ENHANCEMENT_ENABLED=true`, etc.).

---

### F1: Scene Enhancement Preprocessing
- **Location**: Right Rail $\rightarrow$ `Alt+2` (Sparkles icon).
- **Methods**:
  1. *Radiometric Stretch*: 2%–98% percentile histogram stretching + Contrast Limited Adaptive Histogram Equalization (CLAHE).
  2. *NLM Speckle Filter*: Non-local means denoising tailored to SAR speckle noise reduction without blurring structural boundaries.
  3. *Brovey Pansharpening*: Merges high-resolution panchromatic bands with multispectral channels.
  4. *Tiled Super-Resolution*: Cosine-feathered overlapping sub-tile inference.
- **Quality Gating**: Computes SSIM ($\ge 0.70$) against bicubic upsampling and Laplacian variance sharpness gain ($\ge 1.05$). Rejects blurry artifacts automatically.

---

### F2: Layered Vector Annotation & Agent Protocol
- **Location**: Right Rail $\rightarrow$ `Alt+3` (PenTool icon).
- **Interactive SVG Overlay**: Mounted directly on top of the image canvas in canonical normalized coordinates $[0, 1]$.
- **7 Shape Kinds**: Freehand drawing, Polygon, Rectangle, Circle, Ellipse, Arrow, Point, and Text.
- **Full Professional Layer Hierarchy**:
  - Add/delete layers, reorder via drag, toggle visibility, lock layers, customize stroke colors and opacity.
  - 50-step Undo/Redo history stack.
  - GeoJSON Import & Export.
- **Agent Drawing Tool (`annotate`)**: The agent can autonomously decide drawing tools (e.g. arrows for highways, ellipses for lakes, rectangles for parcels) and render vector layers in response to chat prompts.

---

### F5: Historical Scenes Analytics Dashboard
- **Location**: Sidebar $\rightarrow$ `/historical`.
- **100% Real Database Connection**: Aggregates live records from your SQLite database without mock data.
- **6 Recharts Visualizations**:
  1. *Scenes Over Time*: Area chart of ingested scenes by date and modality.
  2. *Task Type Distribution*: Bar chart of query types (Urban, Flood, Land Cover, VQA).
  3. *Tool Usage & Confidence*: Radar / Bar chart showing tool executions and average confidence.
  4. *Confidence & Abstention Trend*: Dual-line tracking model accuracy over time.
  5. *Modality Archive Ratio*: Donut chart of Optical vs SAR vs Cross-Modal vs Bi-Temporal.
  6. *Measured Surface Change*: Category-wise hectarage totals.
- **District Resolution**: Automatically resolves scene coordinate bounds to administrative districts (`AdminLookup`) for filtering.

---

### F12: Location History & Context Research
- **Location**: Right Rail $\rightarrow$ `Alt+4` (BookOpen icon).
- **External Contextual Intelligence**: Unlike F5 (which looks at previously analyzed workspace scenes), F12 retrieves external historical, disaster, and development records for the geographic location itself.
- **Structured Report**:
  - *Location Overview*: Administrative unit ID, district, state, centroid, period analyzed (e.g. 2000–2026).
  - *Chronological Timeline*: Milestones (e.g. 2005 flood deluge, 2011 highway expansion, 2016 Smart City demarcation, 2019 flash flooding, 2022 ring road construction, 2025 flood mitigation).
  - *Historical Development*: Sprawl dynamics, infrastructure evolution, environmental annals, agricultural transition.
  - *Non-Causal Guardrail*: Contextual evidence narrative with explicit disclaimers preventing unproven causal assertions.
  - *Bibliography*: Full source citations with publishers, dates, URLs, and excerpts.
- **Agent Tool (`location_history`)**: Answers natural language questions like *"What has happened historically in this area?"* directly in the chat console.

---

## 7. Step-by-Step Live Demo Presentation Script

Use this exact script to deliver a flawless, high-impact demonstration:

### [0:00 – 1:00] The Hook & Overview
> **Speaker 1**: *"Good morning, judges. Satellite imagery is one of humanity's most powerful tools for disaster management, urban planning, and environmental monitoring. But today, analyzing it requires specialized GIS engineers and complex software. General AI vision models fail because they hallucinate area statistics and cannot handle radar imagery. We built **SatQuery AI** — an agentic Earth observation platform that allows anyone to query, enhance, annotate, and understand satellite imagery using natural language with 100% mathematically grounded answers."*

### [1:00 – 2:30] Scene Workspace & Multi-Modal Fusion
> **Speaker 2**: *(Screen showing `/scene/[sceneId]`)*  
> *"Here is our analysis workbench. We have loaded a dual optical and radar dataset over Pune, Maharashtra. Notice how our canvas lets us instantly blend between optical and SAR imagery using this slider. Optical gives us human-readable visual features, while SAR penetrates cloud cover to reveal true water boundaries and structural density."*

### [2:30 – 4:00] Asking a Query & The 6-Stage Agent Pipeline
> **Speaker 1**: *(Types query: `Can u mark the 2 highways which are visible in the image with arrows`)*  
> *"Watch what happens when we ask a question. SatQuery AI doesn't just pass the image to an LLM. It routes the query through our 6-Stage Agent Pipeline:
> 1. It classifies the task as Text-Guided Grounding.
> 2. It verifies the scene's spatial resolution and coordinate system.
> 3. It constructs a dynamic DAG plan: first running our `rs_ground` tool to locate the coordinates, then calling our `annotate` tool.
> 4. It decides that for linear infrastructure, an **arrow** is the optimal annotation shape.
> 5. Look at the canvas — the agent has created a live vector annotation layer with directional arrows marking the highways in real time."*

### [4:00 – 5:15] Extension Tools: Enhancement & Vector Layers
> **Speaker 2**: *(Opens Right Rail `Alt+2` and `Alt+3`)*  
> *"On the right rail, we have our professional tool suite:
> - **Scene Enhancement**: We can apply Radiometric CLAHE stretching or SAR speckle filtering, with an automated SSIM quality gate that guarantees we never degrade image fidelity.
> - **Vector Annotations**: Users have access to 7 vector drawing tools with full layer management, undo/redo history, and instant GeoJSON export."*

### [5:15 – 6:15] Location Context & Historical Analytics
> **Speaker 1**: *(Opens Right Rail `Alt+4`, then navigates to `/historical`)*  
> *"Finally, satellite observations need context:
> - **Location Context (F12)**: Resolves our coordinates to Pune District via our in-memory 820-district spatial index, and retrieves chronological records of major floods (2005, 2019) and infrastructure master plans with full source citations.
> - **Historical Analytics (F5)**: Our `/historical` dashboard aggregates every query, tool execution, and scene footprint across the entire workspace from our live database."*

### [6:15 – 7:00] Conclusion
> **Speaker 2**: *"SatQuery AI bridges the gap between raw Earth observation pixels and actionable intelligence — grounded, verifiable, and accessible. Thank you, and we welcome your questions."*

---

## 8. Anticipated Judge Q&A & Defenses

#### Q1: "How do you guarantee that the numbers and measurements in your answers aren't AI hallucinations?"
> **Answer**: *"We enforce a strict numerical grounding stage (Stage 5 `fusion.py`). Our Vision-Language Models are never allowed to invent numbers. Every area, hectare figure, or percentage reported to the user is calculated by deterministic computer vision tools (`geo_stats`, `spectral_index`, `sar_water_mask`) based on the scene's actual Ground Sample Distance (GSD) and pixel count. If a VLM mentions an unsupported number, our grounding engine catches it and replaces it with the verified tool measurement."*

#### Q2: "How do you handle SAR speckle noise and coregistration between optical and radar images?"
> **Answer**: *"We have two dedicated tools: `coreg_check` computes phase correlation to verify sub-pixel alignment between image pairs. For speckle noise, our F1 enhancement pipeline uses Non-Local Means (NLM) filtering, which averages similar pixel neighborhoods while preserving high-frequency linear edges and water boundaries."*

#### Q3: "What happens if a user asks a question about an image modality that cannot answer it?"
> **Answer**: *"Our Stage 2 Input Validation Gate (`input_gate.py`) checks the task requirements against the scene metadata. For example, if a user asks for 'flooding change over time' on a single image without a baseline, the system refuses the query cleanly with an actionable explanation rather than hallucinating temporal changes."*

#### Q4: "How is your administrative boundary lookup so fast without hitting external APIs?"
> **Answer**: *"In `backend/core/geo/admin_lookup.py`, we downloaded and indexed all ~820 Indian district boundaries locally into a Shapely `STRtree` spatial index. Point-in-polygon queries execute in under 1 millisecond completely offline."*

---

*Document generated for SatQuery AI Platform Presentation & Demonstration.*
