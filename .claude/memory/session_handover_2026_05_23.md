---
name: Session handover — 2026-05-23
description: Everything done today and exactly where we stopped. Read this at the start of the next session.
type: handover
---

# Session Handover — 2026-05-23

## What was built today (in order)

### 1. Two custom agents created
- `d:\facultymind\.kiro\agents\facultymind-planner.md` — planning only, writes plans to `.kiro/plans/`
- `d:\facultymind\.kiro\agents\facultymind-executor.md` — reads latest plan, executes, updates BUGLOG + SPRINTS
- NOTE: Both agents have model ID issues in Kiro (claude-opus-4-7 / claude-sonnet-4-7 not recognized). Workaround: use `general-task-execution` sub-agent for both roles until Kiro resolves model IDs.

### 2. Bloom's CLO Mapper feature (Sprint 2 completion)
- New mode toggle in Bloom's UI: 📄 Lesson Plan | 🎯 CLO Mapper
- CLO Mapper accepts: PDF, DOCX, PNG, JPG, WEBP, BMP, TIFF
- DOCX support via `mammoth`
- Image support via Tesseract.js OCR
- Scanned PDF fallback via Tesseract.js + pdfjs-dist rendering
- New prompt: `src/prompts/templates/blooms-clo-mapping.js`
- New IPC: `blooms:map-clos`, `blooms:export-pdf`
- Preload: `window.api.blooms.mapCLOs`, `window.api.blooms.exportPdf`

### 3. 3-pass AI verification chain for CLO Mapper
- Pass 1: Initial mapping (`blooms-clo-mapping.js`) — with verb dictionary constraint, base-form requirement, "lean higher" bias
- Pass 2: Critic review (`blooms-clo-critic.js`) — flags wrong levels, non-base verbs, weak justifications
- Pass 3: Reconciler (`blooms-clo-reconciler.js`) — applies corrections (conditional, only if Pass 2 found ≥1)
- Shared verb dictionary: `src/prompts/templates/blooms-verbs.js`
- All 3 passes use `preferLocal: true` flag for Ollama auto-routing

### 4. Inline editing + export in CLO Mapper UI
- Bloom's level: clickable `<select>` dropdown per row
- Suggested verbs: `contenteditable` span per row
- Distribution chips recompute live on edit
- `cloEditState` tracks in-memory edits (not saved to DB)
- 📋 Copy as Markdown button
- 📄 Export as PDF button (saves to Desktop)
- Verified badge: 3 states (green corrections, green clean, amber unverified)
- "What the AI improved" collapsible `<details>` panel

### 5. OCR pipeline (Tesseract.js + pdfjs-dist)
- `src/modules/blooms/ocr-engine.js` — Tesseract.js worker + pdfjs-dist PDF renderer
- `recognizePdfBuffer(buffer, onProgress)` — PDF → images → OCR
- `recognizeImageBuffer(buffer, onProgress)` — direct image OCR
- `terminateWorker()` — called on app quit
- OCR progress events: `blooms:ocr-progress` → renderer shows "OCR: extracting page X of Y..."

### 6. Security fixes applied
- CSP enabled in `index.html`
- Google OAuth credentials moved from `.env` to keytar (with `.env` fallback + auto-migration)
- New Settings section: Google OAuth (Client ID + Secret)
- `escapeHtml()` applied throughout CLO Mapper renderer (XSS prevention)
- BAETE export BrowserWindow: `nodeIntegration: false, contextIsolation: true`
- `auth:verify-active-pin` IPC exposed in preload (was missing — vault PIN unlock was silently failing)

### 7. Ollama integration — PARTIALLY DONE, PAUSED HERE
**Status: ~60% complete. DO NOT ship yet.**

What's done:
- `model-router.js` updated:
  - `sendOllama()` function added — hits `localhost:11434/api/chat`
  - `isOllamaAvailable()` — pings Ollama with 2s timeout, caches result 60s
  - `setOllamaModel()` / `getOllamaModel()` — default `qwen2.5:3b`
  - `send()` updated: if `options.preferLocal=true` AND Ollama is up → auto-routes to Ollama
  - `setActiveModel()` now accepts `'ollama'` as valid model
  - Exports updated to include new functions
- `blooms-engine.js`: all 3 CLO Mapper AI calls have `preferLocal: true`
- `preload.js`: `ai.setOllamaModel`, `ai.getOllamaModel`, `ai.checkOllama` exposed
- `main.js`: IPC handlers for `ai:set-ollama-model`, `ai:get-ollama-model`, `ai:check-ollama` added
- `index.html`: "🖥 Local AI" button added to model switcher, Ollama config panel added

What's NOT done yet (resume here):
1. **`settings.js` — `setupOllama()` function** — needs to be written:
   - On init: call `window.api.ai.checkOllama()` → show green/red status dot
   - Load saved ollama model from `window.api.ai.getOllamaModel()`
   - Wire "Apply" button to `window.api.ai.setOllamaModel()`
   - Show/hide Ollama config panel when "Local AI" model button is active
   - Auto-check Ollama status every 30s while Settings is open
2. **Startup auto-detection in `main.js`** — on app ready, check Ollama, if available + no cloud key set → auto-switch to ollama model
3. **Status indicator in sidebar or chat header** — small "🖥 Local" badge when Ollama is active
4. **QA** — full QA after Ollama integration is complete
5. **Test** — install Ollama + `ollama pull qwen2.5:3b` and test the full CLO Mapper flow locally

---

## Current state of the app

- App runs: `npm run dev` from `d:\facultymind\`
- Active model: OpenRouter (free tier, slow due to congestion)
- All migrations run cleanly (001, 002, 003, 004)
- OCR works: confirmed with Alex_SOP.pdf (3764 chars extracted)
- CLO Mapper works: 3-pass chain runs, inline edit works, export works
- Ollama code is in place but `setupOllama()` in settings.js is not yet written

## Open bugs
- BUG-002: SQLCipher — plain SQLite, app-layer AES-256 as workaround (known, deferred)
- BUG-020: pdf-parse + pdfkit PDFs — workaround: use Word/Acrobat PDFs (known, deferred)
- OpenRouter free models are slow/congested — Ollama integration will fix this

## What to do next session (in order)

1. Read this file
2. Write `setupOllama()` in `src/renderer/js/settings.js`
3. Add startup auto-detection in `main.js` (check Ollama on app ready)
4. Add "🖥 Local" status badge in chat header when Ollama is active
5. Run QA on the full Ollama integration
6. Test: install Ollama → `ollama pull qwen2.5:3b` → test CLO Mapper offline
7. After Ollama works: consider adding `preferLocal: true` to other structured tasks (email classification, intent classification)

## Key files changed today
```
src/modules/ai/model-router.js          ← Ollama added, preferLocal routing
src/modules/blooms/blooms-engine.js     ← 3-pass chain, preferLocal flags, image support
src/modules/blooms/ocr-engine.js        ← Tesseract.js + pdfjs-dist pipeline
src/prompts/templates/blooms-clo-mapping.js    ← refined with verb dict + hard rules
src/prompts/templates/blooms-clo-critic.js     ← NEW Pass 2
src/prompts/templates/blooms-clo-reconciler.js ← NEW Pass 3
src/prompts/templates/blooms-verbs.js          ← NEW shared verb dictionary
src/renderer/js/blooms.js              ← CLO Mapper UI, inline edit, export, image support
src/renderer/js/settings.js            ← setupOllama() stub added (NOT YET IMPLEMENTED)
src/renderer/index.html                ← CSP enabled, Local AI button, Ollama config panel
src/main/main.js                       ← Ollama IPC handlers, blooms:export-pdf
src/main/preload.js                    ← Ollama API exposed, blooms.exportPdf
.kiro/agents/facultymind-planner.md    ← NEW agent
.kiro/agents/facultymind-executor.md   ← NEW agent
```

## Reminder: how to resume
When Shad says "read the memory" or "continue from where we left off":
1. Read this file
2. Read `.claude/BUGLOG.md` for any open bugs
3. Start with step 1 of "What to do next session" above
4. Run `npm run dev` to verify app still starts clean before making changes
