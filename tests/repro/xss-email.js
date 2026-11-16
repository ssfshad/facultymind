/**
 * Repro for BUG-S4 — stored XSS via email subject.
 *
 * Run with the real Electron (not ELECTRON_RUN_AS_NODE):
 *   npx electron tests/repro/xss-email.js
 *
 * Loads a hidden page with the exact CSP from src/renderer/index.html, renders
 * an email with the same template string used in src/renderer/js/email.js
 * (renderEmails), and reports whether an inline event handler in the subject
 * executed. Exit code 1 = vulnerable, 0 = blocked.
 *
 * Status: email.js now escapes every field (fixed, regression test
 * tests/unit/email-render.test.js). This script still renders the OLD
 * unescaped template, so it keeps printing VULNERABLE: it shows that the CSP
 * ('unsafe-inline' in script-src) does not stop inline handlers on its own.
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(indexHtml)[1];

const page = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}"></head>
<body><div id="email-inbox-list"></div></body></html>`;

// What an attacker controls: the Subject header of an email sent to the professor.
const email = {
  from_name: 'Exam Office',
  subject: `Result notice <img src=x onerror="document.title='PWNED'">`,
  snippet: 'Please check',
  ai_category: 'Work',
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
  await win.webContents.executeJavaScript(`
    const email = ${JSON.stringify(email)};
    document.getElementById('email-inbox-list').innerHTML = \`
      <div class="email-item"><div class="email-body">
        <span class="email-sender">\${email.from_name}</span>
        <div class="email-subject">\${email.subject}</div>
        <div class="email-preview">\${email.snippet}</div>
      </div></div>\`;
  `);
  await new Promise(r => setTimeout(r, 500));
  const title = await win.webContents.executeJavaScript('document.title');
  const vulnerable = title === 'PWNED';
  console.log(`CSP: ${csp}`);
  console.log(vulnerable
    ? 'VULNERABLE: inline onerror in an email subject executed in the renderer.'
    : 'BLOCKED: handler did not run.');
  app.exit(vulnerable ? 1 : 0);
});
