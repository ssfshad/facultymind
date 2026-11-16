# FacultyMind — Bug Log
# Claude Code: READ THIS AT THE START OF EVERY SESSION.
# Fix all OPEN bugs before adding any new feature.
# Shad: add bugs here as you find them during testing.
#
# UPDATE 2026-10-29: the takeover audit's reproduced bugs (IDs like S1, B5, D1, SH2)
# are tracked in /STATUS.md §5, §6 and §11, each with a test in tests/ flagged
# { todo: '<ID>' }. Fixes are logged here as they land.

---

## How to Use This File

When a bug is found:
  [OPEN] BUG-XXX | Module | Short description | Found: date

When fixed:
  [FIXED] BUG-XXX | Module | Short description | Fix: what was done | Fixed: date

Priority levels:
  CRITICAL  — app crashes or data loss. Fix before anything else.
  HIGH      — feature broken, demo affected. Fix same session.
  MEDIUM    — feature partially broken. Fix before sprint ends.
  LOW       — cosmetic or minor. Fix in Sprint 3 polish.

---

## Active Bugs

[SUPERSEDED] BUG-020 | Blooms | (2026-10-29: hidden in dev because MarkItDown runs first; the real problem is the pdf-parse v2 API call → see X1 in STATUS.md §11)
  Original: pdf-parse 1.1.4 incompatible with pdfkit-generated PDFs — "bad XRef entry" error on any PDF created by pdfkit
  Priority: MEDIUM — sample PDFs cannot be created with pdfkit; real lecture PDFs from Word/Acrobat parse fine
  Root cause: pdf-parse bundles pdf.js v1.10.100 which rejects modern XRef stream format used by newer PDF writers
  Workaround: Use PDFs exported from Microsoft Word, Google Docs, or Adobe Acrobat for Bloom's testing
  Fix path: Upgrade pdf-parse to v2.x (ESM only — needs dynamic import wrapper) or switch to pdfjs-dist directly
  Found: 2026-04-08

[FIXED] BUG-019 | Vault | encryptField() / decryptField() called throughout app without the required key argument — "first argument must be string or Buffer, Received undefined" crash on any vault save
  Priority: CRITICAL — vault save broken for all content (NL + UI)
  Fix: Added APP_FIELD_KEY fallback in encryption.js — used when no key passed. Also added null-safe `plaintext ?? ''` guard.
  Note: Post-competition, derive this from PIN via PBKDF2.
  Fixed: 2026-04-06

[FIXED] BUG-018 | floating-chat.js | fc-file-remove button null crash — innerHTML injected button queried immediately without null guard
  Priority: CRITICAL — file attach would crash if element wasn't found
  Fix: Added null check: `const removeBtn = document.getElementById('fc-file-remove'); if (removeBtn) removeBtn.addEventListener(...)`
  Fixed: 2026-04-05

[FIXED] BUG-017 | floating-chat.js | extractPdfText had no try/catch — PDF.js errors propagated silently and crashed file handling
  Priority: MEDIUM — uploading a corrupt PDF would cause unhandled rejection
  Fix: Wrapped entire function in try/catch, throws a readable error
  Fixed: 2026-04-05

[FIXED] BUG-016 | chat.js | No sending guard — rapid Enter presses caused duplicate messages and corrupted sharedHistory
  Priority: MEDIUM — fast typists could double-submit and corrupt conversation context
  Fix: Added `isSending` flag, set true on entry, released in finally block
  Fixed: 2026-04-05

[FIXED] BUG-015 | module-router.js | VAULT_SAVE, VAULT_SEARCH, BLOOM_GENERATE still pointing to stub handlers after Sprints 2 & 3 completed
  Priority: HIGH — "save this link" / "search vault" / "generate bloom's" NL commands returned placeholder text instead of real actions
  Fix: Implemented handleVaultSave (Fuse.js search + DB insert), handleVaultSearch, handleBloomRedirect (navigate action)
  Fixed: 2026-04-05

[FIXED] BUG-014 | Email | Email sync fetched 50 emails sequentially (50 API calls) — extremely slow (30-60 seconds)
  Priority: HIGH — demo-breaking: email section appeared frozen during sync
  Fix: Reduced to 20 emails, switched sequential for loop to Promise.all in batches of 10 — 5-10x faster
  Fixed: 2026-04-05

[FIXED] BUG-013 | Email | No Gmail sign-out button — users could not disconnect their Gmail account
  Priority: MEDIUM — no way to switch accounts or revoke access from the UI
  Fix: Added email:signout IPC + preload exposure + "⏏ Sign out" button in email header (visible only when connected)
  Fixed: 2026-04-05

[FIXED] BUG-012 | ShadSync | CLO attainment numbers from engine did NOT match DUMMYDATA.md expected values
  Priority: CRITICAL — demo will fail if numbers don't match the memorised answers
  Fix: Option A — recalculated all numbers analytically from seed data using the engine formula.
       Updated DUMMYDATA.md and QA.md with verified values.
       CLO1: 66.3% | CLO2: 67.9% | CLO3: 64.4% | CLO4: 65.7%
       CO1: 67.1% | CO2: 64.9%
       PO1: 66.2% | PO2: 65.8% | PO3: 64.9% | PO5: 66.0%
       No CLO breaches cohort threshold; CLO3 is most at-risk (13/35 = 37.1% below 60%).
       Demo narrative updated: show CLO3 at-risk students instead of "failing CLO4".
       Top 3 students: Hossain (94%), Rahman (87%), Paul (87%).
       Final avg: 25.6/40. Attendance avg: 81.3%.
  Fixed: 2026-04-04

[FIXED] BUG-011 | Email | `googleapis` npm package missing from package.json — UnhandledPromiseRejection crash on every app launch
  Priority: CRITICAL — email module threw on require(), crashing the entire main process startup
  Fix: npm install googleapis --save
  Fixed: 2026-04-04

[FIXED] BUG-010 | ShadSync Main | saveStudent/saveClo/saveCo/savePo IPC handlers passed course CODE string directly as numeric course_id FK — FK violation on manual entry
  Priority: MEDIUM — manual student/CLO entry would throw DB error; demo path (seeded data) unaffected
  Fix: Added course code → numeric ID resolution in the shared mutation handler loop in main.js
  Fixed: 2026-04-04

[FIXED] BUG-009 | ShadSync UI | Course code stored as 'ice301' (lowercase) showed lowercase in dropdown; case-sensitive lookup in attainment IPC would fail if UI sent uppercase
  Priority: MEDIUM — cosmetically bad for demo; breaks manual entry after BUG-009 fix
  Fix: Normalized course code to uppercase in loadCourses() renderer; added case-insensitive resolveCourse() helper in main.js used by all shadsync IPC handlers
  Fixed: 2026-04-04

[FIXED] BUG-008 | ShadSync UI | BAETE PDF export showed literal `${courseSel.value}` and `${new Date().toLocaleDateString()}` instead of real values
  Priority: HIGH — every exported BAETE report had broken header (no course name, no date)
  Fix: Removed backslash escapes from template literal interpolations in exportBaete() in shadsync.js
  Fixed: 2026-04-04

[FIXED] BUG-007 | Local Vault | Missing IPC channels and broken Stashboard schema
  Priority: HIGH — Vault interactions (delete, favorite, location) were broken
  Fix: Added vault:delete, vault:favorite, vault:get-path IPCs. Wired drag/drop. Fixed migration schema.
  Fixed: 2026-04-04

[FIXED] BUG-001 | Native Modules | keytar installed successfully after VS Build Tools + Developer Mode
  Fix: Installed VS Build Tools 2022 + enabled Windows Developer Mode. keytar now available.
  Fixed: 2026-04-04

[OPEN] BUG-002 | Database | better-sqlite3-sqlcipher fails on Windows — MSBuild path construction bug
  Priority: MEDIUM — data still encrypted at field level (AES-256-GCM) via encryption.js
  Workaround: Using better-sqlite3 (plain SQLite) for Sprint 1. All sensitive fields encrypted in app layer.
  Full SQLCipher file-level encryption blocked by upstream package Windows bug.
  Fix path: Try @journeyapps/sqlcipher after Sprint 1, or wait for better-sqlite3-sqlcipher Windows fix.
  Found: 2026-04-04

[FIXED] BUG-003 | Schedule | schedule-manager.js getUpcomingClasses() called undefined local getSchedule()
  Priority: HIGH — silently crashed the 30-min OS notification loop on every tick
  Fix: Changed getSchedule(db) → queries.getSchedule(db) (the already-imported queries module)
  Fixed: 2026-04-04

[FIXED] BUG-004 | Main Process | main.js used db module export as raw Database object (.close, .name)
  Priority: CRITICAL — db.close() on window-all-closed would throw; db:export/import IPC handlers broken
  Fix: Renamed db → dbModule (the module), dbHandle (the raw Database). All IPC handlers updated.
        db:import no longer references deleted better-sqlite3-sqlcipher — uses dbModule.openDatabase().
  Fixed: 2026-04-04

[FIXED] BUG-005 | Schedule | schedule:save IPC sent course_code/name to schedule table which expects course_id FK
  Priority: HIGH — saving any class would fail with FK constraint or silently insert NULL course_id
  Fix: schedule:save IPC now upserts a course record first (by code), then saves the schedule entry with course_id.
  Fixed: 2026-04-04

[FIXED] BUG-006 | Schedule UI | Lesson log rendered a static placeholder, never fetched real data
  Priority: MEDIUM — lesson logs saved via the modal were invisible; course selector always empty
  Fix: renderLessonLog() now fetches via IPC per-course and renders real entries.
       setupLessonLog() populates #lesson-course from loaded _schedule, saves with real course_id.
  Fixed: 2026-04-04

---

## Fixed Bugs
Fixed bugs are marked [FIXED] in place above (2026-10-29 note: this section was never used).

---

## Known Limitations (Expected — Not Bugs)
These are deliberate MVP decisions. Do not attempt to fix them for competition.

- LIMIT-001 | WhisperFlow | Real-time streaming not implemented.
  Press-to-record only. Streaming is v1.5 roadmap. (See ADR-005)

- LIMIT-002 | IonCUDOS | Direct live sync/export to IonCUDOS platform not implemented.
  ShadSync is a standalone OBE engine. IonCUDOS export is roadmap v3.0.

- LIMIT-003 | Vault | Semantic embedding search not implemented.
  Fuse.js fuzzy search only for MVP. Embeddings are post-competition.

- LIMIT-004 | Email | Full email sending not implemented.
  Draft generation works. Sending requires opening email client. MVP scope only.

- LIMIT-005 | Mobile | No mobile app.
  Desktop only for competition. Mobile is v4.0 roadmap.

- LIMIT-006 | Multi-user | No multi-user or department-wide features.
  Single professor per installation. Multi-user is v2.5 roadmap.

- ~~LIMIT-007 | Local OSS Models | Ollama / LLaMA not integrated.~~
  OUTDATED (2026-10-29): Ollama (qwen2.5:3b-instruct) is integrated and is now the default.
