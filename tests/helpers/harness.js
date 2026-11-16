/**
 * harness.js — test doubles for Electron + keytar, and a loader for main.js
 *
 * Tests run under Electron's bundled Node (ELECTRON_RUN_AS_NODE=1) because
 * better-sqlite3 / keytar are compiled for the Electron ABI. This file:
 *   - points app.getPath() at a fresh temp directory (never the real userData)
 *   - replaces keytar with an in-memory store (never touches Credential Manager)
 *   - records ipcMain handlers so tests can invoke them like the renderer would
 *   - captures timers created while main.js boots so background loops
 *     (Ollama checks, cortex ticks) only run when a test triggers them
 *
 * Must be required BEFORE any src/ module.
 */

'use strict';

const Module = require('module');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ROOT = path.join(__dirname, '..', '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-test-'));

// ── Fake keytar ──────────────────────────────────────────────────────────────
const keyStore = new Map();
// Fixed student data key (BUG-S1) so template DBs and a booted main.js agree.
const TEST_STUDENT_KEY = 'a1'.repeat(32);
keyStore.set('facultymind_student_field_key|student_field_key', TEST_STUDENT_KEY);
const fakeKeytar = {
  async setPassword(service, account, pw) { keyStore.set(`${service}|${account}`, pw); },
  async getPassword(service, account)     { return keyStore.get(`${service}|${account}`) ?? null; },
  async deletePassword(service, account)  { return keyStore.delete(`${service}|${account}`); },
};

// ── Fake electron ────────────────────────────────────────────────────────────
const ipcHandlers  = new Map();
const ipcListeners = new Map();
const sentToRenderer = [];
const notifications  = [];
const openedExternal = [];
const dialogQueue    = { open: [], save: [] };

class FakeWebContents {
  constructor() { this._events = {}; }
  send(channel, payload) { sentToRenderer.push({ channel, payload }); }
  on(ev, fn) { this._events[ev] = fn; }
  openDevTools() {}
  setWindowOpenHandler(fn) { this._windowOpenHandler = fn; }
  async printToPDF() { return Buffer.from('%PDF-fake'); }
}

class FakeBrowserWindow {
  constructor(opts) {
    this.opts = opts;
    this.webContents = new FakeWebContents();
    this._destroyed = false;
    this._events = {};
    FakeBrowserWindow._all.push(this);
  }
  loadFile() { return Promise.resolve(); }
  loadURL()  { return Promise.resolve(); }
  on(ev, fn)   { this._events[ev] = fn; }
  once(ev, fn) { this._events[ev] = fn; }
  show() {}
  close() { this._destroyed = true; }
  minimize() {} maximize() {} unmaximize() {}
  isMaximized() { return false; }
  isDestroyed() { return this._destroyed; }
  reload() {}
  static getAllWindows() { return FakeBrowserWindow._all.filter(w => !w._destroyed); }
}
FakeBrowserWindow._all = [];

class FakeNotification {
  constructor(opts) { this.opts = opts; }
  show() { notifications.push(this.opts); }
  static isSupported() { return true; }
}

let resolveReady;
const readyPromise = new Promise(r => { resolveReady = r; });

const fakeElectron = {
  app: {
    getPath: (name) => {
      const p = path.join(tmpRoot, name);
      fs.mkdirSync(p, { recursive: true });
      return p;
    },
    whenReady: () => readyPromise,
    on() {}, quit() {}, setAppUserModelId() {},
  },
  ipcMain: {
    handle: (ch, fn) => ipcHandlers.set(ch, fn),
    on:     (ch, fn) => ipcListeners.set(ch, fn),
  },
  BrowserWindow: FakeBrowserWindow,
  Notification:  FakeNotification,
  nativeTheme:   {},
  shell:  { openExternal: (u) => { openedExternal.push(u); return Promise.resolve(); } },
  dialog: {
    showOpenDialog: async () => dialogQueue.open.shift() || { canceled: true, filePaths: [] },
    showSaveDialog: async () => dialogQueue.save.shift() || { canceled: true },
  },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  if (request === 'keytar')   return fakeKeytar;
  return origLoad.apply(this, arguments);
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Require a module from src/ by repo-relative path. */
function src(rel) { return require(path.join(ROOT, 'src', rel)); }

/**
 * Boot main.js against the fake Electron. Timers created during boot are
 * captured instead of scheduled; returns them so a test can fire one.
 */
let _booted = null;
async function bootMain() {
  if (_booted) return _booted;
  const captured = { timeouts: [], intervals: [] };
  const realSetTimeout = global.setTimeout;
  const realSetInterval = global.setInterval;
  global.setTimeout  = (fn, ms, ...a) => { captured.timeouts.push({ fn, ms, a }); return { unref() {}, ref() {} }; };
  global.setInterval = (fn, ms, ...a) => { captured.intervals.push({ fn, ms, a }); return { unref() {}, ref() {} }; };
  const origLog = console.log;
  console.log = () => {};
  try {
    require(path.join(ROOT, 'src', 'main', 'main.js'));
    resolveReady();
    await readyPromise;
    // let the whenReady().then() body and any queued microtasks finish
    await new Promise(r => setImmediate(r));
  } finally {
    global.setTimeout = realSetTimeout;
    global.setInterval = realSetInterval;
    console.log = origLog;
  }
  _booted = { captured };
  return _booted;
}

/** Invoke an ipcMain.handle() channel the way the renderer would. */
async function invoke(channel, ...args) {
  const fn = ipcHandlers.get(channel);
  if (!fn) throw new Error(`No IPC handler registered for ${channel}`);
  return fn({ sender: null }, ...args);
}

/** Run the same migrations + seed sequence as src/database/db.js openDatabase(). */
function migrateAndSeed(db) {
  const quiet = console.log; console.log = () => {};
  try {
    require(path.join(ROOT, 'src/database/migrations/001_init')).runMigrations(db);
    require(path.join(ROOT, 'src/database/migrations/002_cortex')).runMigration002(db);
    require(path.join(ROOT, 'src/database/migrations/003_identity')).runMigration003(db);
    require(path.join(ROOT, 'src/database/migrations/004_diu_portal')).runMigration004(db);
    require(path.join(ROOT, 'src/database/migrations/005_clo_knowledge')).runMigration005(db);
    require(path.join(ROOT, 'src/database/migrations/006_kb_vectors')).runMigration006(db);
    require(path.join(ROOT, 'src/database/migrations/007_assessment_columns')).runMigration007(db);
    require(path.join(ROOT, 'src/database/seeds/seeder')).seedDatabase(db);
    // Mirror main.js initStudentCrypto(): load the key, encrypt legacy rows.
    const sc = require(path.join(ROOT, 'src/modules/security/student-crypto'));
    sc.useKey(TEST_STUDENT_KEY);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('student_key_fp', sc.fingerprint(Buffer.from(TEST_STUDENT_KEY, 'hex')));
    sc.migrateData(db);
  } finally { console.log = quiet; }
}

// Seeding takes seconds, so build one template per process and copy it.
let _templatePath = null;
function templateDb() {
  if (_templatePath) return _templatePath;
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  _templatePath = path.join(tmpRoot, 'template.db');
  const db = new Database(_templatePath);
  migrateAndSeed(db);
  db.close();
  return _templatePath;
}

/** Open a brand-new seeded database in its own temp dir (no main.js). */
function freshDb() {
  const Database = require(path.join(ROOT, 'node_modules', 'better-sqlite3'));
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'db-'));
  const file = path.join(dir, 'test.db');
  fs.copyFileSync(templateDb(), file);
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return { db, dir, file };
}

/** A fake model-router that records prompts and replies from a script. */
function fakeAiRouter({ active = 'claude', reply = () => 'OK' } = {}) {
  const calls = [];
  let activeModel = active;
  return {
    calls,
    getActiveModel: () => activeModel,
    setActiveModel: (m) => { activeModel = m; },
    async send(message, context, options) {
      calls.push({ message, options });
      const text = typeof reply === 'function' ? reply(message, options, calls.length) : reply;
      return { text: await text, tokens: 0, model: options?.model || activeModel };
    },
    async classifyIntent(message) { return { intent: 'GENERAL_CHAT', raw_query: message }; },
    async isOllamaAvailable() { return false; },
  };
}

module.exports = {
  ROOT, tmpRoot, TEST_STUDENT_KEY, src, bootMain, invoke, freshDb, fakeAiRouter, migrateAndSeed,
  keyStore, fakeKeytar, ipcHandlers, ipcListeners, sentToRenderer,
  notifications, openedExternal, dialogQueue,
};
