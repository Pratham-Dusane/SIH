# Phase 4 setup — credentials you need (GUI only, no CLI)

Phase 4 (PRD §7) swaps the fine-tuning phase for **one hosted VLM** plus **Google Earth
Engine**. Both are online services, so both need credentials. Nothing here requires
installing the gcloud CLI — every step below is a web page.

Everything already works without any of these keys: the seven hosted tools report
`BACKEND_UNAVAILABLE` with a remedy, the input gate refuses with an explanation, and the
four deterministic tools keep running. Add keys to turn the hosted tools on.

---

## ⚠ Do these three things in the GCP Console first

Verified against the live project `sih-gcp-506800`. The service-account key already
authenticates correctly — these are the only remaining blockers, and each one is a
button in the browser.

**1. Enable the Vertex AI API** (needed for `VLM_BACKEND=vertex`)
<https://console.cloud.google.com/apis/api/aiplatform.googleapis.com/overview?project=sih-gcp-506800>
→ **Enable**. Vertex AI is **billed per token**, so the project needs billing linked.
It is not free — but it has no 20-requests-per-day cap, which is why it is the default.

**2. Add two IAM roles to the service account**
<https://console.cloud.google.com/iam-admin/iam?project=sih-gcp-506800>
→ find `satquery-gee@sih-gcp-506800.iam.gserviceaccount.com` → pencil icon → **+ ADD ANOTHER ROLE**:

| Role to add | Why |
|---|---|
| **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) | Without it `ee.Initialize()` fails with *"Caller does not have required permission to use project"*. This is the only thing blocking all Earth Engine work right now. |
| **Vertex AI User** (`roles/aiplatform.user`) | Lets the same key call Gemini through Vertex. |
| **Earth Engine Resource Writer** (`roles/earthengine.writer`) | Add it if it is not already listed — it permits the computations `rs_classify` and `change_detect` run. |

**3. Confirm the project is registered for Earth Engine**
<https://console.cloud.google.com/earth-engine?project=sih-gcp-506800> — enabling the API
is *not* enough, the project itself must be registered (Noncommercial → Community tier).

Then verify, from `backend/`:

```bash
python -m pytest tests/test_live_backends.py --live -q -rs
```

Every test should pass. Any that skip print the exact reason.

---

## What you need, in priority order

| # | Credential | Turns on | Cost | Time |
|---|-----------|----------|------|------|
| 1 | **Vertex AI** on your own GCP project *(default)* | `rs_vqa`, `rs_caption`, `rs_ground`, `change_describe`, `change_vqa` (R2, R3, R4) | Paid per token, no daily cap | ~5 min |
| 1b | *or* **Gemini API key** (AI Studio) | the same five tools | Free, but capped — `gemini-3.6-flash` allows only **20 requests/day** | ~2 min |
| 2 | **GCP project + Earth Engine service account JSON** | `rs_classify`, `change_detect` (R5) | Free (noncommercial tier) | ~15 min |
| 3 | OpenAI or Anthropic key | *Optional.* Alternate VLM backends for the model-comparison feature | Paid | ~2 min |

Do #1 first — it unlocks five of the seven tools and takes two minutes.

---

## 1. Gemini API key (the default VLM backend)

1. Open **<https://aistudio.google.com/apikey>** and sign in with your Google account.
2. Click **Create API key**.
3. If it asks which Google Cloud project to use:
   - Pick **the same project you will register for Earth Engine in step 2** if you have
     already created it — one project for everything is simpler.
   - Otherwise let it create a new one, or click **Import project** to attach an existing one.
4. Click **Copy** on the generated key. It looks like `AIza...`.

Paste it into `backend/.env`:

```
VLM_BACKEND=gemini
GEMINI_API_KEY=AIza...your key...
GEMINI_MODEL=gemini-3.6-flash
```

> **Note on the model id.** The PRD's example backend card (§7.6) names
> `gemini-1.5-pro-vision`, which Google retired. `GEMINI_MODEL` is a switch, and
> whatever you set there is what `/api/models` reports and what every `ToolResult`
> records as `model_version` — so provenance stays honest.
>
> `gemini-3.6-flash` is the **verified** default. Two things were checked live:
> - `gemini-2.5-flash` now returns *"no longer available to new users"* on fresh keys.
> - `gemini-3.5-flash` answers `rs_ground` on a **0–1000** scale rather than the
>   normalised `[0,1]` the PRD fixes (§8.3.3). `parse_bbox` correctly rejects that as
>   out of range, so grounding degrades to honest negatives on that model. Stay on
>   `gemini-3.6-flash` unless you re-verify grounding.
>
> Gemini 3.x also spends 400–800 output tokens on internal reasoning before emitting
> any text, which is why `VLM_MAX_TOKENS=2048` and `GEMINI_THINKING_LEVEL=low`.
> Set the ceiling too low and responses come back empty.

---

## 2. Google Cloud project + Earth Engine service account

Four sub-steps: create the project → enable the API → register it for Earth Engine →
create a service account and download its key.

### 2a. Create (or pick) a Cloud project

1. Open **<https://console.cloud.google.com/projectcreate>**.
2. **Project name:** `satquery-prod` (or anything). Note the **Project ID** Google
   assigns — you need it later, and it is not always the same as the name.
3. Click **Create**.

Billing is **not** required for the Earth Engine noncommercial tier.

### 2b. Enable the Earth Engine API

1. Open **<https://console.cloud.google.com/apis/library/earthengine.googleapis.com>**.
2. Make sure your project is selected in the picker at the top of the page.
3. Click **Enable**.

### 2c. Register the project for Earth Engine

This is the step people miss — an enabled API is not enough, the *project* has to be
registered.

1. Open **<https://console.cloud.google.com/earth-engine>**.
2. Click **Register** (or **Get started**).
3. Choose **Unpaid usage / Noncommercial**.
4. Fill in the short eligibility questionnaire (academic / research / non-profit).
5. Choose a **quota tier** — pick **Community** unless you have been told otherwise.
6. Confirm. Access is usually granted immediately.

> As of **27 April 2026**, every noncommercial project must have selected a tier;
> projects that have not are put on the Community tier by default.

### 2d. Create the service account and download its key

1. Open **<https://console.cloud.google.com/iam-admin/serviceaccounts>** with your
   project selected.
2. Click **+ CREATE SERVICE ACCOUNT**.
3. **Name:** `satquery-gee`. Click **Create and continue**.
4. **Grant this service account access to project** → add **both** of these roles
   (click **+ ADD ANOTHER ROLE** for the second):
   - **Earth Engine Resource Writer** (`roles/earthengine.writer`) — permits the
     interactive computations and exports that `rs_classify` and `change_detect` run.
   - **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`) — without
     this, `ee.Initialize()` fails with *"Caller does not have required permission to
     use project"*. This one is easy to miss and blocks everything.
5. Click **Continue**, then **Done**.
6. Back on the Service Accounts list, find `satquery-gee`, click the **⋮** menu at the
   right → **Manage keys**.
7. **Add key** → **Create new key** → choose **JSON** → **Create**.
   The `.json` file downloads automatically.
8. Copy the **service account email** from the list — it looks like
   `satquery-gee@your-project-id.iam.gserviceaccount.com`.

The service account itself needs no separate Earth Engine registration; it inherits
access from the registered project.

### 2e. Put the key where the backend expects it

1. Create a folder `backend/_secrets/` (already gitignored — the key must never be committed).
2. Move the downloaded JSON into it and rename it `gee-service-account.json`.
3. Fill in `backend/.env`:

```
GEE_SERVICE_ACCOUNT=satquery-gee@your-project-id.iam.gserviceaccount.com
GEE_KEY_PATH=./_secrets/gee-service-account.json
GEE_PROJECT=your-project-id
```

---

## 3. Optional: OpenAI / Anthropic

Only needed if you want to demo backend switching (`VLM_BACKEND=gpt4v` or `claude`).
Both are paid — no free tier.

- **OpenAI:** <https://platform.openai.com/api-keys> → **Create new secret key** →
  `OPENAI_API_KEY=sk-...`, `OPENAI_MODEL=gpt-4o`
- **Anthropic:** <https://console.anthropic.com/settings/keys> → **Create Key** →
  `ANTHROPIC_API_KEY=sk-ant-...`, `ANTHROPIC_MODEL=claude-sonnet-5`

---

## Verify it worked

Start the API, then open **<http://localhost:8080/api/health/models>** in a browser.

Before any keys:

```json
{ "status": "degraded",
  "vlm": { "configured": false, "reason": "GEMINI_API_KEY is not set" },
  "gee": { "gee_initialized": false,
           "reason": "GEE_SERVICE_ACCOUNT and/or GEE_KEY_PATH are not set" },
  "unavailable_tools": ["rs_vqa", "rs_caption", "rs_ground", "change_describe",
                        "change_vqa", "rs_classify", "change_detect"] }
```

After both:

```json
{ "status": "ok",
  "vlm": { "configured": true, "reason": "gemini -> gemini-3.6-flash" },
  "gee": { "gee_initialized": true,
           "reason": "initialised as satquery-gee@... on project ..." },
  "unavailable_tools": [] }
```

`reason` always names the exact next thing to fix, so work down the list until
`unavailable_tools` is empty.

---

## Troubleshooting

| Symptom in `reason` | Fix |
|---|---|
| `earthengine-api is not installed` | `pip install -r requirements.txt` |
| `GEE key file not found at ...` | `GEE_KEY_PATH` is relative to `backend/`. Check the filename matches exactly. |
| `EEException: not signed up for Earth Engine` | Step 2c was skipped or is still pending. |
| `403 ... Permission denied` on a GEE call | The service account is missing **Earth Engine Resource Writer** (step 2d.4). |
| `Earth Engine API has not been used in project ...` | Step 2b was skipped, or `GEE_PROJECT` names a different project than the key. |
| `404 ... no longer available to new users` | `GEMINI_MODEL` names a retired model. Use `gemini-3.6-flash`. |
| `Caller does not have required permission to use project` | The service account is missing **Service Usage Consumer** (step 2d.4). |
| `rs_ground` always returns "could not be located" | The model is answering on a 0-1000 scale. Switch `GEMINI_MODEL` back to `gemini-3.6-flash`. |
| VLM answers come back empty | `VLM_MAX_TOKENS` too low for Gemini 3.x reasoning. Use 2048+. |
| Everything reports `NOT_EVALUATED_OFFLINE` | `OFFLINE_MODE=true` in `.env`. That is correct for offline evaluation (§11.5) and wrong for the demo. |

---

## What Phase 4 deliberately does not do

Stated here so it is not discovered by a judge (PRD §7.0):

- **R1 is NOT ATTEMPTED.** Nothing was fine-tuned on remote-sensing data.
  `GET /api/models` says this in plain language, and every VLM-backed `ToolResult`
  carries `confidence_basis` describing its score as a hedging-language heuristic on an
  unadapted hosted model — never as a calibrated or self-consistency score.
- **Design Rule 3 is broken for the seven hosted tools only.** They all declare
  `offline_capable=False` and return a structured `NOT_EVALUATED_OFFLINE` in
  `OFFLINE_MODE`, rather than failing the run. The four deterministic tools remain the
  only offline-capable perception path.
- **Preview PNGs are sent to a third-party API.** Confirm this is acceptable under
  ISRO/SAC data-handling rules before relying on it for a live demo. GEE never receives
  pixels — only AOI bounds and dates.
