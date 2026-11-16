'use strict';
// BUG-S7 + DevTools: window hardening, as the installed (packaged) app.
// Own file: it boots main.js with app.isPackaged = true.

const h = require('../helpers/harness');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const electron = require('electron');   // the harness fake
let win;

before(async () => {
  electron.app.isPackaged = true;
  await h.bootMain();
  win = electron.BrowserWindow.getAllWindows()[0];
});
after(() => h.src('modules/security/auth').endSession());

const fire = (ev, ...args) => {
  let prevented = false;
  win.webContents._events[ev]({ preventDefault: () => { prevented = true; } }, ...args);
  return prevented;
};

test('packaged build: DevTools off, sandboxed renderer, no Node', () => {
  const wp = win.opts.webPreferences;
  assert.equal(wp.devTools, false);
  assert.equal(wp.sandbox, true);
  assert.equal(wp.nodeIntegration, false);
  assert.equal(wp.contextIsolation, true);
});

test('BUG-S7: the main window cannot be navigated away from the app', () => {
  const index = pathToFileURL(path.join(h.ROOT, 'src/renderer/index.html')).href;
  assert.equal(fire('will-navigate', index), false, 'own page allowed');
  assert.equal(fire('will-navigate', `${index}#settings`), false, 'in-page anchor allowed');
  for (const url of ['https://evil.example/phish', 'file:///C:/Windows/win.ini', 'http://teacherportal.diu.edu.bd/']) {
    assert.equal(fire('will-navigate', url), true, url);
  }
});

test('BUG-S7: new windows never open in the app; only https goes to the system browser', () => {
  const before = h.openedExternal.length;
  assert.deepEqual(win.webContents._windowOpenHandler({ url: 'https://diu.edu.bd/notice' }), { action: 'deny' });
  assert.deepEqual(win.webContents._windowOpenHandler({ url: 'file:///C:/secret.txt' }), { action: 'deny' });
  assert.deepEqual(h.openedExternal.slice(before), ['https://diu.edu.bd/notice']);
});

test('BUG-S7: webviews only for the DIU portals, stripped of preload/Node, sandboxed', () => {
  for (const src of ['https://teacherportal.diu.edu.bd/', 'https://elearn.daffodilvarsity.edu.bd/course/1']) {
    const prefs = { preload: 'C:/evil.js', nodeIntegration: true, contextIsolation: false, sandbox: false };
    assert.equal(fire('will-attach-webview', prefs, { src }), false, src);
    assert.deepEqual({ preload: prefs.preload, node: prefs.nodeIntegration, iso: prefs.contextIsolation, sandbox: prefs.sandbox, devTools: prefs.devTools },
      { preload: undefined, node: false, iso: true, sandbox: true, devTools: false });
  }
  for (const src of ['https://evil.example/', 'http://teacherportal.diu.edu.bd/', 'https://teacherportal.diu.edu.bd.evil.example/', 'file:///C:/x.html']) {
    assert.equal(fire('will-attach-webview', {}, { src }), true, src);
  }
});
