/**
 * auth.js — PIN setup, PIN verify, session management
 * Session times out after 15 minutes of inactivity (configurable in settings)
 */

const crypto = require('crypto');

let _sessionActive = false;
let _sessionTimer  = null;
let _timeoutMs     = 15 * 60 * 1000; // 15 min default

// Lockout state
let _failedAttempts = 0;
let _lockedUntil    = 0;  // epoch ms — 0 means not locked
const MAX_ATTEMPTS  = 3;
const LOCKOUT_MS    = 30 * 1000; // 30 seconds

// ─── PIN Hashing ──────────────────────────────────────────────────────────────

/**
 * Hash a PIN using PBKDF2. Returns hex string.
 * Also used as the SQLCipher encryption key derivation.
 */
function hashPin(pin, salt) {
  return crypto.pbkdf2Sync(pin, salt, 310_000, 32, 'sha256').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// ─── First Launch ─────────────────────────────────────────────────────────────

function isFirstLaunch(db) {
  const row = db.prepare('SELECT id FROM users LIMIT 1').get();
  return !row;
}

// ─── PIN Setup ────────────────────────────────────────────────────────────────

function setupPin(db, pin) {
  if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 digits');
  const salt    = generateSalt();
  const pinHash = hashPin(pin, salt);
  // Use INSERT OR REPLACE so this works both for first-time setup AND PIN change
  db.prepare('INSERT OR REPLACE INTO users (id, pin_hash) VALUES (1, ?)').run(`${salt}:${pinHash}`);
}

// ─── PIN Verification ─────────────────────────────────────────────────────────

function verifyPin(db, pin) {
  // Lockout check
  if (_lockedUntil && Date.now() < _lockedUntil) {
    const secsLeft = Math.ceil((_lockedUntil - Date.now()) / 1000);
    throw new Error(`Too many wrong attempts. Try again in ${secsLeft} seconds.`);
  }

  const row = db.prepare('SELECT pin_hash FROM users LIMIT 1').get();
  if (!row) return false;
  const [salt, storedHash] = row.pin_hash.split(':');
  const inputHash = hashPin(pin, salt);
  const valid = crypto.timingSafeEqual(Buffer.from(inputHash, 'hex'), Buffer.from(storedHash, 'hex'));

  if (valid) {
    // Reset on success
    _failedAttempts = 0;
    _lockedUntil    = 0;
  } else {
    _failedAttempts += 1;
    if (_failedAttempts >= MAX_ATTEMPTS) {
      _lockedUntil    = Date.now() + LOCKOUT_MS;
      _failedAttempts = 0;
      throw new Error(`Too many wrong attempts. Try again in 30 seconds.`);
    }
  }

  return valid;
}

/**
 * Derive the SQLCipher key from a verified PIN.
 * Called after verifyPin() succeeds so the DB can be re-keyed or confirmed.
 */
function deriveCipherKey(pin, salt) {
  return crypto.pbkdf2Sync(pin, salt, 310_000, 32, 'sha256').toString('hex');
}

function getSalt(db) {
  const row = db.prepare('SELECT pin_hash FROM users LIMIT 1').get();
  if (!row) return null;
  return row.pin_hash.split(':')[0];
}

// ─── Session ──────────────────────────────────────────────────────────────────

function startSession(db) {
  _sessionActive = true;
  const timeoutSetting = db
    ? db.prepare("SELECT value FROM settings WHERE key='session_timeout_min'").get()
    : null;
  if (timeoutSetting) _timeoutMs = parseInt(timeoutSetting.value, 10) * 60 * 1000;
  resetTimer();
}

function resetTimer() {
  if (_sessionTimer) clearTimeout(_sessionTimer);
  if (_sessionActive) {
    _sessionTimer = setTimeout(() => {
      _sessionActive = false;
    }, _timeoutMs);
  }
}

function isSessionActive() {
  return _sessionActive;
}

function endSession() {
  _sessionActive = false;
  if (_sessionTimer) clearTimeout(_sessionTimer);
}

module.exports = {
  isFirstLaunch,
  setupPin,
  verifyPin,
  deriveCipherKey,
  getSalt,
  startSession,
  resetTimer,
  isSessionActive,
  endSession,
  hashPin,
};
