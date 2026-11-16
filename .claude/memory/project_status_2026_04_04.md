---
name: Project status after Gemini build audit
description: What was found and fixed in the April 4 audit session; what still needs doing
type: project
---

Shad used Gemini to build the entire project (Sprints 1–3). The code is functionally complete and well-structured. An audit was run on 2026-04-04.

**Fixed this session:**
- BUG-008: BAETE PDF export had escaped template literals — course name/date showed as literal `${...}` text
- BUG-009: Course code 'ice301' stored lowercase, showed lowercase in dropdown (now uppercase), IPC lookup was case-sensitive (now uses resolveCourse() helper)
- BUG-010: saveStudent/saveClo etc. IPC handlers passed course CODE string as numeric FK, causing DB violation on manual entry (now resolves code → ID first)
- BUG-011: `googleapis` package missing from package.json — crashed every app launch with UnhandledPromiseRejection

**Still open (CRITICAL):**
- BUG-012: Attainment numbers from the engine (~CLO1: 66.3%) don't match DUMMYDATA.md expected values (CLO1: 74.2%). Either update DUMMYDATA.md/QA.md to match real engine output, OR tweak seed data so engine produces documented numbers. Must fix before demo.

**What to do next session:**
1. Fix BUG-012 — run the app, read actual attainment output, update DUMMYDATA.md + QA.md (preferred option A)
2. Rebuild the installer (npm run build:win) after all bug fixes
3. Sprint 3.20–3.23: clean install test + 3× demo rehearsal (Shad must do physically)

**App status:** Starts cleanly, DB seeded, no startup errors after BUG-011 fix.

**Why:** Competition deadline is May 16, 2026. All code is otherwise complete.
**How to apply:** Start next session by fixing BUG-012, then rebuild installer.
