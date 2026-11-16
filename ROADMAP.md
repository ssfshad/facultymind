# FacultyMind — Roadmap

Deadline: **International AI Builders Congress, Dec 26 2026 (DIU).** Direction and
working rules: [.claude/CLAUDE.md](.claude/CLAUDE.md) · Definition of done:
[QUALITY.md](QUALITY.md) · Bug IDs: [STATUS.md](STATUS.md) §5, §6, §11.

## NEXT UP (updated end of every session)

0. **Local model switched to `gemma4:e2b` (Shad, 2026-11-11; commits `be0396d`, `8032401`).** Bake-off in [eval/MODEL-COMPARISON.md](eval/MODEL-COMPARISON.md): routing 93.6%, entities 96%, explanations 8/8, ~2.5 s/call, but **~4.6 GB RAM loaded** (qwen2.5:3b ~2.1 GB, kept installed as the light fallback). Open:
   - [ ] **8 GB laptop test** of gemma4:e2b (Windows + Electron already use ~3-4 GB; may swap and break the < 60 s target). If it fails, switch back to qwen2.5:3b-instruct for the competition laptop.
   - [ ] Shad's saved `ollama_model` setting overrides the code default: he set Gemma in Settings; a fresh install must `ollama pull gemma4:e2b`.
   - [ ] Run the hero flow live in the app on Gemma (only unit tests and eval scripts so far).
   - [ ] Decision for Shad: add a small code calculator so arithmetic in chat is exact (Gemma answered 17% of 240 as 40, then corrected to 40.8). Outside the hero flow, so not started.
   - [ ] Remaining misses from the fresh-50 test: course code not extracted for schedule questions (harmless). Fixed: "mark all present" intent, reminder time ("tomorrow", "ajke 3tay"), vault password (`entity-fixups.js`).
0b. **DASH AI handler test (later, Shad 2026-11-11).** Routing and entity extraction are measured (99.1% / ~95%), but the handlers behind the 19 intents in `module-router.js` have never been run end to end. Run ~20 commands (reminders, schedule, vault save/search, data add/edit/delete, marks/attendance entry, email) against a COPY of the demo DB, never the real one, and list which really work. Check: handlers that say "set your API key" while on Ollama, `SHADSYNC_UPDATE` routed to `handleDataAdd`, and email handlers blocked by the Gmail `invalid_grant` login error.
1. **Day 4: eval suite (`npm run eval`)** — see the Day 4 list below. Day 3 is done (B2/B3/B8, X1, B4/SH1/SH2, SC1).
2. **Follow-ups from Day 2:** remove `'unsafe-inline'` from the CSP (convert 18 inline handlers); check pre-V1 vault titles for leaked passwords (real-data step, needs Shad's OK).
3. ~~Real ICE415 sheet~~ **DONE 2026-11-11 (Shad approved after a copy run):** imported into the real DB (31 students encrypted, 11 columns, 341 marks, cell-exact; ICE301 demo unchanged). Backup: `%APPDATA%acultymindackups\pre-ice415-2026-11-10T22-34-25-687Z`. Shad moves the original `.xls` out of `docs/` himself (it is gitignored, never committed).

---

## 7-day sprint (Oct 29 → Nov 5, 2026)

### Day 0 — Oct 29 (tonight)
- [x] Product direction + working rules in CLAUDE.md
- [x] QUALITY.md, ROADMAP.md
- [x] Docs drift: BUGLOG, SPRINTS (short updates)
- [x] S1: design the encryption + migration, run it on a DB copy, show the evidence (`f6d01b7`, branch `fix/s1-student-encryption`)
- [x] S1: applied to the real DB and verified (35/35 encrypted, 0 plaintext); key recovery file + key transfer in export/import (`f2b7402`)

### Day 1 — Oct 30: student data protection
- [x] S1 real field encryption + migration (existing `X_enc` rows, `name_anon` form-path bug)
- [x] S3 per-install vault key + HKDF subkeys; real DB re-keyed and verified (`d2bd8f1`)
- [x] S2 anonymise before any cloud-bound call (`603ead7`, + R1); hardening: fail closed, local-only policy for student-data paths (`0f30c72`)

### Day 2 — Oct 31: app security + data loss
- [x] S4 email XSS, S5 raw keys to renderer, S6 session not enforced in main, S7 navigation/webview guards
- [x] A3 PIN replace without old PIN, V1 password in vault title
- [x] DevTools off in packaged builds
- [x] B5 WAL-unsafe export (done with S1)
- [x] D1 attendance wipe, D3 failed import closes DB

### Day 3 — Nov 1: hero flow works for any course, on Ollama
- [x] `getApiKey` helper (B2, B3, B8)
- [x] X1 pdf-parse v2 fallback
- [x] Multi-course ShadSync (B4, SH1, SH2), SC1

### Day 4 — Nov 2: eval suite (`npm run eval`)
- [~] Deterministic parts first. `npm run eval` (`eval/`, frozen 70/30 split, `eval/REPORT.md`): ShadSync math PASS 100% (63 checks); **marks-sheet import PASS 100% cell-exact (858 cells; new flexible `assessment_columns`/`assessment_marks` tables, migration 007, `marks-importer.js`, IPC `shadsync:import-marks-sheet` with dry run)**; question extraction PASS 99.2% on synthetic papers (real phone photos: best 64% end-to-end, see `eval/OCR-BAKEOFF.md`). Intent router: **PASS 99.1% on the held-out test (325/328; 1,100 commands, 19 intents, English/typos/Banglish, target 90%)**. Rule fast path (`src/modules/ai/intent-rules.js`): rules decide 96% of commands with 100% precision, 78% instantly (no model call, median 0 ms vs 2.4 s); for reminders/vault/CLO-map the rule fixes the intent and the model only fills details. Model alone on the same commands: 81.7%. **Local model comparison (`eval/MODEL-COMPARISON.md`): Qwen3.5 4B beats the current Qwen2.5 3B at routing (93.6% vs 82.0%) and entity extraction (100% vs 60%) but is ~4x slower and invented numbers in 3/8 explanations (checker caught them); Gemma 4 E4B still to test; default model not switched yet.** Caveats: commands and rules share an author (templates), so real teacher phrasing will score lower: collect real commands in the teacher pilot as a separate set. Full first run takes ~55 min (model answers cached in gitignored `eval/.cache`); slow tier runs with `npm run eval -- intent-router` or `--all`.
- [ ] Bloom's/CLO harness (confidence, dev/test split, ambiguity)
- [ ] Fix failing mapper tests (ice2345, clo-mapper-fast Q3a); all test scripts exit non-zero on failure

### Day 5 — Nov 3: speed + explanations
- [ ] pdf-parse/mammoth first, MarkItDown fallback; Syllabus Mapper < 60 s
- [ ] AI gap explanations with automatic fact-check

### Day 6 — Nov 4: product shell + packaging
- [ ] Labs flag (Email, Vault, WhisperFlow, Cortex, DIU Portal hidden in competition build)
- [ ] First-run onboarding with demo course, progress bars, friendly errors
- [ ] One build config (B7); bundle converter, Tesseract data, embedding model for offline first run (B6)

### Day 7 — Nov 5: release candidate
- [ ] Full `npm test` + `npm run eval`
- [ ] End-to-end hero flow on a real course
- [ ] Bug bash
- [ ] v0.9 installer

---

## After the sprint (Nov 6 → Dec 26)
- **Teacher pilot:** real faculty use it; log time saved per task (validation evidence for judges).
- **Accuracy push** on held-out data until every QUALITY.md target passes.
- **Polish:** UI, error messages, onboarding.
- **Demo mode:** scripted, offline, reproducible.
- **Code freeze: Dec 19.** After that only fixes for demo-blocking bugs.
