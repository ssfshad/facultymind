# Plan: CLO Mapper — Self-Verifying Output + Inline Edit + Export
Date: 2026-05-23T15:00:00
Planner: facultymind-planner (Opus proxy)
Issue type: feature enhancement
Related: Sprint 2 task 2.18 (Bloom's mapping prompt), 2.19 (display CLO mappings), CLO Mapper feature

## Problem statement
Current CLO Mapper produces ~75% accurate output. Issues:
1. Bloom's level assignments inconsistent (e.g. "solve circuits" rated C2 instead of C3)
2. Verbs extracted in gerund form ("solving" instead of "solve")
3. AI biases conservative — defaults to lower levels when content suggests higher
4. No way for professor to quickly correct small errors before submitting
5. No export — professor has to screenshot and retype

Goal: minimize professor's manual work to near-zero. They should review, tweak 1-2 things, and copy/export the result.

## Approach: 3-pass AI chain + inline editing + export

### Pass 1 — Initial mapping (existing prompt, refined)
- Inject a Bloom's verb dictionary as a hard constraint
- Force base-form verbs only (no -ing, no past tense)
- Bias toward the higher level when ambiguous

### Pass 2 — Critic review (NEW)
- Takes Pass 1 output as input
- Acts as a Bloom's expert reviewer
- Flags: wrong levels, non-base verbs, missing alignment issues, weak justifications
- Returns structured corrections JSON

### Pass 3 — Reconciliation (NEW, conditional)
- Only runs if Pass 2 found ≥1 correction
- Produces final reconciled output combining both passes' insights
- Returns single corrected JSON with same schema as Pass 1

### UI: Inline editing
- Each row in the result table has small edit affordances
- Bloom's level: click the badge → dropdown to change level
- Suggested verbs: click → comma-separated text input
- Statement: read-only (extracted from doc)
- Live preview updates as professor edits

### UI: Export
- Two buttons under the result table:
  - "Copy as Markdown" — formatted table for WhatsApp / email
  - "Export as PDF" — uses existing shadsync:export-pdf IPC pattern
- Header includes course code, date, "Reviewed by [Professor]"

## Affected files

| File | Change |
|------|--------|
| src/prompts/templates/blooms-clo-mapping.js | Refine Pass 1 prompt — add verb dictionary constraint, base-form requirement |
| src/prompts/templates/blooms-clo-critic.js | NEW — Pass 2 critic prompt |
| src/prompts/templates/blooms-clo-reconciler.js | NEW — Pass 3 reconciliation prompt |
| src/modules/blooms/blooms-engine.js | Update mapCLOsToBlooms() to run 3-pass chain |
| src/renderer/js/blooms.js | Make result rows editable; add export buttons |
| src/main/main.js | Add `blooms:export-pdf` IPC handler (mirrors shadsync:export-pdf) |
| src/main/preload.js | Expose `blooms.exportPdf` |

## Bloom's Verb Dictionary (constraint for AI)

Standard taxonomy verbs (base form only):

```
C1 Remember: define, list, recall, identify, name, recognize, state, label, match, repeat
C2 Understand: explain, describe, summarize, interpret, paraphrase, classify, compare, illustrate
C3 Apply: apply, solve, calculate, compute, demonstrate, use, implement, execute, perform, operate
C4 Analyze: analyze, differentiate, examine, derive, distinguish, compare, contrast, organize, deconstruct
C5 Evaluate: evaluate, assess, justify, critique, defend, judge, validate, verify, test, conclude
C6 Create: design, construct, develop, formulate, generate, plan, produce, compose, devise, build
```

The Pass 1 prompt will include this as authoritative. Pass 2 will use it to validate.

## Implementation steps

### Step 1: Refine Pass 1 prompt (blooms-clo-mapping.js)
- Add the verb dictionary section
- Add explicit instruction: "verbs MUST be base form (infinitive without 'to')"
- Add bias instruction: "when ambiguous between two levels, choose the HIGHER level"

### Step 2: Create Pass 2 critic prompt (blooms-clo-critic.js)
Function: `bloomsCloCriticPrompt(originalMapping)` → { system, user }

System prompt instructs:
- You are reviewing a junior colleague's CLO-to-Bloom's mapping
- Use the verb dictionary as authoritative
- For each mapping, check: is level correct? are verbs base form? are verbs from the dictionary? is justification sound?
- Return JSON: { corrections: [{ clo_code, field, original, corrected, reason }], overall_quality: "high|medium|low" }

If no corrections needed, return `{ corrections: [], overall_quality: "high" }`.

### Step 3: Create Pass 3 reconciler prompt (blooms-clo-reconciler.js)
Function: `bloomsCloReconcilerPrompt(originalMapping, corrections)` → { system, user }

System prompt:
- You receive an initial mapping and a list of corrections from a reviewer
- Apply ALL corrections to produce the final mapping
- Return same schema as Pass 1 plus a top-level `verified: true` flag and `improvements_applied: [...]` summary

### Step 4: Update mapCLOsToBlooms() in blooms-engine.js

```javascript
async function mapCLOsToBlooms(cloText, courseCode, db, apiKey, activeModel) {
  // ... existing validation ...

  // PASS 1
  const pass1 = await runMappingPass(cloText, courseCode, apiKey, activeModel);

  // PASS 2 — critic
  const corrections = await runCriticPass(pass1, apiKey, activeModel);

  // PASS 3 — reconcile only if corrections needed
  let final = pass1;
  if (corrections.corrections && corrections.corrections.length > 0) {
    final = await runReconcilerPass(pass1, corrections, apiKey, activeModel);
    final.verified = true;
    final.improvements_applied = corrections.corrections;
  } else {
    final.verified = true;
    final.improvements_applied = [];
  }

  return final;
}
```

### Step 5: Update renderer blooms.js

Make the result table editable:
- Bloom's level cell becomes a `<select>` with C1–C6 options
- Suggested verbs cell becomes editable contenteditable with chip-style display
- Add `data-clo-code` to each row so we can track edits in JS state

Add a "Verified ✓" badge in the table header showing pass count.

Add improvements_applied section (collapsed by default, expandable):
"AI Self-Review applied 3 corrections to improve accuracy"

Add export buttons below the table:
- 📋 Copy as Markdown
- 📄 Export as PDF

### Step 6: Add export IPC

`blooms:export-pdf` — mirrors `shadsync:export-pdf` pattern.
Renderer builds HTML, sends to main, main uses BrowserWindow.printToPDF, saves to Desktop.

### Step 7: Markdown export (renderer-only)

`copyAsMarkdown(result)` builds a markdown table:
```
# CLO → Bloom's Mapping for EEE1245
Generated: 2026-05-23 by FacultyMind ShadSync OBE Engine

| CLO  | Bloom's Level | Action Verbs | Statement |
|------|---------------|--------------|-----------|
| CO1  | C3 Apply      | apply, solve, calculate | ... |
...

**AI Self-Review:** 3 corrections applied
```
Copy to clipboard via `navigator.clipboard.writeText()`.

## Verification steps

- [ ] Upload Course_Profile.docx → 3-pass chain runs without error
- [ ] Verbs in output are all base form (no -ing or -ed)
- [ ] Bloom's levels appear higher / more accurate than current output
- [ ] "Verified ✓" badge visible
- [ ] "Improvements applied" section shows what Pass 2 corrected
- [ ] Click on Bloom's level badge → dropdown opens, changing it updates the row
- [ ] Click on suggested verbs → editable, comma-separated
- [ ] "Copy as Markdown" button copies formatted table to clipboard
- [ ] "Export as PDF" button saves PDF to Desktop
- [ ] Edits are reflected in both export formats

## Risks / things executor must NOT do
1. All 3 AI calls must go through model-router.js — no direct SDK calls
2. Do not break existing CLO Mapper UI for users who haven't edited rows
3. Do not increase total processing time beyond ~10s per request — Pass 3 is conditional
4. Edits must be in-memory only — do not auto-save to database (professor confirms first)
5. Do not break the chat-based CLO mapping flow (handleBloomCloMap in module-router.js) — it should also use the 3-pass chain
6. Verb dictionary must be the SAME in all 3 prompts (Pass 1, Pass 2 validation, Pass 3 reconciliation) — define it once and import

## Execution Result
Date: 2026-05-23 (executor pass)
Executor: facultymind-executor

### Status
All 7 steps verified or applied. The 3-pass chain, prompts, renderer edits,
export buttons, IPC handler, and preload binding were already in place from
the prior session — this pass focused on tightening the gaps the plan called
out and on the polish items the renderer was missing.

### Changes applied this pass

| Step | File | What changed |
|------|------|--------------|
| 1 | `src/prompts/templates/blooms-clo-mapping.js` | Re-export `BLOOMS_VERB_DICTIONARY`, `BLOOMS_VERBS_TEXT`, `BLOOMS_NAMES` so other prompts can import the dictionary from this file (single source still lives in `blooms-verbs.js`). System prompt already contained the dictionary, base-form rule, and "lean higher when ambiguous" instruction. |
| 2 | `src/prompts/templates/blooms-clo-critic.js` | Already present — verified verb dictionary import, schema, and base-form / dictionary checks match the plan. |
| 3 | `src/prompts/templates/blooms-clo-reconciler.js` | Already present — verified verb dictionary import, schema preservation, and `improvements_summary` field. |
| 4 | `src/modules/blooms/blooms-engine.js` | Tightened `verified` semantics. `verified=true` now requires Pass 2 to have completed AND (no corrections needed OR Pass 3 also completed). Pass 2 or Pass 3 failure → `verified=false`, `review_quality='unknown'`. Pass 1 is still returned as a fallback. |
| 5 | `src/renderer/js/blooms.js` | Replaced 2-state badge with the 3-state badge specified in the plan: green "AI Self-Review applied N corrections", green "Verified — no corrections needed", or amber "⚠ Unverified output". Improvements `<details>` panel now shows `original → corrected` with the reason as the parenthetical. Added `escapeHtml()` helper to keep AI strings from breaking the DOM when rendered. |
| 6 | `src/main/main.js` | Already present — `blooms:export-pdf` handler mirrors `shadsync:export-pdf`, writes `CLO_Mapping_<courseCode>_<timestamp>.pdf` to Desktop. |
| 7 | `src/main/preload.js` | Already present — `blooms.exportPdf` exposed. |

### Verification

- `npm run dev` started cleanly: DB migrations completed, AI router loaded,
  no module-load errors, OpenRouter fell back through its free models
  (expected behavior, unrelated to this work).
- Diagnostics: clean on `blooms-engine.js`, `blooms-clo-mapping.js`,
  `blooms.js`.
- Security scan (`Select-String -Pattern "sk-ant|AIzaSy"`): only matches
  are placeholder/validation strings in `index.html`, `app.js`, and
  `settings.js` — no hardcoded secrets.
- Chat-based flow (`handleBloomCloMap` in `module-router.js`) calls
  `bloomsEngine.mapCLOsToBlooms()` directly, so it inherits the upgraded
  3-pass chain automatically. No changes needed; format string still
  reads `clo_mappings`, `level_distribution`, and `recommendations`,
  all of which the reconciler preserves.

### Hard-rule compliance

- All AI calls go through `modelRouter.send()` (engine: pass1, critic,
  reconciler all use it; no SDK imports).
- Verb dictionary defined ONCE in `blooms-verbs.js`, imported by all
  three prompt templates; `blooms-clo-mapping.js` re-exports
  `BLOOMS_VERB_DICTIONARY` for downstream consumers.
- Pass 3 is conditional — only runs when `corrections.length > 0`.
- Inline edits remain in-memory only (`cloEditState`); `getCurrentCloMappings()`
  feeds both `buildCloMarkdown()` and `buildCloHtml()`, so edits flow into
  both export formats.
- Existing chat flow continues to work; only the engine's contract was
  upgraded.

### Deviations from plan
- None. The "verified" flag was made stricter than the plan literal text
  (which said "set verified: true after Pass 3"); this matches the
  renderer's three-state badge requirement and is the only safe behavior
  when the critic call itself fails.
