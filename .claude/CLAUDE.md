# FacultyMind — Claude Code Master Brief
# READ THIS FILE FIRST. EVERY SESSION. NO EXCEPTIONS.

## Product Direction (set by Shad, 2026-10-29) — overrides anything below
Deadline: **International AI Builders Congress, Dec 26 2026, at DIU** (DIU co-organises).
Judges value "AI-native, secure, responsible, enterprise-ready", plus validation
(real users) and commercialisation. No teacher has used FacultyMind yet.

- **Core = OBE automation for BAETE accreditation:** Bloom's Engine + ShadSync + Syllabus Doctor.
- **Pitch:** "Accreditation work that takes days, done in minutes. Student data never leaves the laptop."
- **Hero flow:** question paper + marks sheet → Bloom's level per question →
  question→CLO map → CLO/CO/PO attainment → gaps → AI explains WHY each CLO is
  weak and WHAT to change → BAETE-ready PDF.
  Target: **< 60 s end-to-end, fully offline, gemma4:e2b via Ollama (default since 2026-11-11; ~4.6 GB RAM loaded, so an 8 GB laptop is tight — qwen2.5:3b-instruct, ~2.1 GB, is the lighter fallback).**
- **Local-first AI.** Cloud providers stay optional via config and never receive student identifiers.
- **Secondary (Labs):** Email, Vault, WhisperFlow, Cortex, DIU Portal. Behind a "Labs"
  feature flag, hidden in the competition build. No new features there.
- `emailbridge-main/` — do not touch this sprint.
- DevTools: disabled in packaged builds, enabled in dev.

Plan: [ROADMAP.md](../ROADMAP.md) (active sprint + NEXT UP) · Definition of done:
[QUALITY.md](../QUALITY.md) · Current state and bug list: [STATUS.md](../STATUS.md).

## Working Rules (Shad, 2026-10-29)
1. One bug/task at a time: remove its `todo` flag (or write the test) → make it
   pass → full `npm test` → commit with the bug ID in the message.
2. Real student data: any migration or change touching %APPDATA% data is first
   run on a COPY. Show Shad before/after row counts plus one sample decrypted
   row, then STOP and wait for his explicit OK.
3. Never commit real student data, keys or .env. Delete root .env only after
   confirming the Google OAuth creds are in the keychain.
4. No refactoring of main.js beyond what a fix needs. No new features outside the hero flow.
5. If a fix needs a product decision, ask Shad in one line with the recommended
   option. Don't guess.
6. End of every session: `npm test` (+ `npm run eval` once it exists), commit,
   update STATUS.md (fixed/open) and ROADMAP.md "NEXT UP".

## What This Project Is
FacultyMind is a downloadable Windows desktop application (Electron.js) built as
an AI-powered academic management platform for university faculty.
It is NOT a web app. It is NOT hosted online. It runs locally on any Windows PC
after a standard installer setup.

## The Developer
Name: Shad
Institution: Daffodil International University (DIU), Bangladesh
Solo developer — no team.
Original competition deadline: May 16, 2026 (MVP showcase) — passed.
Current deadline: Dec 26, 2026 (see Product Direction above).

## Who It's For
University lecturers and professors — to take routine academic admin off their plate.
Working style: Day and night sprints. Quality over speed.
Target accuracy: 90% on every feature before moving to the next.

## The Signature
The OBE engine inside FacultyMind is named ShadSync.
Every attainment report, every BAETE export, every CLO calculation
is powered by ShadSync. This name appears in the UI and all reports.

## Platform & Distribution
- Desktop: Windows (primary), macOS (secondary)
- Installer: Built with Electron Builder (.exe for Windows, .dmg for macOS)
- Database: Travels with the installation (SQLite file in app data folder)
- Portability: Professor installs on any PC, enters API keys once, fully functional
- Transfer: Dev PC → build installer → copy to competition laptop → install → import demo DB → done

## Core Modules (original build order, historical — current priorities are in ROADMAP.md)
1.  Electron scaffold + project structure
2.  SQLite + SQLCipher database initialisation
3.  Multi-model AI abstraction layer (local Ollama default; cloud providers pluggable via config)
4.  Natural Language Interface — chat UI + intent classifier + module router
5.  WhisperFlow — press-to-record + OpenAI Whisper API transcription
6.  Smart Schedule Manager — timetable + OS notifications + lesson tracking
7.  First-launch onboarding — API key setup + PIN creation
8.  ShadSync OBE Engine — student data, CLO/CO/PO attainment, BAETE reports
9.  Bloom's Taxonomy Engine — PDF upload + CLO mapping + quiz generation
10. Email Intelligence — Gmail OAuth + classification + priority + rules + draft reply
11. Local Vault — file/link/note/password storage + Fuse.js search + AI dialogue
12. Quick Portal Access — DIU Portal + BLC embedded WebView
    (the local DIU Teachers Portal screens are a DEMO STAND-IN; keep them behind
    an interface so a real portal connection can replace them later)
13. Security audit — SQLCipher verify, keychain verify, prompt sanitisation verify
14. Demo preparation — dummy data verified, every button tested, demo script rehearsed

## Absolute Non-Negotiables
- 90% accuracy on every feature before starting the next
- Zero broken buttons, dropdowns, or navigation links at demo time
- Real student data exists on user machines — treat it as sensitive
- All student data stays LOCAL — never sent to any cloud AI provider (only the
  local model may see it, and only after anonymisation)
- Student data is NEVER committed to git (marks sheets, exports, DB files —
  see .gitignore). Tests and benchmarks use the seeded demo data only.
- Anonymise ALL student names and IDs before any AI API call — always
- Re-associate anonymised data with real identifiers locally after every AI response
- Every UI interaction must feel smooth — no lag, no flicker, no janky transitions
- If a feature is not stable, mark it DEMO-READY with dummy data — do not fake LIVE
- Never delete working code without explicit instruction from Shad

## Tech Stack (updated 2026-10-29 — local-first)
Framework:          Electron.js
Database:           SQLite (better-sqlite3); SQLCipher still blocked (BUG-002)
AI Default:         LOCAL — Ollama, gemma4:e2b (Shad, 2026-11-11; see eval/MODEL-COMPARISON.md).
                    qwen2.5:3b-instruct stays installed as the light fallback for 8 GB machines.
AI Providers:       Switchable via config, all optional, plugged in through
                    src/modules/ai/model-router.js only:
                      Claude API · OpenAI GPT-4o · Google Gemini · OpenRouter
                    Cloud providers must never receive student data.
Voice:              OpenAI Whisper API (cloud, optional)
PDF / documents:    MarkItDown converter (bin/converter.exe, built from
                    python/converter.py) → pdf-parse / mammoth → tesseract.js OCR
Embeddings:         Local all-MiniLM-L6-v2 via @xenova/transformers
Search:             Fuse.js (offline)
Email:              Gmail API via OAuth2
Credential Store:   keytar npm package (Windows Credential Manager / macOS Keychain)
Notifications:      Electron native notification API
Portal:             Electron BrowserView (WebView)
Installer:          Electron Builder

## What Claude Code Must Do Every Session
1. Read CLAUDE.md (this file)
2. Read BUGLOG.md — fix any OPEN bugs before adding new features
3. Check ROADMAP.md — the active sprint and NEXT UP (SPRINTS.md is the history up to May 2026)
4. Read the relevant MODULE file before editing that module
5. Run `npm test` and the app after any significant change — verify nothing broke.
   Tests marked { todo: 'BUG-…' } are confirmed open bugs; when you fix one,
   remove its todo flag. Run `npm run bench` before/after performance work and
   compare with BENCHMARKS.md.
6. Update BUGLOG.md if a new bug is found or an existing one is fixed
7. Update ROADMAP.md when a task is completed (mark with [x])
8. Never ask "should I proceed?" — read DECISIONS.md and proceed. Exceptions:
   Working Rule 2 (real-data checkpoints) and Rule 5 (product decisions).

## Project Folder Structure
/facultymind
  /src
    /main              <- Electron main process (main.js)
    /renderer          <- Electron renderer UI (React or vanilla JS)
    /modules
      /ai              <- model-router.js — ALL AI calls go here
      /shadsync        <- ShadSync OBE engine
      /blooms          <- Bloom's Taxonomy engine
      /schedule        <- Smart schedule manager
      /email           <- Email intelligence module
      /vault           <- Local vault storage
      /voice           <- WhisperFlow voice interface
      /portal          <- DIU/BLC WebView module
      /security        <- Encryption, PIN auth, keychain
    /database
      /migrations      <- SQLite schema migrations
      /seeds           <- Dummy data seed files
      /queries         <- Reusable query functions
    /prompts
      /templates       <- All AI prompt templates (see PROMPTS.md)
      /schemas         <- JSON schemas for AI response validation
    /utils             <- Shared utility functions
  /assets              <- Icons, fonts, images
  /build               <- Electron Builder output (gitignored)
  .claude/             <- This folder
  package.json
  electron-builder.yml
  .gitignore
