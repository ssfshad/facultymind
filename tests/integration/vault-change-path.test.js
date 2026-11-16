'use strict';
// BUG-B5: moving the DB folder must carry writes that are still in the WAL.
// Own file: vault:change-path saves a custom DB path that would affect other tests.

const h = require('../helpers/harness');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require(path.join(h.ROOT, 'node_modules', 'better-sqlite3'));

before(() => h.bootMain());
after(() => h.src('modules/security/auth').endSession());

test('BUG-B5: vault:change-path copies recent writes', async () => {
  await h.invoke('vault:save', { title: 'written-just-before-move', type: 'note', content: 'x' });
  const folder = fs.mkdtempSync(path.join(h.tmpRoot, 'moved-'));
  h.dialogQueue.open.push({ canceled: false, filePaths: [folder] });
  const r = await h.invoke('vault:change-path');
  assert.equal(r.ok, true, r.error);
  const copy = new Database(r.path, { readonly: true });
  const n = copy.prepare("SELECT COUNT(*) n FROM vault_items WHERE title='written-just-before-move'").get().n;
  copy.close();
  assert.equal(n, 1);
});
