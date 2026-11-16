# FacultyMind — Environment & Dependencies
# Claude Code: use EXACT versions listed here. Do not upgrade unless Shad says so.
# Mismatched versions are the #1 cause of "works on my machine" bugs.

---

## Node.js & Runtime
Node.js:     v20.x LTS (DO NOT use v21+ — Electron compatibility issues)
npm:         v10.x (comes with Node 20)
Electron:    v28.x

Check versions: node --version && npm --version

---

## package.json — Exact Dependencies

```json
{
  "name": "facultymind",
  "version": "1.0.0",
  "description": "AI-Powered Academic Management Platform for University Faculty",
  "main": "src/main/main.js",
  "scripts": {
    "start":      "electron .",
    "dev":        "NODE_ENV=development electron .",
    "build:win":  "electron-builder --win --x64",
    "build:mac":  "electron-builder --mac",
    "build:all":  "electron-builder --win --mac",
    "db:seed":    "node src/database/seeds/seed.js",
    "db:migrate": "node src/database/migrations/run.js",
    "test":       "node src/tests/run-qa.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk":        "^0.24.0",
    "openai":                   "^4.47.0",
    "@google/generative-ai":    "^0.12.0",
    "better-sqlite3":           "^9.4.0",
    "@journeyapps/sqlcipher":   "^5.3.1",
    "keytar":                   "^7.9.0",
    "fuse.js":                  "^7.0.0",
    "pdf-parse":                "^1.1.1",
    "axios":                    "^1.6.0",
    "bcrypt":                   "^5.1.1",
    "electron-store":           "^8.1.0",
    "uuid":                     "^9.0.0"
  },
  "devDependencies": {
    "electron":                 "^28.0.0",
    "electron-builder":         "^24.9.0"
  }
}
```

---

## electron-builder.yml — Installer Configuration

```yaml
appId: com.shad.facultymind
productName: FacultyMind
copyright: Copyright 2026 Shad, DIU

directories:
  output: build
  buildResources: assets

files:
  - src/**/*
  - assets/**/*
  - package.json

win:
  target:
    - target: nsis       # Standard installer (.exe)
      arch: [x64]
    - target: portable   # Portable .exe (no install needed)
      arch: [x64]
  icon: assets/icon.ico
  requestedExecutionLevel: asInvoker

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  installerIcon: assets/icon.ico
  uninstallerIcon: assets/icon.ico

mac:
  target: dmg
  icon: assets/icon.icns
  category: public.app-category.education

portable:
  artifactName: FacultyMind-Portable-${version}.exe
```

---

## SQLCipher Setup (Critical — Easy to Get Wrong)
Do NOT use plain better-sqlite3. Use the SQLCipher fork.

```bash
npm install @journeyapps/sqlcipher
```

Connection code (EXACT — do not modify):
```javascript
const Database = require('@journeyapps/sqlcipher').Database;
const db = new Database('facultymind.db');
db.pragma(`key = '${derivedKey}'`);  // Must be first operation after open
db.pragma('cipher_page_size = 4096');
db.pragma('kdf_iter = 64000');
db.pragma('cipher_hmac_algorithm = HMAC_SHA1');
db.pragma('cipher_kdf_algorithm = PBKDF2_HMAC_SHA1');
```

---

## Required Global Tools
Install these once on the dev machine:

```bash
# Windows (run as administrator)
npm install -g electron-builder
npm install -g node-gyp
npm install -g windows-build-tools  # Required for native modules (keytar, sqlcipher)
```

---

## Environment Variables (Development Only)
Create a .env file in project root FOR DEVELOPMENT ONLY.
This file is gitignored. Never commit it.
In production: all values come from OS keychain via keytar.

```
NODE_ENV=development
LOG_LEVEL=debug
```

DO NOT put API keys in .env. Ever. Use keytar.

---

## .gitignore (Complete List)
```
node_modules/
build/
dist/
.env
*.db
*.sqlite
portable.enc
keychain-test.json
/secrets/
api-keys.json
*.log
.DS_Store
Thumbs.db
```

---

## First Time Setup (Run In Order)
```bash
git clone [repo]
cd facultymind
npm install
npm run db:migrate   # Creates encrypted SQLite schema
npm run db:seed      # Loads CSE301 dummy dataset
npm run dev          # Starts app in development mode
```

If keytar fails on Windows:
```bash
npm install --global --production windows-build-tools
npm rebuild keytar
```

---

## Known Compatibility Notes
- keytar requires native build tools — run windows-build-tools if it fails
- SQLCipher must be the FIRST pragma after opening DB — if order changes, DB won't open
- Electron 28+ has contextIsolation ON by default — do not disable it
- pdf-parse may warn about test files — ignore the warning, it works correctly
- bcrypt requires node-gyp — included in windows-build-tools
