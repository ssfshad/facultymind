/**
 * student-crypto.js — at-rest encryption for student identifiers (BUG-S1)
 * and vault items (BUG-S3)
 *
 * students.name_enc / student_id_enc / enrollment_no_enc and
 * vault_items.content_enc / username_enc / password_enc hold AES-256-GCM
 * ciphertext ("iv:tag:ct" hex, see encryption.js). The students *_anon
 * columns only ever hold tokens (S001 / Student_S001 / E001).
 *
 * Master key: 32 random bytes per install, stored in the OS keychain under
 * "student_field_key". It is loaded once at startup (keytar is async, the DB
 * layer is sync) and kept in memory. A fingerprint in settings
 * ('student_key_fp') makes sure we never encrypt with — or silently replace —
 * the wrong key, e.g. after importing a DB from another machine. The master
 * key is what the recovery file and DB exports carry.
 *
 * The master key never encrypts data directly. HKDF-SHA256 derives one
 * subkey per kind of data (SUBKEY_INFO), so student data and vault items
 * never share a key.
 */

const crypto = require('crypto');
const { encryptField, decryptField } = require('./encryption');

const KEY_SERVICE = 'student_field_key';
const FP_SETTING  = 'student_key_fp';
const CIPHERTEXT  = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/;
const NAME_TOKEN  = /^Student_S\d+$/;
const SUBKEY_INFO = { students: 'facultymind/student-data/v1', vault: 'facultymind/vault/v1' };

let _key = null;      // master key
let _sub  = null;     // { students, vault } derived subkeys

function fingerprint(key) {
  return crypto.createHmac('sha256', key).update('facultymind-student-key-check').digest('hex').slice(0, 16);
}

/** HKDF-SHA256 subkey for one kind of data (no salt: the master key is uniformly random). */
function deriveSubkey(master, info) {
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.alloc(0), info, 32));
}

function getSetting(db, key) {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? null;
}

function hasCiphertext(db) {
  return db.prepare('SELECT name_enc, student_id_enc FROM students').all()
    .some(r => CIPHERTEXT.test(r.name_enc || '') || CIPHERTEXT.test(r.student_id_enc || ''));
}

/** Use an explicit master key (tests, tools). Pass null to unload. */
function useKey(key) {
  _key = key ? (Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex')) : null;
  _sub = _key ? {
    students: deriveSubkey(_key, SUBKEY_INFO.students),
    vault:    deriveSubkey(_key, SUBKEY_INFO.vault),
  } : null;
}

function isReady() { return !!_key; }

/** Write the key to the keystore and read it back; nothing is encrypted unless both succeed. */
async function storeAndVerify(keystore, hex) {
  try {
    await keystore.setKey(KEY_SERVICE, hex);
    if ((await keystore.getKey(KEY_SERVICE)) !== hex) throw new Error('read-back did not match');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not store the student data key: ${e.message}` };
  }
}

/**
 * Load the per-install key from the keystore, creating it on first run.
 * Refuses to create a new key when the DB already holds ciphertext, and
 * refuses a key whose fingerprint doesn't match the DB.
 * @returns {{ ok: boolean, created?: boolean, error?: string }}
 */
async function loadKey(db, keystore) {
  useKey(null);
  const storedFp = getSetting(db, FP_SETTING);
  let hex = null;
  try { hex = await keystore.getKey(KEY_SERVICE); } catch (_) {}

  if (!hex) {
    if (storedFp || hasCiphertext(db)) {
      return { ok: false, error: 'Student data is encrypted but its key is not in this computer\'s keychain' };
    }
    hex = crypto.randomBytes(32).toString('hex');
    const stored = await storeAndVerify(keystore, hex);
    if (!stored.ok) return stored;
    useKey(hex);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(FP_SETTING, fingerprint(_key));
    return { ok: true, created: true };
  }

  const key = Buffer.from(hex, 'hex');
  if (storedFp && storedFp !== fingerprint(key)) {
    return { ok: false, error: 'The student data key in the keychain does not match this database' };
  }
  useKey(key);
  if (!storedFp) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(FP_SETTING, fingerprint(_key));
  return { ok: true, created: false };
}

/** Encrypt a student identifier (student subkey). */
function encrypt(value) {
  if (!_key) throw new Error('Student data key is not loaded — student records cannot be saved');
  return encryptField(String(value ?? ''), _sub.students);
}

/** Encrypt a vault value (vault subkey). */
function vaultEncrypt(value) {
  if (!_key) throw new Error('Data key is not loaded — restore it from your recovery file');
  return encryptField(String(value ?? ''), _sub.vault);
}

/** Decrypt a value written by vaultEncrypt(). Throws when the key is missing or wrong. */
function vaultDecrypt(value) {
  if (!_key) throw new Error('Data key is not loaded — restore it from your recovery file');
  return decryptField(value, _sub.vault);
}

/** Legacy pre-S1 value → the plaintext it stood for ("Rahman_enc" → "Rahman"). */
function legacyPlain(value) {
  return String(value).replace(/_enc$/, '');
}

/**
 * Value to show for an *_enc column. Falls back to the anon token when the
 * column is empty or can't be decrypted (missing/wrong key) — never throws.
 */
function reveal(encValue, fallback) {
  if (encValue == null || encValue === '') return fallback;
  if (!CIPHERTEXT.test(encValue)) return legacyPlain(encValue);
  if (!_key) return fallback;
  try { return decryptField(encValue, _sub.students); } catch (_) { return fallback; }
}

/** Next free S### token for a course (max + 1, so deletions never cause reuse). */
function nextSeq(db, courseId) {
  const rows = db.prepare('SELECT student_id_anon FROM students WHERE course_id=?').all(courseId);
  const max = rows.reduce((m, r) => {
    const t = /^S(\d+)$/.exec(r.student_id_anon || '');
    return t ? Math.max(m, parseInt(t[1], 10)) : m;
  }, 0);
  return String(max + 1).padStart(3, '0');
}

/**
 * Column values for a new student. Real identifiers go only into *_enc.
 * When no real ID / enrollment number is given, the token is stored instead
 * (same as the seed data).
 */
function newStudentColumns(db, courseId, { name, studentId, enrollmentNo }) {
  const seq = nextSeq(db, courseId);
  const token = `S${seq}`;
  return {
    course_id:          courseId,
    student_id_anon:    token,
    name_anon:          `Student_${token}`,
    enrollment_no_anon: `E${seq}`,
    name_enc:           encrypt(name),
    student_id_enc:     encrypt(studentId || token),
    enrollment_no_enc:  encrypt(enrollmentNo || `E${seq}`),
  };
}

// ─── Migration ────────────────────────────────────────────────────────────────
// Pre-S3 vault rows were encrypted with a key that was hard-coded in
// encryption.js; it is kept here only to read those rows.

const LEGACY_VAULT_KEY = Buffer.from('facultymind_shadsync_vault_aes256_key_v1_2026!!'.slice(0, 32), 'utf8');
const STUDENT_COLS = ['name_enc', 'student_id_enc', 'enrollment_no_enc'];
const VAULT_COLS   = ['content_enc', 'username_enc', 'password_enc'];

/**
 * Re-encrypt one ciphertext value under `subkey`. Returns the new value and
 * how it was found: 'subkey' (already done, value unchanged), 'masterKey'
 * (S1 rows written with the master key), one of `fallbacks`, or 'unreadable'
 * (left as it is).
 */
function rekey(v, subkey, encryptFn, fallbacks = {}) {
  try { decryptField(v, subkey); return { value: v, kind: 'subkey' }; } catch (_) {}
  for (const [kind, key] of Object.entries({ masterKey: _key, ...fallbacks })) {
    try { return { value: encryptFn(decryptField(v, key)), kind }; } catch (_) {}
  }
  return { value: v, kind: 'unreadable' };
}

/**
 * Students: encrypt every value under the student subkey.
 *  - "X_enc" rows (seeder, ShadSync form)      → encrypt "X"
 *  - plaintext rows (chat "add student" path)   → encrypt as-is
 *  - S1 ciphertext (master key)                 → re-encrypt under the subkey
 *  - rows whose *_anon columns hold real values (ShadSync form typed the real
 *    name/ID into name_anon/student_id_anon)    → move them into *_enc, give
 *    the row fresh tokens
 * Must run inside a transaction (see runMigration).
 */
function studentsPart(db) {
  const report = { total: 0, alreadyEncrypted: 0, legacySuffix: 0, plaintext: 0, masterKey: 0, unreadable: 0, realValuesInAnon: 0, retokened: 0 };
  const rows = db.prepare('SELECT * FROM students ORDER BY course_id, id').all();
  report.total = rows.length;
  const update = db.prepare(`
    UPDATE students SET student_id_anon=?, name_anon=?, enrollment_no_anon=?,
                        name_enc=?, student_id_enc=?, enrollment_no_enc=?
    WHERE id=?`);

  for (const r of rows) {
    let { student_id_anon: idAnon, name_anon: nameAnon, enrollment_no_anon: enrAnon } = r;
    if (!NAME_TOKEN.test(nameAnon || '')) {
      // ShadSync form path: the *_anon columns hold what the teacher typed.
      report.realValuesInAnon++;
      const [name, sid, enr] = [nameAnon, idAnon, enrAnon];
      const seq = nextSeq(db, r.course_id);
      idAnon = `S${seq}`; nameAnon = `Student_S${seq}`; enrAnon = `E${seq}`;
      report.retokened++;
      update.run(idAnon, nameAnon, enrAnon, name == null ? null : encrypt(name), encrypt(sid ?? idAnon), encrypt(enr ?? enrAnon), r.id);
      continue;
    }

    let changed = false;
    const next = STUDENT_COLS.map(c => {
      const v = r[c];
      if (v == null || v === '') {
        if (c === 'name_enc') return v ?? null;
        changed = true;
        return encrypt(c === 'student_id_enc' ? idAnon : enrAnon);
      }
      if (CIPHERTEXT.test(v)) {
        const out = rekey(v, _sub.students, encrypt);
        if (out.kind !== 'subkey') report[out.kind]++;
        if (out.value !== v) changed = true;
        return out.value;
      }
      changed = true;
      if (/_enc$/.test(v)) { report.legacySuffix++; return encrypt(legacyPlain(v)); }
      report.plaintext++; return encrypt(v);
    });
    if (!changed) { report.alreadyEncrypted++; continue; }
    update.run(idAnon, nameAnon, enrAnon, ...next, r.id);
  }
  return report;
}

/**
 * Vault: encrypt every value under the vault subkey (old hard-coded key,
 * master key or plaintext → vault subkey). Values that decrypt with no known
 * key are left as they are and counted. Must run inside a transaction.
 */
function vaultPart(db) {
  const report = { items: 0, values: 0, alreadySubkey: 0, legacyKey: 0, masterKey: 0, plaintext: 0, unreadable: 0 };
  const rows = db.prepare(`SELECT id, ${VAULT_COLS.join(', ')} FROM vault_items ORDER BY id`).all();
  report.items = rows.length;
  const update = db.prepare(`UPDATE vault_items SET ${VAULT_COLS.map(c => `${c}=?`).join(', ')} WHERE id=?`);

  for (const r of rows) {
    let changed = false;
    const next = VAULT_COLS.map(c => {
      const v = r[c];
      if (v == null || v === '') return v;
      report.values++;
      if (!CIPHERTEXT.test(v)) { report.plaintext++; changed = true; return vaultEncrypt(v); }
      const out = rekey(v, _sub.vault, vaultEncrypt, { legacyKey: LEGACY_VAULT_KEY });
      report[out.kind === 'subkey' ? 'alreadySubkey' : out.kind]++;
      if (out.value !== v) changed = true;
      return out.value;
    });
    if (changed) update.run(...next, r.id);
  }
  return report;
}

/**
 * Run migration parts in ONE transaction: any error leaves every row as it
 * was. Idempotent. Old plaintext/ciphertext is overwritten on disk
 * (secure_delete, WAL truncated, VACUUM). Reports hold counts only.
 */
function runMigration(db, parts) {
  if (!_key) throw new Error('Student data key is not loaded');
  let reports;
  const prevSecureDelete = db.pragma('secure_delete', { simple: true });
  db.pragma('secure_delete = ON');
  try {
    db.transaction(() => { reports = parts.map(p => p(db)); })();
  } finally {
    db.pragma(`secure_delete = ${prevSecureDelete ? 'ON' : 'OFF'}`);
  }
  const changed = reports.some(r => r.legacySuffix || r.plaintext || r.masterKey || r.legacyKey || r.realValuesInAnon);
  if (changed) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
  }
  return reports;
}

/** Startup migration: students and vault together, one transaction. */
function migrateData(db) {
  const [students, vault] = runMigration(db, [studentsPart, vaultPart]);
  return { students, vault };
}

function migrateStudents(db) { return runMigration(db, [studentsPart])[0]; }
function migrateVault(db)    { return runMigration(db, [vaultPart])[0]; }

// ─── Key recovery / transfer ──────────────────────────────────────────────────
// The key is wrapped with a passphrase (scrypt → AES-256-GCM). The same
// "recovery bundle" is written to a .fmkey file and embedded in DB exports,
// so a reinstall, a new Windows profile or another laptop can get the key back.

const RECOVERY_SETTING = 'student_key_recovery';  // only ever in exported copies
const BACKUP_SETTING   = 'student_key_backed_up';
const MIN_PASSPHRASE   = 8;
const SCRYPT = { N: 1 << 16, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

function deriveWrapKey(passphrase, salt, params) {
  return crypto.scryptSync(String(passphrase), salt, 32, params);
}

/** Wrap the loaded key with a passphrase. Returns a JSON-safe bundle. */
function wrapKey(passphrase) {
  if (!_key) throw new Error('Student data key is not loaded');
  if (String(passphrase || '').length < MIN_PASSPHRASE) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE} characters`);
  }
  const salt = crypto.randomBytes(16);
  const iv   = crypto.randomBytes(12);
  const params = { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p };
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveWrapKey(passphrase, salt, SCRYPT), iv);
  const ct = Buffer.concat([cipher.update(_key), cipher.final()]);
  return {
    format: 'facultymind-student-key', v: 1, kdf: 'scrypt', ...params,
    salt: salt.toString('hex'), iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'), ct: ct.toString('hex'),
    fp: fingerprint(_key), created: new Date().toISOString(),
  };
}

/** Unwrap a bundle. Throws 'Wrong passphrase…' on a bad passphrase or a tampered bundle. */
function unwrapKey(bundle, passphrase) {
  const b = typeof bundle === 'string' ? JSON.parse(bundle) : bundle;
  if (!b || b.format !== 'facultymind-student-key' || b.v !== 1) throw new Error('Not a FacultyMind key recovery file');
  let key;
  try {
    const wk = deriveWrapKey(passphrase, Buffer.from(b.salt, 'hex'), { N: b.N, r: b.r, p: b.p, maxmem: SCRYPT.maxmem });
    const d = crypto.createDecipheriv('aes-256-gcm', wk, Buffer.from(b.iv, 'hex'));
    d.setAuthTag(Buffer.from(b.tag, 'hex'));
    key = Buffer.concat([d.update(Buffer.from(b.ct, 'hex')), d.final()]);
  } catch (_) {
    throw new Error('Wrong passphrase, or the recovery file is damaged');
  }
  if (key.length !== 32 || fingerprint(key) !== b.fp) throw new Error('Wrong passphrase, or the recovery file is damaged');
  return key;
}

/** Fingerprint a DB expects (null = no encrypted student data yet). */
function dbFingerprint(db) {
  return getSetting(db, FP_SETTING);
}

/**
 * Restore the key from a bundle: unwrap, check it belongs to this DB, store it
 * in the keystore (read back), then load it. Nothing changes on any failure.
 */
async function restoreKey(db, keystore, bundle, passphrase) {
  let key;
  try { key = unwrapKey(bundle, passphrase); }
  catch (e) { return { ok: false, error: e.message }; }
  return installKey(db, keystore, key);
}

/** Store an already-unwrapped key for this DB (see restoreKey). */
async function installKey(db, keystore, key) {
  const dbFp = dbFingerprint(db);
  if (dbFp && dbFp !== fingerprint(key)) {
    return { ok: false, error: 'This recovery file belongs to a different FacultyMind database' };
  }
  const stored = await storeAndVerify(keystore, key.toString('hex'));
  if (!stored.ok) return stored;
  useKey(key);
  if (!dbFp) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(FP_SETTING, fingerprint(key));
  return { ok: true };
}

function markBackedUp(db) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(BACKUP_SETTING, new Date().toISOString());
}

/** Key state for the Settings screen. */
function keyStatus(db) {
  return {
    loaded:     !!_key,
    encrypted:  !!dbFingerprint(db) || hasCiphertext(db),
    backedUpAt: getSetting(db, BACKUP_SETTING),
  };
}

module.exports = {
  KEY_SERVICE, CIPHERTEXT, RECOVERY_SETTING, MIN_PASSPHRASE,
  useKey, isReady, loadKey, fingerprint,
  SUBKEY_INFO, deriveSubkey,
  encrypt, reveal, vaultEncrypt, vaultDecrypt, nextSeq, newStudentColumns,
  migrateData, migrateStudents, migrateVault,
  wrapKey, unwrapKey, dbFingerprint, restoreKey, installKey, markBackedUp, keyStatus,
};
