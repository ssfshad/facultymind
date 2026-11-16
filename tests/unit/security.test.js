'use strict';
// Safety net + bug repros for src/modules/security (encryption, auth, portable config)

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const enc  = h.src('modules/security/encryption');
const auth = h.src('modules/security/auth');

describe('encryption: field encryption', () => {
  const K = 'c4'.repeat(32);
  test('round-trips text including unicode', () => {
    for (const s of ['hello', '', 'বাংলা নাম', 'a:b:c', 'x'.repeat(10_000)]) {
      assert.equal(enc.decryptField(enc.encryptField(s, K), K), s);
    }
  });

  test('uses a fresh IV every call (same input → different ciphertext)', () => {
    assert.notEqual(enc.encryptField('same', K), enc.encryptField('same', K));
  });

  test('detects tampering (GCM auth tag)', () => {
    const c = enc.encryptField('secret', K);
    const [iv, tag, data] = c.split(':');
    const flipped = (data[0] === 'a' ? 'b' : 'a') + data.slice(1);
    assert.throws(() => enc.decryptField(`${iv}:${tag}:${flipped}`, K));
  });

  test('null/undefined plaintext encrypts to empty string', () => {
    assert.equal(enc.decryptField(enc.encryptField(null, K), K), '');
    assert.equal(enc.decryptField(enc.encryptField(undefined, K), K), '');
  });

  test('explicit hex key works and wrong key fails', () => {
    const k1 = 'a'.repeat(64), k2 = 'b'.repeat(64);
    const c = enc.encryptField('x', k1);
    assert.equal(enc.decryptField(c, k1), 'x');
    assert.throws(() => enc.decryptField(c, k2));
  });

  test('BUG-S3: there is no default key — encrypting or decrypting without one is refused', () => {
    assert.throws(() => enc.encryptField('vault password'), /Encryption key required/);
    assert.throws(() => enc.decryptField(enc.encryptField('x', K)), /Encryption key required/);
  });

  test('BUG-S3: vault values cannot be decrypted with the key printed in source', () => {
    // Any copy of the source used to decrypt any install's vault.
    const sc = h.src('modules/security/student-crypto');
    sc.useKey(h.TEST_STUDENT_KEY);
    const c = sc.vaultEncrypt('vault password');
    const leaked = Buffer.from('facultymind_shadsync_vault_aes256_key_v1_2026!!'.slice(0, 32), 'utf8');
    assert.throws(() => enc.decryptField(c, leaked), 'ciphertext must not be decryptable with the key printed in source');
    assert.equal(sc.vaultDecrypt(c), 'vault password');
  });
});

describe('encryption: anonymise / reAssociate', () => {
  const students = [
    { id: 1, name: 'Alice Akter',  student_id: '221-15-0001', enrollment_no: 'EN-1' },
    { id: 2, name: 'Bashir Uddin', student_id: '221-15-0002', enrollment_no: 'EN-2' },
  ];

  test('anonymise replaces every identifier', () => {
    const { anonymised } = enc.anonymise(students);
    const blob = JSON.stringify(anonymised);
    for (const s of students) {
      assert.ok(!blob.includes(s.name));
      assert.ok(!blob.includes(s.student_id));
    }
  });

  test('reAssociate restores names and IDs', () => {
    const { mapping } = enc.anonymise(students);
    const out = enc.reAssociate('Student_S002 (S002, E002) beat Student_S001.', mapping);
    assert.equal(out, 'Bashir Uddin (221-15-0002, EN-2) beat Alice Akter.');
  });

  test('BUG-R1: names containing "$" are restored literally', () => {
    const { mapping } = enc.anonymise([{ id: 1, name: "Mr. $& Rahman", student_id: 'X1', enrollment_no: 'E' }]);
    assert.equal(enc.reAssociate('Student_S001 passed', mapping), 'Mr. $& Rahman passed');
  });

  test('BUG-S2: every cloud sender in model-router is only called through the redacting sendCloud()', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(h.ROOT, 'src/modules/ai/model-router.js'), 'utf8');
    for (const fn of ['sendClaude', 'sendGPT4o', 'sendGemini', 'sendOpenRouter']) {
      const direct = [...src.matchAll(new RegExp(`(?<!function |sendCloud\\()\\b${fn}\\(`, 'g'))];
      assert.equal(direct.length, 0, `${fn}( is called directly, bypassing sendCloud`);
      assert.ok(src.includes(`sendCloud(${fn},`), `${fn} is never routed through sendCloud`);
    }
    // No other file talks to a cloud AI endpoint directly (WhisperFlow audio is the known Labs exception)
    const hits = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) { if (!/renderer/.test(p)) walk(p); continue; }
        if (!p.endsWith('.js') || p.endsWith('model-router.js') || p.endsWith('whisperflow.js')) continue;
        if (/api\.anthropic\.com|api\.openai\.com|generativelanguage|openrouter\.ai\/api|@anthropic-ai\/sdk|require\('openai'\)|@google\/generative-ai/.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
      }
    })(path.join(h.ROOT, 'src'));
    assert.deepEqual(hits, []);
  });
});

describe('auth: PIN', () => {
  function freshAuth() {
    // auth.js keeps lockout state in module scope — reload for isolation
    delete require.cache[require.resolve(require('path').join(h.ROOT, 'src/modules/security/auth'))];
    return h.src('modules/security/auth');
  }

  test('setup → verify correct / incorrect', () => {
    const a = freshAuth();
    const { db } = h.freshDb();
    assert.equal(a.isFirstLaunch(db), true);
    a.setupPin(db, '4321');
    assert.equal(a.isFirstLaunch(db), false);
    assert.equal(a.verifyPin(db, '4321'), true);
    assert.equal(a.verifyPin(db, '0000'), false);
  });

  test('rejects PINs shorter than 4', () => {
    const a = freshAuth();
    const { db } = h.freshDb();
    assert.throws(() => a.setupPin(db, '12'), /at least 4/);
    assert.throws(() => a.setupPin(db, ''), /at least 4/);
  });

  test('locks out after 3 wrong attempts', () => {
    const a = freshAuth();
    const { db } = h.freshDb();
    a.setupPin(db, '4321');
    assert.equal(a.verifyPin(db, '1111'), false);
    assert.equal(a.verifyPin(db, '2222'), false);
    assert.throws(() => a.verifyPin(db, '3333'), /Too many wrong attempts/);
    assert.throws(() => a.verifyPin(db, '4321'), /Too many wrong attempts/, 'correct PIN is refused while locked');
  });

  test('BUG-A1: lockout is forgotten when the app restarts', { todo: 'BUG-A1 in-memory lockout' }, () => {
    const { db } = h.freshDb();
    let a = freshAuth();
    a.setupPin(db, '4321');
    a.verifyPin(db, '1111'); a.verifyPin(db, '2222');
    assert.throws(() => a.verifyPin(db, '3333'));
    a = freshAuth(); // simulates app restart
    assert.throws(() => a.verifyPin(db, '4321'), /Too many/, 'lockout should survive restart');
  });

  test('BUG-A2: numeric PIN bypasses the length check and crashes', { todo: 'BUG-A2 no type validation' }, () => {
    const a = freshAuth();
    const { db } = h.freshDb();
    // IPC payloads are untyped; a number has no .length so the guard passes,
    // then pbkdf2Sync throws a raw TypeError instead of a friendly validation error.
    assert.throws(() => a.setupPin(db, 12), /at least 4/);
  });

  test('session starts inactive, becomes active after startSession, ends on endSession', () => {
    const a = freshAuth();
    const { db } = h.freshDb();
    assert.equal(a.isSessionActive(), false);
    a.startSession(db);
    assert.equal(a.isSessionActive(), true);
    a.endSession();
    assert.equal(a.isSessionActive(), false);
  });
});
