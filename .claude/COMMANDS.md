# FacultyMind — Commands Reference
# Every terminal command needed to develop, run, test, and ship FacultyMind.
# Claude Code: use these exact commands. Never guess.

---

## Daily Development

```bash
# Start app in development mode (with DevTools enabled)
npm run dev

# Start app in production mode (no DevTools)
npm start

# Install a new dependency
npm install [package-name]

# Install a dev-only dependency
npm install --save-dev [package-name]
```

---

## Database

```bash
# Run all migrations (create/update schema)
npm run db:migrate

# Seed dummy dataset (CSE301 + 35 students)
npm run db:seed

# Reset database completely (CAUTION — deletes all data)
node src/database/reset.js

# Open database for inspection (dev only — will show encrypted)
# To inspect: temporarily disable SQLCipher in dev mode only
node src/database/dev-inspect.js
```

---

## Building the Installer

```bash
# Build Windows installer (.exe) — use this for competition
npm run build:win

# Output location:
# build/FacultyMind Setup 1.0.0.exe       <- standard installer
# build/FacultyMind-Portable-1.0.0.exe    <- portable (no install)

# Build macOS (.dmg)
npm run build:mac

# Build both platforms
npm run build:all
```

---

## Security Checks (Run Before Every git commit)

```bash
# Check for exposed API keys
git grep -ri "sk-ant"    src/
git grep -ri "sk-proj"   src/
git grep -ri "AIzaSy"    src/
git grep -ri "api.key"   src/

# All commands above should return NOTHING.
# If any return results — do NOT commit. Fix first.

# Check .gitignore is working
git status --short | grep -E "\.(db|sqlite|env)$"
# Should return nothing. If .db or .env shows — fix .gitignore.
```

---

## Electron Rebuild (After npm install on new machine)

```bash
# Rebuild native modules for current Electron version
./node_modules/.bin/electron-rebuild

# If keytar fails specifically
npm rebuild keytar --runtime=electron --target=28.0.0 --disturl=https://electronjs.org/headers --abi=119
```

---

## Testing

```bash
# Run QA script (automated checks)
npm test

# Check a specific module manually
node src/tests/test-shadsync.js
node src/tests/test-blooms.js
node src/tests/test-memory.js
```

---

## Logs & Debugging

```bash
# View app logs (Windows)
type %APPDATA%\FacultyMind\logs\main.log

# View app logs (macOS)
cat ~/Library/Logs/FacultyMind/main.log

# Clear logs
node src/utils/clear-logs.js
```

---

## Git Workflow

```bash
# Standard commit (always check security first)
git add .
git status                    # review what is being committed
git commit -m "Sprint 1: [task description]"

# Never commit without reviewing git status first
# Never force push
# Commit message format: "Sprint [N]: [what was built]"
```

---

## Competition Day Commands

```bash
# STEP 1: Build final installer (run on dev PC)
npm run build:win

# STEP 2: Verify installer was created
ls -la build/

# STEP 3: Export demo database (run inside app UI)
# Settings → Database → Export Demo Database

# STEP 4: On competition laptop — after installing
# Launch app → onboarding → enter API keys → import database
# Then verify:
node -e "console.log('Node OK:', process.version)"  # should show v20.x
```
