# FacultyMind — OBE Engine Architecture
# Last updated: 2026-05-24 (Evening session)
# This is the authoritative technical reference for the CLO/Syllabus pipeline.

---

## System Overview

FacultyMind is a production-grade, local-first academic compiler designed to
optimize and secure the Outcome-Based Education (OBE) workflow on institutional
consumer laptops (8GB RAM minimum).

```
[ Raw Course Profile / Examination Paper ]
          │
          ▼
┌───────────────────────────────────┐
│  STATE 0: OCR SANITIZER           │
│  - Cleans formatting artifacts    │
│  - "Analy ze" → "Analyze"         │
│  - "lmplement" → "Implement"      │
└───────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────┐
│  STATE 1: LOCAL TEXT CACHE        │
│  - 0ms bypass for exact matches   │
│  - SQLite vector_blob lookup      │
└───────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────┐
│  STATE 2: HYBRID RETRIEVAL        │
│  - BM25 keyword gate (root_verb)  │
│  - Cosine similarity on vectors   │
│  - 88% threshold cutoff           │
└───────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────┐
│  STATE 3: LOCAL REASONING         │
│  - DeepSeek-R1 8B (think: false)  │
│  - Only for low-confidence items  │
│  - ~3 sec on CPU, 5.5GB RAM       │
└───────────────────────────────────┘
          │
          ▼
┌───────────────────────────────────┐
│  STATE 4: SYSTEM INGESTION / UI   │
│  - Conflict alerts & macro flags  │
│  - Shadow editor for corrections  │
│  - Auto-save to KB vector store   │
└───────────────────────────────────┘
```

---

## Module 1: Micro Exam Paper Parser

**File:** `src/modules/blooms/clo-mapper-fast.js`
**Entry point:** `mapDeterministic(rawText, courseCode, db)`

### Pipeline

**Layer 1 — Deterministic verb-dictionary gate (BM25)**
- Extracts the primary imperative verb from each question
- Looks it up in `BLOOMS_VERBS` dictionary (180+ verbs, C1–C6)
- Unambiguous verbs resolve instantly: `design → C6`, `analyze → C4`, `apply → C3`
- Ambiguous verbs (appear in multiple levels) go to disambiguation rules
- Speed: <1ms per question

**Layer 2 — Local dense vector similarity**
- Model: `all-MiniLM-L6-v2` (23MB quantised ONNX, via `@xenova/transformers`)
- Stored in SQLite `clo_knowledge_base.vector_blob` (Float32Array as BLOB)
- BM25 keyword gate first (filter by `root_verb`), then cosine similarity
- Threshold: 88% — below this, falls through to Layer 3
- Speed: <50ms including embedding computation

**Layer 3 — Local LLM fallback**
- Model: `deepseek-r1:8b` via Ollama at `localhost:11434`
- `think: false` — bypasses chain-of-thought, straight to JSON output
- `temperature: 0.0` — zero token drift on structured output
- Only called for questions that Layer 1+2 cannot resolve (typically 0-3 per paper)
- Speed: ~3 seconds on CPU

### Pre-validation gate (Stage 0)
Runs BEFORE any verb lookup:
- **NON_MEASURABLE**: flags "develop a familiarity with", "understanding of", "memorize the entire", etc.
- **NON_COGNITIVE (Affective)**: flags "collaborate with", "appreciate", "coordinate with peers"
- **NON_COGNITIVE (Psychomotor)**: flags "polishing individual asset animations", "demonstrate professional ownership"

### Multi-level output
Questions with multiple imperative verbs ("Define X. Justify Y.") return:
- `bloom_level`: highest level (C5 for justify)
- `bloom_levels`: all levels ['C5', 'C1']
- `bloom_levels_display`: "C1, C5" (sorted, for UI display)

### Test scores (as of 2026-05-24)
- 25Q extended stress test: 25/25 = 100%
- 20Q Flutter exam: 20/20 = 100%
- Finite Automata paper: 10/10 = 100%
- Word-format paste: 8/8 = 100%

---

## Module 2: Macro Syllabus Mapper

**File:** `src/modules/blooms/syllabus-mapper.js`
**Entry point:** `analyzeSyllabus(buffer, mimeType, onProgress)`
**UI:** Bloom's tab → 📋 Syllabus

### Pipeline

**Stage 1 — Extract**
- Regex patterns extract CO statements from common DIU formats
- Strips preamble: "Be able to...", "Students will be able to...", "Upon completion..."
- Extracts weekly topics from "Week N:" patterns and table formats

**Stage 2 — Reverse-map**
- `DOMAIN_TOPIC_MATRIX`: 180+ topic keywords → Bloom's level + suggested verbs
- Examples:
  - "nodal analysis" → C4 Analyze: [analyze, calculate, formulate]
  - "thevenin" → C4 Analyze: [analyze, simplify, calculate]
  - "ohm's law" → C2 Understand: [explain, describe, interpret]
  - "hands on project" → C3 Apply: [apply, demonstrate, implement]
  - "introduction to" → C1 Remember: [define, list, state]
- No AI, no vectors — pure keyword lookup

**Stage 3 — Gap detect**
Two gap types:
- **DOMAIN_MISMATCH**: CO text contains keywords from a different discipline
  (e.g. "mathematical induction" in an EE course)
- **LEVEL_MISMATCH**: CO verb is 2+ levels below the week dominant level

### Real-world test: Orin ma'am's Course_Profile.docx (EEE 1245)
- CO1: ✅ Green — "Demonstrate" (C3) acceptable for mixed C1-C4 content
- CO2: 🚨 DOMAIN_MISMATCH — "mathematical induction" vs Weeks 4-10 (Nodal/Mesh/Thevenin/Norton)
  - Suggested: "Analyze complex linear DC and AC networks using nodal, mesh, Thevenin's, and Norton's engineering models."
- CO3: 🚨 DOMAIN_MISMATCH — "sets, functions, and relations" vs Week 15 (Hands-on Project)
  - Suggested: "Apply network theorems and engineering design principles to compute electrical performance metrics."

### Speed
Runs entirely on main thread, zero AI inference, under 3 seconds for an 8-page DOCX.

---

## Module 3: Native Security & Integrity Guardrails

### Poison Prevention
**File:** `src/modules/blooms/clo-knowledge.js` → `checkLevelConflict(rootVerb, bloomLevel)`
**IPC:** `clo-kb:check-conflict` → `window.api.cloKb.checkConflict(rootVerb, bloomLevel)`

When a professor manually overrides a Bloom's level in the Shadow Editor:
1. `checkLevelConflict()` checks if the proposed level contradicts the standard dictionary
2. If it does, a warning modal fires: "⚠️ OBE Standard Mismatch: The verb 'list' is natively C1..."
3. Professor must explicitly confirm to save the override
4. Override is saved as `source: 'teacher_override'` in the KB — distinguishable from standard mappings

### OCR Text Normalization
**File:** `src/modules/blooms/clo-mapper-fast.js` → `splitQuestions()` Stage 0

Specific patterns corrected before any verb matching:
- Split-word artifacts: "Analy ze" → "Analyze", "Im plement" → "Implement"
- Capital-I-as-lowercase-l: "lmplement" → "Implement", "lntegrate" → "Integrate"
- N.B. / Note: lines stripped (exam instructions, not questions)
- `[5 Marks]`, `[CLO2, C4]` metadata stripped
- `Question N` markers normalized to newlines for single-line pastes

### Production Packaging
**File:** `electron-builder.yml`

`asarUnpack` rules prevent native module crashes on deployment:
```yaml
asarUnpack:
  - "node_modules/better-sqlite3/build/Release/*.node"
  - "node_modules/keytar/build/Release/*.node"
  - "node_modules/onnxruntime-node/bin/**"
  - "node_modules/onnxruntime-node/lib/binding/**"
  - "node_modules/@xenova/transformers/dist/*.wasm"
```

Without these, the app crashes on a professor's machine with "ERR_DLOPEN_FAILED"
when trying to load the SQLite or embedding model binaries from inside the ASAR archive.

---

## Knowledge Base (Self-Improving Layer)

**Table:** `clo_knowledge_base` (SQLite)
**Columns:** `id, course_code, question_text, clo_code, bloom_level, bloom_name, action_verbs, source, verified, root_verb, vector_blob, created_at`

**Pre-seeded on first launch:**
- 150 general engineering/CS/mobile questions (`clo-seed-dataset.json`)
- 30 ICE-specific questions with DIU conventions (`clo-seed-ice.json`)
- Total: 180 verified anchor points from day one

**Self-improvement loop:**
1. Professor corrects a mapping in the Shadow Editor
2. Correction saved to KB with `source: 'teacher_override'`
3. `saveEmbedding()` computes vector and stores in `vector_blob`
4. Next paper: hybrid search finds the similar question and applies the teacher's convention
5. Over time: teacher-specific patterns (e.g. Sir Sarker's C5 for "find error") are learned automatically

---

## Hardware Requirements

| Component | Minimum | Recommended |
|---|---|---|
| RAM | 8GB | 16GB+ |
| Disk | 10GB free | 20GB+ |
| CPU | Intel i5/i7 (any gen) | Modern i7/Ryzen 5+ |
| GPU | Not required | Not required |
| OS | Windows 10+ | Windows 11 |

**RAM breakdown at runtime:**
- Electron app: ~300MB
- DeepSeek-R1:8b (Ollama): ~5.5GB
- all-MiniLM-L6-v2 (ONNX): ~150MB
- SQLite + app data: ~50MB
- **Total: ~6.0GB** — leaves 2GB headroom on 8GB machines

---

## Key Files Reference

```
src/modules/blooms/clo-mapper-fast.js      ← Deterministic exam parser (Layer 1)
src/modules/blooms/blooms-engine.js        ← Orchestrator (Layer 1→2→3 routing)
src/modules/blooms/clo-knowledge.js        ← KB CRUD + hybrid search (Layer 2)
src/modules/blooms/embedding-engine.js     ← all-MiniLM-L6-v2 wrapper
src/modules/blooms/document-dropper.js     ← Async multi-page document pipeline
src/modules/blooms/syllabus-mapper.js      ← Macro Syllabus Mapper
src/modules/blooms/ocr-engine.js           ← Tesseract OCR for scanned images
src/modules/ai/model-router.js             ← ALL AI calls go through here
src/database/migrations/006_kb_vectors.js  ← root_verb + vector_blob columns
src/database/seeds/clo-seed-dataset.json   ← 150 general seed questions
src/database/seeds/clo-seed-ice.json       ← 30 ICE-specific seed questions
src/renderer/js/blooms.js                  ← Full Bloom's UI (4 tabs)
electron-builder.yml                       ← Production packaging config
```
