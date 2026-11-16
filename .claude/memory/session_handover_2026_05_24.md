---
name: Session handover — 2026-05-24
description: Full state of the project after today's session. Read this at the start of the next session.
type: handover
---

# Session Handover — 2026-05-24

## What was built today (in order)

### 1. Ollama local AI integration — COMPLETE
- `model-router.js`: `sendOllama()`, `isOllamaAvailable()`, `setOllamaModel()`, `getOllamaModel()`, `preferLocal` auto-routing
- `setActiveModel()` now accepts `'ollama'`
- Auto-detection on startup: if Ollama is running AND no cloud key set → auto-switch to Local AI
- `ai:model-changed` IPC event sent to renderer on auto-switch
- Settings UI: "🖥 Local AI" button, Ollama config panel, green/amber status dot, 30s auto-refresh
- Chat header: `updateModelBadge()` shows "🖥 Local AI" in green when Ollama is active
- `ai:check-ollama`, `ai:set-ollama-model`, `ai:get-ollama-model` IPC handlers + preload exposure
- Fixed: `ai:send`, `blooms:generate`, `blooms:map-clos` IPC handlers now skip API key check when model is `ollama`
- Model: `qwen2.5:3b` installed and running at `localhost:11434`

### 2. Ollama performance optimizations
- `sendOllama()` uses task-specific system prompt only (skips the 3000-token FacultyMind context)
- `num_predict` capped at 1024 for CLO tasks
- `num_ctx` set to 4096
- `temperature` set to 0.2 for consistent JSON output
- OpenRouter fallback chain trimmed from 16 to 6 models

### 3. CLO Mapper prompt accuracy fixes
- `blooms-clo-mapping.js`: Rewrote HARD RULES with 3-priority system:
  - PRIORITY 1: Match the literal verb ("apply" = C3, always)
  - PRIORITY 2: Base-form requirement
  - PRIORITY 3: Disambiguation only when genuinely ambiguous
  - Removed the "lean higher" bias that was causing over-classification
- `blooms-clo-critic.js`: Fixed critic to flag over-classification (not just under-classification)
  - Added: "apply is C3, period. Do not push it to C4"
  - Removed: "lean HIGHER when ambiguous" instruction from critic

### 4. CLO Knowledge Base RAG system — COMPLETE
Full self-improving system built. Files created/modified:

**New files:**
- `src/database/migrations/005_clo_knowledge.js` — clo_knowledge_base table + 3 indexes
- `src/modules/blooms/clo-knowledge.js` — CRUD + Fuse.js search (addRecord, addBatch, getAll, getStats, verify, unverify, deleteRecord, searchSimilar)
- `src/prompts/templates/blooms-clo-parser.js` — AI prompt to parse OCR'd exam text into structured CLO records

**Modified files:**
- `src/database/db.js` — runs migration 005
- `src/modules/blooms/blooms-engine.js` — KB example retrieval before Pass 1, examples passed to prompt
- `src/prompts/templates/blooms-clo-mapping.js` — accepts `examples=[]` 3rd arg, injects VERIFIED EXAMPLES section
- `src/main/main.js` — 7 IPC handlers: clo-kb:import-images, clo-kb:save-batch, clo-kb:get, clo-kb:verify, clo-kb:unverify, clo-kb:delete, clo-kb:stats
- `src/main/preload.js` — `window.api.cloKb` exposed with all 7 methods
- `src/renderer/js/blooms.js` — 📚 Knowledge Base tab added (3rd mode), full KB UI

### 5. Folder scan for batch training — COMPLETE
- `clo-kb:scan-folder` IPC handler: opens folder picker dialog, reads all PNG/JPG images, returns buffers
- `window.api.cloKb.scanFolder()` exposed in preload
- "📁 Scan Folder" button added to KB import section
- `handleKbScanFolder()` function in blooms.js
- Per-image status tracking: ✅ used / ⚠️ no CLO found / ❌ failed — shown in collapsible details panel after scan

### 6. Desktop notifications — PARTIALLY DONE, PAUSED HERE
**Status: ~40% complete. DO NOT ship yet.**

What's done:
- `notify:send` IPC handler in main.js — fires `new Notification({ title, body, icon, silent: !sound })`
- `window.api.notify.send(title, body, sound)` exposed in preload

What's NOT done yet (resume here):
1. **Wire notifications to task completions** — when a task/reminder is marked done, fire a notification
2. **Wire to KB training completion** — after "Save Accepted" in KB tab, fire "✅ Training complete: X questions added"
3. **Wire to CLO Mapper completion** — after analysis finishes, fire "✅ CLO mapping complete for [course]"
4. **Wire to Bloom's lesson plan completion** — after PDF processing, fire "✅ Lesson plan generated"
5. **Sound** — Electron's `silent: false` uses the OS default notification sound. Test on Windows to confirm it plays.
6. **QA** — full QA after notification wiring is complete

---

## Current state of the app

- App runs: `npm run dev` from `d:\facultymind\`
- Active model: **Ollama (qwen2.5:3b)** — local, offline, no API cost
- Ollama server: already running in background (port 11434)
- All 5 migrations run cleanly (001-005)
- CLO Knowledge Base: table exists, 0 records (professor hasn't fed data yet)
- KB folder scan: working
- Notifications: IPC handler exists but not wired to any events yet

## Open bugs
- BUG-002: SQLCipher — plain SQLite, app-layer AES-256 as workaround (known, deferred)
- BUG-020: pdf-parse + pdfkit PDFs — workaround: use Word/Acrobat PDFs (known, deferred)
- CLO Mapper accuracy with qwen2.5:3b: ~60-70% (improved from 33% after prompt fixes). Will reach 85%+ once KB has verified examples.

## What to do next session (in order)

### Priority 1: Wire notifications to events
1. In `src/renderer/js/blooms.js` — after `handleKbSaveAccepted()` saves records, call:
   `window.api.notify.send('✅ Training Complete', 'X questions added to CLO Knowledge Base', true)`
2. In `src/renderer/js/blooms.js` — after `runCloAnalysis()` succeeds, call:
   `window.api.notify.send('✅ CLO Mapping Complete', 'Analysis for [courseCode] is ready', true)`
3. In `src/renderer/js/blooms.js` — after lesson plan generates, call:
   `window.api.notify.send('✅ Lesson Plan Ready', 'Bloom\'s analysis complete', true)`
4. In `src/renderer/js/schedule.js` — when a task is marked done, call:
   `window.api.notify.send('✅ Task Complete', taskTitle, true)`
5. Test on Windows — confirm notification sound plays

### Priority 2: Feed the KB with real exam questions
- Professor creates a folder with exam question images
- Goes to Bloom's → Knowledge Base → Scan Folder
- Reviews parsed questions, accepts correct ones
- Saves to KB
- Tests CLO Mapper accuracy improvement

### Priority 3: QA on everything built today
- Run full QA: Ollama integration, KB system, folder scan, notifications
- Test CLO Mapper accuracy with KB examples vs without

### Priority 4: Consider adding `preferLocal: true` to more tasks
- Email classification (email-classifier.js) — structured JSON, good candidate
- Intent classification (classifyIntent in model-router.js) — small JSON, fast

## Key files changed today
```
src/modules/ai/model-router.js          ← Ollama: sendOllama, isOllamaAvailable, preferLocal routing
src/modules/blooms/blooms-engine.js     ← KB retrieval before Pass 1
src/modules/blooms/clo-knowledge.js     ← NEW: CRUD + Fuse.js search
src/modules/blooms/ocr-engine.js        ← recognizeImageBuffer added
src/prompts/templates/blooms-clo-mapping.js    ← examples injection, fixed HARD RULES
src/prompts/templates/blooms-clo-critic.js     ← fixed over-classification bias
src/prompts/templates/blooms-clo-parser.js     ← NEW: exam question parser prompt
src/database/migrations/005_clo_knowledge.js   ← NEW: clo_knowledge_base table
src/database/db.js                      ← runs migration 005
src/renderer/js/blooms.js              ← KB tab, folder scan, per-image status
src/renderer/js/settings.js            ← setupOllama() function
src/renderer/js/chat.js                ← updateModelBadge(), onModelChanged listener
src/main/main.js                       ← Ollama IPC, KB IPC, notify:send, folder scan
src/main/preload.js                    ← window.api.notify, window.api.cloKb, Ollama API
```

## Reminder: how to resume
When Shad says "read the memory" or "continue from where we left off":
1. Read this file
2. Read `.claude/BUGLOG.md` for any open bugs
3. Start with "Priority 1: Wire notifications to events" above
4. Run `npm run dev` to verify app still starts clean before making changes
5. Ollama is already installed — just make sure `ollama serve` is running (or it auto-starts)
