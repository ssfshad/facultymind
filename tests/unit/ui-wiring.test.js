'use strict';
// Static wiring checks for the ShadSync import screen (no DOM available under test).

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(h.ROOT, 'src/renderer/index.html'), 'utf8');
const js = fs.readFileSync(path.join(h.ROOT, 'src/renderer/js/shadsync.js'), 'utf8');
const IDS = ['btn-shadsync-import', 'ss-import-file', 'modal-shadsync-import', 'ss-import-body', 'btn-ss-import-cancel', 'btn-ss-import-confirm'];

describe('ShadSync import screen wiring', () => {
  test('every element the script uses exists in the page, exactly once', () => {
    for (const id of IDS) {
      assert.ok(js.includes(`'${id}'`), `${id} not used by shadsync.js`);
      assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must appear once in index.html`);
    }
  });

  test('new markup has no inline event handlers (CSP follow-up)', () => {
    const block = html.slice(html.indexOf('id="btn-shadsync-import"'), html.indexOf('id="btn-shadsync-report"'))
      + html.slice(html.indexOf('id="modal-shadsync-import"'), html.indexOf('id="modal-shadsync-data"'));
    assert.ok(!/\son[a-z]+=/i.test(block), 'inline handler found in the import markup');
  });

  test('sheet-derived text is never inserted as HTML', () => {
    const section = js.slice(js.indexOf('// ── Marks sheet import'), js.indexOf('window.ShadSyncModule = {'));
    assert.ok(section.length > 500);
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(section), 'import section must use textContent only');
  });

  test('course names in the dropdown and student names in the at-risk list are escaped', () => {
    assert.ok(js.includes('esc(c.id)'));
    assert.ok(js.includes('esc(s.name)'));
  });
});
