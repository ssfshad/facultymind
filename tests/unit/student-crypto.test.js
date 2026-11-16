'use strict';
// BUG-S1: real student-identifier encryption + the legacy-row migration

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const sc      = h.src('modules/security/student-crypto');
const queries = h.src('modules/shadsync/shadsync-queries');

const CT = sc.CIPHERTEXT;

function ice301(db) {
  return db.prepare("SELECT id FROM courses WHERE lower(code)='ice301'").get().id;
}

// Insert a row exactly as one of the pre-S1 code paths would have.
function legacyRow(db, cid, cols) {
  return db.prepare(`INSERT INTO students (course_id, student_id_anon, name_anon, enrollment_no_anon, name_enc, student_id_enc, enrollment_no_enc)
                     VALUES (@course_id, @student_id_anon, @name_anon, @enrollment_no_anon, @name_enc, @student_id_enc, @enrollment_no_enc)`)
    .run({ course_id: cid, ...cols }).lastInsertRowid;
}

function withKey(fn) {
  return (...a) => { sc.useKey(h.TEST_STUDENT_KEY); try { return fn(...a); } finally { sc.useKey(h.TEST_STUDENT_KEY); } };
}

describe('student-crypto: storage', () => {
  test('seeded students: every *_enc column is ciphertext and decrypts to the seed name', withKey(() => {
    const { db } = h.freshDb();
    const seed = require(require('path').join(h.ROOT, 'src/database/seeds/ice301_dummy.json'));
    const rows = db.prepare('SELECT * FROM students ORDER BY id').all();
    assert.equal(rows.length, seed.students.length);
    for (const r of rows) {
      for (const c of ['name_enc', 'student_id_enc', 'enrollment_no_enc']) assert.match(r[c], CT, `${c} = ${r[c]}`);
      const s = seed.students.find(x => x.token === r.student_id_anon);
      assert.equal(sc.reveal(r.name_enc, r.name_anon), s.name);
    }
  }));

  test('ShadSync form save round-trips through getCourseData', withKey(() => {
    const { db } = h.freshDb();
    const cid = ice301(db);
    const id = queries.saveStudent(db, { courseId: cid, name: 'Karim Hossain', studentId: '201-15-1234', enrollmentNo: 'EN-77' });
    const row = db.prepare('SELECT * FROM students WHERE id=?').get(id);
    assert.equal(row.student_id_anon, 'S036');
    assert.equal(row.name_anon, 'Student_S036');
    const st = queries.getCourseData(db, cid).students.find(s => s.id === id);
    assert.equal(st.realName, 'Karim Hossain');
    assert.equal(st.realId, '201-15-1234');
  }));

  test('the DB file contains no plaintext name after a save', withKey(() => {
    const { db, file } = h.freshDb();
    queries.saveStudent(db, { courseId: ice301(db), name: 'Zubaida Unique-Name' });
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    assert.ok(!require('fs').readFileSync(file).includes('Zubaida'));
  }));

  test('tokens never repeat after a deletion (max + 1, not count + 1)', withKey(() => {
    const { db } = h.freshDb();
    const cid = ice301(db);
    const del = db.prepare("SELECT id FROM students WHERE student_id_anon='S010'").get().id;
    for (const t of ['marks', 'attendance', 'diu_marks']) db.prepare(`DELETE FROM ${t} WHERE student_id=?`).run(del);
    db.prepare('DELETE FROM students WHERE id=?').run(del);
    const id = queries.saveStudent(db, { courseId: cid, name: 'New' });
    const tok = db.prepare('SELECT student_id_anon FROM students WHERE id=?').get(id).student_id_anon;
    assert.equal(tok, 'S036');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM students WHERE course_id=? AND student_id_anon=?').get(cid, tok).n, 1);
  }));

  test('without a key, saving refuses instead of writing plaintext', () => {
    const { db } = h.freshDb();
    sc.useKey(null);
    try {
      assert.throws(() => queries.saveStudent(db, { courseId: ice301(db), name: 'Nobody' }), /key is not loaded/);
      // and reads fall back to the token rather than throwing
      const r = db.prepare('SELECT * FROM students LIMIT 1').get();
      assert.equal(sc.reveal(r.name_enc, r.name_anon), r.name_anon);
    } finally { sc.useKey(h.TEST_STUDENT_KEY); }
  });
});

describe('student-crypto: migration of pre-S1 rows', () => {
  test('converts all three legacy shapes and is idempotent', withKey(() => {
    const { db } = h.freshDb();
    const cid = ice301(db);
    const a = legacyRow(db, cid, { student_id_anon: 'S100', name_anon: 'Student_S100', enrollment_no_anon: 'E100',
      name_enc: 'Legacy Suffix_enc', student_id_enc: 'S100_enc', enrollment_no_enc: 'E100_enc' });          // seeder / form *_enc
    const b = legacyRow(db, cid, { student_id_anon: 'S101', name_anon: 'Student_S101', enrollment_no_anon: 'E101',
      name_enc: 'Chat Plain', student_id_enc: 'S101', enrollment_no_enc: 'E101' });                         // chat add-student
    const c = legacyRow(db, cid, { student_id_anon: '201-15-9999', name_anon: 'Form Real Name', enrollment_no_anon: 'EN-9',
      name_enc: 'Form Real Name_enc', student_id_enc: '201-15-9999_enc', enrollment_no_enc: 'EN-9_enc' });  // form put real data in *_anon

    const r1 = sc.migrateStudents(db);
    assert.deepEqual(
      { legacySuffix: r1.legacySuffix, plaintext: r1.plaintext, realValuesInAnon: r1.realValuesInAnon, retokened: r1.retokened },
      { legacySuffix: 3, plaintext: 3, realValuesInAnon: 1, retokened: 1 });

    const get = (id) => db.prepare('SELECT * FROM students WHERE id=?').get(id);
    assert.equal(sc.reveal(get(a).name_enc), 'Legacy Suffix');
    assert.equal(sc.reveal(get(a).student_id_enc), 'S100');
    assert.equal(sc.reveal(get(b).name_enc), 'Chat Plain');
    const rc = get(c);
    assert.equal(rc.student_id_anon, 'S102');
    assert.equal(rc.name_anon, 'Student_S102');
    assert.equal(rc.enrollment_no_anon, 'E102');
    assert.equal(sc.reveal(rc.name_enc), 'Form Real Name');
    assert.equal(sc.reveal(rc.student_id_enc), '201-15-9999');
    assert.equal(sc.reveal(rc.enrollment_no_enc), 'EN-9');

    const total = db.prepare('SELECT COUNT(*) n FROM students').get().n;
    const r2 = sc.migrateStudents(db);
    assert.equal(r2.alreadyEncrypted, total);
    assert.equal(sc.reveal(get(c).name_enc), 'Form Real Name');
  }));

  test('migration leaves marks/attendance links and attainment unchanged', withKey(() => {
    const { db } = h.freshDb();
    const engine = h.src('modules/shadsync/shadsync-engine');
    const cid = ice301(db);
    // Put the seeded rows back into the legacy shape, then migrate again.
    for (const r of db.prepare('SELECT * FROM students').all()) {
      db.prepare('UPDATE students SET name_enc=?, student_id_enc=?, enrollment_no_enc=? WHERE id=?')
        .run(sc.reveal(r.name_enc) + '_enc', r.student_id_anon + '_enc', r.enrollment_no_anon + '_enc', r.id);
    }
    const before = engine.calculateCourseAttainment(db, cid);
    const counts = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
    const pre = ['students', 'marks', 'attendance', 'diu_marks'].map(counts);
    sc.migrateStudents(db);
    assert.deepEqual(['students', 'marks', 'attendance', 'diu_marks'].map(counts), pre);
    assert.deepEqual(engine.calculateCourseAttainment(db, cid).clo, before.clo);
  }));
});

describe('student-crypto: key safety', () => {
  const store = () => {
    const m = new Map();
    return { m, getKey: async (s) => m.get(s) ?? null, setKey: async (s, k) => { m.set(s, k); } };
  };

  test('first run creates and stores a key', async () => {
    const { db } = h.freshDb();
    db.prepare("DELETE FROM settings WHERE key='student_key_fp'").run();
    db.prepare('DELETE FROM attendance').run(); db.prepare('DELETE FROM marks').run(); db.prepare('DELETE FROM diu_marks').run();
    db.prepare('DELETE FROM students').run();
    const ks = store();
    const r = await sc.loadKey(db, ks);
    assert.equal(r.ok, true); assert.equal(r.created, true);
    assert.match(ks.m.get(sc.KEY_SERVICE), /^[0-9a-f]{64}$/);
    sc.useKey(h.TEST_STUDENT_KEY);
  });

  test('never creates a new key when the DB already holds ciphertext', async () => {
    const { db } = h.freshDb();
    const r = await sc.loadKey(db, store());
    assert.equal(r.ok, false);
    assert.match(r.error, /not in this computer's keychain/);
    assert.equal(sc.isReady(), false);
    sc.useKey(h.TEST_STUDENT_KEY);
  });

  test('refuses a keychain key that does not match the DB', async () => {
    const { db } = h.freshDb();
    const ks = store(); ks.m.set(sc.KEY_SERVICE, 'b2'.repeat(32));
    const r = await sc.loadKey(db, ks);
    assert.equal(r.ok, false);
    assert.match(r.error, /does not match/);
    sc.useKey(h.TEST_STUDENT_KEY);
  });

  test('loads the matching key', async () => {
    const { db } = h.freshDb();
    const ks = store(); ks.m.set(sc.KEY_SERVICE, h.TEST_STUDENT_KEY);
    assert.deepEqual(await sc.loadKey(db, ks), { ok: true, created: false });
  });
});

// ── Order, atomicity, recovery (S1 pre-migration review) ─────────────────────

// A pre-S1 database: legacy "X_enc" rows, no key fingerprint yet.
function legacyDb() {
  const { db, file } = h.freshDb();
  for (const t of ['attendance', 'marks', 'diu_marks', 'students']) db.prepare(`DELETE FROM ${t}`).run();
  db.prepare("DELETE FROM settings WHERE key='student_key_fp'").run();
  const cid = ice301(db);
  for (let i = 1; i <= 5; i++) {
    const n = String(i).padStart(3, '0');
    legacyRow(db, cid, { student_id_anon: `S${n}`, name_anon: `Student_S${n}`, enrollment_no_anon: `E${n}`,
      name_enc: `Legacy Name ${i}_enc`, student_id_enc: `S${n}_enc`, enrollment_no_enc: `E${n}_enc` });
  }
  const snapshot = () => JSON.stringify(db.prepare('SELECT * FROM students ORDER BY id').all());
  return { db, file, cid, snapshot };
}

// Same sequence as main.js initStudentCrypto()
async function startup(db, ks) {
  const r = await sc.loadKey(db, ks);
  if (!r.ok) return { loaded: r };
  return { loaded: r, report: sc.migrateStudents(db) };
}

describe('student-crypto: key is stored and verified before any row is encrypted', () => {
  const failing = {
    write:    { getKey: async () => null, setKey: async () => { throw new Error('Credential Manager unavailable'); } },
    readback: { getKey: async () => null, setKey: async () => {} },  // write "succeeds", nothing reads back
  };

  for (const mode of ['write', 'readback']) {
    test(`keychain ${mode} failure: migration does not run, rows untouched, no fingerprint`, async () => {
      sc.useKey(null);
      const { db, snapshot } = legacyDb();
      const before = snapshot();
      const s = await startup(db, failing[mode]);
      assert.equal(s.loaded.ok, false);
      assert.match(s.loaded.error, /Could not store the student data key/);
      assert.equal(s.report, undefined);
      assert.equal(sc.isReady(), false);
      assert.equal(snapshot(), before);
      assert.equal(sc.dbFingerprint(db), null);
      sc.useKey(h.TEST_STUDENT_KEY);
    });
  }

  test('migration is one transaction: a failure on one row leaves every row as it was', withKey(() => {
    const { db, snapshot } = legacyDb();
    const victim = db.prepare('SELECT id FROM students ORDER BY id LIMIT 1 OFFSET 3').get().id;
    db.exec(`CREATE TRIGGER boom BEFORE UPDATE ON students WHEN OLD.id = ${victim} BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    const before = snapshot();
    assert.throws(() => sc.migrateStudents(db), /boom/);
    assert.equal(snapshot(), before);
    db.exec('DROP TRIGGER boom');
    const r = sc.migrateStudents(db);
    assert.equal(r.legacySuffix, 15);
    assert.equal(sc.migrateStudents(db).alreadyEncrypted, 5, 'second run is a no-op');
  }));
});

describe('student-crypto: recovery file', () => {
  const store = () => {
    const m = new Map();
    return { m, getKey: async (s) => m.get(s) ?? null, setKey: async (s, k) => { m.set(s, k); } };
  };

  test('wrap → unwrap round-trips; wrong or short passphrase and tampering are refused', withKey(() => {
    const b = sc.wrapKey('correct horse battery');
    assert.ok(!JSON.stringify(b).includes(h.TEST_STUDENT_KEY), 'key must not appear in the bundle');
    assert.equal(sc.unwrapKey(b, 'correct horse battery').toString('hex'), h.TEST_STUDENT_KEY);
    assert.equal(sc.unwrapKey(JSON.stringify(b), 'correct horse battery').toString('hex'), h.TEST_STUDENT_KEY);
    assert.throws(() => sc.unwrapKey(b, 'wrong passphrase'), /Wrong passphrase/);
    assert.throws(() => sc.unwrapKey({ ...b, ct: '00' + b.ct.slice(2) }, 'correct horse battery'), /Wrong passphrase/);
    assert.throws(() => sc.wrapKey('short'), /at least 8/);
    assert.throws(() => sc.unwrapKey({ hello: 1 }, 'x'), /Not a FacultyMind key recovery file/);
  }));

  test('lost keychain (reinstall / new profile): restore brings every name back', async () => {
    sc.useKey(null);
    const { db } = legacyDb();
    const ks = store();
    await startup(db, ks);
    const bundle = JSON.stringify(sc.wrapKey('my recovery phrase'));
    const names = () => db.prepare('SELECT * FROM students ORDER BY id').all().map(r => sc.reveal(r.name_enc, r.name_anon));
    const expected = names();
    assert.equal(expected[0], 'Legacy Name 1');

    // New Windows profile: empty keychain, app restarts
    const fresh = store();
    sc.useKey(null);
    assert.equal((await sc.loadKey(db, fresh)).ok, false);
    assert.deepEqual(names(), ['Student_S001', 'Student_S002', 'Student_S003', 'Student_S004', 'Student_S005']);

    assert.match((await sc.restoreKey(db, fresh, bundle, 'nope nope nope')).error, /Wrong passphrase/);
    assert.equal(fresh.m.size, 0, 'nothing stored on a wrong passphrase');
    assert.deepEqual(await sc.restoreKey(db, fresh, bundle, 'my recovery phrase'), { ok: true });
    assert.deepEqual(names(), expected);
    sc.useKey(null);
    assert.deepEqual(await sc.loadKey(db, fresh), { ok: true, created: false }, 'key survives the next restart');
    sc.useKey(h.TEST_STUDENT_KEY);
  });

  test('a recovery file from another database is refused and the keychain is left alone', withKey(async () => {
    const { db } = h.freshDb();                       // fingerprint of TEST_STUDENT_KEY
    sc.useKey('c3'.repeat(32));
    const otherBundle = sc.wrapKey('other laptop phrase');
    const ks = store(); ks.m.set(sc.KEY_SERVICE, h.TEST_STUDENT_KEY);
    const r = await sc.restoreKey(db, ks, otherBundle, 'other laptop phrase');
    assert.equal(r.ok, false);
    assert.match(r.error, /different FacultyMind database/);
    assert.equal(ks.m.get(sc.KEY_SERVICE), h.TEST_STUDENT_KEY);
  }));
});

// ── BUG-S3: vault items move to the per-install key ──────────────────────────

describe('student-crypto: vault migration (S3)', () => {
  const enc = h.src('modules/security/encryption');
  const LEGACY = Buffer.from('facultymind_shadsync_vault_aes256_key_v1_2026!!'.slice(0, 32), 'utf8');

  // Rows as pre-S3 code wrote them (default hard-coded key), plus edge cases.
  function vaultDb() {
    const { db, file } = h.freshDb();
    db.prepare('DELETE FROM vault_items').run();
    const ins = db.prepare('INSERT INTO vault_items (title, type, content_enc, username_enc, password_enc, url) VALUES (?, ?, ?, ?, ?, ?)');
    ins.run('BLC', 'password', '', enc.encryptField('shad', LEGACY), enc.encryptField('Legacy-P@ss-1', LEGACY), '');
    ins.run('Note', 'note', enc.encryptField('Legacy secret note', LEGACY), '', '', '');
    ins.run('Link', 'link', '', null, null, 'https://example.edu');
    ins.run('Plain', 'note', 'Plaintext note body', '', '', '');
    ins.run('Broken', 'note', enc.encryptField('other key', 'd5'.repeat(32)), '', '', '');
    const snapshot = () => JSON.stringify(db.prepare('SELECT * FROM vault_items ORDER BY id').all());
    return { db, file, snapshot };
  }

  test('legacy-key and plaintext values are re-encrypted; the source key no longer opens them', withKey(() => {
    const { db } = vaultDb();
    const r = sc.migrateVault(db);
    assert.deepEqual(r, { items: 5, values: 5, alreadySubkey: 0, legacyKey: 3, masterKey: 0, plaintext: 1, unreadable: 1 });
    const row = (t) => db.prepare('SELECT * FROM vault_items WHERE title=?').get(t);
    assert.equal(sc.vaultDecrypt(row('BLC').password_enc), 'Legacy-P@ss-1');
    assert.equal(sc.vaultDecrypt(row('BLC').username_enc), 'shad');
    assert.equal(sc.vaultDecrypt(row('Note').content_enc), 'Legacy secret note');
    assert.equal(sc.vaultDecrypt(row('Plain').content_enc), 'Plaintext note body');
    assert.throws(() => enc.decryptField(row('BLC').password_enc, LEGACY));
    assert.equal(row('Link').url, 'https://example.edu');
  }));

  test('second run is a no-op; unreadable values are left untouched', withKey(() => {
    const { db, snapshot } = vaultDb();
    const broken = db.prepare("SELECT content_enc FROM vault_items WHERE title='Broken'").get().content_enc;
    sc.migrateVault(db);
    const once = snapshot();
    assert.deepEqual(sc.migrateVault(db), { items: 5, values: 5, alreadySubkey: 4, legacyKey: 0, masterKey: 0, plaintext: 0, unreadable: 1 });
    assert.equal(snapshot(), once);
    assert.equal(db.prepare("SELECT content_enc FROM vault_items WHERE title='Broken'").get().content_enc, broken);
  }));

  test('one transaction: a failure on one item leaves every item as it was', withKey(() => {
    const { db, snapshot } = vaultDb();
    const victim = db.prepare("SELECT id FROM vault_items WHERE title='Plain'").get().id;
    db.exec(`CREATE TRIGGER boom BEFORE UPDATE ON vault_items WHEN OLD.id = ${victim} BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    const before = snapshot();
    assert.throws(() => sc.migrateVault(db), /boom/);
    assert.equal(snapshot(), before);
  }));

  test('no plaintext vault values left in the DB file after migration', withKey(() => {
    const { db, file } = vaultDb();
    sc.migrateVault(db);
    db.close();
    const bytes = require('fs').readFileSync(file);
    assert.ok(!bytes.includes('Plaintext note body'));
  }));

  test('without the key, vault save and decrypt refuse instead of using a default', () => {
    sc.useKey(null);
    assert.throws(() => sc.encrypt('x'), /not loaded/);
    assert.throws(() => sc.vaultEncrypt('x'), /not loaded/);
    assert.throws(() => sc.vaultDecrypt('00'.repeat(12) + ':' + '00'.repeat(16) + ':00'), /not loaded/);
    sc.useKey(h.TEST_STUDENT_KEY);
  });
});

// ── S3: HKDF subkeys — student data and vault never use the master key ──────

describe('student-crypto: HKDF subkeys', () => {
  const enc = h.src('modules/security/encryption');
  const crypto = require('crypto');
  const MASTER = Buffer.from(h.TEST_STUDENT_KEY, 'hex');
  const sub = (info) => Buffer.from(crypto.hkdfSync('sha256', MASTER, Buffer.alloc(0), info, 32));

  test('subkeys are HKDF-SHA256(master, info) with the agreed labels, and all differ', () => {
    assert.deepEqual(sc.SUBKEY_INFO, { students: 'facultymind/student-data/v1', vault: 'facultymind/vault/v1' });
    const s = sub('facultymind/student-data/v1'), v = sub('facultymind/vault/v1');
    assert.deepEqual(sc.deriveSubkey(MASTER, sc.SUBKEY_INFO.students), s);
    assert.notDeepEqual(s, v);
    assert.notDeepEqual(s, MASTER);
    assert.notDeepEqual(v, MASTER);
  });

  test('student values open only with the student subkey; vault values only with the vault subkey', withKey(() => {
    const st = sc.encrypt('Student Name'), vt = sc.vaultEncrypt('vault secret');
    assert.equal(enc.decryptField(st, sub(sc.SUBKEY_INFO.students)), 'Student Name');
    assert.equal(enc.decryptField(vt, sub(sc.SUBKEY_INFO.vault)), 'vault secret');
    for (const [c, wrong] of [[st, MASTER], [st, sub(sc.SUBKEY_INFO.vault)], [vt, MASTER], [vt, sub(sc.SUBKEY_INFO.students)]]) {
      assert.throws(() => enc.decryptField(c, wrong));
    }
    assert.throws(() => sc.vaultDecrypt(st), 'a student value must not open as a vault value');
  }));

  // DB exactly as it stands after S1 (students under the master key) and before S3 (vault under the source key)
  function postS1Db() {
    const { db, file } = h.freshDb();
    const LEGACY = Buffer.from('facultymind_shadsync_vault_aes256_key_v1_2026!!'.slice(0, 32), 'utf8');
    const rows = db.prepare('SELECT * FROM students').all();
    const up = db.prepare('UPDATE students SET name_enc=?, student_id_enc=?, enrollment_no_enc=? WHERE id=?');
    const plain = new Map();
    for (const r of rows) {
      const vals = ['name_enc', 'student_id_enc', 'enrollment_no_enc'].map(c => sc.reveal(r[c], null));
      plain.set(r.id, vals);
      up.run(...vals.map(v => enc.encryptField(v, MASTER)), r.id);
    }
    db.prepare('DELETE FROM vault_items').run();
    db.prepare("INSERT INTO vault_items (title, type, content_enc, username_enc, password_enc) VALUES ('BLC','password','',?,?)")
      .run(enc.encryptField('shad', LEGACY), enc.encryptField('Legacy-P@ss-1', LEGACY));
    const snapshot = () => JSON.stringify([db.prepare('SELECT * FROM students ORDER BY id').all(), db.prepare('SELECT * FROM vault_items ORDER BY id').all()]);
    return { db, file, plain, snapshot, n: rows.length };
  }

  test('S3 migration re-keys every S1 student value and the vault, in one pass', withKey(() => {
    const { db, plain, n } = postS1Db();
    const { students, vault } = sc.migrateData(db);
    assert.equal(students.masterKey, n * 3);
    assert.equal(students.alreadyEncrypted, 0);
    assert.equal(students.unreadable, 0);
    assert.deepEqual(vault, { items: 1, values: 2, alreadySubkey: 0, legacyKey: 2, masterKey: 0, plaintext: 0, unreadable: 0 });
    for (const r of db.prepare('SELECT * FROM students').all()) {
      const vals = ['name_enc', 'student_id_enc', 'enrollment_no_enc'].map(c => r[c]);
      assert.deepEqual(vals.map(v => enc.decryptField(v, sub(sc.SUBKEY_INFO.students))), plain.get(r.id));
      for (const v of vals) assert.throws(() => enc.decryptField(v, MASTER), 'master key must not open student values');
    }
    const again = sc.migrateData(db);
    assert.equal(again.students.alreadyEncrypted, n);
    assert.equal(again.students.masterKey, 0);
    assert.equal(again.vault.alreadySubkey, 2);
  }));

  test('S3 migration is one transaction across students and vault', withKey(() => {
    const { db, snapshot } = postS1Db();
    const victim = db.prepare('SELECT id FROM vault_items').get().id;
    db.exec(`CREATE TRIGGER boom BEFORE UPDATE ON vault_items WHEN OLD.id = ${victim} BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    const before = snapshot();
    assert.throws(() => sc.migrateData(db), /boom/);
    assert.equal(snapshot(), before, 'a vault failure must also roll back the student re-key');
  }));

  test('recovery file still carries only the master key and restores both subkeys', withKey(async () => {
    const st = sc.encrypt('Student Name'), vt = sc.vaultEncrypt('vault secret');
    const bundle = sc.wrapKey('recovery phrase 1');
    sc.useKey(null);
    sc.useKey(sc.unwrapKey(bundle, 'recovery phrase 1'));
    assert.equal(sc.reveal(st, null), 'Student Name');
    assert.equal(sc.vaultDecrypt(vt), 'vault secret');
  }));
});
