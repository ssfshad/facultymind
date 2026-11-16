# FacultyMind — Security Checklist
# Run through EVERY item before marking any sprint DONE.
# Claude Code: run this checklist at the end of each sprint.
# Mark [x] when verified. Reset all to [ ] at start of next sprint.

---

## SPRINT SECURITY AUDIT — Run Before Marking Sprint Complete

### 1. Database Security
[ ] SQLite database file opens ONLY with correct SQLCipher key
    Test: try to open .db file with DB Browser for SQLite → should show encrypted blob
[ ] Incorrect PIN at launch prevents database from opening
[ ] Session timeout fires correctly after 15 minutes of inactivity
[ ] Database file is in app.getPath('userData') — NOT in the app installation folder
[ ] No raw SQL queries accept unsanitised user input (use parameterised queries only)

### 2. Student Data Anonymisation (MOST CRITICAL)
[ ] anonymise() is called before EVERY external AI API call that involves student data
[ ] reAssociate() correctly maps tokens back to real identifiers after AI response
[ ] Run grep across all AI calls: grep -r "aiRouter.send" src/ — manually verify each
    call either (a) does not involve student data or (b) calls anonymise() first
[ ] No student name, enrollment number, or real ID appears in any console.log output
[ ] No student data appears in any error message sent to an external service

### 3. API Key Security
[ ] All API keys retrieved from keytar (OS keychain) — verify with:
    grep -r "process.env" src/    → should return nothing in production code
    grep -r "apiKey:" src/        → all should reference keychain, not literals
[ ] No API key appears in any console.log or error log
[ ] No API key committed to git — run: git grep -i "sk-" && git grep -i "AIza"
[ ] portable.enc file (if exists) is NOT committed to git
[ ] .gitignore includes: .env, *.db, *.sqlite, portable.enc, /secrets

### 4. Authentication
[ ] PIN lock screen appears on every app launch (no bypass possible)
[ ] Session timeout: app locks after 15 minutes of inactivity
[ ] Wrong PIN: 30-second lockout after 3 failed attempts
[ ] PIN hash stored using bcrypt (never plain text, never reversible)
[ ] PIN change flow requires current PIN verification before allowing change

### 5. Email OAuth Security
[ ] Gmail OAuth token stored in keytar — NOT in SQLite or any file
[ ] OAuth scope is minimum required: read-only (gmail.readonly) for MVP
    Do NOT request gmail.send or full gmail access
[ ] OAuth token refresh handled silently without re-prompting user
[ ] Token revocation: professor can disconnect Gmail from settings at any time
[ ] No email body content stored permanently in SQLite
    (Only: sender, subject, category, priority, timestamp — no full body)

### 6. Network Security
[ ] All external API calls use HTTPS — verify no HTTP calls exist
[ ] Electron webSecurity is NOT disabled in BrowserWindow options
    Check: webPreferences.webSecurity should never be set to false
[ ] Content Security Policy set in main window
[ ] nodeIntegration is false in renderer (use contextBridge / preload only)
[ ] contextIsolation is true in all BrowserWindow instances

### 7. Portable Mode Security (if implemented)
[ ] portable.enc encrypted with AES-256 using PIN-derived key
[ ] portable.enc is in the app data folder, NOT the installation folder
[ ] portable.enc can be deleted to force fresh API key setup on new machine

### 8. Pre-Competition Final Check
[ ] Run full app from a CLEAN Windows user account (no dev tools installed)
[ ] Installer tested on a machine that never had FacultyMind before
[ ] All demo queries in DUMMYDATA.md return exact expected answers
[ ] No developer console errors visible during normal demo flow
[ ] No "undefined", "null", or placeholder text visible in any UI element
[ ] All navigation links, buttons, and dropdowns work correctly
[ ] WhisperFlow records and transcribes correctly on competition laptop microphone
[ ] OS notifications fire correctly on competition laptop
[ ] App starts in under 5 seconds on competition laptop
[ ] Demo database imported and all data loads correctly

---

## Security Incident Response
If a security issue is found during development:

CRITICAL (data exposure, key leak):
1. Stop all development immediately
2. Rotate any exposed API keys
3. Document in BUGLOG.md as CRITICAL
4. Fix before any other work resumes

HIGH (auth bypass, encryption gap):
1. Log in BUGLOG.md as HIGH priority
2. Fix before current sprint ends
3. Re-run full security checklist after fix

MEDIUM/LOW:
1. Log in BUGLOG.md
2. Fix before Sprint 3 ends
3. Verify fixed in Sprint 3 security audit
