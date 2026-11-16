# FacultyMind

**Accreditation work that takes days, done in minutes. Student data never leaves the laptop.**

FacultyMind is an offline-first Windows desktop app that automates Outcome-Based Education (OBE) paperwork for university teachers preparing for BAETE accreditation in Bangladesh. Its OBE engine is called **ShadSync**.

Built for the **International AI Builders Congress 2026** (CloudCamp Bangladesh, co-organised by Daffodil International University) by team **X Dimension**.

## The problem

Every semester, for every course, teachers must tag each exam question with a Course Learning Outcome (CLO) and a Bloom's taxonomy level, compute CLO → CO → PO attainment from student marks, and write gap reports. It is done by hand in Excel. It is slow, error-prone, and the data (student marks, unreleased exam papers) cannot safely be pasted into online AI tools.

## What FacultyMind does

```
question paper + marks sheet
   → Bloom's level per question (rules first, local AI for unclear cases)
   → question → CLO mapping
   → CLO / CO / PO attainment (ShadSync, deterministic math)
   → weak outcomes flagged, AI explains why and what to change
   → accreditation-ready PDF report
```

- **Bloom's Engine** — reads PDF/DOCX/photographed papers (MarkItDown, pdf-parse, mammoth, Tesseract OCR), splits questions and tags Bloom's levels with a verb-rule engine; only low-confidence questions go to the local LLM.
- **ShadSync** — imports DIU CIA marks sheets (.xls/.xlsx) and computes CLO, CO and PO attainment.
- **Syllabus Doctor** — checks whether the weekly plan covers each course outcome.
- **Chat** — plain-English (and Banglish) commands routed to 19 tools.

## AI, locally

| Part | How |
|---|---|
| Local LLM | Ollama · **Gemma 4 E2B** (default), Qwen2.5 3B Instruct (light fallback for 8 GB PCs) |
| Embeddings | all-MiniLM-L6-v2, run locally via `@xenova/transformers` |
| Rules first | Bloom's verb engine and an intent rule fast-path answer most requests with no model call |
| Cloud (optional) | Claude / Gemini / OpenRouter — off by default, and every call passes a PII redactor that fails closed |

## Privacy and security

- Student names and IDs encrypted with AES-256-GCM; per-install key in the OS keychain with HKDF subkeys and a passphrase recovery file.
- Student-data tasks run only on the local model; cloud calls are redacted or blocked.
- PIN lock enforced in the main process; sandboxed renderer; no raw API keys in the UI.
- Real student data is never committed or used in tests — the repo uses a synthetic demo course.

## Measured quality

From `npm test` and `npm run eval` (frozen 70/30 dev/test split, see [`eval/REPORT.md`](eval/REPORT.md) and [`eval/MODEL-COMPARISON.md`](eval/MODEL-COMPARISON.md)):

| Component | Result |
|---|---|
| ShadSync attainment math | 100% vs hand-computed references |
| Marks-sheet import | 100% cell-exact (858 cells) |
| Question extraction (synthetic papers) | 99.2% |
| Chat intent routing (held-out, 1,100 commands) | 99.1% |
| Automated tests | 324 |

Bloom's tagging accuracy against teacher-tagged DIU papers is being measured next. Known gaps and open bugs are tracked openly in [`STATUS.md`](STATUS.md) and [`ROADMAP.md`](ROADMAP.md).

## Run it

Requirements: Windows 10/11, Node.js 20+, [Ollama](https://ollama.com).

```bash
ollama pull gemma4:e2b        # or qwen2.5:3b-instruct on 8 GB machines
npm install
npm start                     # launch the app
npm test                      # automated tests
npm run eval                  # accuracy evaluation
```

The first launch creates a local database seeded with a synthetic demo course (ICE301, fictional students).

## Tech stack

Electron · Node.js · better-sqlite3 · Ollama · @xenova/transformers · Tesseract.js · pdf-parse · mammoth · MarkItDown · Fuse.js · keytar

## Project docs

- [`STATUS.md`](STATUS.md) — audit, current state, bug list
- [`ROADMAP.md`](ROADMAP.md) — sprint plan and next steps
- [`QUALITY.md`](QUALITY.md) — accuracy targets (definition of done)
- [`.claude/CLAUDE.md`](.claude/CLAUDE.md) — product direction and working rules

## Author

Sk Shihan Fardin (Shad) — team X Dimension, Daffodil International University.
