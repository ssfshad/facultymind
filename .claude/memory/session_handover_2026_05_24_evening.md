---
name: Session handover — 2026-05-24 (Evening)
description: Full state after the long CLO Mapper engineering session. Read this at the start of the next session.
type: handover
---

# Session Handover — 2026-05-24 (Evening)

## What was built this session (in order)

### 1. Deterministic CLO Mapper Engine — clo-mapper-fast.js
Complete rewrite of the CLO mapping pipeline. Zero AI calls for 95%+ of questions.

**Architecture:**
- Stage 0: Pre-validation gate (NON_MEASURABLE / NON_COGNITIVE rejection)
- Stage 1: First-token imperative priority — scans all sentences, collects ALL imperative verbs, picks highest Bloom's level
- Stage 2: Downstream noun decoupling — verb is the only signal, not technical jargon
- Multi-level output: "Define X. Justify Y." → bloom_levels: ['C5','C1'], bloom_levels_display: "C1, C5"

**Test scores:**
- 25Q extended stress test: 25/25 = 100%
- 20Q Flutter exam: 20/20 = 100%
- Finite Automata paper: 10/10 = 100%
- Word-format paste: 8/8 = 100%

**Key fixes made:**
- `contrast` defaults to C4 (not C2)
- `appraise`/`assess` defaults to C5 (not C3)
- `criticize`/`critique` always C5
- `characterize` defaults to C4
- `outline`/`relate` → C2
- `construct` + end-to-end/sequence/framework cues → C6
- `translate X into Y` → C3
- `set up` → C6 (phrase verb)
- `complete` → C3
- `what happens when` → C2
- Multi-sentence questions: collect ALL imperative verbs, report all levels
- N.B. / Note: lines stripped before splitting
- N_STYLE regex: only matches numbers at line start (not mid-sentence like "divisible by 5.")
- `criticize` explicit case → C5

### 2. Model Switch: qwen2.5:14b → deepseek-r1:8b
- Deleted qwen2.5:14b (freed 9GB)
- Installed deepseek-r1:8b (5.2GB, fits 8GB RAM)
- model-router.js: `think: false` at root level of Ollama API payload
- `temperature: 0.0` for JSON tasks
- Response reads `message.content` directly (no regex strip needed)
- Default model updated to `deepseek-r1:8b`
- DB preference still shows qwen2.5:14b — needs manual update in Settings → Local AI

### 3. Hybrid KB Search — clo-knowledge.js + embedding-engine.js
- Migration 006: adds `root_verb` + `vector_blob` columns to clo_knowledge_base
- embedding-engine.js: lazy-loads all-MiniLM-L6-v2 via @xenova/transformers
- clo-knowledge.js: BM25 keyword gate + cosine similarity on vector blobs
- searchSimilar() (sync): keyword gate first, Fuse.js fallback
- searchSimilarHybrid() (async): full hybrid search with embeddings
- saveEmbedding(): token cache — skips recomputation for exact string matches
- checkLevelConflict(): poison prevention warning
- @xenova/transformers installed and loading on startup

### 4. 150-Question Seed Dataset
- src/database/seeds/clo-seed-dataset.json — 25 questions per C1-C6
- Covers Flutter, mobile dev, ICE/CS topics
- All lowercase, all starting with base-form verb, all pre-verified
- Seeder updated: inserts on first launch if KB is empty
- Solves cold-start problem — Layer 2 active from day one

### 5. Document Dropper — document-dropper.js
- Async multi-page pipeline: extract → stripDocumentNoise → chunkBySections → splitQuestions → extractSubQuestionsFromContext → mapDeterministic
- stripDocumentNoise(): removes DIU headers, page numbers, CamScanner watermarks
- chunkBySections(): splits Section A/B style papers
- extractSubQuestionsFromContext(): when a block starts with context paragraph (noun, not verb), extracts sub-letter items as independent questions
- setImmediate between sections — doesn't freeze renderer
- blooms:map-clos IPC handler now routes file uploads through ingestAndMap() first

### 6. Production Packaging — electron-builder.yml
- asarUnpack: better-sqlite3, keytar, onnxruntime-node, @xenova/transformers WASM
- extraResources: clo-seed-dataset.json bundled at process.resourcesPath/seeds/
- notarize.js stub for macOS
- installer-extras.nsh stub for Windows NSIS

### 7. Shadow Editor UI — blooms.js
- "📝 Shadow Edit" button added to CLO result table
- Renders question rows with color-coded verb badges (green/amber/red)
- Click badge → micro-dropdown (C1-C6) at cursor position
- Poison prevention: checkConflict IPC fires before saving override
- Badge turns green instantly on selection
- Change saved to KB (fire-and-forget)
- "✕ Close Shadow Edit" returns to table view with edits applied
- Multi-level questions show static badge "C1, C5" instead of dropdown

### 8. Multi-Level Bloom's Output
- "Define X. Justify Y." → bloom_levels: ['C5','C1'], bloom_levels_display: "C1, C5"
- UI shows static badge for multi-level, dropdown for single-level
- Markdown export shows "C1, C5" in the level column
- All regression tests still pass

## Current State

**App runs:** `npm run dev` from d:\facultymind\
**Active model:** Ollama (deepseek-r1:8b) — but DB still has qwen2.5:14b preference
**Fix needed:** Go to Settings → Local AI → change model to deepseek-r1:8b → Save
**All 5+1 migrations run cleanly** (001-006)
**Embedding model:** all-MiniLM-L6-v2 loads on startup (confirmed in logs)
**KB seed:** 150 questions inserted on first launch

## Open Issues

1. **Ollama model preference in DB** — still shows qwen2.5:14b. Fix: Settings → Local AI → deepseek-r1:8b → Save. Or run scripts/fix-ollama-model.js through Electron (not system Node — version mismatch).

2. **CLO code column showing "null"** — the output showed "CLO-1|null" in the markdown. This is a display issue in the markdown builder — `bloom_level` was being shown in the CLO code column. The multi-level fix may have resolved this but needs verification in the live app.

3. **Shadow editor: multi-level questions** — the dropdown is replaced with a static badge for multi-level questions. If the professor wants to edit a multi-level question, they need to use the table view dropdown instead. This is a known limitation.

## What to do next session

1. **Test the live app** with the finite automata paper and the "Define Hypervisor. Justify..." question — verify multi-level output shows correctly in the UI.

2. **Fix the Ollama model preference** — Settings → Local AI → deepseek-r1:8b → Save.

3. **Feed the KB** — professor should go to Bloom's → Knowledge Base → Scan Folder with real exam question images. The 150 seed questions are there but teacher-specific conventions (like Sir Sarker's C5 for "find error") need to be added via corrections.

4. **Consider the CLO code display bug** — if "CLO-1|null" still appears, check the markdown builder in blooms.js around the `buildCloMarkdown()` function.

## Key files changed this session
```
src/modules/blooms/clo-mapper-fast.js       ← Complete engine rewrite
src/modules/blooms/blooms-engine.js         ← Hybrid search, graceful AI fallback
src/modules/blooms/clo-knowledge.js         ← Hybrid search, saveEmbedding, checkLevelConflict
src/modules/blooms/embedding-engine.js      ← NEW: all-MiniLM-L6-v2 wrapper
src/modules/blooms/document-dropper.js      ← NEW: async multi-page pipeline
src/modules/ai/model-router.js              ← deepseek-r1:8b, think:false, temp:0.0
src/database/migrations/006_kb_vectors.js   ← NEW: root_verb + vector_blob columns
src/database/db.js                          ← runs migration 006
src/database/seeds/clo-seed-dataset.json    ← NEW: 150 pre-verified questions
src/database/seeds/seeder.js                ← seeds KB on first launch
src/renderer/js/blooms.js                   ← Shadow editor, multi-level badge
src/main/main.js                            ← embedding pre-warm, checkConflict IPC, saveEmbedding on save
src/main/preload.js                         ← checkConflict exposed
electron-builder.yml                        ← asarUnpack, extraResources
package.json                                ← asarUnpack in build section
scripts/notarize.js                         ← NEW: macOS notarization stub
assets/installer-extras.nsh                 ← NEW: NSIS stub
scripts/test-25q.js                         ← 25-question stress test
scripts/test-20q.js                         ← 20-question Flutter exam test
scripts/test-finite-automata.js             ← Finite automata paper test
scripts/test-word-format.js                 ← Word-format paste test
```

## Test commands to verify on resume
```
node scripts\test-25q.js          # should be 25/25
node scripts\test-20q.js          # should be 20/20
node scripts\test-finite-automata.js  # should be 10/10
node scripts\test-word-format.js  # should be 8/8
```
