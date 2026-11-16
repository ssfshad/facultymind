# FacultyMind — Competition Transfer Guide
# How to move FacultyMind from dev PC to competition laptop.
# Follow this EXACTLY. Test it on Sprint 3 task 3.21 before competition day.

---

## Overview
Dev machine:          Your desktop PC (Windows) — where you build and test
Competition machine:  Your laptop — what you carry to the competition

The goal: competition laptop runs FacultyMind identically to the dev machine,
with full ShadSync dummy data, all AI models working, and a rehearsed demo.

---

## Step 1: Build the Installer (On Dev PC — Day Before Competition)

```bash
# In your project root
npm run build:win
# This produces: /build/FacultyMind Setup 1.0.0.exe
```

Verify the installer exists and the file size is reasonable (typically 80–150MB).

---

## Step 2: Export the Demo Database (On Dev PC)

In FacultyMind app:
  Settings → Database → Export Demo Database
  → saves: facultymind-demo-export.db

Copy both files to a USB drive or upload to Google Drive:
  - FacultyMind Setup 1.0.0.exe
  - facultymind-demo-export.db

---

## Step 3: Install on Competition Laptop

1. Copy installer from USB to Desktop
2. Run: FacultyMind Setup 1.0.0.exe
3. Follow installer prompts (Next → Install → Finish)
4. App installs to: C:\Program Files\FacultyMind\
5. Data folder created at: C:\Users\[username]\AppData\Roaming\FacultyMind\

---

## Step 4: First Launch Setup on Competition Laptop

On first launch, FacultyMind shows the onboarding screen:

a) SET YOUR PIN
   Enter a PIN you will remember for the demo (4–6 digits)
   This encrypts your database. Write it on paper as backup.

b) ENTER API KEYS
   - Claude API Key:  sk-ant-... (from console.anthropic.com)
   - OpenAI API Key:  sk-...     (from platform.openai.com)
   - Gemini API Key:  AIza...    (from aistudio.google.com)
   Keys stored in Windows Credential Manager automatically.

c) SELECT MODE
   Choose: "Import existing database"
   → Select: facultymind-demo-export.db from USB
   → All ShadSync data, schedule, and vault items load instantly

d) VERIFY
   FacultyMind opens. Check:
   ✓ ShadSync shows CSE301 with 35 students
   ✓ Schedule shows Monday CSE301 class
   ✓ AI responds to "Hello" in chat

---

## Step 5: Full Demo Rehearsal on Competition Laptop

Run through every demo step from DUMMYDATA.md:
[ ] WhisperFlow voice input works (test laptop microphone)
[ ] "Show CSE301 CLO attainment" → correct numbers appear
[ ] PDF upload → Bloom's lesson plan generated
[ ] Model switch Claude → GPT-4o → back to Claude
[ ] Email demo inbox visible (use DEMO-READY mode)
[ ] OS notification fires for upcoming class

Do this at least 3 times without failure before competition morning.

---

## Step 6: Competition Morning Checklist

[ ] Laptop charged (bring charger)
[ ] Internet connection available (mobile hotspot as backup)
[ ] API keys working — test one chat message
[ ] ShadSync data loaded — check student count
[ ] WhisperFlow working — do one voice test
[ ] Presentation/slides ready (if required)
[ ] USB with installer and DB backup (in case laptop fails)
[ ] PIN written on paper in your wallet (not phone — phone might die)

---

## Emergency Backup Plan

If competition laptop fails entirely:
1. USB has the installer
2. Borrow any Windows laptop in the competition venue
3. Install FacultyMind (5 minutes)
4. Enter API keys manually from notes
5. Import demo database from USB
6. Ready in under 10 minutes

If internet fails during demo:
- Local vault, schedule, ShadSync dashboard: fully work offline
- AI features (chat, Bloom's, email classification): require internet
- Demo strategy: start with ShadSync and schedule (offline-capable)
  then explain internet dependency for AI features

---

## File Locations on Competition Laptop
```
App installation:  C:\Program Files\FacultyMind\
App data:          C:\Users\[you]\AppData\Roaming\FacultyMind\
Database:          C:\Users\[you]\AppData\Roaming\FacultyMind\facultymind.db
Logs:              C:\Users\[you]\AppData\Roaming\FacultyMind\logs\
```

## Uninstall (After Competition If Needed)
Control Panel → Programs → FacultyMind → Uninstall
App data folder must be manually deleted for complete removal.
