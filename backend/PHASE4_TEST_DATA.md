# Where to get real test data

Real imagery from public portals — no generated or synthetic files. Every source below
is free and downloadable through a browser.

Read this once, download the corpus, then work through
[PHASE4_MANUAL_TEST.md](PHASE4_MANUAL_TEST.md), which refers to these files by name.

---

## What the tools actually need

This matters more than it sounds, because it makes most of the corpus easy:

| Tool | Needs |
|---|---|
| `rs_vqa`, `rs_caption`, `rs_ground`, `change_describe`, `change_vqa` | Only the **preview PNG** the backend renders. **Any** readable raster works. |
| `rs_classify`, `change_detect` | Only **CRS + bounds + acquisition date**. The pixels are never sent to Earth Engine. A plain 3-band RGB GeoTIFF is enough. |
| `spectral_index` (NDVI/NDWI/NDBI) | **Real multispectral bands.** This is the only thing needing a 4-band file. |
| `sar_water_mask` | A **SAR** raster (1–2 bands, linear intensity). |
| `geo_stats`, `coreg_check` | Nothing extra — they consume prior steps. |

So a **georeferenced 3-band RGB GeoTIFF covers tests 2, 3, 5 and 6**. Only test 4's
deterministic fallback needs the 4-band version.

**Hard requirement for tests 5 and 6:** the file must carry a real CRS. A screenshot, a
JPEG, or a PNG has no CRS, and those tools will correctly refuse with `NO_AOI`.

---

## The corpus

Put everything in `D:\SIH\_testdata\`. Names are referenced by the manual test doc.

| File | Config | Used by | Source |
|---|---|---|---|
| `single_optical.tif` | SINGLE | Tests 2, 3, 5 | Copernicus Browser → §1 |
| `single_rgbn.tif` | SINGLE | Test 4 | Copernicus Browser → §1 (4-band script) |
| `t1.tif` + `t2.tif` | BI_TEMPORAL | Test 6 | Copernicus Browser → §2 |
| `benchmark.png` | SINGLE + benchmark mode | Test 5 negative | RSVQA / VRSBench → §4 |
| `mismatch_a.tif` + `mismatch_b.tif` | BI_TEMPORAL | Test 6 refusal | Copernicus Browser → §2c |
| `optical.tif` + `sar.tif` | CROSS_MODAL | Cross-modal | Copernicus Browser → §3 |
| `cartosat.tif` + `risat.tif` | CROSS_MODAL | PRD demo script | Bhoonidhi → §5 |

---

## 1. Copernicus Browser — the workhorse

Free ESA portal. Sentinel-2 (optical, 10 m) and Sentinel-1 (SAR). Exports georeferenced
GeoTIFF directly from the browser.

**Register once:** <https://dataspace.copernicus.eu/> → *Register*
**Then open:** <https://browser.dataspace.copernicus.eu/>

### 1a. A single optical scene (`single_optical.tif`)

1. Search for a place in the box at top-left. Pick somewhere with **obvious water** —
   you need it for the grounding test. Good options:
   - *Ukai Dam, Gujarat* — large reservoir, sharp shoreline
   - *Chilika Lake, Odisha* — lagoon plus farmland
   - *Bhakra Dam, Himachal* — reservoir in terrain
2. Left panel → **Search** tab. Set:
   - **Data source:** Sentinel-2 → **L2A**
   - **Time range:** any 3-month window
   - **Max cloud coverage:** `10%`
3. Click **Search**, then **Visualize** on a result.
4. Note the **acquisition date** shown on the result card. **Write it down** — you will
   type it into the app, and tests 5 and 6 fail without it.
5. Click the **download icon** (⬇, right-hand toolbar) → **Analytical** tab:
   - **Image format:** `TIFF (32-bit float)`
   - **Image resolution:** `HIGH`
   - **Coordinate system:** `WGS 84 (EPSG:4326)`
   - **Layers:** tick the visualization you are viewing (e.g. *True color*)
6. **Download** → unzip → rename the `.tif` to `single_optical.tif`.

> Keep the scene under roughly 2000×2000 px. Drag the map to a tighter view before
> downloading; the whole-tile export is large and slow to preview.

### 1b. The 4-band version (`single_rgbn.tif`) — only for test 4

`spectral_index` needs real NIR and green bands, which a true-colour export does not
have. Same steps, but first create a custom layer:

1. In the left panel, scroll the layer list to the bottom → **Custom** → **Custom script**.
2. Paste this and click **Refresh**:

```javascript
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B03", "B02", "B08"] }],
    output: { bands: 4, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(s) {
  return [s.B04, s.B03, s.B02, s.B08];
}
```

3. Download via **Analytical** → `TIFF (32-bit float)` as above.

Band order is **R, G, B, NIR** — exactly the `generic4` layout `spectral_index`
expects, so NDVI and NDWI both work. The backend will detect it as `MULTISPECTRAL`.

---

## 2. A bi-temporal pair (`t1.tif`, `t2.tif`)

Same portal. The trick is **same AOI, same visualization, two dates far apart**, with
something that actually changed.

**Areas with dramatic, verifiable change:**

| Place | What changed | Dates to try |
|---|---|---|
| Navi Mumbai International Airport (~73.07 E, 18.99 N) | Farmland → runway and terminal | 2018 vs 2024 |
| Dholera SIR, Gujarat (~72.20 E, 22.25 N) | Scrub → planned city grid | 2017 vs 2024 |
| Amaravati, Andhra Pradesh (~80.52 E, 16.51 N) | Farmland → capital construction | 2016 vs 2023 |
| Polavaram Dam, Andhra Pradesh | River → reservoir fill | 2018 vs 2024 |

**Do this exactly, or the pair will not be co-registered:**

1. Frame the AOI and **do not move or zoom the map again**.
2. Search Sentinel-2 L2A for the earlier window → Visualize → download as §1a → `t1.tif`.
3. **Without touching the map**, change only the time range to the later window →
   Search → Visualize → download → `t2.tif`.
4. Record both acquisition dates.

Because both exports use the same bounding box and CRS, `coreg_check` should report a
sub-pixel to ~2 px shift.

### 2c. A deliberately misregistered pair (`mismatch_a.tif`, `mismatch_b.tif`)

For the refusal test, you want a pair that is *not* aligned. Easiest honest way:
download `mismatch_a.tif` as above, then **pan the map by roughly a third of the frame**
and download `mismatch_b.tif`. Same area, different footprint.

Expect either `POOR_CO_REGISTRATION` at the gate or `REFUSED_MISREGISTERED` from
`change_detect` — both are correct outcomes.

---

## 3. SAR (`sar.tif`) and a cross-modal pair

Same browser, different collection.

1. Keep the **same AOI** as your `optical.tif`.
2. **Data source:** Sentinel-1 → **IW - VV+VH decibel gamma0** (or *Raw*).
3. Pick a date close to the optical acquisition.
4. Left panel → **Custom** → **Custom script**, paste, **Refresh**:

```javascript
//VERSION=3
function setup() {
  return {
    input: ["VV"],
    output: { bands: 1, sampleType: "FLOAT32" }
  };
}
function evaluatePixel(s) {
  return [s.VV];
}
```

5. **Analytical** → `TIFF (32-bit float)` → same coordinate system as the optical →
   save as `sar.tif`.

One float band with speckle is detected as `SAR` by the modality detector. `sar_water_mask`
converts linear intensity to dB itself, so download **linear gamma0, not dB**, if the
option is offered.

---

## 4. Benchmark PNGs (`benchmark.png`) — for the no-CRS refusal

These are plain images with no georeferencing, which is exactly the point: they prove
the system refuses to invent an AOI rather than fabricating coordinates.

| Dataset | What it is | Link |
|---|---|---|
| **RSVQA-LR / HR** | RS visual question answering, with ground-truth Q&A | [Zenodo LR](https://zenodo.org/records/6344333) · [Zenodo HR](https://zenodo.org/records/6344366) |
| **VRSBench** | 29,614 images with captions, object references, and Q&A — covers captioning *and* grounding | [Project page](https://vrsbench.github.io/) |
| **LEVIR-CD** | 637 bi-temporal 1024×1024 building-change pairs, 2002–2018 | [Project page](https://justchenhao.github.io/LEVIR/) |
| **OSCD** | Sentinel-2 urban change pairs (multispectral) | [IEEE DataPort / GitHub mirrors](https://github.com/3SPP/awesome-remote-sensing-change-detection-1) |

RSVQA and VRSBench are the useful ones here because they ship reference answers — you
can check whether `rs_vqa` is actually right, not just fluent.

**Upload these with the *Benchmark mode* toggle ON.** That is what tells the backend to
record CRS/GSD checks as `N/A` instead of faking a pass (PRD §6.7).

---

## 5. Bhoonidhi — Cartosat-2S and RISAT (ISRO data)

This is the one that matters most for the actual evaluation. The PRD's demo script calls
for a **Cartosat-2S + RISAT pair**, and the ISRO/SAC evaluation set is exactly that.

**Register:** <https://bhoonidhi.nrsc.gov.in/bhoonidhi/registration.html>
**Browse and order:** <https://bhoonidhi.nrsc.gov.in/bhoonidhi/index.html>

1. Register (free; Indian users, government/academic email helps).
2. **Browse & Order** → draw your AOI on the map.
3. Filter by **Satellite/Sensor**: `CARTOSAT-2S` for optical, `RISAT-1` (CRS or MRS mode)
   for SAR.
4. Set the date range and submit the order.
5. Open products download immediately; others queue as **delayed downloads** and arrive
   by email. Plan for this — it is not instant.

Products arrive as GeoTIFF with a real CRS, which is the path the ISRO/SAC evaluation
uses (PRD §11.5 requires GeoTIFF-native, never the PNG path).

> Cartosat-2S is sub-metre to ~2 m — far finer than Sentinel's 10 m. Expect large files
> and exercise the tiling path. This is called out in §11.5 as something to test before
> submission.

For API access: `bhoonidhi@nrsc.gov.in`.

---

## 6. Other sources worth knowing

| Source | Good for | Link |
|---|---|---|
| **USGS EarthExplorer** | Landsat 8/9 (30 m), long archive back to 1972 — great for decades-apart change | <https://earthexplorer.usgs.gov/> |
| **NASA Earthdata Search** | MODIS, VIIRS, ASTER, NISAR | <https://search.earthdata.nasa.gov/> |
| **Sentinel Hub EO Browser** | Same data as Copernicus Browser, alternative UI | <https://apps.sentinel-hub.com/eo-browser/> |

---

## Quick sanity check before you start testing

After uploading anything, open the scene detail page and confirm:

- **CRS** is populated (e.g. `EPSG:4326` or a UTM zone) — blank means tests 5 and 6 will refuse
- **GSD** is sensible (10 m for Sentinel-2)
- **Modality** is what you expect (`OPTICAL`, `MULTISPECTRAL`, or `SAR`)
- **Band count** matches what you downloaded

If modality comes back `AMBIGUOUS`, the detector was not confident. That is a legitimate
state, not a bug — the compatibility panel will say so.
