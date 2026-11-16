'use strict';
// Proactive engine (Cortex) + email monitor: provider-key handling, throttling, races, OAuth

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Keep background intervals from holding the test process open
const realSetInterval = global.setInterval;
global.setInterval = (...a) => { const t = realSetInterval(...a); t.unref?.(); return t; };

function quietDb() {
  const { db } = h.freshDb();
  // Make quiet hours effectively never apply and remove classes so no trigger is suppressed
  db.prepare("INSERT OR REPLACE INTO faculty_profile (key, value) VALUES ('quiet_hours_start','23:59')").run();
  db.prepare("INSERT OR REPLACE INTO faculty_profile (key, value) VALUES ('quiet_hours_end','00:00')").run();
  db.prepare('DELETE FROM schedule').run();
  return db;
}

function freshProactive() {
  delete require.cache[require.resolve(path.join(h.ROOT, 'src/modules/ai/proactive-engine'))];
  return h.src('modules/ai/proactive-engine');
}

describe('cortex proactive engine', () => {
  test('periodic check-in fires once with a cloud key, then is throttled', async () => {
    const pe = freshProactive();
    const db = quietDb();
    const ai = h.fakeAiRouter({ active: 'claude', reply: 'Remember to update the ICE301 lesson log.' });
    const ks = { getKey: async (s) => (s === 'claude' ? 'k' : null) };
    const first = await pe.triggerPeriodic(db, ai, ks);
    const second = await pe.triggerPeriodic(db, ai, ks);
    assert.ok(first && first.text);
    assert.equal(second, null);
    assert.equal(ai.calls.length, 1);
  });

  test('ACTIONS line is parsed into buttons', async () => {
    const pe = freshProactive();
    const db = quietDb();
    const ai = h.fakeAiRouter({ reply: 'Two unread emails.\nACTIONS:{"buttons":[{"label":"Show emails","action":"nav:email"}]}' });
    const r = await pe.triggerPeriodic(db, ai, { getKey: async () => 'k' });
    assert.equal(r.text, 'Two unread emails.');
    assert.deepEqual(r.buttons, [{ label: 'Show emails', action: 'nav:email' }]);
  });

  test('BUG-B3: with Ollama active, Cortex never calls the AI', async () => {
    const pe = freshProactive();
    const db = quietDb();
    const ai = h.fakeAiRouter({ active: 'ollama', reply: 'Good afternoon.' });
    const ks = { getKey: async () => null }; // local model needs no key
    const r = await pe.triggerGreeting(db, ai, ks);
    assert.ok(r && r.text, 'greeting should be produced by the local model');
  });

  test('BUG-C1: an AI answer of SILENT is not throttled → AI is re-asked every tick', { todo: 'BUG-C1 markFired skipped on SILENT' }, async () => {
    const pe = freshProactive();
    const db = quietDb();
    const ai = h.fakeAiRouter({ reply: 'SILENT' });
    const ks = { getKey: async () => 'k' };
    for (let i = 0; i < 3; i++) await pe.triggerPeriodic(db, ai, ks);
    assert.equal(ai.calls.length, 1, `AI called ${ai.calls.length}× in three 5-minute ticks`);
  });
});

describe('email monitor', () => {
  function loadNotificationsWith(fetchEmails) {
    const backendPath = require.resolve(path.join(h.ROOT, 'src/modules/email/email-backend'));
    const notifPath   = require.resolve(path.join(h.ROOT, 'src/modules/email/notifications'));
    require.cache[backendPath] = { id: backendPath, filename: backendPath, loaded: true,
      exports: { fetchEmails, authenticate: async () => true, fetchProfile: async () => null, signOut: async () => {} } };
    delete require.cache[notifPath];
    return require(notifPath);
  }
  const email = (id, extra = {}) => ({ id, subject: `Subject ${id}`, from_name: 'Dean', from_email: 'dean@example.edu', snippet: 'x', ...extra });

  test('BUG-E1: overlapping polls announce the same new email twice', { todo: 'BUG-E1 setInterval re-entrancy' }, async () => {
    new (require('electron').BrowserWindow)({}); // a window for pushToRenderer
    h.sentToRenderer.length = 0;
    let inbox = [email('m1')];
    const n = loadNotificationsWith(async () => { await new Promise(r => setTimeout(r, 50)); return inbox; });
    // AI calls take time on a local model; 150 ms here stands in for several seconds.
    // Category "Work" takes the important-email path (the one that awaits before
    // latestSeenId is updated).
    const ai = h.fakeAiRouter({ reply: async () => {
      await new Promise(r => setTimeout(r, 150));
      return JSON.stringify([{ id: 'm2', category: 'Work', priority: 'HIGH', summary: 'meeting' },
                             { id: 'm1', category: 'Work', priority: 'NORMAL', summary: 'old' }]);
    } });
    const ks = { getKey: async (s) => (s === 'gmail_refresh' ? 'tok' : 'k') };
    n.setConnected(ks, ai);                          // first sync: establishes latestSeenId
    await new Promise(r => setTimeout(r, 400));
    h.sentToRenderer.length = 0; h.notifications.length = 0;
    inbox = [email('m2'), email('m1')];              // a new email arrives
    const pollA = n.syncEmails();                    // poll A is still working…
    await new Promise(r => setTimeout(r, 80));
    const pollB = n.syncEmails();                    // …when the interval fires poll B
    await Promise.all([pollA, pollB]);
    const inChat = h.sentToRenderer.filter(m => m.channel === 'ai:proactive' && JSON.stringify(m.payload).includes('m2')).length;
    const asOsNotification = h.notifications.filter(o => (o.title || '').includes('Subject m2')).length;
    assert.equal(inChat + asOsNotification, 1, `new email announced ${inChat} time(s) in chat and ${asOsNotification} time(s) as OS notifications`);
  });

  test('BUG-E3: a second important email within 10 minutes gets no alert of any kind', { todo: 'BUG-E3 throttled alerts are dropped, not queued' }, async () => {
    delete require.cache[require.resolve(path.join(h.ROOT, 'src/modules/ai/proactive-engine'))]; // fresh throttle state
    let inbox = [email('w1')];
    const n = loadNotificationsWith(async () => inbox);
    const ai = h.fakeAiRouter({ reply: (msg, opts) => opts?.systemPrompt?.includes('triage')
      ? JSON.stringify(inbox.map(e => ({ id: e.id, category: 'Work', priority: 'HIGH', summary: e.subject })))
      : 'New email from the Dean.' });
    const ks = { getKey: async (s) => (s === 'gmail_refresh' ? 'tok' : 'k') };
    n.setConnected(ks, ai);
    await new Promise(r => setTimeout(r, 100));
    h.sentToRenderer.length = 0; h.notifications.length = 0;
    inbox = [email('w2'), email('w1')];            // important email #1
    await n.syncEmails();
    inbox = [email('w3'), email('w2'), email('w1')]; // important email #2, one poll later
    await n.syncEmails();
    const forW3 = h.sentToRenderer.filter(m => m.channel === 'ai:proactive' && JSON.stringify(m.payload).includes('w3')).length
                + h.notifications.filter(o => (o.title || '').includes('Subject w3')).length;
    const forW2 = h.sentToRenderer.filter(m => m.channel === 'ai:proactive').length;
    assert.ok(forW2 >= 1, 'first email should be announced');
    assert.equal(forW3, 1, 'second important email was silently dropped (no chat alert, no OS notification)');
  });

  test('BUG-B3: with Ollama active, emails are never classified', async () => {
    h.sentToRenderer.length = 0;
    const n = loadNotificationsWith(async () => [email('x1')]);
    const ai = h.fakeAiRouter({ active: 'ollama', reply: JSON.stringify([{ id: 'x1', category: 'Work', priority: 'HIGH', summary: 's' }]) });
    n.setConnected({ getKey: async (s) => (s === 'gmail_refresh' ? 'tok' : null) }, ai);
    await new Promise(r => setTimeout(r, 100));
    const update = h.sentToRenderer.find(m => m.channel === 'email:inbox-update');
    assert.equal(update.payload.emails[0].ai_category, 'Work');
  });

  test('BUG-B12: abandoned Gmail sign-in keeps port 3000 bound; retry fails until restart', { todo: 'BUG-B12 no OAuth timeout' }, async () => {
    const backendPath = require.resolve(path.join(h.ROOT, 'src/modules/email/email-backend'));
    delete require.cache[backendPath];
    const backend = require(backendPath);
    const ks = { getKey: async (s) => ({ google_client_id: 'cid', google_client_secret: 'sec' }[s] || null), setKey: async () => {} };
    const first = backend.authenticate(ks);
    first.catch(() => {});
    await new Promise(r => setTimeout(r, 300));       // user closes the browser tab without signing in
    let retryError = null;
    try { await backend.authenticate(ks); } catch (e) { retryError = e.message; }
    // clean up: hit the callback with an error so the dangling server closes
    await new Promise(r => require('http').get('http://localhost:3000/oauth2callback?error=test_cleanup', res => { res.resume(); res.on('end', r); }).on('error', r));
    assert.equal(retryError, null, `retry failed: ${retryError}`);
  });
});
