/**
 * Database initialisation — SQLite via better-sqlite3
 *
 * NOTE: better-sqlite3-sqlcipher has a Windows build bug (invalid path construction
 * on Windows with MSBuild). Using better-sqlite3 (prebuilt binaries) for Sprint 1.
 * All sensitive fields are AES-256-GCM encrypted at the application layer
 * via src/modules/security/encryption.js — data is encrypted at rest.
 * Full SQLCipher file-level encryption is logged as BUG-002 for post-Sprint 1.
 *
 * DB location: Electron app.getPath('userData') + '/facultymind.db'
 */

const path = require('path');
const fs   = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');
const { runMigrations } = require('./migrations/001_init');
const { runMigration002 } = require('./migrations/002_cortex');
const { runMigration003 } = require('./migrations/003_identity');
const { runMigration004 } = require('./migrations/004_diu_portal');
const { runMigration005 } = require('./migrations/005_clo_knowledge');
const { runMigration006 } = require('./migrations/006_kb_vectors');
const { runMigration007 } = require('./migrations/007_assessment_columns');
const { seedDatabase } = require('./seeds/seeder');

let _db = null;

const PREFS_PATH = () => path.join(app.getPath('userData'), 'vault-prefs.json');

function getCustomDbPath() {
  try {
    const prefs = JSON.parse(fs.readFileSync(PREFS_PATH(), 'utf8'));
    if (prefs.dbPath && fs.existsSync(prefs.dbPath)) return prefs.dbPath;
  } catch (_) {}
  return null;
}

function saveCustomDbPath(newPath) {
  const prefs = { dbPath: newPath };
  fs.writeFileSync(PREFS_PATH(), JSON.stringify(prefs), 'utf8');
}

function clearCustomDbPath() {
  try { fs.unlinkSync(PREFS_PATH()); } catch (_) {}
}

function getDbPath() {
  return getCustomDbPath() || path.join(app.getPath('userData'), 'facultymind.db');
}

/**
 * Open (or create) the database.
 * @param {string} _cipherKey - Reserved for SQLCipher upgrade (ignored for now)
 */
function openDatabase(_cipherKey) {
  if (_db) return _db;

  const dbPath = getDbPath();
  _db = new Database(dbPath);

  runMigrations(_db);
  runMigration002(_db);
  runMigration003(_db);
  runMigration004(_db);
  runMigration005(_db);
  runMigration006(_db);
  runMigration007(_db);
  seedDatabase(_db);

  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');

  // NOTE: Full SQLCipher file-level encryption is deferred (BUG-002 — Windows build issue).
  // All sensitive fields (student names, IDs, vault content, passwords) are encrypted
  // at the application layer using AES-256-GCM via src/modules/security/encryption.js.
  // The database file itself is plain SQLite — do not store unencrypted sensitive data
  // directly in any column that isn't routed through encryptField().

  console.log('[db] Opened:', dbPath);
  return _db;
}

function getDb() {
  if (!_db) throw new Error('Database not opened. Call openDatabase() first.');
  return _db;
}

function close() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { openDatabase, getDb, close, getDbPath, saveCustomDbPath, clearCustomDbPath };
