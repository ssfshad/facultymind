# FacultyMind — Performance Baseline

**Recorded:** 2026-10-29, before any fixes (baseline commit `a7a8819`)
**Raw data:** `bench/results/2026-10-29T10-53-04-099Z.json`
**Re-run:** `npm run bench` (about 4 minutes), then compare against this file.

## Machine

| | |
|---|---|
| CPU | AMD Ryzen 5 5600 (6 cores / 12 threads) |
| RAM | 32 GB |
| GPU | AMD RX 580. Ollama reports qwen2.5:3b **fully in VRAM** |
| OS | Windows 11 Pro 10.0.26100 |
| Runtime | Electron 32.3.3 (Node 20.18.1) |

> ⚠️ This is the **developer** machine. The stated target is professor PCs with **8 GB RAM**, often with no usable GPU. Expect the AI and extraction numbers to be noticeably worse there. Measuring on one such machine is the most valuable next benchmark.

## Method

- `bench/micro.js` runs in-process under Electron's Node, using the test harness. The DB is a temp copy with the **seeded demo data only**. Public model caches (embedding model, OCR language data) are copied from `%APPDATA%\facultymind` so nothing is downloaded. **No real student data is read.** The LLM calls go only to local Ollama, with synthetic prompts.
- `bench/run.js` launches the real app (`electron .`) with a throwaway `--user-data-dir`, timing from process spawn to the `[WINDOW] shown` log line. It then sums the working set of every process whose command line contains that profile dir, 10 s after the window appears. 1 fresh-profile run + 3 warm runs on the same profile. Only the PID it started is killed.
- Times are median (p95) over *n* runs unless marked as a single run.

## 1. App launch

| Scenario | Time to window | Memory 10 s later |
|---|---|---|
| **First launch** (empty profile: creates DB, runs 6 migrations, seeds 975 KB rows) | **6.1 s** | 1,090 MB · 8 processes |
| **Normal launch** (warm, median of 3: 1.26 / 1.29 / 1.32 s) | **1.29 s** | **~1,300 MB** · 8 processes |
| + Ollama qwen2.5:3b-instruct (separate process) | — | **+2.01 GiB** |

What drives the numbers:
- First-launch time is mostly DB seeding (**2.9 s**, see §2); a normal reopen + migration check costs **3.8 ms**.
- About 1.3 GB for an Electron app is heavy. Contributors: the eager ONNX embedding pre-warm, `@xenova/transformers`, Tesseract, and a 120 KB + 45 KB + 10 more stylesheets renderer. Not yet broken down per process.
- A real first launch on a fresh PC also downloads the embedding model (23 MB) and OCR data (5 MB) the first time those features are used. That wasn't measured here (caches were pre-copied); it needs internet.

## 2. Core engines (in-process)

| Operation | Median | p95 | n |
|---|---|---|---|
| DB fresh open + migrate + seed | 2,871 ms | 2,896 ms | 3 |
| DB reopen + migration check (every app start) | 3.8 ms | 9.6 ms | 10 |
| **ShadSync** CLO/CO/PO attainment, ICE301 (35 students) | **0.24 ms** | 0.51 ms | 200 |
| **CLO mapper**, 6-question paper, no KB | 0.13 ms | 0.45 ms | 50 |
| CLO mapper, 6 questions **with KB lookup** (975 rows) | 8.4 ms | 27.0 ms | 20 |
| CLO mapper, 50 questions with KB | 64.7 ms | 80.2 ms | 5 |
| CLO mapper, 200 questions, no KB | 3.3 ms | 11.3 ms | 5 |
| **Syllabus** manual analysis (3 COs × 15 weeks) | 0.39 ms | 0.83 ms | 50 |
| **PIN verify** (PBKDF2-SHA256, 310k iterations, blocks main thread) | 38 ms | 40 ms | 10 |
| Embedding model first call (load from cache) | 229 ms | — | 1 |
| Embedding per question (all-MiniLM-L6-v2) | 2.5 ms | 3.2 ms | 20 |

**Takeaway:** the rule-based engines are effectively instant. The KB lookup is the only real cost in the CLO mapper (~1.3 ms per question, linear in KB size: 975 rows today and growing as professors add papers).

## 3. Document extraction

| File | Dev path (MarkItDown `converter.exe`) | Installed path (no converter.exe) | Correct pdf-parse v2 call |
|---|---|---|---|
| 1-page PDF (`level1-simple.pdf`) | **16.1 s** | 1.25 s (fell to **OCR**) | — |
| Dense 1-page PDF (`level5-complex.pdf`) | **19.2 s** (16.6 s min) | 2.33 s (fell to **OCR**) · 2.72 s standalone | **218 ms** |
| DOCX, 33k chars (proposal) | **17.3 s** | 137 ms (mammoth) | — |

- **MarkItDown costs ~16 s per call no matter the file size**: the 654 MB PyInstaller binary unpacks on every call. That's the single biggest delay in the Bloom's / Syllabus flows.
- In the installed app (converter.exe isn't bundled) every PDF falls through to Tesseract OCR because the pdf-parse call is broken (STATUS.md BUG-X1). OCR is ~12× slower than pdf-parse per page and grows with page count.
- Not measured: multi-page real exam papers, scanned PDFs, and the full Syllabus Mapper pipeline on a real course profile (waiting on `Course_Profile.docx`).

## 4. Local AI (Ollama, qwen2.5:3b-instruct)

| Operation | Time |
|---|---|
| Intent classification, **cold** (model unloaded → load + answer) | **9.9 s** (single) |
| Intent classification, warm | **2.45 s** median · 2.63 s p95 (n=5) |
| Chat reply, ~120 tokens | **10.3 s** (single, 198 chars) |

- Every *first* chat message pays the classification cost before its handler runs, so even "what's my schedule today?", which needs no generation, waits about 2.5 s.
- The app pre-warms the model at startup, which hides the cold cost for the first message, but Ollama unloads idle models after 5 min by default. Expect the ~10 s cold path again after a break.
- These are GPU numbers (model in VRAM). On a CPU-only 8 GB laptop expect several times slower, which matters for the Syllabus Mapper's multi-call pipeline (the May plan measured 7–9 min on this box with an 8B model).

## 5. Suggested targets (for after fixes; not commitments)

| Metric | Baseline | Target idea |
|---|---|---|
| Normal launch to window | 1.29 s | keep ≤ 1.5 s |
| Memory, app only | ~1.3 GB | < 600 MB (lazy-load embeddings/OCR) |
| PDF/DOCX text extraction | 16–19 s | < 1 s (pdf-parse/mammoth first; MarkItDown only when structure is needed, or keep it running) |
| Chat simple-intent latency | 2.45 s | < 0.5 s for keyword-obvious intents (rule-based pre-classifier) |
| CLO mapper with KB, 50 Q | 65 ms | fine as is; re-check when KB > 10k rows |
