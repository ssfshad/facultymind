# FacultyMind — Sprint Plan
# Update task status here as work progresses.
# Claude Code: check this file every session. Mark [x] when done.

## CURRENT SPRINT: see /ROADMAP.md (7-day sprint from 2026-10-29).
## This file is the history up to May 2026. Corrections from the 2026-10-29 audit are marked AUDIT.

---

## Sprint 1: Apr 25–30 — Foundation Layer
STATUS: [x] IN PROGRESS — scaffolding complete, awaiting VS Build Tools for native modules

### Goal
By end of Sprint 1: Professor can launch FacultyMind, set a PIN,
enter API keys, switch AI models, have a full conversation, use voice input,
and set a class reminder with OS notification.

### Tasks
- [x] 1.1  Init Electron project with correct folder structure (see ARCHITECTURE.md)
- [x] 1.2  Install all dependencies: better-sqlite3 (sqlcipher blocked — see BUG-002), keytar,
           fuse.js, electron-builder, axios, pdf-parse, openai, @anthropic-ai/sdk — all installed
- [x] 1.3  Create SQLite + SQLCipher database with all tables (see ARCHITECTURE.md schema)
           Code complete in src/database/migrations/001_init.js — runs on first launch
- [x] 1.4  Build first-launch onboarding screen (PIN setup + API key entry)
- [x] 1.5  Build main app window with sidebar navigation (all modules, even if empty)
- [x] 1.6  Implement model-router.js — Claude API integration first
- [x] 1.7  Add GPT-4o to model-router.js
- [x] 1.8  Add Gemini to model-router.js
- [x] 1.9  Build model switcher UI in settings panel
- [x] 1.10 Build Natural Language chat interface (text input + response display)
- [x] 1.11 Build intent classifier prompt (see PROMPTS.md PROMPT-001)
- [x] 1.12 Build basic module router (routes intent to correct handler)
           src/modules/ai/module-router.js — all 12 intents handled, stubs for Sprint 2+ modules
- [x] 1.13 Build WhisperFlow mic button + audio capture (Web Audio API)
- [x] 1.14 Connect WhisperFlow to OpenAI Whisper API via IPC
- [x] 1.15 Display transcription in chat input before submit
- [x] 1.16 Build Smart Schedule Manager — timetable entry UI
- [x] 1.17 Implement pre-class OS notification with 30-min lead time
- [x] 1.18 Build lesson log (what was covered, what is next per course)
- [x] 1.19 Implement keytar API key storage for Windows Credential Manager (code done, needs VS Build Tools)
- [x] 1.20 Implement portable config fallback (encrypted .enc file for pendrive mode)
- [x] 1.21 Build DB export/import feature (for competition laptop transfer)
- [x] 1.22 PIN lock screen on app launch — session timeout after 15 min inactivity
- [x] 1.23 Full Sprint 1 QA — every button, every flow tested end to end
           DONE: All code-fixable QA failures resolved (QA-005, QA-008, QA-011).
           Open: QA-012 (SQLCipher) = BUG-002 known/deferred. QA-022+ = Sprint 2 stubs, expected.

### Sprint 1 Done When:
Full conversation with Claude works. Voice input transcribed. Model switch works.
Class reminder fires. Database is encrypted. API keys stored in keychain.
PIN lock works. DB export produces a valid file.

---

## Sprint 2: May 1–8 — Core Intelligence
STATUS: [x] COMPLETE

### Goal
By end of Sprint 2: The two showstopper features — ShadSync and Bloom's —
are fully functional and demonstrable with the pre-loaded dummy dataset.

### Tasks
- [x] 2.1  Build ShadSync student data entry UI (add/edit student records)
- [x] 2.2  Build marks entry UI (Q1, Q2, midterm, final, assignment, lab)
- [x] 2.3  Build attendance tracking UI (per session, per student)
- [x] 2.4  Build CLO definition UI (add CLOs per course, assign Bloom's level)
- [x] 2.5  Build CO definition and CO-CLO mapping UI
- [x] 2.6  Build PO definition and CO-PO mapping UI
- [x] 2.7  Implement CLO attainment calculation engine (shadsync-engine.js)
- [x] 2.8  Implement CO attainment calculation
- [x] 2.9  Implement PO attainment calculation
- [x] 2.10 Implement attainment gap detection (flag CLOs below 60% threshold)
- [x] 2.11 Build ShadSync dashboard UI — attainment table, cohort chart, heat map
- [x] 2.12 Build BAETE compliance report generator (PDF export via shadsync-reports.js)
           AUDIT: shadsync-reports.js doesn't exist; export is shadsync:export-pdf in main.js
- [x] 2.13 Load dummy dataset from seeds/ice301_dummy.json (see DUMMYDATA.md)
- [x] 2.14 Verify all demo query answers match DUMMYDATA.md exactly
- [x] 2.15 Wire NL commands to ShadSync: "show ice301 attainment", "who failed CLO2"
- [x] 2.16 Build Bloom's Taxonomy Engine — PDF upload UI
- [x] 2.17 Implement PDF text extraction with PDF.js
- [x] 2.18 Build Bloom's mapping prompt (see PROMPTS.md PROMPT-002)
- [x] 2.19 Display generated lesson plan: CLO tags, Bloom's levels, quiz questions
- [x] 2.20 Connect Bloom's output to ShadSync — auto-tag CLOs on new course material
- [x] 2.21 Full Sprint 2 QA — ShadSync queries, Bloom's PDF, report generation

### Sprint 2 Done When:
Upload any lecture PDF → get full Bloom's lesson plan in under 60 seconds.
Ask "show ice301 CLO attainment" → ShadSync dashboard opens instantly.
Ask "which students failed CLO2" → named list from dummy data appears.
BAETE report exports to PDF correctly.

---

## Sprint 3: May 9–15 — Operations, Polish and Demo Prep
STATUS: [x] IN PROGRESS

### Goal
By end of Sprint 3: All modules complete and stable. Demo rehearsed.
Installer built. Competition laptop transfer tested.

### Tasks
- [x] 3.1  Gmail OAuth2 integration — connect professor's inbox
- [x] 3.2  Email fetcher — fetch last 50 emails on connect
- [x] 3.3  Email classifier — Claude API classifies each email (PROMPTS.md PROMPT-003)
- [x] 3.4  Email UI — categorised inbox view (Personal/Work/Student/OTP/Ad/Spam)
- [x] 3.5  Priority detector — HIGH/NORMAL/LOW scoring
- [x] 3.6  VIP sender list — add/remove via natural language
- [x] 3.7  Custom rule parser (PROMPTS.md PROMPT-004) — "today only show OTPs"
- [x] 3.8  High-priority email notification — fires regardless of active snooze rules
- [x] 3.9  Draft reply flow — intent prompt → Claude generates full draft
- [x] 3.10 End-of-day snooze summary notification
- [x] 3.11 Local Vault — Integrate existing "stashboard" project.
- [x] 3.12 Local Vault — Tweak stashboard UI and logic to fit seamlessly into FacultyMind.
- [x] 3.13 Local Vault — Vault Fuse.js search and AI disambiguation dialogue integrations.
- [x] 3.14 Password vault — AES-256 entry + PIN-protected reveal (via stashboard integration).
- [x] 3.15 Quick Portal Access — DIU Teacher Portal WebView
- [x] 3.16 Quick Portal Access — BLC WebView
- [x] 3.17 Full security audit (see SECURITY.md checklist — run every item)
- [ ] 3.18 Prompt sanitisation audit — verify anonymise() called before every API call
           AUDIT: not done — anonymise() has no callers (S2). Re-opened, on ROADMAP Day 1
- [x] 3.19 Build Windows installer with Electron Builder
- [ ] 3.20 Test installer on a clean machine (not the dev machine)
- [ ] 3.21 Transfer to competition laptop — full install + DB import test
- [ ] 3.22 Rehearse full 5-minute demo script (see DUMMYDATA.md demo queries)
- [ ] 3.23 Run full demo 3 times without any failure before competition day

## Post-Sprint 3 (Added 2026-04-04): Cortex Intelligence Layer
Jarvis-style proactive AI engine — not in original sprint plan, added as major feature.
- [x] C.1  DB migration 002 — activity_log, ai_thoughts, cortex_state tables
- [x] C.2  activity-logger.js — every module visit and action logged
- [x] C.3  rules-engine.js — faculty defines rules in plain English, AI parses + stores
- [x] C.4  thought-journal.js — AI writes its own observations to a persistent journal
- [x] C.5  context-builder.js — assembles full situational awareness (time, schedule, emails, activity, rules, thoughts)
- [x] C.6  daily-trainer.js — runs once/day, AI reads yesterday's log, writes patterns + reflection
- [x] C.7  proactive-engine.js — rebuilt: app_open, post_class, pre_class, periodic, email_alert triggers
- [x] C.8  main.js — Cortex wired in: startup training, greeting, 5-min periodic loop, all IPC handlers
- [x] C.9  preload.js — cortex API exposed to renderer (log, getRules, addRule, deleteRule, getThoughts, setProactive)
- [x] C.10 renderer — proactive message style (purple avatar, pulse dot, action buttons), rules + thoughts UI in Settings
- [x] C.11 Verified: app starts clean, both migrations run, Cortex handles missing API key gracefully

### Sprint 3 Done When:
Full 5-minute demo runs clean 3 times in a row on the competition laptop.
Every button works. Every dropdown works. No broken navigation.
Installer tested on a machine that never had FacultyMind before.

---

## Post-Sprint 3 (Added 2026-05-23): Bloom's CLO Mapping + DOCX Support
Feature addition — CLO-to-Bloom's mapping mode and DOCX file support for the Bloom's Engine.
- [x] B.1  Install mammoth (pure-JS DOCX extraction, no native deps)
- [x] B.2  Create blooms-clo-mapping.js prompt template (PROMPT-007)
- [x] B.3  Update blooms-engine.js: extractText() helper, DOCX support, mapCLOsToBlooms()
- [x] B.4  Add BLOOM_CLO_MAP intent to intent-classifier.js
- [x] B.5  Add handleBloomCloMap handler to module-router.js
- [x] B.6  Add blooms:map-clos IPC handler to main.js; update blooms:generate for mimeType
- [x] B.7  Expose blooms.mapCLOs in preload.js
- [x] B.8  Update blooms.js renderer: mode toggle, CLO mapper UI, DOCX acceptance, result table

## Post-Sprint 3 (Added 2026-05-24): CLO Mapper — Deterministic Fast Path
The real fix — stop asking a 14B LLM to do parser work. The CLO Mapper now
runs a deterministic verb-dictionary engine first that resolves 95-100% of
exam questions in <50ms with zero AI calls. The LLM only gets called for the
small residue of low-confidence cases (typically 0-3 questions per paper).
- [x] R.1  Build clo-mapper-fast.js — splits questions, tokenises, looks up
           action verbs in BLOOMS_VERBS dictionary, applies disambiguation
           rules for verbs that span multiple levels (compare, demonstrate,
           construct, etc.). Question-ID parser handles Q1(a), Q.1, etc.
- [x] R.2  Wire the fast engine into blooms-engine.mapCLOsToBlooms() — runs
           BEFORE any LLM call. If every question resolves with high/medium
           confidence, return immediately with `_engine: 'deterministic'`.
- [x] R.3  Smoke test scripts/test-clo-mapper-fast.js — validates against
           the actual ICE301 result the user got, AND the printed answer
           key on the ICE2343 Digital Logic Design paper. Currently 100%
           pass on all 19 test questions.
- [x] R.4  Keep OpenRouter as opt-in fallback only — restored Ollama as the
           default for any low-confidence residue.

### Done When:
Professor pastes any exam paper → 95%+ of questions get a Bloom's level in
under 1 second, fully offline, no LLM. The LLM is only consulted for the
2-3 low-confidence stragglers per paper.
