# FacultyMind — System Architecture
# Read this before touching any module.

## Application Type
Electron.js desktop application.
Main process (Node.js) + Renderer process (UI).
They communicate exclusively via Electron IPC (ipcMain / ipcRenderer).
No localhost HTTP server. No open ports. Pure desktop architecture.

## The Golden Rule of Data Flow
User Input
  → NL Interface (chat or WhisperFlow voice)
  → Intent Classifier (model-router.js)
  → Module Router (routes to correct module)
  → Module processes request
  → Response returned to UI

Student Data Flow (CRITICAL — never skip anonymisation):
Raw student data (in SQLite)
  → anonymise() — replaces names/IDs with tokens (S001, S002...)
  → AI API call (Claude / GPT-4o / Gemini)
  → AI response received
  → reAssociate() — maps tokens back to real student identifiers
  → Result displayed in UI

## AI Abstraction Layer — THE MOST IMPORTANT ARCHITECTURAL RULE
File: /src/modules/ai/model-router.js

ALL AI calls in the entire application go through model-router.js.
NEVER call Claude API, OpenAI API, or Gemini API directly from any module.
Always use: await aiRouter.send(prompt, context, options)

model-router.js reads the active model from settings and routes accordingly.
Swapping models requires ZERO changes to any module code.

### model-router.js interface:
```javascript
// options: { model: 'claude'|'gpt4o'|'gemini'|null (uses active setting) }
const response = await aiRouter.send(promptTemplate, contextObject, options);
// Returns: { text: string, tokens: number, model: string }
```

## Database Architecture
Engine: SQLite with SQLCipher
Location: Electron app.getPath('userData') + '/facultymind.db'
Key derivation: User PIN → PBKDF2 → SQLCipher encryption key
The database file is encrypted at rest. Plain SQLite open will fail.

### Core Tables:
```sql
users           (id, pin_hash, name, email, created_at)
courses         (id, code, name, section, semester, year)
students        (id, course_id, student_id_anon, name_anon, enrollment_no_anon)
marks           (id, student_id, course_id, q1, q2, midterm, final, assignment, lab)
attendance      (id, student_id, course_id, date, present)
clos            (id, course_id, code, description, bloom_level, weight)
cos             (id, course_id, code, description)
pos             (id, code, description, category)
co_clo_map      (co_id, clo_id, weight)
co_po_map       (co_id, po_id, weight)
schedule        (id, course_id, day_of_week, start_time, end_time, room, zoom_link)
lesson_log      (id, course_id, date, topic_covered, topic_next, notes)
tasks           (id, title, due_datetime, reminder_datetime, done, created_at)
vault_items     (id, type, title, content, tags, created_at)
email_rules     (id, rule_json, active, expires_at, created_at)
vip_senders     (id, email, name, added_at)
api_keys        (id, service, key_reference)  -- reference to OS keychain, NOT actual key
sessions        (id, started_at, model_active)
```

## ShadSync Module Architecture
Location: /src/modules/shadsync/

### Files:
- shadsync-engine.js    — core calculation engine
- shadsync-queries.js   — all database queries for OBE data
- shadsync-reports.js   — BAETE report generation
- shadsync-router.js    — handles NL queries routed from model-router

### Calculation Chain:
Student Marks → CLO Attainment (per student, per CLO)
  → CO Attainment (weighted average of CLOs mapped to each CO)
  → PO Attainment (weighted average of COs mapped to each PO)
  → Overall Program Attainment

### CLO Attainment Formula:
CLO_attainment = (student_score_on_CLO_items / max_score_on_CLO_items) * 100
Threshold: 60% (configurable per course)
Gap flagged if: attainment < threshold for > 40% of students

## WhisperFlow Architecture
Location: /src/modules/voice/

### Files:
- whisperflow.js   — audio capture + Whisper API call
- voice-ui.js      — renderer-side mic button and waveform display

### Flow:
1. User presses mic button in renderer
2. Web Audio API captures audio (MediaRecorder)
3. On release: audio blob sent to main process via IPC
4. main process sends audio to OpenAI Whisper API
5. Transcription returned to renderer
6. Transcription displayed in chat input (editable before submit)
7. User confirms (or auto-submits after 2s) → sent to NL Interface

## Security Architecture
Location: /src/modules/security/

### Files:
- auth.js          — PIN setup, PIN verify, session management
- encryption.js    — SQLCipher key derivation, anonymise(), reAssociate()
- keychain.js      — keytar wrapper for OS credential storage
- portable-config.js — encrypted portable config for pendrive deployments

### API Key Storage:
Keys stored in OS keychain using keytar.
Reference ID stored in api_keys table (never the actual key).
On app start: keychain.getKey(service) → decrypted key → used in API call.

### Portable Mode:
When OS keychain unavailable (pendrive scenario):
Keys stored in AES-256 encrypted file: /app-data/portable.enc
Encrypted with user PIN. File travels with the app data folder.
User sets portable mode in settings before transfer.

## Electron IPC Channels (Main ↔ Renderer)
'ai:send'           — send message to active AI model
'ai:model-switch'   — change active model
'voice:audio-data'  — send recorded audio to main for Whisper API
'voice:transcript'  — return transcript to renderer
'shadsync:query'    — query ShadSync engine
'schedule:get'      — get schedule data
'schedule:notify'   — trigger pre-class notification
'email:fetch'       — fetch and classify emails
'email:rule-set'    — set active email filter rule
'vault:save'        — save item to vault
'vault:search'      — search vault with Fuse.js
'db:export'         — export database for transfer
'db:import'         — import database on new machine
'auth:verify-pin'   — verify user PIN
'auth:session'      — check/update session state

## Gitignore Requirements
The .gitignore MUST include:
  .env
  *.db
  *.sqlite
  /build
  /dist
  portable.enc
  keychain-test.json
  /secrets
  node_modules
  api-keys.json

## Pre-Commit Check (Always Run Before git commit)
git grep -ri "sk-" src/         # No OpenAI keys
git grep -ri "AIza" src/        # No Gemini keys
git grep -ri "claude" src/ | grep -i "api.key"  # No Claude keys in code
