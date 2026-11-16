# FacultyMind — Code Review Checklist
# Claude Code: run through this before marking ANY task complete.
# This is your self-review. Be honest. Do not skip steps.

---

## RULE: No task is done until this checklist passes.
If any item fails, fix it before moving on.
Do not mark a SPRINTS.md task [x] until the relevant sections below pass.

---

## Section A: Every Single Code Change

### A1. Correctness
[ ] Does the code do exactly what the task in SPRINTS.md says?
[ ] Have I tested the happy path (normal use)?
[ ] Have I tested the failure path (what if API fails, DB is locked, input is empty)?
[ ] Does it handle null and undefined inputs without crashing?

### A2. Architecture Compliance
[ ] If this involves an AI call — does it go through model-router.js?
    If not: STOP. Refactor to use model-router.js first.
[ ] If this involves student data — is anonymise() called before the AI call?
    If not: STOP. Add anonymise() before proceeding.
[ ] If this involves an API key — is it retrieved from keytar?
    If not: STOP. Move key retrieval to keychain.js.
[ ] Does this change break any existing functionality?
    Test: run the app and click through all working features.

### A3. Code Quality
[ ] Is every function under 50 lines? If not, split it.
[ ] Are variable names clear and self-describing?
[ ] Are complex sections commented with WHY (not just what)?
[ ] Are there any console.log statements left in production code paths?
    Acceptable: logger.debug() in development mode only.
    Not acceptable: console.log(studentData) or console.log(apiKey) ever.
[ ] Are all async functions using try/catch with meaningful error messages?

### A4. IPC Compliance (Electron)
[ ] Is renderer → main communication using ipcRenderer.invoke() ?
[ ] Is main → renderer communication using ipcMain.handle() ?
[ ] Is there any direct Node.js module usage in renderer without contextBridge?
    If yes: move it to main process and expose via preload.js contextBridge.
[ ] Is nodeIntegration: false in all BrowserWindow instances?
[ ] Is contextIsolation: true in all BrowserWindow instances?

---

## Section B: After Completing a Full Module

### B1. Module Isolation
[ ] Can this module be demonstrated independently?
[ ] Does disabling this module break any other module?
    If yes: there is a hidden dependency. Fix the coupling.
[ ] Does this module have its own error boundary?
    (errors in email module should not crash ShadSync or schedule)

### B2. Memory Integration
[ ] Does this module read from memoryManager where relevant?
    Examples: email module checks NOTIFICATION_RULE and EMAIL_RULE
              schedule module checks notification_lead_time from profile
              AI responses respect quiet_hours from profile
[ ] Does this module update memory when the professor states a preference?
    Example: "remind me 45 minutes before" → updates profile.notification_lead_time

### B3. UI Consistency
[ ] Does the UI follow the rules in UI.md?
[ ] Are all buttons, dropdowns, and navigation links functional?
[ ] Are there any placeholder texts ("Lorem ipsum", "TODO", "undefined") visible?
[ ] Does the module work at window sizes 1280x720 and 1920x1080?
[ ] Are loading states shown while async operations complete?
[ ] Are error states shown clearly when something fails?

### B4. WhisperFlow Integration (for modules that accept voice)
[ ] Can all key actions in this module be triggered by voice?
[ ] Does the intent classifier correctly route voice commands to this module?
    Test: speak "show CSE301 attainment" → does ShadSync open?
    Test: speak "remind me at 3pm to submit marks" → does reminder get set?

---

## Section C: Before Each Sprint Is Marked Complete

### C1. Run SECURITY.md
[ ] Full security checklist from SECURITY.md completed and all items passed.

### C2. End-to-End Flow Test
[ ] Open fresh app instance (or clear session)
[ ] Complete the full professor workflow for this sprint:
    Sprint 1: Onboard → chat → voice → model switch → set reminder → check schedule
    Sprint 2: Upload PDF → get lesson plan → open ShadSync → run all demo queries
    Sprint 3: Connect Gmail → classify emails → set rule → open vault → portal access

### C3. Performance Check
[ ] App starts in under 5 seconds
[ ] AI responses begin within 3 seconds of sending (streaming or loading state shown)
[ ] ShadSync dashboard loads in under 2 seconds
[ ] PDF upload and Bloom's processing completes in under 60 seconds for a 20-page PDF

### C4. Demo Script Verification (Sprint 3 only)
[ ] Run full 5-minute demo from DUMMYDATA.md three times in a row
[ ] Zero broken interactions across all three runs
[ ] All demo query answers match DUMMYDATA.md exactly

---

## Section D: The "Shad Will Demo This" Test
Before any feature is called done, ask:
"If Shad demos this live to judges tomorrow, will it work perfectly?"

If the answer is anything other than a confident YES:
→ It is not done. Keep working.

Common failure modes to check:
- Feature works in dev but breaks on a cold start (no cached data)
- Feature works with keyboard but breaks with voice input
- Feature works alone but breaks when another module is also open
- Feature shows correct data but crashes on edge case inputs
- Feature looks good at 100% zoom but breaks at 125% (common on Windows laptops)
