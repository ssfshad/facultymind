# Plan: Syllabus Alignment Pipeline — Speed, Accuracy & Hallucination Overhaul
Date: 2026-05-29T19:00:00
Planner: Claude Opus 4.8
Issue type: bug (performance + correctness regression)
Related: Bloom's Engine / ShadSync syllabus mapper, `syllabus-mapper.js`, `model-router.js`

## Problem statement
The Syllabus Alignment pipeline takes 7–9+ minutes per document, hallucinates Course
Outcomes that do not exist in the source, mislabels "Chapter N" as "Week N", and truncates
extraction partway through long documents (stops at chapter 5 of 24). Shad's hard
requirements: **(1) under 5 minutes, (2) ~90% accuracy, (3) zero hallucination, (4) clean
text extraction, (5) the app MUST run on professor PCs with 8GB RAM.** Requirement 5 is the
binding constraint and overrides everything else.

## Root cause / why this matters

### The binding constraint: 8GB RAM target machines
The current local model is `deepseek-r1:8b` (5.2GB on disk) — set in
`model-router.js:20`. On an **8GB machine**, after Windows (~3–4GB) and Electron
(~0.8–1.5GB: main + renderer + GPU process) are resident, there is **~2.5–4GB free**.
A 5.2GB model **cannot fit in RAM** on those machines. Ollama will either:
- swap to disk (catastrophic — token latency goes from ms to seconds), or
- fail to load / get OOM-killed.

This means the 7–9 min times Shad sees on his **own 32GB dev box (Ryzen 5 5600, RX 580)**
are the *best case*. On the actual 8GB target hardware the current pipeline will be far
worse or simply not run. **DeepSeek-R1:8b is the wrong model for this project.** No amount
of prompt tuning fixes a model that doesn't fit in RAM.

### Why DeepSeek-R1 specifically is wrong here
1. **It is a reasoning model.** Even with `think:false` (`model-router.js:346`) and the
   "strict data-extraction engine" prompt prefix added earlier today, R1 was trained to
   emit long `<think>` chains. Suppression is unreliable and wastes tokens/time on a
   CPU-bound box. (Evidence: Shad's own observation that extraction "outputs its thoughts".)
2. **CPU-only inference.** The dev box has an AMD RX 580 (Polaris) — Ollama has no usable
   ROCm/Vulkan path for it on Windows, so generation is CPU-only. Target machines are
   even weaker. Token generation is the bottleneck, not context size.

### The three stacked truncation points (separate from the model choice)
Confirmed by reading the code:
1. **Input cap** — `syllabus-extractor.js` slices `rawText` to a fixed char count before
   the model sees it. Earlier today I raised it 6000 → 24000. On a slow CPU model a 24000-
   char prompt is a major slowdown (prompt eval is O(tokens)). This is the wrong lever.
2. **Output cap** — extraction call `maxTokens` (was 1500, I raised to 8000) in
   `syllabus-mapper.js`. 8000 output tokens on a CPU model ≈ many minutes alone.
3. **Context window** — `num_ctx` in `model-router.js:356`. I temporarily raised it to
   16384 (now reverted to 4096 default + `numCtx` override). Quadrupling `num_ctx`
   quadruples KV-cache RAM and prompt-eval cost — this is what pushed 7 → 9 min. **On 8GB
   machines a 16k context is impossible.**

### The hallucination + label bugs (correctness, model-independent)
- **Fake COs:** The Computer Networks doc has *per-chapter* learning outcomes and NO unified
  course-level CO list. The model invented "CO1..CO5" by concatenating each chapter's
  objectives. Today I added a prompt rule forbidding this, but prompt rules alone are weak;
  we also need a structural guard (see Approach).
- **Week vs Chapter:** Schema hard-coded `"week":"Week 1"` and downstream code assumes
  weeks. I updated the prompt to preserve original labels, but downstream
  (`reverseMapTopic`, `detectAlignmentGaps`, the report renderer) still says "Week".
- **Truncation/early-stop:** Partly the output cap, partly that a slow model degrades on
  long generations.

### Architecture reality (must preserve)
All AI calls route through `model-router.js` (`send()` → `sendOllama()` / `sendOpenRouter()`
/ `sendClaude()` …). The syllabus pipeline makes **3 sequential Ollama calls** per document
(`syllabus-mapper.js`):
1. `_extractWithLLM()` — extract COs + units
2. `_analyzeGapsWithLLM()` CO gap call
3. `_analyzeGapsWithLLM()` week-level mapping call
Three sequential CPU-bound calls is the structural reason for the multi-minute total. **Any
solution must reduce both per-call cost AND ideally the number of calls.**

## Affected files
- `src/modules/ai/model-router.js` — change default `_ollamaModel`; keep `numCtx` override; possibly add a small per-task model selector.
- `src/prompts/templates/syllabus-extractor.js` — tune input cap to the new model; keep anti-hallucination + label-preservation rules; tighten output schema.
- `src/prompts/templates/syllabus-gap-analyzer.js` — keep both prompts; ensure they fit a small context budget.
- `src/modules/blooms/syllabus-mapper.js` — retune `maxTokens`/`numCtx` per call; add structural CO-hallucination guard; merge gap+week-level into ONE call to cut 3 calls → 2; relabel "week"→"unit" terminology where it surfaces to the user.
- `src/renderer/js/blooms.js` (+ report renderer) — display the original unit label ("Chapter N"/"Week N") instead of hard-coded "Week".
- `package.json` — no new deps expected (model pull is via Ollama CLI, documented for executor).
- `.claude/BUGLOG.md` — Shad to log this as a tracked bug (planner cannot edit).

## Approach

### Decision 1 — Replace the local model with one that fits 8GB RAM
**Reject** `deepseek-r1:8b` for this pipeline. Candidate replacements (all available via
Ollama, must be validated by executor with `ollama pull` + a timed test):

| Model | Disk | ~RAM (q4) | Reasoning? | Notes |
|-------|------|-----------|-----------|-------|
| `qwen2.5:3b-instruct` | ~1.9GB | ~3–3.5GB | No | Strong JSON/instruction following; fits 8GB; fast on CPU. **Primary candidate.** |
| `llama3.2:3b-instruct` | ~2.0GB | ~3.5GB | No | Good extraction; fits 8GB. **Backup candidate.** |
| `qwen2.5:1.5b-instruct` | ~1.0GB | ~2GB | No | Fastest; use if 3b still too slow on 8GB. Accuracy tradeoff — validate. |
| `phi3.5:3.8b-mini` | ~2.2GB | ~3.8GB | No | Tight on 8GB; only if Qwen/Llama underperform. |

**Primary recommendation: `qwen2.5:3b-instruct`** — best balance of JSON discipline,
non-reasoning speed, and 8GB fit. It is a non-reasoning model so the `<think>` problem
disappears entirely. The executor MUST run a timed accuracy test (see Verification) before
committing. If 3b is too slow on a simulated-constrained run, fall back to 1.5b.

This is a model swap, not an ADR change — `model-router.js` already supports arbitrary
Ollama model IDs via `_ollamaModel` / `setOllamaModel()`. No architectural violation.

### Decision 2 — Right-size the token/context budget for an 8GB CPU box
With a small non-reasoning model the levers change:
- **Input cap:** 24000 is too big for CPU prompt-eval. Set to **~12000 chars** (~3000
  tokens). Enough for COs + a 24-row content table when whitespace-collapsed, but half the
  prompt-eval cost of 24000. If docs still truncate, raise in 2000-char steps with timing.
- **Output cap (`maxTokens`/`num_predict`):** extraction **2500**, gap+week combined call
  **2500**. A 24-unit table in minified JSON is ~1500–2000 tokens; 2500 gives headroom
  without inviting runaway generation.
- **Context window (`num_ctx`):** **6144** for the extraction call only (input-heavy), via
  the `numCtx` override I already added to `sendOllama()`. Gap call stays at default 4096.
  6144 fits an 8GB box with a 3b model; 16384 does not. Never exceed 6144 on target HW.

### Decision 3 — Cut 3 sequential calls → 2
Merge `_analyzeGapsWithLLM`'s two calls (CO gaps + week levels) into **one** combined prompt
that returns `{ "co_gaps":[...], "unit_levels":[...] }`. One fewer CPU round-trip ≈ 30–40%
of the analysis-phase time saved. Extraction stays its own call (different concern, different
context size). Net: extraction call + combined-analysis call = 2 calls total.

Time budget target on 8GB (qwen2.5:3b, CPU): extraction ~60–120s, combined analysis
~60–120s, plus MarkItDown extraction ~20–40s ⇒ **well under 5 min**. Executor must measure
and confirm.

### Decision 4 — Structural guard against hallucinated COs (don't trust the prompt alone)
After extraction, before accepting COs, apply a deterministic sanity check in
`syllabus-mapper.js`:
- If every "CO" text is suspiciously long (e.g. > 350 chars) AND there is no line in the raw
  text matching a CO-list header (`/course outcomes?|CLOs?|learning outcomes/i` near
  `CO\d`), treat the CO extraction as **low-confidence** and surface a diagnostic
  ("No course-level outcomes detected; document appears to use per-chapter objectives")
  instead of fabricating CO1..CO5. This makes hallucination visible rather than silent.
- This is a guard, not a parser rewrite — keep it small and well-commented.

### Decision 5 — Fix Week/Chapter labeling end-to-end
The extractor prompt now preserves the original label in the `week` field. Propagate that:
- `reverseMapTopic` / `detectAlignmentGaps` — operate on `w.week` as an opaque label; do
  not assume the literal word "Week".
- Report renderer (`blooms.js` + the markdown table builder) — column header should read
  "Unit / Week / Chapter" or echo the source label; rows print `w.week` verbatim.
- Do NOT rename the JSON field `week` (avoid a wide refactor); only change display + remove
  any code that *reformats* labels into "Week N".

### Why not just use OpenRouter/cloud and skip local entirely?
`model-router.js` already prefers OpenRouter when a key + `preferOpenRouter` is set, and the
syllabus path passes `openrouterApiKey` through. Cloud is the fast/accurate path **when
online and keyed**. But the 8GB professor machines are exactly the offline/no-key scenario
the local model exists for. So: **keep OpenRouter as the preferred fast path, and make the
local fallback actually runnable on 8GB.** Do not remove either path.

## Implementation steps for executor

> Execute in order. After each model-touching step, run a **timed** test (PowerShell
> `Measure-Command`) and record seconds. Stop and report if any single Ollama call exceeds
> ~3 min on the dev box (it will be worse on 8GB).

### Step 0 — Baseline (measure before changing)
1. With current state, time one full run on the Computer Networks doc and on
   `Embedded-System-Design.docx`. Record total seconds + per-call seconds from the
   `[syllabus-mapper]` logs. This is the regression baseline.

### Step 1 — Pull and smoke-test the new local model
1. `ollama pull qwen2.5:3b-instruct` (executor runs; document size + pull time).
2. Quick raw test (non-streaming, JSON) via a throwaway `node -e` or a temp script that
   calls the Ollama `/api/chat` endpoint with a tiny extraction prompt; confirm it returns
   clean JSON with NO `<think>` and within a few seconds for a small input.

### Step 2 — Switch the default local model (single source of truth)
1. In `model-router.js`, change `_ollamaModel` default (line ~20) from `'deepseek-r1:8b'`
   to `'qwen2.5:3b-instruct'`. Update the inline comment to note the 8GB-RAM rationale.
2. Confirm `setOllamaModel()`/`getOllamaModel()` still consistent. Pre-warm call in
   `main.js` (the `[main] Pre-warming Ollama model:` line) will pick up the new default —
   verify it logs the new model.
3. **Grep `src/` for every `deepseek` reference** (`grep_search` for `deepseek`). For each
   hit — pre-warm in `main.js`, any CLO/Bloom's/settings default, any docs string in code —
   repoint it to the single source of truth (`getOllamaModel()` / `_ollamaModel`). After this
   step there must be ZERO hard-coded `deepseek-r1:8b` strings in `src/`. The model becomes
   the one default everywhere.
4. Do NOT delete Shad's locally-pulled `deepseek-r1:8b` blob from disk — only remove the
   app's reliance on it.

### Step 3 — Right-size token/context budgets
1. `syllabus-extractor.js`: change input cap from 24000 → **12000**. Keep the anti-
   hallucination + label-preservation rules added today.
2. `syllabus-mapper.js` extraction call (`_extractWithLLM`): set `maxTokens: 2500`,
   `numCtx: 6144`, keep `think:false`.
3. `syllabus-mapper.js` analysis call(s): set `maxTokens: 2500`, leave `numCtx` default
   (4096). (Step 4 merges these.)

### Step 4 — Merge gap + week-level into one analysis call
1. In `syllabus-gap-analyzer.js`, add a single combined prompt builder
   `syllabusCombinedAnalyzerPrompt(courseOutcomes, weeklyTopics)` returning a system+user
   pair whose schema is:
   `{"co_gaps":[{co,status,gap_type,gap_description,expected_level,suggested_verbs,suggested_rewrite}],"unit_levels":[{week,bloom_level,bloom_name,suggested_verbs}]}`
   Keep the existing two builders for now (don't delete) in case rollback is needed.
2. In `syllabus-mapper.js` `_analyzeGapsWithLLM`, replace the two sequential
   `modelRouter.send()` calls with ONE call using the combined prompt; parse both arrays
   from the single response. Preserve all existing field-mapping/normalization logic and the
   deterministic fallback (`detectAlignmentGaps`) when the call returns null/garbage.
3. Keep the `<think>`-stripping and JSON-slice guards already present.

### Step 5 — Structural CO-hallucination guard
1. In `syllabus-mapper.js`, after `_extractWithLLM` returns, add a small helper
   `_looksLikeHallucinatedCOs(cos, rawText)` implementing Decision 4. If it triggers, set
   `courseOutcomes = []` and add a `diagnostics.suggestion` explaining per-chapter objectives
   were detected. Do NOT fabricate.
2. Ensure the existing fallback chain (DOCX table → regex) does not re-introduce fake COs —
   the guard runs on the final assembled `courseOutcomes` too.

### Step 6 — Week/Chapter label fix (display only)
1. Audit `blooms.js` (and any markdown report builder) for hard-coded "Week" strings in the
   syllabus report. Replace the column header with a neutral label and print `w.week`
   verbatim.
2. Confirm `reverseMapTopic`/`detectAlignmentGaps` never reformat the label.

### Step 7 — Timed validation (the acceptance gate)
1. Re-run both test docs. Record total + per-call seconds. **Must be < 5 min total** on the
   dev box (target 8GB will be slower but the dev box is the proxy; aim for < 3 min on dev so
   8GB stays under 5).
2. Eyeball accuracy: COs correct or correctly reported-as-absent; all units present (24/24
   for Computer Networks); labels say "Chapter" where the source does; no invented COs.
3. If qwen2.5:3b is too slow or inaccurate, pull `llama3.2:3b-instruct`, repeat Step 2/7. If
   both 3b models miss the time budget, drop to `qwen2.5:1.5b-instruct` and re-validate
   accuracy.

## Verification
- [ ] `npm run dev` launches without errors after the model swap.
- [ ] `ollama list` shows the new model; `[main] Pre-warming Ollama model:` logs it.
- [ ] Full syllabus run on Computer Networks doc completes **< 5 min** (record exact seconds).
- [ ] Full run on `Embedded-System-Design.docx` completes **< 5 min** (record seconds).
- [ ] All units extracted (no early stop at chapter 5; 24/24 for Computer Networks).
- [ ] Unit labels preserved ("Chapter N" stays "Chapter N", not "Week N").
- [ ] No hallucinated COs — either correct course-level COs, or an honest
      "per-chapter objectives detected" diagnostic.
- [ ] Analysis phase now makes 2 Ollama calls total, not 3 (confirm via logs).
- [ ] No `<think>` content leaks into output (grep the raw LLM response logs).
- [ ] anonymise()/reAssociate() boundaries unchanged — NOTE: syllabus text is course
      content, not student PII, but confirm no student data path was touched.
- [ ] keytar/secret path untouched.
- [ ] All AI calls still go through `model-router.js` (no direct SDK/HTTP added outside it).

## Risks / things executor must NOT do
1. **Do NOT exceed `num_ctx: 6144` anywhere on the target path.** 16384 broke 8GB viability
   and caused the 9-min regression. 6144 is the ceiling for the 8GB target.
2. **Do NOT keep `deepseek-r1:8b` as the syllabus model.** It does not fit 8GB RAM. (It may
   remain available for other features if Shad wants, but the syllabus pipeline must default
   to the small model.)
3. **Do NOT bypass `model-router.js`.** No direct `ollama` HTTP calls in the mapper; route
   through `send()`/`sendOllama()`.
4. **Do NOT rename the JSON `week` field** across the codebase — display-layer fix only, to
   avoid a sprawling refactor.
5. **Do NOT delete the old two-prompt analyzer builders** until the merged call is verified;
   keep them for rollback.
6. **Do NOT raise the input char cap back up to chase a truncation** before first confirming
   the small model handles 12000 chars within budget — truncation may now be an output-token
   issue, not input.
7. If the new model produces worse accuracy than DeepSeek on COs, **report with numbers**
   before reverting — do not silently flip models back.

## Decisions locked by Shad (2026-05-29)

**Q1 — Offline is first priority.** Professors will have an OpenRouter key, BUT the offline
local model is the PRIMARY path and must be excellent on 8GB. OpenRouter is the
"when-online" accelerator, not the default. Practical effect: do NOT set `preferOpenRouter`
on the syllabus path by default. The local model must hit all five requirements on its own.
OpenRouter remains the fallback/accelerator only.

**Q2 — One model for everything. Drop `deepseek-r1:8b` entirely.**
Rationale: DeepSeek-R1:8b (5.2GB) cannot fit in 8GB RAM for chat OR extraction, so keeping
it for DASH AI chat is dead weight that never runs on target hardware. A single small
non-reasoning model (`qwen2.5:3b-instruct`, ~1.9GB) serves ALL local inference — syllabus,
Bloom's, CLO mapping, AND DASH AI chat. Heavy reasoning, when the professor is online, already
routes to a large OpenRouter model through `model-router.js`. This means:
- Only ONE model to pull (~1.9GB vs 7.1GB), one pre-warm, one failure mode.
- `deepseek-r1:8b` should be removed as the default and not referenced as a fallback.
- Executor should NOT delete the user's locally-pulled deepseek blob (that's Shad's disk);
  just stop the app from defaulting to or pre-warming it.

### Extra step added from Q2 (do in Step 2)
- Audit the codebase for any OTHER place that hard-codes or pre-warms `deepseek-r1:8b`
  (e.g. `main.js` pre-warm, any CLO/Bloom's module, any settings default) and point them all
  at the new single default via `getOllamaModel()`/`_ollamaModel`. There must be exactly ONE
  source of truth for the local model id. Grep for `deepseek` across `src/` and fix every hit.
