'use strict';
// BUG-S4: email fields are attacker-controlled and must render as text.
// Runs the real src/renderer/js/email.js against a minimal fake DOM and
// pushes an inbox update the way the main process does.

const h = require('../helpers/harness');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEmailModule() {
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, {
      id, innerHTML: '', textContent: '', style: {}, disabled: false,
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener() {},
    });
    return elements.get(id);
  };
  let pushInbox = null;
  const window = {
    api: { email: { onInboxUpdate: (cb) => { pushInbox = cb; }, onNewCount() {} } },
  };
  const ctx = {
    window, console, setTimeout, Date,
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [] },
    confirm: () => false,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(h.ROOT, 'src/renderer/js/email.js'), 'utf8'), ctx);
  ctx.window.EmailModule.init();
  return { push: (emails) => pushInbox({ emails }), list: () => el('email-inbox-list').innerHTML };
}

test('BUG-S4: HTML in sender, subject, category, summary and snippet is rendered as text', () => {
  const m = loadEmailModule();
  const evil = `<img src=x onerror="document.title='PWNED'">`;
  m.push([
    { from_name: `Exam Office ${evil}`, subject: `Result notice ${evil}`, snippet: `Please ${evil}`, ai_category: `Work${evil}` },
    { from_name: '<b>X</b>', subject: 's', ai_summary: `Summary ${evil}`, ai_category: 'Personal' },
  ]);
  const html = m.list();
  assert.ok(!/<img|<b>/i.test(html), 'raw tags must not reach innerHTML');
  assert.match(html, /&lt;img src=x onerror=&quot;document\.title=&#39;PWNED&#39;&quot;&gt;/);
  assert.match(html, /Result notice/);
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt;/);
});
