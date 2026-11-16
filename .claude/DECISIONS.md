# FacultyMind — Architectural Decisions Log
# Read this before questioning any architectural choice.
# All decisions here are FINAL for the MVP. Do not re-open them.

---

## ADR-001: Desktop App, Not Web App
Decision: Electron.js downloadable desktop application.
Reason: Local-first data storage. OS keychain for credential security.
Native notifications. Embedded WebView for portal access. SQLCipher encryption.
None of these are possible in a browser without a server.
Future: Web version and mobile app are v2.5+ roadmap items.
Status: FINAL. Do not reconsider for MVP.

---

## ADR-002: SQLCipher Over Plain SQLite
Decision: All database files encrypted with SQLCipher (AES-256).
Reason: Student marks, personal schedules, and credentials are institutional data.
Encryption at rest is non-negotiable for any academic platform.
The professor's PIN on first launch derives the SQLCipher key via PBKDF2.
Package: Use 'better-sqlite3-sqlcipher' npm package.
Status: FINAL.

---

## ADR-003: AI Abstraction Layer Is Mandatory
Decision: Every single AI call in the application goes through model-router.js.
Reason: The professor can switch between Claude, GPT-4o, and Gemini at any time.
If modules call APIs directly, a model switch requires changing code in 10+ places.
With model-router.js, it requires changing exactly zero module files.
Rule: If you are writing `fetch('https://api.anthropic.com')` outside of
model-router.js, you are doing it wrong. Stop. Fix it.
Status: FINAL. Zero exceptions.

---

## ADR-004: ShadSync Is Self-Contained
Decision: ShadSync OBE engine is an isolated module with its own tables,
calculation logic, and report generation. It has no hard dependencies on
other modules (email, vault, schedule, etc.).
Reason: ShadSync must be demonstrable as a standalone feature during the demo.
If it depends on other modules being complete, a bug in email could break ShadSync.
Status: FINAL.

---

## ADR-005: WhisperFlow Is Press-to-Record for MVP
Decision: WhisperFlow uses press-to-record model, not always-on streaming.
The professor presses a button, speaks, releases, and the audio is sent to
OpenAI Whisper API for transcription. Not real-time streaming.
Reason: Real-time streaming introduces 300-500ms latency artifacts, requires
a persistent WebSocket connection, and is far more likely to fail during a
live competition demo. Press-to-record gives 95%+ accuracy with zero demo risk.
Post-competition: Real-time streaming can be explored in v1.5.
Status: FINAL for MVP.

---

## ADR-006: Dummy Dataset Is Fixed, Not Generated
Decision: The ShadSync competition demo dataset is a pre-verified, fixed JSON file
loaded at app startup. It is NOT randomly generated.
File: /src/database/seeds/cse301_dummy.json
Reason: Generated data has edge cases that produce unexpected attainment numbers.
The demo queries in DUMMYDATA.md must return exact, known answers every time.
A judge asking "who failed CLO2?" must get the same answer every demo run.
Status: FINAL.

---

## ADR-007: Student Anonymisation Is Non-Negotiable
Decision: All student names, IDs, and enrollment numbers are anonymised
before any data is sent to any external AI API. No exceptions.
Implementation:
  - anonymise(students) → replaces name with 'Student_S001', ID with 'S001', etc.
  - All AI prompts use anonymised tokens only
  - reAssociate(response, mapping) → maps S001 back to real name after response
Reason: Privacy compliance and institutional trust. If this step is ever skipped,
real student data leaks to a third-party AI provider. Unacceptable.
Status: FINAL. Security audit must verify this step every sprint.

---

## ADR-008: keytar for All API Key Storage
Decision: All third-party API keys (Claude, OpenAI, Gemini, Whisper) are stored
using the keytar npm package which interfaces with:
  - Windows Credential Manager on Windows
  - macOS Keychain on macOS
Never stored in: .env files, SQLite, JSON config files, or anywhere in the codebase.
Portable exception: If professor enables "portable mode", keys stored in AES-256
encrypted portable.enc file, encrypted with their PIN.
Status: FINAL.

---

## ADR-009: Electron BrowserView for Portal Access
Decision: DIU Teacher Portal and BLC open inside FacultyMind using
Electron BrowserView (not shell.openExternal).
Reason: Opening in an external browser breaks the workflow. The professor
should never need to leave the FacultyMind window during a working session.
BrowserView renders the portal as an embedded panel inside the app.
Fallback: If BrowserView fails for a specific portal (session/JS issues),
fall back to deep-link URL opened in the system browser.
Status: FINAL for MVP.

---

## ADR-010: Competition Transfer Process Is Defined
Decision: The process for transferring FacultyMind from the dev PC to the
competition laptop is fixed and must be tested before competition day.
Steps (see SPRINTS.md task 3.21):
  1. Run electron-builder on dev PC → produces setup.exe
  2. Copy setup.exe to competition laptop (USB or download)
  3. Run installer on competition laptop
  4. Launch FacultyMind → first-launch screen appears
  5. Enter API keys → stored in competition laptop's Credential Manager
  6. Import demo database file (from DB export on dev PC)
  7. Full demo rehearsal on competition laptop
This process must be tested on Sprint 3 task 3.21. It must succeed completely
before competition day. There is no plan B.
Status: FINAL.

---

## ADR-011: No New Features After April 22nd
Decision: After the proposal showcasing on April 22nd, no new features
are added to the scope until after May 16th MVP showcase.
Reason: Scope creep is the #1 risk for a solo 20-day build.
Every day spent on a new feature is a day not spent making existing
features stable and demo-ready.
If Shad wants to add something: add it to the ROADMAP section of the proposal.
Build it after May 16th.
Status: FINAL. Claude Code must refuse to implement new features
outside the SPRINTS.md task list without explicit instruction from Shad.
