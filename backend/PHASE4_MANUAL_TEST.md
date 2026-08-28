# Phase 4 - manual test script

What to upload, where to upload it, what you should see, and what a *wrong* result
looks like. Automated coverage is 129 hermetic tests plus 9 live ones; this script
covers what only a human can judge.

**Get the data first:** [PHASE4_TEST_DATA.md](PHASE4_TEST_DATA.md) tells you where to
download every file named below. Nothing here uses generated data.

Start both servers:

```bash
cd backend && .venv/Scripts/python -m uvicorn main:app --reload --port 8080
```

```bash
cd frontend && npm run dev
```

---

## The upload flow (same for every test)

Every test below says *"upload X as Y"*. Here is what that means, once:

1. Go to **<http://localhost:3000/scene/new>** (Dashboard → *New Scene*).
2. Pick the **input mode tab** - this decides which slots appear:

| Tab | Slots you get |
|---|---|
| **SINGLE** | one: *Upload Image* |
| **CROSS_MODAL** | two: *Optical / Multispectral* and *SAR* |
| **BI_TEMPORAL** | two: *Time 1 (earlier)* and *Time 2 (later)* |

3. Drop the file(s) into the named slot(s).
4. Optionally set a **Scene name**. Left blank, the scene is named after the uploaded
   file - never a fixed label.
5. Toggle **Benchmark mode** ON *only* for `benchmark.png` (test 5b). A
   **Benchmark dataset** field appears; put `VRSBench` or `RSVQA` in it.
6. Click **Validate**. The files upload, the backend reads real raster metadata, and the
   **Compatibility Panel** shows the R8 checklist.
   - If the inputs are incompatible, ingest returns HTTP 422 and the page shows the
     failing checks instead of proceeding. That refusal is the feature.
7. **Confirm & Open Workspace** → you land on the real scene.

> If the dashboard shows no scenes and a red *"Could not load scenes"* banner, the
> backend is down. An empty workspace and a failed request now look different - the
> UI no longer substitutes demo scenes for either.

### Setting acquisition dates - required for tests 5 and 6

`rs_classify` and `change_detect` query the Earth Engine catalog by **AOI + date range**.
Most downloaded GeoTIFFs carry no date tag this backend recognises, so it reads as
unknown and those tools refuse with `NO_DATE_RANGE` / `NO_DATES` rather than inventing a
window.

After confirming a scene, set the dates you wrote down at download time:

```bash
curl -X POST http://localhost:8080/api/scenes/SCENE_ID/dates -H "Content-Type: application/json" -d "{\"by_role\":{\"single\":\"2023-02-15\"}}"
```

For a bi-temporal pair:

```bash
curl -X POST http://localhost:8080/api/scenes/SCENE_ID/dates -H "Content-Type: application/json" -d "{\"by_role\":{\"t1\":\"2018-03-10\",\"t2\":\"2024-03-12\"}}"
```

`SCENE_ID` is in the URL of the scene page. Dates are `YYYY-MM-DD`. If the GeoTIFF *did*
carry a readable date tag, ingest picks it up and you can skip this.

---

## 0. Readiness - do this first

Open <http://localhost:8080/api/health/models>.

| Field | Expected |
|---|---|
| `status` | `ok` |
| `vlm.configured` | `true` |
| `vlm.reason` | `vertex -> gemini-3.5-flash on sih-gcp-506800 (global)` |
| `gee.gee_initialized` | `true` |
| `unavailable_tools` | `[]` |

All three tiles on the Backend Registry page should read **READY**, and Tool Availability
should say **12 of 12**. If anything is off, `reason` names the exact fix.

---

## 1. The R1 disclosure page - the highest-stakes screen

**Nothing to upload.** Go to **<http://localhost:3000/models>** (sidebar → *Backend Registry*).

**Must be true:**
- Amber panel at top: **"Requirement R1 - Not Attempted"**, stating what was fine-tuned is **nothing**.
- Three status tiles: VLM Gateway, Google Earth Engine, Tool Availability.
- Five backend cards: `V1`, `G1`, `G2`, `G3`, `DET`.
- `DET` is the only card with **Offline capable: yes**.

**The failure mode to watch for:** cards named *RS-CLIP Dual Encoder*, *RS-VLM*,
*RS-Ground*, *RS-Change*, *RS-Fusion Head* with versions like `v0.2.0`. Those five models
were never built. Showing them to a judge is the worst outcome in this repo. Hard-refresh;
if they persist the page did not rebuild.

**Also:** stop the backend and reload. Expect a red "Could not reach the backend registry"
card naming the URL - not a blank page, not stale cards.

---

## 2. `rs_vqa` and `rs_caption` - does it refuse to hallucinate?

> **Upload:** `single_optical.tif` → **SINGLE** tab → *Upload Image* slot.

Then ask in the query console:

| Ask | What a correct answer looks like |
|---|---|
| "What land cover types are visible?" | Names only things actually in frame. |
| "How many buildings are in this image?" | A hedged estimate **or** an explicit refusal to count. A confident precise integer from 10 m imagery is wrong. |
| "What is the population of this area?" | Must decline - not visible in imagery. |
| "Describe this scene." | Routes to `rs_caption`. |

Open the trace drawer. **`confidence_basis` must read** *"heuristic hedging-language
score on a hosted, unadapted VLM response - not self-consistency"*. If it ever claims
self-consistency or calibration, that is a bug.

**Worth doing deliberately:** upload a **non-satellite image** (a photo or screenshot) as
SINGLE and ask what land cover is visible. It should say the image is not remote-sensing
imagery rather than inventing land cover. Verified live during implementation.

---

## 3. `rs_ground` - the honest-negative contract

> **Upload:** `single_optical.tif` → **SINGLE** tab → *Upload Image* slot.
> Use a scene with obvious water (Ukai Dam, Chilika Lake - see the data doc).

1. **Something present:** *"Locate the water body"*.
   Expect a box on the canvas and text like
   `Located 'the water body' at normalised box (0.120,0.340),(0.560,0.780) - 19.4% of the image footprint.`
   Check the box actually sits over the water.
2. **Something absent:** *"Locate the international airport terminal"* on a rural scene.
   Expect exactly:
   `No region matching 'the international airport terminal' could be located`
   with **confidence 0.0**.

**Test 2 is the whole point.** A plausible-looking box for something that is not there is
a failure, even though it demos better.

If *every* grounding query returns the negative, the model is answering on a 0–1000 scale
instead of `[0,1]`. Check `VERTEX_MODEL` - see the model note in PHASE4_SETUP.md.

---

## 4. Missing-capability refusal - R8 on display

> **Upload:** `single_rgbn.tif` (the 4-band file) → **SINGLE** tab → *Upload Image* slot.
> The 4-band version is needed because the second half of this test uses NDWI.

Break a backend on purpose. In `backend/.env` set `VLM_BACKEND=claude` with no
`ANTHROPIC_API_KEY`, and restart the API. Then ask any VQA question.

**Expect a structured refusal - not a crash, not an empty answer:**
- Problem code `MISSING_CAPABILITY`
- Detail naming which backend is unavailable and why
- A **remedy** naming the env vars to set

Now ask something deterministic instead - *"How much of this image is water?"* - and it
should still answer, because `spectral_index` + `geo_stats` need no hosted backend. It
should report hectares, computed from the GSD.

That contrast is the R8 demo: the system knows precisely what it cannot do, and still
does everything it can. Put `VLM_BACKEND=vertex` back afterwards.

---

## 5. `rs_classify` - land cover

> **Upload:** `single_optical.tif` → **SINGLE** tab → *Upload Image* slot.
> **Then set the acquisition date** (see above) or this will refuse.

Ask: *"What is the land cover breakdown for this area?"*

- Class fractions sum to ~100%.
- The answer text **must** end with words to the effect of *"not a classification of the
  uploaded raster"*.
- `confidence` is exactly **0.7**; `confidence_basis` says *"treat as a reference
  classification, not a measurement of the exact uploaded raster"*.

That caveat is load-bearing: this queries Google's global Dynamic World product for the
same footprint. It does **not** classify your pixels. If the UI ever presents it as a
measurement of the uploaded image, that is a misrepresentation.

### 5b. The no-CRS negative

> **Upload:** `benchmark.png` → **SINGLE** tab → *Upload Image* slot →
> **Benchmark mode ON**.

Ask the same land-cover question. Expect a refusal with status `NO_AOI` - never an
invented AOI. The Compatibility Panel should show CRS/GSD checks as **N/A**, not PASS.

### 5c. The no-date negative

Upload `single_optical.tif` and ask the land-cover question **without** setting a date.
Expect `NO_DATE_RANGE` and instructions to set the acquisition date. Then set it and
re-ask - it should now answer. This is a good two-step demo of the refusal being a
*remedy*, not a dead end.

---

## 6. `change_detect` + `change_describe` - R5/R4

> **Upload:** `t1.tif` → **BI_TEMPORAL** tab → *Time 1 (earlier)* slot
> and `t2.tif` → *Time 2 (later)* slot.
> **Then set both dates** (see above) or `change_detect` refuses with `NO_DATES`.

Ask: *"Has the built-up area increased, decreased, or remained unchanged?"*

Expect, in order:
1. `coreg_check` → alignment in px
2. `change_detect` → changed % **and** hectares, plus a change-mask layer
3. `geo_stats` → area from the mask
4. `change_describe` → narrative

**The thing to actually verify:** open the trace and confirm the narrative quotes the
*same numbers* `change_detect` produced - it is prompted to use them verbatim. If the
prose says "roughly 30%" while `change_detect` says 34.38%, the anchoring broke.

`change_detect` confidence is fixed at **0.6**, basis *"NDVI/NDBI differencing threshold,
not a trained detector - expect lower IoU than a labeled-benchmark model"*. Say that out
loud in the demo before a judge asks.

`geo_stats` should warn that area was computed on **the mask's own grid**, not the
uploaded raster's - the GEE mask is at 10 m in EPSG:4326 and does not share your file's
pixel grid.

### 6b. The misregistration refusal

> **Upload:** `mismatch_a.tif` → *Time 1*, `mismatch_b.tif` → *Time 2*.

Expect either `POOR_CO_REGISTRATION` at the gate, or `REFUSED_MISREGISTERED` from
`change_detect` with *"registration error is indistinguishable from real change"*. It
refuses **before** calling GEE - check the trace shows no GEE call.

### 6c. The unanchored cap

Ask a change question on a bi-temporal pair where you have **not** set dates.
`change_detect` refuses, but `change_describe` still answers from the two previews - with
confidence **capped at 0.45** and a warning that the narrative is unquantified.
Confidence must never exceed 0.45 there.

---

## 7. Offline mode - R11 / §11.5

> **Upload:** anything already ingested works; no new file needed.

Set `OFFLINE_MODE=true` in `backend/.env`, restart, re-run a VQA query.

- All seven hosted tools return status `NOT_EVALUATED_OFFLINE` - **not** errors.
- The deterministic four still run and still answer measurement questions.
- `/api/health/models` shows `status: degraded`, `offline_mode: true`.
- The Backend Registry page shows a blue "Offline evaluation mode is on" banner.

This is the ISRO/SAC offline-container behaviour. Set it back to `false` afterwards.

---

## 8. Cross-modal - the PRD demo script

> **Upload:** `optical.tif` → **CROSS_MODAL** tab → *Optical / Multispectral* slot
> and `sar.tif` → *SAR* slot.
> (Or `cartosat.tif` + `risat.tif` from Bhoonidhi, which is what the PRD demo calls for.)

The Compatibility Panel is the star here: CRS, GSD ratio, spatial overlap, and
co-registration shift, all visible before any query runs. That is R8 satisfied on screen.

Ask: *"Use the optical and SAR images together to identify built-up and water-covered regions."*

Note that `sar_optical_fuse` is still a **stub** - it belongs to Phase 5 step 12, not
Phase 4. It returns a structured "not yet wired" result. `sar_water_mask` on the SAR image
and `spectral_index` on the optical both work today.

---

## 9. Rate limiting *(only if you switch to `VLM_BACKEND=gemini`)*

The AI Studio free tier allows **20 requests/day** for `gemini-3.6-flash`. When exhausted,
tools return `BACKEND_RATE_LIMITED` with text telling you to wait or switch backend -
after four retries with exponential backoff. It should never surface as a stack trace.
This is why Vertex is the default.

---

## Automated checks

```bash
cd backend && .venv/Scripts/python -m pytest tests/ -q
```

129 passed, 9 skipped. Hermetic - no network calls, so it also passes inside a
`--network none` container.

```bash
cd backend && .venv/Scripts/python -m pytest tests/test_live_backends.py --live -q -rs
```

9 passed against the real Vertex and Earth Engine APIs. Each test skips with a readable
reason if its backend is not configured.
