# FacultyMind — Project Status Report

**Audit date:** 2026-10-29 (pass 1: exploration · pass 2: tests, benchmarks, reproduced bugs — §11)
**Audited by:** Claude Code (takeover audit — **no `src/` file has been modified; nothing is fixed yet**)
**Baseline commit:** `a7a8819` · Tests: `npm test` · Benchmarks: `npm run bench` → [BENCHMARKS.md](BENCHMARKS.md)
**Environment:** Windows 11 Pro 26100 · Node 22.16.0 · npm 10.9.2 · Electron 32.3.3 · Ollama running locally with `gemma4:e2b` (default since 2026-11-11; `qwen2.5:3b-instruct` also installed)

> Labels used below: **VERIFIED** = I ran it and saw the result. **READ** = found by reading the code, not executed. **UNVERIFIED** = would need UI click-through, credentials or a clean machine.

---

> **Sprint progress (2026-10-29):** **FIXED: S1** (student identifiers AES-256-GCM, per-install key in Credential Manager, passphrase recovery file, key travels in exports; real DB migrated and verified: 35/35 encrypted, counts unchanged, 0 plaintext in DB files) and **B5** (export and vault move use the SQLite backup API), **S2** (every cloud AI call goes through a redactor: student names, IDs and enrollment numbers become placeholders and are restored locally; Ollama calls are not redacted, decided per call; WhisperFlow audio is the one cloud path that cannot be redacted; it fails closed, and student-data paths (data-add/edit/delete, marks/attendance, email classification, dropped rosters/marks sheets) run on Ollama only, or are refused when Ollama is down), **S3** (vault and student data each use their own HKDF-SHA256 subkey of the per-install master key; the hard-coded key is gone; real DB re-keyed and verified: 105/105 student values and 3/3 vault values, master/old key open none), **R1**, and Day 2: **S4** (email fields escaped), **S5** (renderer never gets raw keys; key slots allow-listed), **S6** (main refuses IPC while locked), **S7** (sandboxed window, navigation/webview guards), **A3** (PIN change needs the current PIN), **V1** (no secrets in vault titles), **D1** (atomic attendance save), **D3** (failed import keeps the DB open), DevTools off in packaged builds.
>
> **Marks sheets (2026-11-11):** flexible assessment columns (migration 007) + `marks-importer.js` read `.xls`/`.xlsx` CIA sheets (columns, max marks, CO/PO/Bloom rows, USN/ID headers) and import them encrypted in one transaction; ShadSync computes CO and PO attainment straight from the sheet's columns (blank cells = not graded). Eval 100% cell-exact. **Imported into the real DB on 2026-11-11 with Shad's OK** (copy run first): ICE415, 31 students, 341 marks; backup in `%APPDATA%acultymindackups\`; migration 007 applied. The Diu portal / exports still read the legacy `marks` table, so an imported course shows attainment but no legacy marks there.
>
> **Day 3 (2026-11-11): FIXED B2, B3, B8 (`getApiKey` helper), X1, B4, SH1, SH2, SC1.** 174 tests, 0 fail, 14 todo. Not yet exercised in the running app against Ollama; ICE415 needs an `ice415_assessment_meta` setting before ShadSync shows CLOs; a student added via the app gets an empty marks row and counts as zeros until graded.
>
> **Local model (2026-11-11):** default switched to **`gemma4:e2b`** after a bake-off against qwen2.5:3b, qwen3.5:4b and phi4-mini ([eval/MODEL-COMPARISON.md](eval/MODEL-COMPARISON.md)): routing 93.6% (qwen2.5: 82.0%), entities 96% (60%), explanations 8/8, ~2.5 s per call. Cost: ~4.6 GB RAM loaded vs ~2.1 GB, so an **8 GB laptop is untested and likely tight** (qwen2.5:3b-instruct kept as fallback). Fixes in `8032401`: chat prompt answers plain questions, "mark all present/absent" routes to SHADSYNC_UPDATE, `entity-fixups.js` fills reminder time and vault password after the model. Fresh 50-command test (classify only): intent 50/50, entities 19/20 (set written before the fixes). 324 tests, 0 fail, 14 todo. Not yet exercised live in the app.
>
> **Follow-ups found on Day 2:** (1) CSP still allows `'unsafe-inline'` scripts: 18 inline `on…=` handlers in the renderer would need converting first. (2) Vault titles saved before V1 may contain a password in plain text; checking them means reading real vault data (needs Shad's OK). (3) `smartClassifyDocument` never passes an API key, so dropped-file routing only works on Ollama (part of B2/B3/B8). 169 tests, 0 fail, 22 todo. Everything else below is still open. Live log: [Claude Doc](https://claude.ai/artifact/KjGEiKrR4kENf1EqXtZifs).
>
> **Plaintext copies outside the app (Shad handles these):** pre-S1 copies of the real DB exist in two Claude Code Temp scratchpad folders (`%LOCALAPPDATA%/Temp/claude/D--Projects-facultymind/39030197-bc11-4626-a8ed-8c98dcebd812/scratchpad/` and `%LOCALAPPDATA%/Temp/claude/D--Projects-facultymind/e7c1b385-fee0-45e0-a588-8a49d4ff610f/scratchpad/backup-pre-s1/`). Shad will move them into an encrypted archive and delete the originals after a few days of verified use. The real ICE415 marks sheet in `docs/` is also plaintext; it gets imported through the app once multi-course ShadSync works (see ROADMAP NEXT UP).

## 0. Headline findings

1. **The app installs, launches and builds.** `npm install` is clean, `electron .` starts with no crashes, all 6 DB migrations run, and an unpacked Windows build succeeds. 11 of the 13 test scripts pass.
2. **Student-data "encryption" is fake.** Real student names are saved as `"<name>_enc"` in plain text (e.g. `Rahman_enc`). `anonymise()` is never called anywhere, and raw student names are sent to the AI. This breaks the project's own #1 non-negotiable rule.
3. **Choosing GPT-4o can never work.** Its key is saved under `openai` but looked up under `gpt4o`.
4. **When the active model is Ollama (the current setting), the Cortex features silently switch off:** greeting, proactive check-ins, daily training and email classification. They all need an API key for the active model, and Ollama doesn't have one.
5. **ShadSync is hard-wired to ICE301.** Every course reads the `ice301_assessment_meta` setting. The other 3 courses return empty results, and their POs show 0%.
6. **The demo transfer path can lose data.** `db:export` copies only the `.db` file while SQLite is in WAL mode, so recent writes still in the `-wal` file are left behind.
7. ~~**There is no git repository.**~~ Resolved: `git init` + baseline commit `a7a8819` (2026-10-29).
8. **Pass 2 found more bugs, all reproduced with tests (§11)**, including two more data-loss bugs (one failed attendance save wipes the whole day; a failed DB import leaves the app with no database), a working XSS in the real CSP, a PIN that can be replaced without the old one, and a **dead pdf-parse fallback**: installed copies send every text PDF to OCR.

---

## 0.1 Decisions from Shad (2026-10-29)

| Topic | Decision | Consequence for the plan |
|---|---|---|
| Goal | New deadline (**date not given yet**) | Still needed to schedule the roadmap |
| AI | **Local-first**: Ollama default; cloud providers switchable via config for later | B2/B3 and the `getApiKey` helper (roadmap #9) move up; "no key needed for local" must work everywhere. CLAUDE.md updated |
| Student data | **Real data exists.** Never sent to cloud APIs, never committed | S1/S2 are now **blockers**. `.gitignore` excludes `*.xls/*.xlsx/*.csv`, DB files and WAL. The ICE415 marks sheet in `docs/` holds real names and is not in git |
| `emailbridge-main/` | Part of this project (merged in) | Needs its own audit pass (Supabase functions, RLS, secrets) — not done yet |
| Git | Init and commit as-is | Done: `a7a8819` (sensitive and oversized files excluded, see above) |
| DIU Portal | Keep as demo stand-in, **behind an interface** | Roadmap: extract a `PortalProvider` interface (local stand-in now, real connector later) |
| Email | Functional; reconnect Gmail later; lower priority | Email bugs stay listed but are ranked after the others |
| Course_Profile.docx | Shad will provide later | Syllabus Mapper speed/accuracy on real documents still unmeasured |

**Who it's for:** university lecturers and professors, to make routine academic work easier.

---

## 1. What the software is supposed to do

FacultyMind is an offline-first **Windows desktop app (Electron)** for university faculty at Daffodil International University (DIU), Bangladesh. It was built solo by Shad for a competition MVP showcase on **May 16, 2026**, which has now passed. A professor installs it, sets a PIN and enters API keys, and then manages their academic work through a chat interface plus dedicated modules:

| Module | Purpose |
|---|---|
| **Chat + intent router** | Requests in plain English → AI intent classifier → module handler (`module-router.js`, 20 intents) |
| **ShadSync** (signature OBE engine) | Student marks → CLO → CO → PO attainment, gap detection (<60%), BAETE accreditation PDF |
| **Bloom's Engine** | PDF/DOCX/image upload → text extraction (MarkItDown / pdf-parse / Tesseract OCR) → Bloom's level per exam question / CLO, quiz generation, "Syllabus Doctor" CO-vs-weekly-plan gap analysis, CLO knowledge base with local embeddings |
| **Cortex** | Proactive "Jarvis" layer: activity log, rules written in plain English, AI thought journal, daily self-training, timed check-ins |
| **Email Intelligence** | Gmail OAuth, categorise and prioritise, rules, AI draft replies, high-priority alerts |
| **Smart Schedule** | Timetable, 30-min pre-class OS notifications, lesson log |
| **Local Vault** | Notes / links / passwords (AES-GCM), Fuse.js search |
| **DIU Portal** | Local marks/attendance/grade screens modelled on the DIU Teachers Portal, plus embedded `<webview>`s of the real DIU / BLC portals |
| **WhisperFlow** | Press-to-record voice → OpenAI Whisper |
| **Security** | PIN lock (PBKDF2), OS keychain via keytar, field encryption |

**AI providers in the code today:** Claude (`claude-sonnet-4-20250514`), GPT-4o, Gemini (`gemini-1.5-pro`), OpenRouter (default sub-model `minimax/minimax-m2.5:free` in your DB) and **local Ollama (`qwen2.5:3b-instruct`, currently active)**. Note that `.claude/CLAUDE.md` still says cloud-only, and BUGLOG's LIMIT-007 still says local models aren't integrated. Both are out of date.

**Last work (no git, so taken from file dates and handover notes):** late May 2026. The work was on the Bloom's CLO mapper's fast rule-based engine, the Syllabus Mapper, and a planned "syllabus pipeline overhaul" (`.kiro/plans/2026-05-29-1900-…`) to fix 7–9 min run times, made-up Course Outcomes, and the switch from deepseek-r1:8b → qwen2.5:3b for 8 GB-RAM machines. The model switch is in the code (`main.js:40-48`). The installer in `dist/` is dated 2026-05-30.

---

## 2. What currently WORKS (verified by running)

| Check | Result |
|---|---|
| `npm install` | ✅ "up to date, audited 620 packages". Native modules (better-sqlite3, keytar, sharp) build/load fine |
| `npm run dev` (app launch) | ✅ Window shown, all 6 migrations OK, DB opened at `%APPDATA%\facultymind\facultymind.db`, no uncaught exceptions. The log recorded a successful PIN unlock during my run (I didn't type it; I assume that was you at the window) |
| Local AI (Ollama) | ✅ Reachable; `qwen2.5:3b-instruct` replied in 0.4 s |
| Local embedding model | ✅ `all-MiniLM-L6-v2 loaded` at startup |
| Windows build | ✅ `electron-builder --win --dir` (output to a temp folder; your `dist/` is untouched) succeeds. Not code-signed |
| ShadSync attainment (ICE301) | ✅ Matches DUMMYDATA.md exactly: CLO1 66.3 · CLO2 67.9 · CLO3 64.4 · CLO4 65.7 · CO1 67.1 · CO2 64.9 · PO1 66.2 · PO2 65.8 · PO3 64.9 · PO5 66.0 |
| PDF/DOCX extraction | ✅ in **dev** only: pdfkit-generated sample PDFs extract fine via MarkItDown (`bin/converter.exe`), and the proposal DOCX extracts (33k chars). ⚠️ Correction (pass 2): this only works because MarkItDown runs first. The pdf-parse fallback is broken (BUG-X1), so BUG-020 is *bypassed*, not fixed, and installed copies (no converter.exe) OCR every PDF |
| Vault passwords | ✅ Stored as real AES-GCM ciphertext (but see the hard-coded key in §6) |
| DB contents | 4 courses, 35 students (all ICE301), 975 CLO knowledge-base rows, 6 schedule entries, 3 vault items |

### New test suite (pass 2) — `npm test`

`tests/` runs on `node:test` under Electron's Node (`tests/run.js`), with no new dependencies. `tests/helpers/harness.js` fakes `electron` and `keytar`, gives every run a temp userData dir with the seeded **demo** data, and can boot the real `main.js` to call its IPC handlers exactly as the UI does. It never touches the real DB or Credential Manager.

| Folder | What it covers |
|---|---|
| `tests/unit/security.test.js` | AES-GCM round-trip/tamper, anonymise/reAssociate, PIN setup/verify/lockout, session |
| `tests/unit/shadsync.test.js` | ICE301 CLO/CO/PO numbers = DUMMYDATA.md, at-risk list, marks update |
| `tests/unit/module-router.test.js` | intent routing, schedule/reminder/vault/DIU handlers |
| `tests/unit/cortex-email.test.js` | proactive triggers + throttling, email monitor, OAuth |
| `tests/unit/blooms.test.js` | CLO mapper levels + 11 hostile inputs (empty, 2,000 questions, regex bombs, Bangla, HTML), syllabus mapper |
| `tests/integration/ipc.test.js` | 12 end-to-end IPC flows: PIN → keys → model switch → vault → ShadSync → schedule → lesson log → attendance → rules → syllabus → KB |
| `tests/regression/legacy-scripts.test.js` | wraps the old `scripts/test-*.js` and fails if accuracy drops below today's baseline |
| `tests/repro/xss-email.js` | real Electron window with the app's CSP (`npx electron tests/repro/xss-email.js`) |

**Result: 103 tests, 66 pass, 36 todo, 1 skipped, exit 0, ~20 s.** Every `todo` test is a reproduced bug from §11 (or a hardening item): it fails today for the stated reason and will start passing when the bug is fixed.

### Old test scripts (`scripts/test-*.js`)

| Script | Result |
|---|---|
| test-10q-stress | ✅ 10/10 |
| test-20q | ✅ 20/20 |
| test-25q | ✅ 25/25 |
| test-dbms-gaps | ✅ 6/6 |
| test-finite-automata | ✅ 10/10 |
| test-ice431 / -audit / -word | ✅ 8/8 each |
| test-word-format | ✅ 8/8 |
| test-syllabus-mapper | ⚠️ exits 0 but prints **✗ "CO2 gap detected (Domain Mismatch)"**: CO2 is flagged under the wrong gap type, and CO3's suggested rewrite is garbled ("…phasor and ram and impedance an") |
| test-clo-mapper-fast | ❌ exit 1 — 18/19 (95%). `Q3(a)` expected C3, got C5 (verbs "implement, verify") |
| test-ice2345 | ❌ **4/10 = 40%** (exits 0, so the failure is easy to miss). Wrong on "combine", "find", "show", "define+compare" |
| test-orin-doc | ❌ crashes: `ENOENT … C:\Users\Anxiety\Desktop\Course_Profile.docx` (hard-coded path to a file that no longer exists) |

The handover note of 2026-05-24 said "all tests passing", but that's no longer true for ice2345 / clo-mapper-fast.

---

## 3. What's BROKEN or crashes

| # | Problem | Evidence |
|---|---|---|
| B1 | **Gmail is disconnected.** The stored refresh token is rejected; the monitor logs `[Email Monitor] Polling error: invalid_grant` every 2 min forever and never asks you to re-authenticate | VERIFIED (startup stderr); `notifications.js:85-89` |
| B2 | **GPT-4o can't be used.** Keys are saved as `openai` (`settings.js:332`, `app.js:257`) but `ai:send` looks up `getKey(activeModel)` = `gpt4o` (`main.js:489`) → "No API key set for gpt4o" | READ |
| B3 | **Cortex / email classification silently off on Ollama.** `proactive-engine.js:79-81`, `notifications.js:38-39`, `main.js:214-215`, `main.js:1635`, `main.js:683-684` all need `getKey(activeModel)`; with `ollama` that's `null` → returns early. Greeting, check-ins, daily training and email categories never run in the current configuration | READ (and the startup log shows no greeting) |
| B4 | **ShadSync only works for ICE301.** `shadsync-queries.js:4` always reads `ice301_assessment_meta`; ICE401/ICE205/ICE420 return no CLOs and POs show **0%** instead of "no data" | VERIFIED |
| B5 | ~~**`db:export` can produce an incomplete backup.**~~ **FIXED 2026-10-29** (backup API; import removes stale -wal/-shm). `fs.copyFileSync` of the main file while in WAL mode (`main.js:1554`, `db.js` sets WAL). Same issue in `vault:change-path` (`main.js:859`). `db:import` (`main.js:1572`) leaves the old `-wal/-shm` files next to the new DB, which can corrupt it | READ |
| B6 | **Installer ≠ dev build.** `bin/converter.exe` (MarkItDown, the *primary* extractor) is **not bundled** in the packaged app (verified in the build output), so installed copies silently fall back to pdf-parse, which keeps less of the document structure. Question splitting / accuracy will differ from what you tested | VERIFIED |
| B7 | **`electron-builder.yml` is ignored.** Build log: `loaded configuration file=package.json ("build" field)`. Everything in the yml (artifact name, seed `extraResources`, NSIS VC++ include, `npmRebuild`, mac entitlements, `afterSign`) has no effect | VERIFIED |
| B8 | **Bloom's key fallback sends the wrong provider's key.** `main.js:1022-1023` and `1116-1117`: if there's no key for the active model, it grabs the `openai` key and sends it to *the active provider* (e.g. Claude); it also looks up `anthropic`, a service name that doesn't exist (keys are stored under `claude`) | READ |
| B9 | **The chat command "switch to …" only knows claude/gpt4o/gemini** (`module-router.js:392`), so you can't switch to Ollama/OpenRouter by voice/chat | READ |
| B10 | **Gemini model is retired.** `gemini-1.5-pro` (`model-router.js:283`) was retired by Google in 2025, so Gemini calls will fail. `claude-sonnet-4-20250514` (`:245`) is also old | READ |
| B11 | **Quitting runs an AI call first.** `window-all-closed` (`main.js:277-298`) awaits a "daily synthesis" AI call before quitting, so closing the window can hang. It also only checks `keychain`, not `portableConfig` | READ |
| B12 | **The OAuth flow can wedge port 3000.** If you close the browser without finishing, the local server in `email-backend.js:71-125` never times out; the next attempt fails with "Port 3000 is in use" until restart | READ |

---

## 4. What's HALF-BUILT

- **SQLCipher whole-file encryption** — BUG-002, still open. The DB file is plain SQLite.
- **Student field encryption** — the columns exist (`name_enc`, `student_id_enc`), but nothing encrypts them (see §6-S1).
- **Anonymisation layer** — `anonymise()` / `reAssociate()` exist in `encryption.js:67-108` and have **zero callers**.
- **PIN session lock** — `auth.js` tracks session timeout, but the main process never checks it before handling IPC; the lock is only a renderer-side screen.
- **ShadSync for multiple courses** — only ICE301 has assessment metadata, CLO maps and students.
- **Portal open via chat** still answers "Quick Portal module is coming in Sprint 3" (`module-router.js:357`), even though the portal tab exists.
- **Syllabus pipeline overhaul** (`.kiro/plans/2026-05-29-1900-…`) — the model switch is done. Still unconfirmed: whether the input/output caps were reduced, the "Chapter vs Week" downstream fixes, and the structural guard against made-up COs.
- **PaddleOCR / CLO-mapper verification plans** — their runtime checklists are all unchecked `[ ]`.
- **Sprint 3 remaining:** 3.20 clean-machine install test, 3.21 competition-laptop transfer, 3.22–3.23 demo rehearsals.
- **Offline first run** — Tesseract language data (`ocr-engine.js:35`) and the embedding model (`embedding-engine.js:56`) download into userData on first use, so an offline laptop can't OCR or do KB search the first time. The `eng.traineddata` in the repo root isn't wired in.
- `stubHandler()` (`module-router.js:486`) — defined, no longer used.
- Many `*-preview.html` pages in `src/renderer/` look like UI-redesign mockups, not live screens.

---

## 5. Bugs and risky code (file:line)

| Severity | Location | Issue |
|---|---|---|
| High | `shadsync-engine.js:24-41` | Sums over `marks` rows but divides by `students.length`; a student without a marks row lowers the average. **Reproduced (BUG-SH2).** ~~With 0 students → NaN~~: *retracted*, the test shows it returns 0 (see SH1 instead). A CLO mapped to no assessments (`totalMaxMarks` = 0) is still untested |
| High | `main.js:1554`, `:859`, `:1572` | WAL-unsafe copy/restore (B5). Use `db.backup()` |
| Medium | `module-router.js:596` | `JSON.parse` of a small local model's free-text output; any extra text → generic error. **Reproduced (BUG-MR1).** Same pattern in `main.js:1264` (not separately tested) |
| Medium | `main.js:67` | Ollama "model exists" check uses `startsWith(name.split(':')[0])`, so `qwen2.5:14b` counts as a match for `qwen2.5:3b-instruct` |
| Medium | `notifications.js:41` | Re-classifies the same 20 emails with the AI every 2 minutes (no cache by message id) |
| Medium | `proactive-engine.js:228` | When the AI answers `SILENT`, `markFired` isn't called, so the "periodic" trigger calls the AI every 5 min indefinitely |
| Medium | `proactive-engine.js:60` | Rate-limit state is in memory only; every restart re-fires greeting/periodic |
| Low | `schedule-manager.js:36,72` | ~~UTC date key causes wrong notifications~~: *retracted*. Both the check and the write use the same UTC date and classes recur weekly, so keys never collide; there's no user-visible effect. Still true: one `settings` row is added per class per day, forever |
| Low | `main.js:5-12` | `crash.log` grows forever; every renderer console message containing the word "error" is appended |
| Low | `main.js:226` | Comment says "loads 14b"; the model is now 3B |
| Low | `auth.js:13-16` | Lockout counter is in memory; restarting the app resets it. PIN minimum is 4 digits |
| Low | `main.js:1438` | Folder scan converts every image to a JS number array (`Array.from(buffer)`) for IPC, roughly 8× memory use per image |
| Low | `scripts/test-orin-doc.js:8` | Hard-coded Desktop path |

---

## 6. Security issues

| # | Severity | Location | Issue |
|---|---|---|---|
| S1 | ~~**Critical**~~ **FIXED 2026-10-29** | `seeder.js:96`, `shadsync-queries.js:45-47`, `module-router.js:627`, read back by `.replace('_enc','')` at `shadsync-queries.js:24`, `main.js:899/974`, `module-router.js:241/287` | **Student names/IDs stored in plain text** under columns labelled AES-256. The UI-entered path actually stores the real name in `name_anon` (the "anonymous" column). Verified in DB: `Rahman_enc`, `Hossain_enc`… |
| S2 | ~~**Critical**~~ **FIXED 2026-10-29** (pii-guard on every cloud call) | `encryption.js:67` (no callers); `main.js:511` + `module-router.js:578-595` | **Raw student data goes to cloud AI.** Every first chat message (e.g. "add student Karim Hossain to ICE301") is sent unmodified to the intent classifier and then the data-add prompt. With a cloud model active, that leaves the machine |
| S3 | ~~**High**~~ **FIXED 2026-10-29** (per-install master key; HKDF subkeys for student data and vault; real DB re-keyed and verified) | `encryption.js:16` | **Hard-coded vault key** `'facultymind_shadsync_vault_aes256_key_v1_2026!!'`. Anyone with the source + DB file can decrypt every vault password/note. The code comment acknowledges this |
| S4 | ~~**High**~~ **FIXED 2026-10-30** | `email.js:238-239` + CSP `index.html:7` (`script-src 'unsafe-inline'`) | **Stored XSS from email.** Gmail subjects are inserted with `innerHTML` unescaped; the CSP allows inline handlers, so a subject like `<img src=x onerror=…>` runs script in the app, which can then call `window.api.keys.get('claude')` |
| S5 | ~~**High**~~ **FIXED 2026-10-30** | `main.js:456-463`, `preload.js:26` | `keys:get` returns **raw API keys to the renderer**. Combined with S4, an email can steal keys. Renderer should only get "is set: yes/no" |
| S6 | ~~**High**~~ **FIXED 2026-10-30** | `main.js:428-439` | **PIN lock is cosmetic.** No IPC handler checks `auth.isSessionActive()`; any renderer code (or DevTools) can read vault/students/keys while "locked" |
| S7 | ~~Medium~~ **FIXED 2026-10-30** | `main.js:154-155` | `sandbox: false` + `webviewTag: true`, with **no** `will-attach-webview`, `will-navigate` or `setWindowOpenHandler` guards. The main window can be navigated to arbitrary URLs and webviews can be attached with any prefs |
| S8 | Medium | `email-backend.js:63-67` | OAuth flow has no `state` parameter (no CSRF protection); the callback server accepts any local request |
| S9 | Medium | `portable-config.js:25` | Fixed PBKDF2 salt `'portable-config-salt'` |
| S10 | Medium | `npm audit` | 31 vulnerabilities (2 critical, 26 high); **12 in production deps** incl. `protobufjs` (critical), `axios` 1.14 (high), `form-data`, `adm-zip`, `@xmldom/xmldom`, `sharp` |
| S11 | Low | `.env` (root) | Real Google OAuth client ID/secret on disk. It's gitignored, and the code migrates them to keytar on first use, so delete it after confirming the keychain has them. `emailbridge-main/.env` holds a Supabase *publishable* key (expected to be public) |
| S12 | Low | `main.js:767`, `:1203` | PDF export loads renderer-supplied HTML into a hidden window; it's isolated (no preload), so the risk is low |
| S13 | Info | `auth.js:25`, `:85` | 310k-iteration `pbkdf2Sync` on the main thread. ~~Freezes UI 0.3–0.5 s~~: *corrected by benchmark*, it's **38 ms** per check on the dev box, so negligible here; only worth revisiting on much slower PCs |

---

## 7. Performance concerns

- **MarkItDown extraction takes 16–19 s per document**, even a 1-page PDF (benchmarked, see BENCHMARKS.md). `converter.exe` is a 654 MB packed Python binary that unpacks on every call. pdf-parse (correct v2 API) takes 218 ms and mammoth 137 ms on the same files, so the "fast" path is ~80–120× faster but only runs as a fallback, and that fallback is broken for PDFs (BUG-X1).
- **Memory: ~1.3 GB working set** for the app's 8 processes after startup (warm), plus Ollama's qwen2.5:3b at **2.01 GiB** loaded (separate process). That's ~3.3 GB before Windows, tight on the 8 GB target machines.
- **Local LLM latency:** intent classification alone is **2.4 s** warm and **9.9 s** cold, and it runs before *every* first chat message; a 120-token reply takes ~10 s. Ollama reports the model **fully in VRAM** on the dev PC (RX 580), so this is the *GPU* number: 8 GB laptops without a usable GPU will be slower (unmeasured).
- **Syllabus Mapper 7–9 min** (from your own plan doc; not re-measured, since I had no real syllabus file; `Course_Profile.docx` is gone).
- **Constant background AI calls:** periodic Cortex every 5 min (worse when `SILENT`), email re-classification of 20 emails every 2 min, an AI call on every quit. Expensive on cloud keys and slow on a CPU-only Ollama.
- **Startup work:** Ollama warm-up + ONNX embedding load + email sync all fire at window show.
- **Bundle size:** `app.asar` is **252 MB** (onnxruntime, transformers, tesseract, googleapis, sharp); the existing installer is 176 MB.
- **Renderer monoliths:** `blooms.js` 103 KB, `main.css` 120 KB **plus** `bento-theme.css` 45 KB and 10 other stylesheets, all loaded at once; inline-style HTML strings throughout.
- `vault:get` (`main.js:788`) does `SELECT *` on every view; fine now (3 rows), but it won't scale.

---

## 8. Code quality / messy parts

- **No version control.** Highest-leverage fix.
- **`main.js` is 1,700 lines** with ~80 IPC handlers, and duplicate key-lookup boilerplate copied ~15× (`keychain || portableConfig` → `getKey`). One `getApiKey(service)` helper would fix B2, B3 and B8 together.
- **Two huge engines:** `syllabus-mapper.js` (1,500 lines / 91 KB) and `clo-mapper-fast.js` (1,000 lines).
- **Duplicated PDF-export handlers** (`shadsync:export-pdf` ≈ `blooms:export-pdf`).
- **Two conflicting build configs** (package.json `build` vs `electron-builder.yml`).
- **Clutter in the repo root:** `crash-log*.txt`, `debug-output*.txt`, `test-ocr*.mjs`, `test-mapper.js`, `switch_model.js` (a one-off that writes to your real DB by absolute path), `eng.traineddata` (5 MB, unused), and a mis-pasted file `CUsersAnxietyDesktopfacultyminddocsproposal_text.txt`.
- **`scripts/` has ~25 one-off patch scripts** (`_fix-fc.js` … `_fix-fc10.js`, `_patch-chat.ps1`, `_final-patch.js`), probably from fixes applied by scripted text replacement.
- **Backups mixed into src:** `chat.js.bak`, `main.css.backup-pre-redesign`, 7 `*-preview.html` mockups, `tokens-demo.html`.
- **`emailbridge-main/`** is an unrelated React + Supabase + Telegram web app (made with Lovable) sitting inside this repo.
- **Docs drift:** CLAUDE.md (stack, deadline), BUGLOG (BUG-020 now appears fixed, LIMIT-007 outdated, "Fixed Bugs: none — project not started"), SPRINTS 2.12 refers to a `shadsync-reports.js` that doesn't exist. Handover files are in `.claude/memory/` with broken UTF-8 (mojibake).
- **Inconsistent course-code casing** in data (`ice301` vs `ICE401`); patched around in the UI (BUG-009) rather than in the data.
- **No automated test runner;** tests are ad-hoc scripts, some exit 0 on failure.

---

## 9. Prioritised roadmap

> Updated after pass 2: IDs refer to §11. Because the decision is local-first with real student data, **B3 and X1 join Priority 3's first item**, and S1/S2 are blockers before any cloud provider is turned on. The test suite now exists, so each fix starts by deleting a `todo` flag and making that test pass.

### Priority 1 — Safety net (do first, ~½ day)
1. ~~`git init`, `.gitignore`, baseline commit~~ ✅ done (`a7a8819`). ~~Test suite~~ ✅ done (`npm test`). ~~Baseline benchmarks~~ ✅ done ([BENCHMARKS.md](BENCHMARKS.md)).
2. Back up `%APPDATA%\facultymind\` (DB + `-wal` + `-shm`) before any migration work.
3. Fix `db:export` / `db:import` / `vault:change-path` to use `db.backup()` and handle WAL files (B5, D3), and make attendance saves atomic (D1). This protects every later step.

### Priority 2 — Data protection, the project's core promise (~2–3 days)
4. Make student encryption real: `encryptField` for `name_enc`/`student_id_enc`/`enrollment_no_enc`, plus a **migration** that converts existing `"X_enc"` rows; fix the UI path that stores real names in `name_anon` (S1).
5. Replace the hard-coded vault key with a key derived from the PIN, or a random key stored in keytar; re-encrypt existing vault rows (S3).
6. Wire `anonymise()` / `reAssociate()` into every cloud-bound call that carries student data, or scrub names before intent classification (S2).
7. Close the XSS → key-theft chain: escape email fields (S4), stop returning raw keys to the renderer (S5), drop `'unsafe-inline'` from `script-src`, add navigation/webview guards (S7).
8. Enforce the session in the main process for sensitive IPC (S6).

### Priority 3 — Make the advertised features actually work (~2–3 days)
9. Add a single `getApiKey(provider)` helper with a model→service map (`gpt4o→openai`, `ollama→none`), loaded from config so cloud providers can be plugged in later. This fixes B2, B3 and B8 at once and turns Cortex/email classification back on under Ollama. Fix the pdf-parse v2 call (X1) in the same pass.
10. ShadSync multi-course: store assessment metadata per course (B4) and fix the averaging/NaN bugs (§5).
11. Gmail: catch `invalid_grant` → clear the token and show "Reconnect Gmail" in the UI (B1); add an OAuth timeout + `state` (B12, S8).
12. Update retired model IDs (B10) and add Ollama/OpenRouter to chat-based model switching (B9).
13. Pick one build config (B7), bundle `converter.exe` and Tesseract data / embedding model for offline first run (B6), then run `npm audit fix` on production deps.

### Priority 4 — Accuracy and speed (~1 week)
14. Fix the failing mapper tests (ice2345 at 40%, clo-mapper-fast Q3a) and make all test scripts exit non-zero on failure; add `npm test`.
15. Finish the syllabus pipeline overhaul (gap-type mislabel, garbled rewrite, no made-up COs, <5 min on 8 GB RAM).
16. Speed up extraction: try pdf-parse/mammoth first and use MarkItDown only when structure is needed, or keep the converter running between calls.
17. Throttle background AI: cache email classification by id, fix the `SILENT` loop, persist rate limits, drop the quit-time AI call (B11).

### Priority 5 — Cleanup and release (~2 days)
18. Remove or move clutter (§8), split `main.js` IPC by module, sync CLAUDE.md / BUGLOG / SPRINTS with reality.
19. Sprint 3 leftovers: clean-machine install test, transfer test, signed installer.

---

## 10. Open questions for Shad

> **Update 2026-10-29 (evening):** A answered — Dec 26 2026, International AI Builders Congress at DIU. C answered — DevTools off in packaged builds, on in dev; S5/S6/A3 still get fixed. B: don't touch `emailbridge-main/` this sprint. Plan now lives in [ROADMAP.md](ROADMAP.md), done-criteria in [QUALITY.md](QUALITY.md).
>
> Questions 2–8 below were answered on 2026-10-29; see §0.1. Previously open:
> - **A. The new deadline date.** Your answer was cut off at "new deadline on".
> - **B. emailbridge-main hosting:** is its Supabase project live (does it hold real user/email data)? That decides how urgent its audit is.
> - **C. DevTools in production:** should the installed app allow Ctrl+Shift+I? Several §11 bugs (S5, S6, A3) are reachable by anyone at the keyboard while DevTools is available.

*Original pass-1 questions (kept for history):*

1. **What's the goal now?** The May 16 competition has passed. Is the target a new deadline, real day-to-day use at DIU, or something else? This decides whether to polish the demo or harden for real data. (The "Context from me" part of your request was left as the template placeholder, so I didn't get your notes.)
2. **Local-first or cloud-first AI?** The code has moved to Ollama + OpenRouter as defaults, but CLAUDE.md says "Claude default, FINAL — DO NOT CHANGE". Which is the real direction? Should I update CLAUDE.md?
3. **Is there real student data in the DB,** or only the ICE301 demo seed? That decides how careful the encryption migration (Priority 2) has to be.
4. **`emailbridge-main/`**: part of FacultyMind (e.g. a future Telegram bridge), or a separate project I should leave alone / move out?
5. **OK to `git init`** and commit the current state as a baseline? (I haven't done it.)
6. **DIU Portal module**: the local marks/attendance/grade screens look like a stand-in modelled on the real DIU Teachers Portal. Is that intended as a demo stand-in, or should it eventually sync with the real portal?
7. **Email module**: still in scope? Gmail needs reconnecting either way.
8. **Can you re-share `Course_Profile.docx`** (Orin ma'am's document) and any real syllabus, so I can measure the Syllabus Mapper's actual speed and accuracy?

---

## 11. Confirmed bugs — reproduced (pass 2, 2026-10-29)

Every row was **reproduced before being listed**: by an automated test (the *Test* column; run `npm test`, and the test shows as a failing `todo` with the observed value), by a repro script, or by a command whose output is quoted. **Nothing has been fixed.**

How the "renderer" steps work: the app keeps Electron's default menu, so **Ctrl+Shift+I opens DevTools** (verified: the menu contains `toggledevtools`). Anything typed into that console runs with the same `window.api` the UI uses, and so does any script injected through BUG-S4.

### 11.1 Student data & security

| ID | Sev | Where | Steps to reproduce | Observed → expected | Test |
|---|---|---|---|---|---|
| **S1** | FIXED | `shadsync-queries.js:45-47`, `seeder.js:96`, `module-router.js:627` | 1. Add a student in ShadSync, or say "add student Karim Hossain to ICE301" in chat. 2. Open `%APPDATA%\facultymind\facultymind.db` in any SQLite viewer → `students` | `name_enc` = `"Karim Hossain_enc"` / `"Karim Hossain"`; the form path also writes the real name into `name_anon` → should be AES-GCM ciphertext, with a token in `name_anon` | `shadsync › BUG-S1` ×2, `module-router › BUG-S1` |
| **S2** | FIXED | `main.js:511`, `module-router.js:578-595`, `encryption.js:67` | 1. Select a cloud model. 2. Chat: "add student Karim Hossain to ICE301" | The prompt sent to the provider contains "Karim Hossain"; `anonymise()` has 0 callers in `src/` → no student identifier should leave the machine | `module-router › BUG-S2`, `security › BUG-S2` |
| **S3** | FIXED | `encryption.js:16` | Encrypt any vault item, then decrypt it with the key literal copied from the source | Decrypts → per-install key (PIN-derived or in keytar) | `security › BUG-S3` |
| **S4** | FIXED | `email.js:229-239`, CSP `index.html:7` | `npx electron tests/repro/xss-email.js`. Real world: anyone emails the professor the subject `<img src=x onerror="…">` | Prints **VULNERABLE**: the handler runs in the renderer under the real CSP (`'unsafe-inline'`) → subject should be rendered as text | `tests/repro/xss-email.js` (exit 1) |
| **S5** | FIXED | `main.js:456-463`, `preload.js:26` | DevTools console: `await window.api.keys.get('claude')` | Raw API key returned → renderer should only learn "set / not set" | `ipc › BUG-S5` |
| **S6** | FIXED | `main.js` (no handler checks `auth.isSessionActive()`) | 1. Let the app auto-lock (15 min). 2. DevTools: `await window.api.vault.get()` / `window.api.diu.students(1)` | All vault items and students returned while locked → sensitive IPC refused while locked | `ipc › BUG-S6` |
| **A3** | FIXED | `main.js:406-413`, `auth.js:41-47` | On the lock screen, DevTools: `await window.api.auth.setupPin('1111')`, then unlock with 1111 | New PIN accepted without the old one → setup only allowed on first launch or with the old PIN | `ipc › BUG-A3` |
| **A1** | Medium | `auth.js:13-16` | Enter 3 wrong PINs (30 s lockout) → close and reopen the app → try again at once | Lockout gone → persisted lockout | `security › BUG-A1` |
| **A2** | Low | `auth.js:41-44` | IPC `auth:setup-pin` with the number `12` | Raw `TypeError … Received type number (12)` → "PIN must be at least 4 digits" | `security › BUG-A2` |
| **R1** | FIXED | `encryption.js:96-108` | `reAssociate()` for a student whose name contains `$&` | Restored text is "Mr. Student_S001 Rahman" → the literal name | `security › BUG-R1` |

### 11.2 Data loss

| ID | Sev | Where | Steps to reproduce | Observed → expected | Test |
|---|---|---|---|---|---|
| **B5** | FIXED | `main.js:1554` (also `vault:change-path` `main.js:859`) | 1. Save a vault note. 2. Settings → Export database straight away. 3. Open the exported `.db` | Export had **0 of 1** vault rows (recent writes sit in `-wal`) → a complete snapshot (`db.backup()`). This is the laptop-transfer path | `ipc › BUG-B5` |
| **D1** | FIXED | `main.js:989-995` | Save a day's attendance (35 students). Save the same date again where one record fails to insert (e.g. a student deleted in another view, a DB-busy error) | Save fails **and all 35 rows for that day are deleted** (770 → 735) → all-or-nothing | `ipc › BUG-D1` |
| **D3** | FIXED | `main.js:1569-1573` | Settings → Import database → choose a file that is moved/deleted/unreadable before the copy | Import fails, then **every** feature errors with "The database connection is not open" until restart → old DB stays open | `ipc › BUG-D3` |

### 11.3 Broken features

| ID | Sev | Where | Steps to reproduce | Observed → expected | Test |
|---|---|---|---|---|---|
| **B3** | High | `proactive-engine.js:79-81`, `notifications.js:38-39`, `main.js:214/683/1635` | With **Ollama active (the default)**: open the app; connect Gmail | No greeting, no check-ins, no daily training; emails never categorised (`ai_category` undefined) → the local model should be used | `cortex-email › BUG-B3` ×2 |
| **X1** | Medium | `blooms-engine.js:13,74`, `model-router.js:740` | Installed app (no `converter.exe`): upload any text-layer PDF to Bloom's or chat. Direct check: `require('pdf-parse')(buf)` → `p is not a function` | pdf-parse v2 has no default function export and the error is swallowed → **every PDF goes to Tesseract OCR**: measured **2.7 s vs 218 ms** per page with the correct v2 API (≈12× slower, scaling per page), and OCR needs downloaded language data on a fresh install. On the clean sample the text matched (2,778 vs 2,798 chars); on real scanned-looking PDFs quality is unmeasured. The chat file-drop classifier (`model-router.js:740`) has no OCR fallback at all | `blooms › BUG-X1` |
| **B2** | High | `main.js:489` vs `settings.js:332` | Settings → enter an OpenAI key → choose GPT-4o → chat "hi" | "No API key set for gpt4o" → reply from GPT-4o | `ipc › BUG-B2` |
| **B4** | High | `shadsync-queries.js:4` | Add a second course with its own CLO/assessment setup → open its ShadSync dashboard | Uses ICE301's `ice301_assessment_meta` → that course's own metadata | `shadsync › BUG-B4` |
| **SH2** | High | `shadsync-engine.js:24-41` | ICE301: add one student who has no marks yet → view attainment / BAETE report | CLO1 drops **66.3 % → 64.4 %** for the whole class → ungraded students excluded. This puts wrong numbers in accreditation reports | `shadsync › BUG-SH2` |
| **V1** | FIXED | `module-router.js:174-176` | Chat: "save my BLC password Hunter2-secret" (the classifier fills only `password`) | Vault row's **title = "Hunter2-secret" in plaintext** → a neutral title; only `password_enc` holds the secret | `module-router › BUG-V1` |
| **SH1** | Medium | `shadsync-engine.js:72-95` | Open ShadSync for a course with no students | POs shown as **0 %** → "no data" | `shadsync › BUG-SH1` |
| **SY1** | Medium | `syllabus-mapper.js:513` | Syllabus tab → paste `CO1: Analyze DC circuits.` plus other COs | CO1 silently missing from the report (statements < 25 chars dropped) → every CO listed | `blooms › BUG-SY1` |
| **SC1** | Medium | `main.js:1502` | Schedule → add a class for "ICE301" (the seeded course code is `ice301`) | A second ICE301 course is created (3 → 4 courses) → case-insensitive match | `ipc › BUG-SC1` |
| **MR1** | Medium | `module-router.js:596` | With the local model, chat "add course CSE401 Compilers"; the model answers "Sure! Here is the JSON: {…}" | "Couldn't process that: Unexpected token 'S'…" → extract the JSON object | `module-router › BUG-MR1` |
| **RM1** | Medium | `module-router.js:126-133` | Chat: "remind me to submit grades next Friday 5pm" (the classifier returns a natural-language datetime) | "Could not save reminder: Invalid time value" → parse it, or save without a time and say so | `module-router › BUG-RM1` |
| **V2** | Medium | `module-router.js:197` | Chat: "find my BLC login in the vault" when the classifier leaves `entities.query` empty | "What are you looking for in the vault?" (reads `intent.raw`, which doesn't exist) → search `raw_query` | `module-router › BUG-V2` |
| **B9** | Low | `module-router.js:392` | Chat: "switch to local AI" | Lists only Claude/GPT-4o/Gemini → Ollama/OpenRouter accepted | `module-router › BUG-B9` |
| **MR2** | Low | `module-router.js:357` | Chat: "open BLC" | "Quick Portal module is coming in Sprint 3" → the portal opens | `module-router › BUG-MR2` |

### 11.4 Email & Cortex (lower priority per §0.1, still real)

| ID | Sev | Where | Steps to reproduce | Observed → expected | Test |
|---|---|---|---|---|---|
| **E3** | Medium | `proactive-engine.js:267`, `notifications.js:60-75` | Two important (Work/Students) emails arrive within 10 minutes | The 2nd gets **no chat alert and no OS notification** (throttled → `null`, not queued or fallen back) | `cortex-email › BUG-E3` |
| **E1** | Medium | `notifications.js:30-90,110` | A poll takes longer than 2 min (normal with local-model classification); the next poll starts | The same new email is **announced twice** → polls must not overlap | `cortex-email › BUG-E1` |
| **C1** | Medium | `proactive-engine.js:225-230` | Leave the app open during the day with a cloud key | Each "SILENT" answer skips the 60-min throttle → **AI called every 5 min** (3 calls in 3 ticks) → at most hourly | `cortex-email › BUG-C1` |
| **B12** | Medium | `email-backend.js:71-125` | Connect Gmail → close the browser tab without signing in → Connect again | "Port 3000 is in use…" until restart → timeout / reuse the server | `cortex-email › BUG-B12` |
| **B1** | Medium | `notifications.js:85-89` | (observed live, pass 1) a stored Gmail token has been revoked/expired | `invalid_grant` logged every 2 min forever; UI never told → "Reconnect Gmail" prompt | startup log |

Packaging bugs B6 (converter.exe not bundled) and B7 (electron-builder.yml ignored) were verified from build output in pass 1 (§3).

### 11.5 Hardening items (real, but not reachable from today's UI)

| ID | Where | Note | Test |
|---|---|---|---|
| HARDEN-1 | `syllabus-mapper.js:507` | `analyzeManualInput(null, …)` throws `null.split`; the renderer always sends strings | `blooms › HARDEN-1` |
| HARDEN-2 | `main.js:914-949` | `diu:saveMarks` with a partial row zeroes the other marks; `diu-portal.js:425-444` always sends every field (blank → 0) | `ipc › HARDEN-2` |

### 11.6 Checked and **retracted** (not bugs)

| Claim | Finding |
|---|---|
| ShadSync returns NaN for a course with 0 students (pass 1) | Returns `avg 0` and a boolean; covered by a passing test. The real issue is SH1 |
| "Notified today" UTC key causes wrong class notifications (pass 1) | Read and write use the same UTC date and classes are weekly, so no collision |
| Important-email chat alerts break because `triggerEmailAlert` gets `db = null` (pass 2 hypothesis) | Disproved: BUG-E1's run delivered alerts to chat. The failure I first saw came from the 10-min throttle, which is how E3 was found |
| `test-syllabus-mapper.js` "CO2 not flagged" (pass 1) | CO2 *is* flagged `NON_MEASURABLE_VERB`; the script's expectation label is wrong (covered by a passing test) |
| BUG-D2 "partial marks wipe data" (pass 2 draft) | Not reachable from the UI → moved to HARDEN-2 |

### 11.7 Bad-input sweep that found **no** bug
- The CLO mapper handled empty, whitespace, `null`/`undefined`, numbers-only, Bangla, emoji, HTML/script tags, a 2,000-question paper, run-on text with no newlines and regex-like text, all without throwing and each in under 5 s.
- The syllabus mapper handled empty, garbage and COs-without-weeks → `EXTRACTION_FAILED` cleanly.
- Module-router handler exceptions are caught and reported (no crash).
- AES-GCM rejects tampered ciphertext and wrong keys.
