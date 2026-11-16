'use strict';
// S1 key recovery + transfer, through the real main.js IPC handlers.
// "Another laptop" = the same app with an empty keychain.

const h = require('../helpers/harness');
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require(path.join(h.ROOT, 'node_modules', 'better-sqlite3'));

const sc = h.src('modules/security/student-crypto');
const KC = `facultymind_${sc.KEY_SERVICE}|${sc.KEY_SERVICE}`;
const PASS = 'transfer passphrase 1';

let cid;
const names = async () => (await h.invoke('diu:students', cid)).students.map(s => s.name);

before(async () => {
  await h.bootMain();
  cid = (await h.invoke('diu:courses')).courses.find(c => c.code.toLowerCase() === 'ice301').id;
});
after(() => h.src('modules/security/auth').endSession());

// Simulate a computer whose Credential Manager has no key: app restarts.
async function loseKey() {
  h.keyStore.delete(KC);
  sc.useKey(null);
}

describe('student data key: recovery file and DB transfer', () => {
  test('status reports an active key with no recovery saved yet', async () => {
    const s = await h.invoke('student-key:status');
    assert.deepEqual({ ok: s.ok, loaded: s.loaded, encrypted: s.encrypted, backedUpAt: s.backedUpAt },
      { ok: true, loaded: true, encrypted: true, backedUpAt: null });
  });

  test('recovery file: save → key lost → restore with passphrase', async () => {
    const realNames = await names();
    assert.ok(realNames.length > 0 && !realNames[0].startsWith('Student_'), 'names decrypt before');
    const file = path.join(h.tmpRoot, 'recovery.fmkey');
    h.dialogQueue.save.push({ canceled: false, filePath: file });
    const saved = await h.invoke('student-key:save-recovery', { passphrase: PASS });
    assert.equal(saved.ok, true, saved.error);
    assert.ok(!fs.readFileSync(file, 'utf8').includes(h.TEST_STUDENT_KEY), 'raw key not in the file');
    assert.ok((await h.invoke('student-key:status')).backedUpAt);

    await loseKey();
    assert.equal((await h.invoke('student-key:status')).loaded, false);

    h.dialogQueue.open.push({ canceled: false, filePaths: [file] });
    assert.match((await h.invoke('student-key:restore', { passphrase: 'wrong one!!' })).error, /Wrong passphrase/);
    assert.equal(h.keyStore.has(KC), false);

    h.dialogQueue.open.push({ canceled: false, filePaths: [file] });
    assert.deepEqual(await h.invoke('student-key:restore', { passphrase: PASS }), { ok: true });
    assert.equal(h.keyStore.get(KC), h.TEST_STUDENT_KEY);
    assert.deepEqual(await names(), realNames);
  });

  test('export → import on a laptop with an empty keychain', async () => {
    const realNames = await names();
    // BUG-B5 regression: a write just before export must be in the file
    await h.invoke('vault:save', { title: 'written-just-before-export', type: 'note', content: 'x' });
    // BUG-S3: vault secrets travel with the same key
    await h.invoke('vault:save', { title: 'transfer-pw', type: 'password', username: 'u', password: 'Transfer-P@ss-9' });

    assert.deepEqual(await h.invoke('db:export'), { ok: false, needsPassphrase: true });
    const out = path.join(h.tmpRoot, 'transfer.db');
    h.dialogQueue.save.push({ canceled: false, filePath: out });
    const ex = await h.invoke('db:export', { passphrase: PASS });
    assert.equal(ex.ok, true, ex.error);

    const copy = new Database(out, { readonly: true });
    assert.equal(copy.prepare("SELECT COUNT(*) n FROM vault_items WHERE title='written-just-before-export'").get().n, 1);
    const bundle = copy.prepare('SELECT value FROM settings WHERE key=?').get(sc.RECOVERY_SETTING)?.value;
    copy.close();
    assert.ok(bundle && !bundle.includes(h.TEST_STUDENT_KEY), 'export carries the wrapped key only');
    for (const n of realNames) assert.ok(!fs.readFileSync(out).includes(n), 'no plaintext names in the export');

    await loseKey();
    assert.equal((await h.invoke('student-key:status')).loaded, false);

    h.dialogQueue.open.push({ canceled: false, filePaths: [out] });
    assert.deepEqual(await h.invoke('db:import'), { ok: false, needsPassphrase: true });
    const bad = await h.invoke('db:import', { passphrase: 'not the passphrase' });
    assert.equal(bad.needsPassphrase, true);
    assert.match(bad.error, /Wrong passphrase/);
    assert.equal(h.keyStore.has(KC), false, 'nothing stored on a wrong passphrase');

    const ok = await h.invoke('db:import', { passphrase: PASS });
    assert.deepEqual(ok, { ok: true });
    assert.equal(h.keyStore.get(KC), h.TEST_STUDENT_KEY);
    assert.deepEqual(await names(), realNames);
    const pw = (await h.invoke('vault:get')).data.find(i => i.title === 'transfer-pw');
    assert.equal((await h.invoke('vault:decrypt', pw.password_enc)).data, 'Transfer-P@ss-9');
    const s = await h.invoke('student-key:status');
    assert.equal(s.loaded, true);

    // the live DB must not keep the passphrase-wrapped key
    const dbPath = path.join(h.tmpRoot, 'userData', 'facultymind.db');
    const liveDb = new Database(dbPath, { readonly: true });
    assert.equal(liveDb.prepare('SELECT COUNT(*) n FROM settings WHERE key=?').get(sc.RECOVERY_SETTING).n, 0);
    liveDb.close();
  });

  test('import of a file that is not a FacultyMind DB changes nothing', async () => {
    const bogus = path.join(h.tmpRoot, 'bogus.db');
    fs.writeFileSync(bogus, 'not a database');
    const before = await names();
    h.dialogQueue.open.push({ canceled: false, filePaths: [bogus] });
    assert.deepEqual(await h.invoke('db:import'), { ok: false, error: 'Not a FacultyMind database' });
    assert.deepEqual(await names(), before);
  });
});
