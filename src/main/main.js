const { app, BrowserWindow, ipcMain, Notification, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

const studentCrypto = require('../modules/security/student-crypto');

const logFile = path.join(app.getPath('userData'), 'crash.log');
function appLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(line.trim());
}
process.on('uncaughtException', (err) => { appLog(`[UNCAUGHT] ${err.stack || err}`); });
process.on('unhandledRejection', (reason) => { appLog(`[UNHANDLED_REJECTION] ${reason}`); });

// Module imports — these work once VS Build Tools + npm install completes
let dbModule, dbHandle, auth, keychain, aiRouter, moduleRouter, scheduleManager, whisperflow, portableConfig;

function loadModules() {
  try {
    dbModule        = require('../database/db');
    dbHandle        = dbModule.openDatabase();
    auth            = require('../modules/security/auth');
    keychain        = require('../modules/security/keychain');
    aiRouter        = require('../modules/ai/model-router');
    moduleRouter    = require('../modules/ai/module-router');
    scheduleManager = require('../modules/schedule/schedule-manager');
    whisperflow     = require('../modules/voice/whisperflow');
    portableConfig  = require('../modules/security/portable-config');

    // Restore persisted active model and OpenRouter sub-model preference
    try {
      const { getActiveModel: getPersistedModel } = require('../database/queries');
      const persistedModel = getPersistedModel(dbHandle);
      if (persistedModel) aiRouter.setActiveModel(persistedModel);

      const orRow = dbHandle.prepare(`SELECT value FROM settings WHERE key = 'openrouter_model'`).get();
      if (orRow) aiRouter.setOpenRouterModel(orRow.value);

      // Restore saved Ollama model preference
      const ollamaRow = dbHandle.prepare(`SELECT value FROM settings WHERE key = 'ollama_model'`).get();
      const defaultModel = 'gemma4:e2b';
      // Migrate away from deepseek-r1:8b — it doesn't fit 8GB RAM target machines
      if (ollamaRow && ollamaRow.value === 'deepseek-r1:8b') {
        console.log('[main] Migrating Ollama model from deepseek-r1:8b to gemma4:e2b (8GB RAM compatibility)');
        aiRouter.setOllamaModel(defaultModel);
        dbHandle.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('ollama_model', ?)`).run(defaultModel);
      } else if (ollamaRow) {
        aiRouter.setOllamaModel(ollamaRow.value);
      }

      // Auto-correct: if the saved Ollama model no longer exists (e.g. was deleted),
      // fall back to the default model and update the DB preference.
      setTimeout(async () => {
        try {
          const http = require('http');
          const savedModel = aiRouter.getOllamaModel();
          const defaultModel = 'gemma4:e2b';
          // Check if the saved model is actually available in Ollama
          const modelExists = await new Promise(resolve => {
            const req = http.get('http://localhost:11434/api/tags', { timeout: 2000 }, res => {
              let raw = '';
              res.on('data', c => { raw += c; });
              res.on('end', () => {
                try {
                  const data = JSON.parse(raw);
                  const models = (data.models || []).map(m => m.name);
                  // Match exact name or name without tag
                  resolve(models.some(m => m === savedModel || m.startsWith(savedModel.split(':')[0])));
                } catch (_) { resolve(false); }
              });
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
          });

          if (!modelExists && savedModel !== defaultModel) {
            console.log(`[main] Saved Ollama model "${savedModel}" not found — switching to ${defaultModel}`);
            aiRouter.setOllamaModel(defaultModel);
            if (dbHandle) dbHandle.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('ollama_model', ?)`).run(defaultModel);
          }
        } catch (_) {}
      }, 3000);

      // Auto-fallback: if active model has no key or key is invalid, switch to openrouter
      // Also: if Ollama is available and no cloud key is set, auto-switch to local AI
      setTimeout(async () => {
        try {
          const activeModel = aiRouter.getActiveModel();
          const activeKeystore = keychain || portableConfig;
          if (!activeKeystore) return;

          // Check if Ollama is available
          const ollamaAvailable = await aiRouter.isOllamaAvailable();

          if (ollamaAvailable && activeModel !== 'ollama') {
            // Check if the current active model has a key
            const hasKey = !!(await require('../modules/ai/api-key').getApiKey(activeKeystore, activeModel));

            if (!hasKey) {
              // No cloud key set — auto-switch to local Ollama
              aiRouter.setActiveModel('ollama');
              const { updateActiveModel } = require('../database/queries');
              updateActiveModel(dbHandle, 'ollama');
              console.log('[main] No cloud API key found, auto-switched to Local AI (Ollama)');
              // Notify renderer to update model badge
              mainWindow?.webContents.send('ai:model-changed', 'ollama');
              return;
            }
          }

          // Standard fallback: if active model has no key, try openrouter
          const key = await require('../modules/ai/api-key').getApiKey(activeKeystore, activeModel);
          if (!key && activeModel !== 'openrouter' && activeModel !== 'ollama') {
            const orKey = await Promise.resolve(activeKeystore.getKey('openrouter')).catch(() => null);
            if (orKey) {
              aiRouter.setActiveModel('openrouter');
              const { updateActiveModel } = require('../database/queries');
              updateActiveModel(dbHandle, 'openrouter');
              console.log(`[main] No key for ${activeModel}, auto-switched to openrouter`);
            }
          }
        } catch (_) {}
      }, 2000);
    } catch (_) {}
  } catch (err) {
    console.error('[main] Module load error:', err.message);
    // App will still open but features dependent on native modules won't work
    // until VS Build Tools are installed and `npm install` re-run
  }
}

let mainWindow = null;
let scheduleNotifyInterval = null;
let cortexPeriodicInterval = null;

function createWindow() {
  nativeTheme.themeSource = 'dark';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,            // BUG-S7: preload only uses contextBridge + ipcRenderer
      webviewTag: true,
      devTools: !app.isPackaged, // DevTools only in dev, never in the installed app
    },
    icon: path.join(__dirname, '../../assets/icon.ico'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Pipe renderer errors to crash.log
  mainWindow.webContents.on('console-message', (_, level, message) => {
    if (level >= 2 || message.includes('Error') || message.includes('error')) {
      appLog(`[RENDERER-CONSOLE] ${message}`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    appLog(`[RENDERER CRASH] reason=${details.reason} exitCode=${details.exitCode}`);
    appLog(`[RENDERER CRASH] URL=${details.url || 'n/a'}`);
  });

  mainWindow.on('unresponsive', () => {
    appLog('[WINDOW] unresponsive — waiting 5s then reloading');
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    }, 5000);
  });

  mainWindow.on('responsive', () => {
    appLog('[WINDOW] responsive again');
  });

  mainWindow.on('closed', () => {
    appLog('[WINDOW] closed');
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', async () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    appLog('[WINDOW] shown (ready-to-show)');

    // ── Cortex startup sequence ──────────────────────────────────────────────
    try {
      const activityLogger = require('../modules/cortex/activity-logger');
      const { runDailyTraining } = require('../modules/cortex/daily-trainer');
      const { triggerGreeting } = require('../modules/ai/proactive-engine');
      const activeKeystore = keychain || portableConfig;

      // 1. Log the app open event
      if (dbHandle) activityLogger.log(dbHandle, 'app_open', 'app', {
        time: new Date().toTimeString().slice(0, 5)
      });

      // 2. Run daily training if needed (async, non-blocking)
      if (dbHandle && aiRouter && activeKeystore) {
        const activeModel = aiRouter.getActiveModel();
        const { getApiKey, isUsable } = require('../modules/ai/api-key');
        const apiKey = await getApiKey(activeKeystore, activeModel);
        if (isUsable(activeModel, apiKey)) runDailyTraining(dbHandle, aiRouter, apiKey, activeModel).catch(() => {});
      }

      // 3. Proactive greeting with full context
      if (dbHandle && aiRouter && activeKeystore && mainWindow && !mainWindow.isDestroyed()) {
        const result = await triggerGreeting(dbHandle, aiRouter, activeKeystore);
        if (result && result.text && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai:proactive', { text: result.text, buttons: result.buttons || [] });
        }
      }

      // 4. Pre-warm Ollama model if available (loads 14b into RAM before first real request)
      if (aiRouter) {
        const ollamaAvailable = await aiRouter.isOllamaAvailable();
        if (ollamaAvailable) {
          const ollamaModel = aiRouter.getOllamaModel();
          console.log(`[main] Pre-warming Ollama model: ${ollamaModel}`);
          // Fire-and-forget — don't await, just kick off the load
          aiRouter.send('hi', {}, {
            model: 'ollama',
            systemPrompt: 'You are a helpful assistant.',
            maxTokens: 5,
          }).catch(() => {}); // ignore errors — this is just a warm-up
        }
      }

      // Pre-warm the local embedding model (all-MiniLM-L6-v2) in the background.
      // This loads the 23MB quantised ONNX model into memory so the first
      // hybrid KB search is instant rather than waiting 2-3 seconds.
      try {
        const embEngine = require('../modules/blooms/embedding-engine');
        embEngine.preWarm();
      } catch (_) {}
    } catch(e) {
      console.error('[Cortex startup]', e.message);
    }
  });

  installNavigationGuards(mainWindow);

  if (process.argv.includes('--dev') && !app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ─── BUG-S7: navigation + webview guards ──────────────────────────────────────
// The main window only ever shows the local renderer. Webviews may only show
// the DIU portals, with no preload, no Node and a sandbox. New windows are
// never opened inside the app; https links go to the system browser.

const WEBVIEW_HOSTS = ['teacherportal.diu.edu.bd', 'elearn.daffodilvarsity.edu.bd'];

function isAllowedWebviewUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && WEBVIEW_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch (_) { return false; }
}

function openHttpsExternally({ url }) {
  if (/^https:\/\//i.test(url || '')) require('electron').shell.openExternal(url);
  return { action: 'deny' };
}

function installNavigationGuards(win) {
  const indexUrl = require('url').pathToFileURL(path.join(__dirname, '../renderer/index.html')).href;
  win.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== indexUrl) {
      event.preventDefault();
      appLog(`[GUARD] blocked main-window navigation to ${url}`);
    }
  });
  win.webContents.setWindowOpenHandler(openHttpsExternally);
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (app.isPackaged) webPreferences.devTools = false;
    if (!isAllowedWebviewUrl(params.src)) {
      event.preventDefault();
      appLog(`[GUARD] blocked webview for ${params.src}`);
    }
  });
}

// Inside a portal webview: https only (SSO redirects are allowed), no popups
app.on('web-contents-created', (_, contents) => {
  if (contents.getType?.() !== 'webview') return;
  contents.setWindowOpenHandler(openHttpsExternally);
  contents.on('will-navigate', (event, url) => {
    if (!/^https:\/\//i.test(url)) event.preventDefault();
  });
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

// BUG-S1/S3: load the per-install master key, then bring student rows and
// vault items under their HKDF subkeys (one transaction). Without the key,
// names show as tokens and student/vault writes are refused — nothing is
// ever written in plaintext.
async function initStudentCrypto() {
  if (!dbHandle || !keychain) return;
  // BUG-S2: the cloud-call redactor reads student identifiers from the live DB
  require('../modules/security/pii-guard').setDbSource(() => dbHandle);
  const res = await studentCrypto.loadKey(dbHandle, keychain);
  if (!res.ok) { appLog(`[student-crypto] ${res.error}`); return; }
  const { students, vault } = studentCrypto.migrateData(dbHandle);
  if (students.total !== students.alreadyEncrypted || students.unreadable) appLog(`[student-crypto] student rows: ${JSON.stringify(students)}`);
  if (vault.legacyKey || vault.masterKey || vault.plaintext || vault.unreadable) appLog(`[student-crypto] vault: ${JSON.stringify(vault)}`);
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.shad.facultymind');
  loadModules();
  try { await initStudentCrypto(); } catch (e) { appLog(`[student-crypto] ${e.stack || e}`); }
  createWindow();
  setupIpcHandlers();
  startScheduleNotifyLoop();
  startCortexPeriodicLoop();
  
  const { startEmailMonitor } = require('../modules/email/notifications');
  const activeKeystore = keychain || portableConfig;
  if(activeKeystore && aiRouter) startEmailMonitor(activeKeystore, aiRouter);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  if (scheduleNotifyInterval) clearInterval(scheduleNotifyInterval);
  if (cortexPeriodicInterval) clearInterval(cortexPeriodicInterval);
  
  try {
     const aiRouter = require('../modules/ai/model-router');
     const keychainModule = require('../modules/security/keychain');
     const { storeReflection } = require('../modules/memory/memory-manager');
     const activeModel = aiRouter.getActiveModel();
     const { getApiKey, isUsable } = require('../modules/ai/api-key');
     const apiKey = await getApiKey(keychain || portableConfig, activeModel);
     if (isUsable(activeModel, apiKey) && dbModule) {
         // Create daily synthesis
         const response = await aiRouter.send("Synthesize today's activity, interactions, and any newly established rules. What should you remember for tomorrow?", {}, { apiKey, model: activeModel, systemPrompt: "You are the AI concluding the day. Reflect and store lessons learned. Respond only with the raw text.", maxTokens: 300 });
         storeReflection(response.text);
     }
  } catch(e) { console.error("Reflection failed", e); }

  if (dbModule) try { dbModule.close(); } catch (_) {}
  // Terminate Tesseract OCR worker if it was used this session
  try { const { terminateWorker } = require('../modules/blooms/ocr-engine'); await terminateWorker(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});

// ─── Schedule notification loop ───────────────────────────────────────────────

function startScheduleNotifyLoop() {
  // Check every minute for upcoming classes (30-min lead time)
  scheduleNotifyInterval = setInterval(() => {
    if (!scheduleManager || !dbHandle) return;
    try {
      const upcoming = scheduleManager.getUpcomingClasses(dbHandle, 30);
      upcoming.forEach(cls => {
        if (!cls.notified) {
          new Notification({
            title: '📚 FacultyMind — Class in 30 minutes',
            body: `${cls.course_code} | ${cls.room || 'Room TBD'} | ${cls.start_time}`,
            icon: path.join(__dirname, '../../assets/icon.ico'),
          }).show();
          scheduleManager.markNotified(dbHandle, cls.id);
        }
      });
    } catch (err) {
      console.error('[notify loop]', err.message);
    }
  }, 60 * 1000);
}

// ─── Cortex Periodic Ambient Intelligence Loop ────────────────────────────────

function startCortexPeriodicLoop() {
  // Tick every 5 minutes. Inside we check if enough time has passed for each trigger type.
  cortexPeriodicInterval = setInterval(async () => {
    if (!dbHandle || !aiRouter || !mainWindow) return;
    const activeKeystore = keychain || portableConfig;
    if (!activeKeystore) return;

    try {
      const { triggerPostClass, triggerPreClass, triggerPeriodic } = require('../modules/ai/proactive-engine');
      const { getClassStatusPublic } = require('../modules/cortex/context-builder');
      const activityLogger = require('../modules/cortex/activity-logger');

      const { upcoming, justEnded } = getClassStatusPublic(dbHandle);

      // Post-class trigger
      if (justEnded) {
        const result = await triggerPostClass(dbHandle, aiRouter, activeKeystore, justEnded);
        if (result && result.text) {
          mainWindow.webContents.send('ai:proactive', { text: result.text, buttons: result.buttons || [] });
          activityLogger.log(dbHandle, 'proactive_fired', 'cortex', { trigger: 'post_class', course: justEnded.course_code });
        }
        return; // Don't stack with other triggers on same tick
      }

      // Pre-class trigger (within 10 min)
      if (upcoming) {
        const [sh, sm] = upcoming.start_time.split(':').map(Number);
        const now = new Date();
        const startMs = sh * 60 + sm;
        const nowMs   = now.getHours() * 60 + now.getMinutes();
        const minutesUntil = startMs - nowMs;

        if (minutesUntil <= 10 && minutesUntil > 0) {
          const result = await triggerPreClass(dbHandle, aiRouter, activeKeystore, { ...upcoming, minutesUntil });
          if (result && result.text) {
            mainWindow.webContents.send('ai:proactive', { text: result.text, buttons: result.buttons || [] });
            activityLogger.log(dbHandle, 'proactive_fired', 'cortex', { trigger: 'pre_class', course: upcoming.course_code });
          }
          return;
        }
      }

      // Periodic ambient check-in
      const result = await triggerPeriodic(dbHandle, aiRouter, activeKeystore);
      if (result && result.text) {
        mainWindow.webContents.send('ai:proactive', { text: result.text, buttons: result.buttons || [] });
        activityLogger.log(dbHandle, 'proactive_fired', 'cortex', { trigger: 'periodic' });
      }

    } catch (err) {
      // Never let cortex crash the main loop
      console.error('[Cortex periodic]', err.message);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// BUG-S6: while the app is locked, the main process refuses every invoke
// channel except the few the lock screen needs. Secure by default: a new
// handler is locked unless it is added here. Before a PIN exists (first
// launch / onboarding) there is nothing to lock.
const LOCK_EXEMPT_CHANNELS = new Set([
  'auth:is-first-launch', 'auth:setup-pin', 'auth:verify-pin', 'auth:session', 'auth:reset-session-timer',
  'settings:get', 'ai:get-active-model', 'ai:check-ollama',
]);

function isLocked() {
  if (!auth || auth.isSessionActive()) return false;
  try { return !!dbHandle && !auth.isFirstLaunch(dbHandle); } catch (_) { return true; }
}

function guardIpcWhileLocked() {
  if (ipcMain.__lockGuarded) return;
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, fn) => handle(channel, (event, ...args) => {
    if (!LOCK_EXEMPT_CHANNELS.has(channel) && isLocked()) {
      return { ok: false, locked: true, error: 'FacultyMind is locked. Enter your PIN to continue.' };
    }
    return fn(event, ...args);
  });
  ipcMain.__lockGuarded = true;
}

function setupIpcHandlers() {
  guardIpcWhileLocked();

  // Window controls (custom titlebar)
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window:close', () => mainWindow?.close());

  // ── Auth ──────────────────────────────────────────────────────────────────

  ipcMain.handle('auth:is-first-launch', () => {
    if (!dbHandle) { appLog('[AUTH] isFirstLaunch: dbHandle is null — returning true'); return true; }
    try {
      const result = auth.isFirstLaunch(dbHandle);
      appLog(`[AUTH] isFirstLaunch: ${result}`);
      return result;
    }
    catch (e) { appLog(`[AUTH] isFirstLaunch ERROR: ${e.message} — returning true`); return true; }
  });

  // BUG-A3: a PIN can be created freely only on first launch; changing it
  // needs the current PIN.
  ipcMain.handle('auth:setup-pin', async (_, pin, currentPin) => {
    if (!dbHandle) return { ok: false, error: 'Database not available' };
    try {
      const first = auth.isFirstLaunch(dbHandle);
      if (!first && !(currentPin && auth.verifyPin(dbHandle, String(currentPin)))) {
        appLog('[AUTH] PIN change refused: current PIN missing or wrong');
        return { ok: false, error: 'Current PIN is incorrect' };
      }
      auth.setupPin(dbHandle, pin);
      appLog('[AUTH] PIN setup successful');
      // The person creating the first PIN is the owner: onboarding continues unlocked
      if (first) auth.startSession(dbHandle);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('auth:verify-pin', async (_, pin) => {
    if (!dbHandle) { appLog('[AUTH] verifyPin: dbHandle is null'); return { ok: false, error: 'Database not available' }; }
    try {
      const valid = auth.verifyPin(dbHandle, pin);
      appLog(`[AUTH] verifyPin: ${valid ? 'SUCCESS' : 'FAILED'}`);
      if (valid) {
        auth.startSession(dbHandle);
        appLog('[AUTH] session started after PIN verify');
      }
      return { ok: valid };
    } catch (e) { appLog(`[AUTH] verifyPin ERROR: ${e.message}`); return { ok: false, error: e.message }; }
  });

  ipcMain.handle('auth:session', () => {
    if (!auth) { appLog('[AUTH] session check: auth module not loaded'); return { active: false }; }
    try {
      const active = auth.isSessionActive();
      return { active };
    }
    catch (e) { appLog(`[AUTH] session check ERROR: ${e.message}`); return { active: false }; }
  });

  ipcMain.on('auth:reset-session-timer', () => {
    if (auth) try { auth.resetTimer(); } catch (_) {}
  });

  // ── API Keys ──────────────────────────────────────────────────────────────

  // BUG-S5: the renderer may only touch API-key slots, never the student data
  // master key or OAuth tokens, and never reads a secret back.
  const RENDERER_KEY_SERVICES = new Set(['claude', 'anthropic', 'openai', 'gpt4o', 'gemini', 'openrouter', 'google_client_id', 'google_client_secret']);

  ipcMain.handle('keys:save', async (_, { service, key }) => {
    if (!RENDERER_KEY_SERVICES.has(service)) return { ok: false, error: `Unknown key "${service}"` };
    try {
      if (keychain) await keychain.setKey(service, key);
      else if (portableConfig) portableConfig.setKey(service, key);
      else return { ok: false, error: 'No keystore available' };
      if (dbHandle) {
        const { saveKeyRef } = require('../database/queries');
        saveKeyRef(dbHandle, service);
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Returns only whether a key is set — the secret stays in the main process
  ipcMain.handle('keys:get', async (_, service) => {
    if (!RENDERER_KEY_SERVICES.has(service)) return { ok: false, set: false, error: `Unknown key "${service}"` };
    try {
      let key = null;
      if (keychain) key = await keychain.getKey(service);
      else if (portableConfig) key = portableConfig.getKey(service);
      return { ok: true, set: !!key };
    } catch (e) { return { ok: false, set: false, error: e.message }; }
  });

  ipcMain.handle('keys:check-all', async () => {
    const services = ['claude', 'openai', 'gemini', 'openrouter'];
    const result = {};
    for (const s of services) {
      try {
        let key = null;
        if (keychain) key = await keychain.getKey(s);
        else if (portableConfig) key = portableConfig.getKey(s);
        result[s] = !!key;
      } catch (_) { result[s] = false; }
    }
    return result;
  });

  // ── AI ────────────────────────────────────────────────────────────────────

  ipcMain.handle('ai:send', async (_, { message, context, options }) => {
    if (!aiRouter) return { ok: false, error: 'AI router not loaded' };
    try {
      const activeModel = options?.model || aiRouter.getActiveModel();
      let apiKey = null;

      // Ollama runs locally — no API key needed
      if (activeModel !== 'ollama') {
        apiKey = await require('../modules/ai/api-key').getApiKey(keychain || portableConfig, activeModel);
        if (!apiKey) return { ok: false, error: `No API key set for ${activeModel}. Go to Settings to add your key.` };
      }

      // Build full options — including conversation history
      const fullOpts = { apiKey, model: activeModel, ...options };

      // Vision fast-path: skip intent classifier, send directly to AI model with image+history
      if (options?.imageBase64) {
        const resp = await aiRouter.send(message, context || {}, fullOpts);
        return { ok: true, text: resp.text, intent: 'GENERAL_CHAT', data: null };
      }

      // If history is present, this is a multi-turn chat — skip intent classification
      // and go straight to general AI chat to preserve context
      if (options?.history && options.history.length > 0) {
        const resp = await aiRouter.send(message, context || {}, fullOpts);
        return { ok: true, text: resp.text, intent: 'GENERAL_CHAT', data: null };
      }

      // Step 1: Classify intent (first message, no history)
      const intent = await aiRouter.classifyIntent(message, { apiKey, model: activeModel });

      // Step 2: Route to correct module handler
      const deps = { db: dbHandle, aiRouter, moduleRouter, apiKey, activeModel };
      const result = moduleRouter
        ? await moduleRouter.route(intent, deps)
        : await aiRouter.send(message, context || {}, fullOpts);

      // Step 3: If model_switch detected in response data, apply it
      if (result.data?.action === 'model_switch' && result.data.model) {
        aiRouter.setActiveModel(result.data.model);
      }

      // Step 4: Post-response micro-learning — record what the faculty asked about
      try {
        const { learnFact } = require('../modules/memory/memory-manager');
        const topic = intent.intent === 'SCHEDULE_QUERY'  ? 'schedule_habits'
                    : intent.intent === 'SHADSYNC_QUERY'  ? 'student_patterns'
                    : intent.intent === 'EMAIL_DRAFT'     ? 'email_habits'
                    : intent.intent === 'EMAIL_RULE'      ? 'email_habits'
                    : intent.intent === 'REMINDER_SET'    ? 'workload'
                    : 'general';
        if (topic !== 'general' && dbHandle) {
          const hour = new Date().getHours();
          const timeLabel = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
          learnFact(topic, `Faculty queried ${intent.intent} in the ${timeLabel} (${new Date().toLocaleDateString('en-BD',{weekday:'long'})})`, 'post_response', 0.55);
        }
      } catch (_) {}

      return { ok: true, text: result.text, intent: intent.intent, data: result.data || null };
    } catch (e) { return { ok: false, error: e.message, code: e.code }; }
  });

  ipcMain.handle('ai:model-switch', async (_, model) => {
    if (!aiRouter) return { ok: false, error: 'AI router not loaded' };
    try {
      aiRouter.setActiveModel(model);
      if (dbHandle) {
        const { updateActiveModel } = require('../database/queries');
        updateActiveModel(dbHandle, model);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:model-changed', model);
      }
      return { ok: true, model };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('ai:set-openrouter-model', (_, modelId) => {
    if (!aiRouter) return { ok: false };
    try {
      aiRouter.setOpenRouterModel(modelId);
      if (dbHandle) dbHandle.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('openrouter_model', ?)`).run(modelId);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('ai:get-openrouter-model', () => {
    try {
      if (dbHandle) {
        const row = dbHandle.prepare(`SELECT value FROM settings WHERE key = 'openrouter_model'`).get();
        if (row) { aiRouter?.setOpenRouterModel(row.value); return row.value; }
      }
      return aiRouter?.getOpenRouterModel() || 'openai/gpt-4o-mini';
    } catch (_) { return 'openai/gpt-4o-mini'; }
  });

  ipcMain.handle('ai:set-ollama-model', (_, modelId) => {
    if (!aiRouter) return { ok: false };
    try {
      aiRouter.setOllamaModel(modelId);
      if (dbHandle) dbHandle.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('ollama_model', ?)`).run(modelId);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('ai:get-ollama-model', () => {
    try {
      if (dbHandle) {
        const row = dbHandle.prepare(`SELECT value FROM settings WHERE key = 'ollama_model'`).get();
        if (row && aiRouter) aiRouter.setOllamaModel(row.value);
        return row?.value || 'gemma4:e2b';
      }
      return aiRouter?.getOllamaModel() || 'gemma4:e2b';
    } catch (_) { return 'gemma4:e2b'; }
  });

  ipcMain.handle('ai:check-ollama', async () => {
    if (!aiRouter) return { available: false };
    try {
      const available = await aiRouter.isOllamaAvailable();
      return { available };
    } catch (_) { return { available: false }; }
  });

  ipcMain.handle('ai:get-active-model', () => {
    if (!aiRouter) return 'claude';
    return aiRouter.getActiveModel();
  });

  ipcMain.handle('ai:smart-route', async (_, buffer, mimeType, fileName) => {
    if (!aiRouter) return { ok: false, error: 'AI router not loaded' };
    try {
      // Pass the buffer and mime type to module-router to handle text extraction and routing
      const result = await aiRouter.smartClassifyDocument(buffer, mimeType, fileName, dbHandle, keychain || portableConfig);
      
      // If it's a specific route, tell the frontend to navigate
      if (result && result.category) {
        if (result.category === 'SYLLABUS') {
          mainWindow.webContents.send('ai:navigate', 'shadsync');
        } else if (result.category === 'EXAM_QUESTIONS' || result.category === 'SCHEDULE_PLAN') {
          mainWindow.webContents.send('ai:navigate', 'blooms');
        } else {
          // GENERAL or unknown
          mainWindow.webContents.send('ai:navigate', 'chat');
        }
      }
      return { ok: true, ...result };
    } catch (e) { 
      return { ok: false, error: e.message }; 
    }
  });

  // ── Email Intel ───────────────────────────────────────────────────────────
  
  ipcMain.handle('email:authenticate', async () => {
    try {
      const emailBackend = require('../modules/email/email-backend');
      const activeKeystore = keychain || portableConfig;
      if (!activeKeystore) throw new Error("No keystore available.");
      const success = await emailBackend.authenticate(activeKeystore);
      if (success) {
        // Activate background polling now without needing a restart
        const { setConnected } = require('../modules/email/notifications');
        setConnected(activeKeystore, aiRouter);
      }
      return { ok: success };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('email:refresh', async () => {
    try {
      const { syncEmails } = require('../modules/email/notifications');
      await syncEmails();
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('email:profile', async () => {
    try {
      const emailBackend = require('../modules/email/email-backend');
      const activeKeystore = keychain || portableConfig;
      if (!activeKeystore) return { ok: false };
      const profile = await emailBackend.fetchProfile(activeKeystore);
      return { ok: !!profile, profile };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('email:fetch', async () => {
    try {
      const emailBackend = require('../modules/email/email-backend');
      const { classifyBatch } = require('../modules/email/email-classifier');
      const activeKeystore = keychain || portableConfig;
      if (!activeKeystore) throw new Error("No keystore available.");
      
      let emails = await emailBackend.fetchEmails(activeKeystore);
      
      // Perform AI categorization on the fetched batch
      if (aiRouter && emails.length > 0) {
        const activeModel = aiRouter.getActiveModel();
        const { getApiKey, isUsable } = require('../modules/ai/api-key');
        const apiKey = await getApiKey(activeKeystore, activeModel);
        if (isUsable(activeModel, apiKey)) {
           emails = await classifyBatch(aiRouter, emails, apiKey, activeModel);
        }
      }
      
      return { ok: true, data: emails };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('email:signout', async () => {
    try {
      const emailBackend = require('../modules/email/email-backend');
      const activeKeystore = keychain || portableConfig;
      if (!activeKeystore) return { ok: false };
      await emailBackend.signOut(activeKeystore);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── ShadSync ──────────────────────────────────────────────────────────────

  // Helper: resolve course code (case-insensitive) → course row
  function resolveCourse(courseCode) {
    const q = require('../database/queries');
    const courses = q.getAllCourses(dbHandle);
    return courses.find(cc => cc.code.toLowerCase() === String(courseCode).toLowerCase()) || null;
  }

  ipcMain.handle('shadsync:data', (_, courseCode) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const c = resolveCourse(courseCode);
      if(!c) return { ok: false, error: 'Course not found' };
      const shadsyncQueries = require('../modules/shadsync/shadsync-queries');
      const data = shadsyncQueries.getCourseData(dbHandle, c.id);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('shadsync:attainment', (_, courseCode) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const c = resolveCourse(courseCode);
      if(!c) return { ok: false, error: 'Course not found' };
      const shadsyncEngine = require('../modules/shadsync/shadsync-engine');
      const attainment = shadsyncEngine.calculateCourseAttainment(dbHandle, c.id);
      return { ok: true, data: attainment };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ['saveStudent', 'saveMarks', 'saveAttendance', 'saveClo', 'saveCo', 'savePo'].forEach(method => {
    ipcMain.handle(`shadsync:${method}`, (_, payload) => {
      if (!dbHandle) return { ok: false, error: 'Database unavailable' };
      try {
        // Resolve course code string → numeric course ID for all mutation payloads
        if (payload.courseId && typeof payload.courseId === 'string' && isNaN(Number(payload.courseId))) {
          const c = resolveCourse(payload.courseId);
          if (!c) return { ok: false, error: `Course not found: ${payload.courseId}` };
          payload = { ...payload, courseId: c.id };
        }
        const shadsyncQueries = require('../modules/shadsync/shadsync-queries');
        const id = shadsyncQueries[method](dbHandle, payload);
        return { ok: true, id };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  });

  // Marks sheet (.xls/.xlsx) -> ShadSync. dryRun:true only parses and returns counts (no names/IDs, nothing written).
  ipcMain.handle('shadsync:import-marks-sheet', (_, { data, fileName, courseCode, dryRun } = {}) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      if (!data || !/\.(xls|xlsx)$/i.test(String(fileName || ''))) return { ok: false, error: 'Choose an .xls or .xlsx marks sheet.' };
      const buf = Buffer.from(data);
      if (buf.length > 20 * 1024 * 1024) return { ok: false, error: 'The file is larger than 20 MB.' };
      const importer = require('../modules/shadsync/marks-importer');
      const parsed = importer.parseMarksSheet(buf);
      if (dryRun) {
        const preview = importer.previewMarksSheet(parsed);
        const code = String(courseCode || parsed.course.code || '').trim();
        const existing = code ? resolveCourse(code) : null;
        preview.existing = existing ? {
          students: dbHandle.prepare('SELECT COUNT(*) n FROM students WHERE course_id=?').get(existing.id).n,
          columns: dbHandle.prepare('SELECT COUNT(*) n FROM assessment_columns WHERE course_id=?').get(existing.id).n,
        } : null;
        return { ok: true, preview };
      }
      return { ok: true, result: importer.importMarksSheet(dbHandle, parsed, { courseCode }) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // BAETE PDF Export
  ipcMain.handle('shadsync:export-pdf', async (event, htmlContent) => {
    try {
      const { BrowserWindow } = require('electron');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      
      const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });
      
      const outPath = path.join(os.homedir(), 'Desktop', `BAETE_Report_${Date.now()}.pdf`);
      fs.writeFileSync(outPath, pdfBuffer);
      win.close();
      return { ok: true, path: outPath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Vault Integration (Stashboard) ────────────────────────────────────────
  ipcMain.handle('vault:get', async () => {
     if (!dbHandle) return { ok: false };
     try {
       const items = dbHandle.prepare("SELECT * FROM vault_items").all();
       return { ok: true, data: items };
     } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('vault:save', async (_, record) => {
     if (!dbHandle) return { ok: false };
     try {
       const contentEnc = record.content  ? studentCrypto.vaultEncrypt(record.content)  : '';
       const userEnc    = record.username ? studentCrypto.vaultEncrypt(record.username) : '';
       const passEnc    = record.password ? studentCrypto.vaultEncrypt(record.password) : '';
       
       dbHandle.prepare(`
         INSERT INTO vault_items (title, type, content_enc, username_enc, password_enc, url, is_favorite)
         VALUES (?, ?, ?, ?, ?, ?, ?)
       `).run(record.title, record.type, contentEnc, userEnc, passEnc, record.url || '', record.favorite ? 1 : 0);
       return { ok: true };
     } catch(e) { return { ok: false, error: e.message }; }
  });
  
  ipcMain.handle('vault:decrypt', async (_, contentEnc) => {
     try {
        const dec = studentCrypto.vaultDecrypt(contentEnc);
        return { ok: true, data: dec };
     } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('vault:delete', async (_, id) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      dbHandle.prepare('DELETE FROM vault_items WHERE id = ?').run(id);
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('vault:favorite', async (_, { id, isFavorite }) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      dbHandle.prepare('UPDATE vault_items SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, id);
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('vault:get-path', async () => {
    try {
      const dbPath = dbModule ? dbModule.getDbPath() : app.getPath('userData') + '/facultymind.db';
      return { ok: true, path: dbPath };
    } catch(e) { return { ok: false, path: app.getPath('userData') + '/facultymind.db' }; }
  });

  ipcMain.handle('vault:change-path', async () => {
    try {
      const { dialog } = require('electron');
      const fs = require('fs');
      const currentPath = dbModule ? dbModule.getDbPath() : null;

      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose Vault Folder',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Move Vault Here'
      });

      if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };

      const folder   = result.filePaths[0];
      const newPath  = require('path').join(folder, 'facultymind.db');

      // Copy current DB to new location (backup API includes WAL contents — BUG-B5)
      if (dbHandle) {
        await dbHandle.backup(newPath);
      } else if (currentPath && fs.existsSync(currentPath)) {
        fs.copyFileSync(currentPath, newPath);
      }

      // Save preference so next launch uses new path
      dbModule.saveCustomDbPath(newPath);

      return { ok: true, path: newPath };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('vault:reset-path', async () => {
    try {
      dbModule.clearCustomDbPath();
      return { ok: true };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // ── DIU Teachers Portal ───────────────────────────────────────────────────

  ipcMain.handle('diu:courses', () => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const courses = dbHandle.prepare('SELECT * FROM courses ORDER BY id').all();
      return { ok: true, courses };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('diu:students', (_, courseId) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const rows = dbHandle.prepare(`
        SELECT s.id, s.name_anon, s.name_enc, s.student_id_anon, s.student_id_enc,
          dm.attendance, dm.ct1, dm.ct2, dm.ct3, dm.presentation, dm.assignment, dm.midterm, dm.final_exam
        FROM students s
        LEFT JOIN diu_marks dm ON dm.student_id = s.id AND dm.course_id = ?
        WHERE s.course_id = ?
        ORDER BY s.id
      `).all(courseId, courseId);
      const students = rows.map(s => ({
        id:         s.id,
        name:       studentCrypto.reveal(s.name_enc, s.name_anon),
        studentId:  studentCrypto.reveal(s.student_id_enc, s.student_id_anon),
        attendance:   s.attendance  ?? 0,
        ct1:          s.ct1         ?? 0,
        ct2:          s.ct2         ?? 0,
        ct3:          s.ct3         ?? 0,
        presentation: s.presentation ?? 0,
        assignment:   s.assignment  ?? 0,
        midterm:      s.midterm     ?? 0,
        finalExam:    s.final_exam  ?? 0,
      }));
      return { ok: true, students };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('diu:saveMarks', (_, { courseId, marks }) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const upsertDiu = dbHandle.prepare(`
        INSERT INTO diu_marks (student_id, course_id, attendance, ct1, ct2, ct3, presentation, assignment, midterm, final_exam)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(student_id, course_id) DO UPDATE SET
          attendance=excluded.attendance, ct1=excluded.ct1, ct2=excluded.ct2, ct3=excluded.ct3,
          presentation=excluded.presentation, assignment=excluded.assignment,
          midterm=excluded.midterm, final_exam=excluded.final_exam
      `);
      const getMark = dbHandle.prepare('SELECT id FROM marks WHERE student_id = ? AND course_id = ?');
      const updMark = dbHandle.prepare('UPDATE marks SET q1=?,q2=?,midterm=?,final=?,assignment=?,lab=? WHERE id=?');
      const insMark = dbHandle.prepare('INSERT INTO marks (student_id,course_id,q1,q2,midterm,final,assignment,lab) VALUES (?,?,?,?,?,?,?,?)');

      const run = dbHandle.transaction(() => {
        for (const m of marks) {
          upsertDiu.run(m.studentId, courseId, m.attendance, m.ct1, m.ct2, m.ct3, m.presentation, m.assignment, m.midterm, m.finalExam);
          // Scale back to ShadSync marks format
          const q1   = Math.min(10, Math.round((m.ct1 / 1.5) * 10) / 10);
          const q2   = Math.min(10, Math.round((m.ct2 / 1.5) * 10) / 10);
          const lab  = Math.min(10, Math.round((m.ct3 / 1.5) * 10) / 10);
          const mid  = Math.min(20, Math.round((m.midterm / 1.25) * 10) / 10);
          const asgn = Math.min(10, Math.round(m.assignment * 2 * 10) / 10);
          const existing = getMark.get(m.studentId, courseId);
          if (existing) {
            updMark.run(q1, q2, mid, m.finalExam, asgn, lab, existing.id);
          } else {
            insMark.run(m.studentId, courseId, q1, q2, mid, m.finalExam, asgn, lab);
          }
        }
      });
      run();
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('diu:saveCourse', (_, course) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const r = dbHandle.prepare(
        'INSERT INTO courses (code, name, section, semester, year) VALUES (?, ?, ?, ?, ?)'
      ).run(course.code.toUpperCase(), course.name, course.section || 'A', course.semester || 'Spring 2026', course.year || new Date().getFullYear());
      return { ok: true, id: r.lastInsertRowid };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('diu:attendance', (_, courseId) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const students = dbHandle.prepare(`
        SELECT s.id, s.name_enc, s.name_anon, s.student_id_enc, s.student_id_anon,
          COUNT(CASE WHEN a.present=1 THEN 1 END) AS days_present,
          COUNT(a.id) AS total_days
        FROM students s
        LEFT JOIN attendance a ON a.student_id=s.id AND a.course_id=?
        WHERE s.course_id=?
        GROUP BY s.id ORDER BY s.id
      `).all(courseId, courseId).map(s => ({
        id:          s.id,
        name:        studentCrypto.reveal(s.name_enc, s.name_anon),
        studentId:   studentCrypto.reveal(s.student_id_enc, s.student_id_anon),
        daysPresent: s.days_present || 0,
        totalDays:   s.total_days   || 0,
      }));
      const dates = dbHandle.prepare(
        'SELECT DISTINCT date FROM attendance WHERE course_id=? ORDER BY date'
      ).all(courseId).map(d => d.date);
      return { ok: true, students, dates };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('diu:saveAttendance', (_, { courseId, date, records }) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      // BUG-D1: the delete is inside the transaction, so a failed insert keeps the old day
      const del = dbHandle.prepare('DELETE FROM attendance WHERE course_id=? AND date=?');
      const ins = dbHandle.prepare('INSERT INTO attendance (student_id,course_id,date,present) VALUES (?,?,?,?)');
      const run = dbHandle.transaction(() => {
        del.run(courseId, date);
        for (const r of records) ins.run(r.studentId, courseId, date, r.present ? 1 : 0);
      });
      run();
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('auth:verify-active-pin', async (_, pin) => {
    if (!dbHandle) return { ok: false };
    try {
      const auth = require('../modules/security/auth');
      const ok = auth.verifyPin(dbHandle, pin); // For session unlock, same as verify-pin for now
      return { ok };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Blooms Engine ─────────────────────────────────────────────────────────

  ipcMain.handle('blooms:generate', async (_, { pdfBuffer, courseCode, mimeType }) => {
    try {
      const activeModel = aiRouter ? aiRouter.getActiveModel() : 'claude';
      let gApiKey = null;

      // Ollama runs locally — no API key needed
      if (activeModel !== 'ollama') {
        // B8: only the active provider's own key — never another provider's
        gApiKey = await require('../modules/ai/api-key').getApiKey(keychain || portableConfig, activeModel);
        if (!gApiKey) return { ok: false, error: 'No API key available. Set one in Settings.' };
      }

      const bloomsEngine = require('../modules/blooms/blooms-engine');

      // Forward OCR page-render progress to the renderer window
      const onProgress = (page, total) => {
        mainWindow?.webContents.send('blooms:ocr-progress', { page, total });
      };

      // FIX 2: Fetch OpenRouter key for preferred cloud routing
      let openrouterApiKey = null;
      try {
        const activeKeystore = keychain || portableConfig;
        if (activeKeystore) {
          openrouterApiKey = await Promise.resolve(activeKeystore.getKey('openrouter'));
        }
      } catch (_) {}

      const plan = await bloomsEngine.processPdfCourseMaterial(
        Buffer.from(pdfBuffer),
        courseCode,
        dbHandle,
        gApiKey,
        aiRouter ? aiRouter.getActiveModel() : 'claude',
        mimeType || 'application/pdf',
        onProgress,
        openrouterApiKey
      );

      return { ok: true, plan };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Blooms CLO Mapper ─────────────────────────────────────────────────────

  ipcMain.handle('blooms:map-clos', async (_, { text, buffer, mimeType, courseCode }) => {
    try {
      const bloomsEngine = require('../modules/blooms/blooms-engine');
      let cloText = text || '';

      // Progress helper — sends step updates to the renderer
      const sendStep = (step, detail = '') => {
        mainWindow?.webContents.send('blooms:clo-progress', { step, detail });
      };

      // If a file buffer was provided, use the async document dropper pipeline.
      // This handles multi-page PDFs/DOCX by stripping noise, chunking by
      // section headers, and parsing questions without blocking the renderer.
      if (buffer && mimeType) {
        const dropper = require('../modules/blooms/document-dropper');
        const onProgress = (step, detail) => {
          mainWindow?.webContents.send('blooms:ocr-progress', { step, detail });
          sendStep(step, detail);
        };

        try {
          // ingestAndMap runs the full pipeline: extract → clean → chunk → map
          // Returns the same result shape as mapCLOsToBlooms so the renderer
          // doesn't need any changes.
          const dropperResult = await dropper.ingestAndMap(
            Buffer.from(buffer), mimeType, courseCode || 'ICE301', dbHandle, onProgress
          );
          sendStep('done', 'Analysis complete');
          return { ok: true, result: dropperResult };
        } catch (dropperErr) {
          // If the dropper fails, fall back to the original single-pass extractor
          console.warn('[blooms:map-clos] Document dropper failed, falling back:', dropperErr.message);
          sendStep('ocr', 'Extracting text from document…');
          const onOcrProgress = (page, total) => {
            mainWindow?.webContents.send('blooms:ocr-progress', { page, total });
            sendStep('ocr', `OCR: page ${page} of ${total}`);
          };
          cloText = await bloomsEngine.extractText(Buffer.from(buffer), mimeType, onOcrProgress);
          sendStep('ocr_done', `Text extracted (${cloText.length} chars)`);
        }
      }

      if (!cloText || cloText.trim().length < 10) {
        return { ok: false, error: 'No CLO text provided. Upload a document or paste CLO text.' };
      }

      // Resolve API key — Ollama runs locally, no key needed
      let apiKey = null;
      const activeModel = aiRouter ? aiRouter.getActiveModel() : 'claude';
      if (activeModel !== 'ollama') {
        // B8: only the active provider's own key — never another provider's
        apiKey = await require('../modules/ai/api-key').getApiKey(keychain || portableConfig, activeModel);
      }

      // Always try to fetch the OpenRouter key separately — even when active
      // model is Ollama or Claude. The CLO Mapper prefers OpenRouter when
      // available because it's 50-100x faster than Ollama on CPU and far more
      // accurate. Falls back to whatever active model can provide.
      let openrouterApiKey = null;
      try {
        const activeKeystore = keychain || portableConfig;
        if (activeKeystore) {
          openrouterApiKey = await Promise.resolve(activeKeystore.getKey('openrouter'));
        }
      } catch (_) {}

      // Need at least one usable path: active-model key, OpenRouter key, or Ollama
      if (!apiKey && !openrouterApiKey && activeModel !== 'ollama') {
        return { ok: false, error: 'No API key available. Set one in Settings (OpenRouter recommended for fast CLO mapping).' };
      }

      const result = await bloomsEngine.mapCLOsToBlooms(
        cloText,
        courseCode || 'ICE301',
        dbHandle,
        apiKey,
        activeModel,
        sendStep,            // ← pass progress callback to engine
        openrouterApiKey     // ← OpenRouter preferred for speed + accuracy
      );

      sendStep('done', 'Analysis complete');
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Syllabus Mapper ───────────────────────────────────────────────────────

  ipcMain.handle('blooms:analyze-syllabus', async (_, { buffer, mimeType }) => {
    try {
      const syllabusMapper = require('../modules/blooms/syllabus-mapper');

      const sendStep = (step, detail = '') => {
        mainWindow?.webContents.send('blooms:syllabus-progress', { step, detail });
      };

      // Fetch OpenRouter key for cloud fallback (optional)
      let openrouterApiKey = null;
      try {
        const activeKeystore = keychain || portableConfig;
        if (activeKeystore) {
          openrouterApiKey = await Promise.resolve(activeKeystore.getKey('openrouter'));
        }
      } catch (_) {}

      const result = await syllabusMapper.analyzeSyllabus(
        Buffer.from(buffer), mimeType, sendStep, openrouterApiKey
      );
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Manual syllabus analysis — professor pastes CO and weekly text directly
  ipcMain.handle('blooms:analyze-syllabus-manual', async (_, { cosText, weeksText }) => {
    try {
      const syllabusMapper = require('../modules/blooms/syllabus-mapper');
      const result = await syllabusMapper.analyzeManualInput(cosText, weeksText);
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Blooms CLO Mapping — PDF export ───────────────────────────────────────

  ipcMain.handle('blooms:export-pdf', async (_, htmlContent) => {
    try {
      const { BrowserWindow } = require('electron');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      const win = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });

      // Determine the filename based on the report type
      let filename;
      if (/Syllabus\s+Alignment\s+Report/i.test(htmlContent)) {
        filename = 'Syllabus_Alignment_Report';
      } else {
        // CLO Mapping — try to pull the course code from the HTML
        let courseCode = 'Course';
        const m = /CLO[^<]*?for\s+([A-Z0-9\-]+)/i.exec(htmlContent);
        if (m && m[1]) courseCode = m[1];
        filename = `CLO_Mapping_${courseCode}`;
      }

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const outPath = path.join(os.homedir(), 'Desktop', `${filename}_${ts}.pdf`);
      fs.writeFileSync(outPath, pdfBuffer);
      win.close();
      return { ok: true, path: outPath };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── CLO Knowledge Base ────────────────────────────────────────────────────

  ipcMain.handle('clo-kb:import-images', async (_, { imageBuffers, mimeTypes, courseCode }) => {
    try {
      const { recognizeImageBuffer } = require('../modules/blooms/ocr-engine');
      const activeModel = aiRouter ? aiRouter.getActiveModel() : 'claude';
      let apiKey = null;
      if (activeModel !== 'ollama') {
        apiKey = await require('../modules/ai/api-key').getApiKey(keychain || portableConfig, activeModel);
      }
      const { bloomsCloParserPrompt } = require('../prompts/templates/blooms-clo-parser');
      const total = imageBuffers.length;
      const results = new Array(total);
      let completed = 0;

      // Process one image: OCR → AI parse
      async function processOne(i) {
        try {
          const ocrText = await recognizeImageBuffer(Buffer.from(imageBuffers[i]), () => {});
          if (!ocrText || ocrText.trim().length < 10) {
            results[i] = { ok: false, error: 'No text extracted', index: i };
          } else {
            const prompt = bloomsCloParserPrompt(ocrText, courseCode);
            const resp = await aiRouter.send(prompt.user, {}, {
              apiKey, model: activeModel, systemPrompt: prompt.system,
              isJson: true, maxTokens: 1000, preferLocal: true,
            });
            const parsed = JSON.parse(resp.text);
            const qCount = (parsed.parsed_questions || []).length;
            results[i] = { ok: true, parsed, ocrText, index: i };
            completed++;
            // Send live progress to renderer
            mainWindow?.webContents.send('clo-kb:progress', {
              current: completed, total,
              index: i, questionsFound: qCount,
            });
          }
        } catch (e) {
          results[i] = { ok: false, error: e.message, index: i };
        }
        // Always send progress even on failure
        mainWindow?.webContents.send('clo-kb:progress', {
          current: completed, total, index: i,
          questionsFound: results[i]?.ok ? (results[i].parsed?.parsed_questions?.length || 0) : 0,
          error: results[i]?.ok ? null : results[i]?.error,
        });
      }

      // Process in batches of 1 for Ollama (single-threaded local model)
      // Parallel batches cause timeouts since qwen2.5:3b handles one request at a time
      const BATCH_SIZE = 1;
      for (let b = 0; b < total; b += BATCH_SIZE) {
        const batch = [];
        for (let j = b; j < Math.min(b + BATCH_SIZE, total); j++) {
          batch.push(processOne(j));
        }
        await Promise.all(batch);
      }

      return { ok: true, results };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clo-kb:save-batch', async (_, { records, courseCode }) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const cloKnowledge = require('../modules/blooms/clo-knowledge');
      const toSave = records.map(r => ({ ...r, course_code: courseCode || r.course_code || 'UNKNOWN' }));
      const ids = cloKnowledge.addBatch(dbHandle, toSave);

      // Async: compute and persist embeddings for each saved record (fire-and-forget)
      // This populates vector_blob so future hybrid searches can use cosine similarity.
      setImmediate(async () => {
        for (let i = 0; i < ids.length; i++) {
          try {
            await cloKnowledge.saveEmbedding(dbHandle, ids[i], toSave[i].question_text);
          } catch (_) {}
        }
      });

      return { ok: true, ids };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clo-kb:get', async (_, { courseCode }) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const cloKnowledge = require('../modules/blooms/clo-knowledge');
      const data = cloKnowledge.getAll(dbHandle, courseCode);
      return { ok: true, data };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clo-kb:verify', async (_, id) => {
    if (!dbHandle) return { ok: false };
    try {
      const cloKnowledge = require('../modules/blooms/clo-knowledge');
      cloKnowledge.verify(dbHandle, id);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Poison Prevention: check if a proposed level contradicts the standard ──
  // Called by the UI before saving a manual override. Returns a warning string
  // if the proposed bloom_level contradicts the authoritative verb dictionary,
  // or null if the mapping is standard-compliant.
  ipcMain.handle('clo-kb:check-conflict', (_, { rootVerb, bloomLevel }) => {
    try {
      const cloKnowledge = require('../modules/blooms/clo-knowledge');
      const warning = cloKnowledge.checkLevelConflict(rootVerb, bloomLevel);
      return { ok: true, warning }; // warning is null if no conflict
    } catch (e) { return { ok: true, warning: null }; }
  });

  ipcMain.handle('clo-kb:unverify', async (_, id) => {
    if (!dbHandle) return { ok: false };
    try {
      const cloKnowledge = require('../modules/blooms/clo-knowledge');
      cloKnowledge.unverify(dbHandle, id);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clo-kb:delete', async (_, id) => {
    if (!dbHandle) return { ok: false };
    try {
      const cloKnowledge = require('../modules/blooms/clo-knowledge');
      cloKnowledge.deleteRecord(dbHandle, id);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Bulk: verify all records (optionally filtered by course)
  ipcMain.handle('clo-kb:verify-all', async (_, { courseCode } = {}) => {
    if (!dbHandle) return { ok: false };
    try {
      if (courseCode) {
        dbHandle.prepare('UPDATE clo_knowledge_base SET verified = 1 WHERE course_code = ?').run(courseCode);
      } else {
        dbHandle.prepare('UPDATE clo_knowledge_base SET verified = 1').run();
      }
      const count = dbHandle.prepare('SELECT COUNT(*) as n FROM clo_knowledge_base WHERE verified = 1').get().n;
      return { ok: true, count };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  // Bulk: delete all records (optionally filtered by course)
  ipcMain.handle('clo-kb:delete-all', async (_, { courseCode } = {}) => {
    if (!dbHandle) return { ok: false };
    try {
      const total = dbHandle.prepare('SELECT COUNT(*) as n FROM clo_knowledge_base').get().n;
      if (courseCode) {
        dbHandle.prepare('DELETE FROM clo_knowledge_base WHERE course_code = ?').run(courseCode);
      } else {
        dbHandle.prepare('DELETE FROM clo_knowledge_base').run();
      }
      return { ok: true, count: total };
    } catch(e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('clo-kb:stats', async () => {
    if (!dbHandle) return { ok: false };
    try {
      const cloKnowledge = require('../modules/blooms/clo-knowledge');
      return { ok: true, stats: cloKnowledge.getStats(dbHandle) };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Scan a folder and return all image file paths inside it
  ipcMain.handle('clo-kb:scan-folder', async () => {
    try {
      const { dialog } = require('electron');
      const fs   = require('fs');
      const path = require('path');

      const result = await dialog.showOpenDialog(mainWindow, {
        title:       'Select Exam Questions Folder',
        buttonLabel: 'Scan This Folder',
        properties:  ['openDirectory'],
      });

      if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };

      const folderPath = result.filePaths[0];
      const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];

      const files = fs.readdirSync(folderPath)
        .filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
        .map(f => ({
          name:     f,
          fullPath: path.join(folderPath, f),
          mimeType: path.extname(f).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
        }));

      if (files.length === 0) {
        return { ok: false, error: `No image files found in "${folderPath}". Add PNG or JPG files and try again.` };
      }

      // Read all image buffers
      const imageFiles = files.map(f => ({
        name:     f.name,
        buffer:   Array.from(fs.readFileSync(f.fullPath)), // convert to plain array for IPC
        mimeType: f.mimeType,
      }));

      return { ok: true, files: imageFiles, folderPath, count: imageFiles.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Desktop Notifications ─────────────────────────────────────────────────

  ipcMain.handle('notify:send', (_, { title, body, sound = true }) => {
    try {
      if (!Notification.isSupported()) {
        console.warn('[notify] Notifications not supported on this system');
        return { ok: false, error: 'Notifications not supported' };
      }
      const n = new Notification({
        title:  title || 'FacultyMind',
        body:   body  || '',
        icon:   path.join(__dirname, '../../assets/icon.ico'),
        silent: !sound,
        // urgency is Linux-only — omit on Windows to avoid errors
      });
      n.show();
      console.log(`[notify] Sent: "${title}"`);
      return { ok: true };
    } catch (e) {
      console.error('[notify] Failed:', e.message);
      return { ok: false, error: e.message };
    }
  });

  // ── Voice ─────────────────────────────────────────────────────────────────

  ipcMain.handle('voice:transcribe', async (_, audioBuffer) => {
    if (!whisperflow) return { ok: false, error: 'WhisperFlow not loaded' };
    try {
      let apiKey = null;
      if (keychain) apiKey = await keychain.getKey('openai');
      else if (portableConfig) apiKey = portableConfig.getKey('openai');
      if (!apiKey) return { ok: false, error: 'No OpenAI API key set' };

      const transcript = await whisperflow.transcribe(audioBuffer, apiKey);
      return { ok: true, transcript };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Schedule ──────────────────────────────────────────────────────────────

  ipcMain.handle('schedule:get', () => {
    if (!dbHandle || !scheduleManager) return { ok: false, data: [] };
    try {
      const data = scheduleManager.getFullSchedule(dbHandle);
      return { ok: true, data };
    } catch (e) { return { ok: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('schedule:save', (_, entry) => {
    if (!dbHandle || !scheduleManager) return { ok: false, error: 'Not available' };
    try {
      const { saveCourse, getAllCourses } = require('../database/queries');
      // Upsert course by code — reuse if already exists (case/space-insensitive: "ICE301" = "ice301")
      const norm = (v) => String(v ?? '').trim().toLowerCase();
      let course = getAllCourses(dbHandle).find(c => norm(c.code) === norm(entry.course_code));
      if (!course) {
        const cid = saveCourse(dbHandle, {
          code: entry.course_code,
          name: entry.course_name || entry.course_code,
          section: '', semester: '', year: new Date().getFullYear(),
        });
        course = { id: cid };
      }
      const schedEntry = { ...entry, course_id: course.id };
      const id = scheduleManager.saveEntry(dbHandle, schedEntry);
      return { ok: true, id };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('schedule:delete', (_, id) => {
    if (!dbHandle || !scheduleManager) return { ok: false };
    try {
      scheduleManager.deleteEntry(dbHandle, id);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('lesson-log:get', (_, courseId) => {
    if (!dbHandle || !scheduleManager) return { ok: false, data: [] };
    try {
      const data = scheduleManager.getLessonLog(dbHandle, courseId);
      return { ok: true, data };
    } catch (e) { return { ok: false, error: e.message, data: [] }; }
  });

  ipcMain.handle('lesson-log:save', (_, entry) => {
    if (!dbHandle || !scheduleManager) return { ok: false };
    try {
      const id = scheduleManager.saveLessonLog(dbHandle, entry);
      return { ok: true, id };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Database export/import ────────────────────────────────────────────────

  // Exports carry the student data key wrapped with a passphrase, so the
  // file can be opened on another laptop (BUG-S1 key transfer).
  ipcMain.handle('db:export', async (_, opts = {}) => {
    if (!dbHandle) return { ok: false, error: 'Database not available' };
    try {
      const status = studentCrypto.keyStatus(dbHandle);
      let bundle = null;
      if (status.encrypted) {
        if (!status.loaded) return { ok: false, error: 'Student data key is missing — restore it before exporting' };
        if (!opts.passphrase) return { ok: false, needsPassphrase: true };
        bundle = studentCrypto.wrapKey(opts.passphrase);
      }
      const { dialog } = require('electron');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export FacultyMind Database',
        defaultPath: `facultymind-backup-${Date.now()}.db`,
        filters: [{ name: 'Database', extensions: ['db'] }],
      });
      if (result.canceled) return { ok: false, error: 'Cancelled' };
      await dbHandle.backup(result.filePath);  // includes WAL contents
      if (bundle) {
        const Database = require('better-sqlite3');
        const copy = new Database(result.filePath);
        copy.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run(studentCrypto.RECOVERY_SETTING, JSON.stringify(bundle));
        copy.pragma('journal_mode = DELETE');
        copy.close();
        studentCrypto.markBackedUp(dbHandle);
      }
      return { ok: true, path: result.filePath };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Two steps when the file needs its key: the first call picks and checks the
  // file; if a passphrase is needed it returns needsPassphrase and the renderer
  // calls again with it. The current DB is only replaced once the key is known.
  let pendingImport = null;
  ipcMain.handle('db:import', async (_, opts = {}) => {
    if (!dbHandle) return { ok: false, error: 'Database not available' };
    try {
      let file = opts.passphrase ? pendingImport : null;
      if (!file) {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow, {
          title: 'Import FacultyMind Database',
          filters: [{ name: 'Database', extensions: ['db'] }],
          properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Cancelled' };
        file = result.filePaths[0];
      }
      pendingImport = null;

      // Inspect the file before touching the current DB
      const Database = require('better-sqlite3');
      let fp, bundleJson;
      try {
        const cand = new Database(file, { readonly: true, fileMustExist: true });
        try {
          cand.prepare('SELECT COUNT(*) FROM students').get();
          fp = studentCrypto.dbFingerprint(cand);
          bundleJson = cand.prepare('SELECT value FROM settings WHERE key=?').get(studentCrypto.RECOVERY_SETTING)?.value ?? null;
        } finally { cand.close(); }
      } catch (_) { return { ok: false, error: 'Not a FacultyMind database' }; }

      const current = keychain ? await keychain.getKey(studentCrypto.KEY_SERVICE).catch(() => null) : null;
      const sameKey = fp && current && studentCrypto.fingerprint(Buffer.from(current, 'hex')) === fp;
      let newKey = null;
      if (fp && !sameKey) {
        if (!bundleJson) return { ok: false, error: 'This database was exported without its key — restore the key from its recovery file first' };
        if (!opts.passphrase) { pendingImport = file; return { ok: false, needsPassphrase: true }; }
        try { newKey = studentCrypto.unwrapKey(bundleJson, opts.passphrase); }
        catch (e) { pendingImport = file; return { ok: false, needsPassphrase: true, error: e.message }; }
      }

      // Replace the DB, keeping the old one until the key is stored
      const fs = require('fs');
      const dbPath = dbModule.getDbPath();
      const prev = `${dbPath}.pre-import`;
      dbModule.close();
      fs.copyFileSync(dbPath, prev);
      // Undo: old DB file back, and the old key back in the keychain
      const rollback = async (result) => {
        try { dbModule.close(); } catch (_) {}
        fs.copyFileSync(prev, dbPath);
        fs.rmSync(prev, { force: true });
        if (newKey && current) await keychain.setKey(studentCrypto.KEY_SERVICE, current).catch(() => {});
        dbHandle = dbModule.openDatabase();
        await initStudentCrypto();
        return result;
      };
      try {
        fs.copyFileSync(file, dbPath);
        for (const ext of ['-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true });
        dbHandle = dbModule.openDatabase();
        dbHandle.prepare('DELETE FROM settings WHERE key=?').run(studentCrypto.RECOVERY_SETTING);
        if (newKey) {
          const r = await studentCrypto.installKey(dbHandle, keychain, newKey);
          if (!r.ok) return rollback(r);
        }
        await initStudentCrypto();
      } catch (e) {
        return rollback({ ok: false, error: e.message });
      }
      fs.rmSync(prev, { force: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Student data key: status, recovery file ───────────────────────────────

  ipcMain.handle('student-key:status', () => {
    if (!dbHandle) return { ok: false, error: 'Database not available' };
    return { ok: true, ...studentCrypto.keyStatus(dbHandle) };
  });

  ipcMain.handle('student-key:save-recovery', async (_, { passphrase } = {}) => {
    if (!dbHandle) return { ok: false, error: 'Database not available' };
    try {
      const bundle = studentCrypto.wrapKey(passphrase);
      const { dialog } = require('electron');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Student Data Key Recovery File',
        defaultPath: `facultymind-key-recovery-${new Date().toISOString().slice(0, 10)}.fmkey`,
        filters: [{ name: 'FacultyMind key', extensions: ['fmkey'] }],
      });
      if (result.canceled) return { ok: false, error: 'Cancelled' };
      require('fs').writeFileSync(result.filePath, JSON.stringify(bundle, null, 1));
      studentCrypto.markBackedUp(dbHandle);
      return { ok: true, path: result.filePath };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('student-key:restore', async (_, { passphrase } = {}) => {
    if (!dbHandle) return { ok: false, error: 'Database not available' };
    if (!keychain) return { ok: false, error: 'Keychain not available' };
    try {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Student Data Key Recovery File',
        filters: [{ name: 'FacultyMind key', extensions: ['fmkey'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Cancelled' };
      const bundle = require('fs').readFileSync(result.filePaths[0], 'utf8');
      const r = await studentCrypto.restoreKey(dbHandle, keychain, bundle, passphrase);
      if (!r.ok) return r;
      await initStudentCrypto();
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Portable config ───────────────────────────────────────────────────────

  ipcMain.handle('config:set-portable-mode', (_, { enabled, pin }) => {
    if (!portableConfig) return { ok: false };
    try {
      portableConfig.setPortableMode(enabled, pin);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Settings (active model persisted in DB) ───────────────────────────────

  ipcMain.handle('settings:get', () => {
    if (!dbHandle) return { model: 'claude' };
    try {
      const { getSettings } = require('../database/queries');
      return getSettings(dbHandle);
    } catch (_) { return { model: 'claude' }; }
  });

  // ── Cortex: Activity Logging ──────────────────────────────────────────────

  ipcMain.on('cortex:log', (_, { eventType, module: mod, payload }) => {
    if (eventType === 'renderer_error') {
      appLog(`[RENDERER] ${mod}: ${JSON.stringify(payload)}`);
    }
    if (!dbHandle) return;
    try {
      const activityLogger = require('../modules/cortex/activity-logger');
      activityLogger.log(dbHandle, eventType, mod || '', payload || {});
    } catch (_) {}
  });

  // ── Cortex: Rules Management ──────────────────────────────────────────────

  ipcMain.handle('cortex:get-rules', () => {
    if (!dbHandle) return { ok: false, data: [] };
    try {
      const rulesEngine = require('../modules/cortex/rules-engine');
      return { ok: true, data: rulesEngine.getRules(dbHandle) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  });

  ipcMain.handle('cortex:add-rule', async (_, { text, type, description, ruleJson }) => {
    if (!dbHandle) return { ok: false, error: 'Database unavailable' };
    try {
      const rulesEngine = require('../modules/cortex/rules-engine');
      const activeKeystore = keychain || portableConfig;

      let id;
      if (type && description) {
        // Structured rule (from UI toggle/form)
        id = rulesEngine.addRule(dbHandle, type, description, ruleJson || {}, 'explicit');
      } else if (text && aiRouter && activeKeystore) {
        // Natural language rule (from chat) — AI parses it
        const activeModel = aiRouter.getActiveModel();
        const { getApiKey, isUsable } = require('../modules/ai/api-key');
        const apiKey = await getApiKey(activeKeystore, activeModel);
        if (isUsable(activeModel, apiKey)) {
          id = await rulesEngine.parseAndSaveRule(dbHandle, text, aiRouter, apiKey, activeModel);
        } else {
          id = rulesEngine.addRule(dbHandle, 'general', text, { raw: text }, 'explicit');
        }
      } else {
        return { ok: false, error: 'Provide either text (NL) or type+description' };
      }
      return { ok: true, id };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('cortex:delete-rule', (_, id) => {
    if (!dbHandle) return { ok: false };
    try {
      const rulesEngine = require('../modules/cortex/rules-engine');
      rulesEngine.deleteRule(dbHandle, id);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // ── Cortex: Thoughts (read-only from renderer) ────────────────────────────

  ipcMain.handle('cortex:get-thoughts', () => {
    if (!dbHandle) return { ok: false, data: [] };
    try {
      const thoughtJournal = require('../modules/cortex/thought-journal');
      return { ok: true, data: thoughtJournal.getRecentThoughts(dbHandle, 20) };
    } catch (e) { return { ok: false, data: [] }; }
  });

  // ── Cortex: Toggle proactive on/off ──────────────────────────────────────

  ipcMain.handle('cortex:set-proactive', (_, enabled) => {
    if (!dbHandle) return { ok: false };
    try {
      dbHandle.prepare(`UPDATE cortex_state SET value = ? WHERE key = 'proactive_enabled'`).run(enabled ? '1' : '0');
      return { ok: true };
    } catch (e) { return { ok: false }; }
  });

  ipcMain.handle('cortex:get-state', () => {
    if (!dbHandle) return { ok: false, data: {} };
    try {
      const rows = dbHandle.prepare(`SELECT key, value FROM cortex_state`).all();
      const data = {};
      rows.forEach(r => { data[r.key] = r.value; });
      return { ok: true, data };
    } catch (e) { return { ok: false, data: {} }; }
  });

  // ── Activity logging middleware: key IPC calls ────────────────────────────
  // Wrap module visits and major actions to feed the activity log.

  const _origHandle = ipcMain.handle.bind(ipcMain);
  function wrapWithLog(channel, mod, eventType) {
    ipcMain.on(channel + ':visited', (_, payload) => {
      if (!dbHandle) return;
      try {
        const activityLogger = require('../modules/cortex/activity-logger');
        activityLogger.log(dbHandle, eventType || 'module_visit', mod, payload || {});
      } catch (_) {}
    });
  }
  // The renderer sends these lightweight fire-and-forget events on module open
  wrapWithLog('nav:chat',     'chat',     'module_visit');
  wrapWithLog('nav:schedule', 'schedule', 'module_visit');
  wrapWithLog('nav:shadsync', 'shadsync', 'module_visit');
  wrapWithLog('nav:email',    'email',    'module_visit');
  wrapWithLog('nav:vault',    'vault',    'module_visit');
  wrapWithLog('nav:blooms',   'blooms',   'module_visit');
}
