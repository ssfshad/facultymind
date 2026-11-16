'use strict';
// BUG-S2: no student name, student ID or enrollment number may appear in any
// request that reaches a cloud model. Every cloud SDK / HTTPS endpoint is
// mocked and records the exact request it would have sent.
//   1. Cloud-allowed paths (general chat, Bloom's, syllabus, Cortex, document
//      routing) are redacted, for every cloud provider.
//   2. Local-only paths (data-add, marks/attendance, email classification,
//      dropped rosters/marks sheets) never reach a cloud model: Ollama when it
//      runs, otherwise refused with a message to the user.
//   3. Fail closed: no DB, no key, or a redactor error blocks the cloud call.
//   4. Bangla-script, ALL-CAPS and first-name-only mentions are caught.

const h = require('../helpers/harness');
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');
const { EventEmitter } = require('events');

// ── Mock providers: record every outgoing request ───────────────────────────
const sent = [];            // { provider, body }
let replyFor = () => 'OK';  // (provider, bodyText) → reply text

function record(provider, payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  sent.push({ provider, body });
  return replyFor(provider, body);
}
const cloudSent = () => sent.filter(r => r.provider !== 'ollama');

const mocks = {
  '@anthropic-ai/sdk': class { constructor() { this.messages = { create: async (p) => ({ content: [{ text: record('claude', p) }], usage: {} }) }; } },
  'openai': class { constructor() { this.chat = { completions: { create: async (p) => ({ choices: [{ message: { content: record('gpt4o', p) } }], usage: {} }) } }; } },
  '@google/generative-ai': {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return { startChat: (cfg) => ({ sendMessage: async (parts) => {
          const text = record('gemini', { ...cfg, parts });
          return { response: { text: () => text, usageMetadata: {} } };
        } }) };
      }
    },
  },
};
const prevLoad = Module._load;
Module._load = function (request) {
  if (mocks[request]) return mocks[request];
  return prevLoad.apply(this, arguments);
};

// OpenRouter goes over raw https; Ollama over http to localhost:11434
const https = require('https');
const http = require('http');
const realHttpsRequest = https.request;
https.request = function (opts, cb) {
  if (opts && opts.hostname === 'openrouter.ai') {
    const req = new EventEmitter();
    let body = '';
    req.write = (b) => { body += b; };
    req.end = () => setImmediate(() => {
      const text = record('openrouter', body);
      const res = new EventEmitter(); res.statusCode = 200;
      cb(res);
      res.emit('data', JSON.stringify({ choices: [{ message: { content: text } }], usage: {} }));
      res.emit('end');
    });
    return req;
  }
  return realHttpsRequest.apply(this, arguments);
};
let ollamaUp = false;
const realHttpGet = http.get, realHttpRequest = http.request;
http.get = function (url, opts, cb) {
  if (String(url).includes('11434')) {
    const req = new EventEmitter(); req.destroy = () => {};
    setImmediate(() => { if (ollamaUp) { const res = new EventEmitter(); res.statusCode = 200; res.resume = () => {}; (cb || opts)(res); res.emit('end'); } else req.emit('error', new Error('ECONNREFUSED')); });
    return req;
  }
  return realHttpGet.apply(this, arguments);
};
http.request = function (opts, cb) {
  if (opts && opts.port === 11434) {
    const req = new EventEmitter(); let body = '';
    req.write = (b) => { body += b; }; req.destroy = () => {};
    req.end = () => setImmediate(() => {
      if (!ollamaUp) return req.emit('error', new Error('ECONNREFUSED'));
      const text = record('ollama', body);
      const res = new EventEmitter(); res.statusCode = 200;
      cb(res); res.emit('data', JSON.stringify({ message: { content: text } })); res.emit('end');
    });
    return req;
  }
  return realHttpRequest.apply(this, arguments);
};

// ── Test data: realistic identifiers ─────────────────────────────────────────
const REAL    = { name: 'Nusrat Jahan Mim', studentId: '221-15-4821', enrollmentNo: 'ENR-2022-0417' };
const BANGLA  = { name: 'তানজিলা আক্তার', studentId: '221-15-4822' };
const CAPS    = { name: 'RAFIQUL ISLAM', studentId: '221-15-4823' };
const KARIM   = { name: 'Karim Hossain', studentId: '221-15-4824' };
const NEW_STUDENT = 'Tanvir Ahmed Rony';          // never in the DB
const SHEET_NAMES = ['Sadia Afrin Lima', 'Mehedi Hasan Shuvo', 'Fatema Tuz Zohra', 'Arif Mahmud'];  // dropped sheet, not in DB
const CLOUD = ['claude', 'gpt4o', 'gemini', 'openrouter'];

let db, cid, forbidden, aiRouter, sc, guard, router;

function wordRe(v) {
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}\\p{N}])`, 'iu');
}
// Whole-word, case-insensitive: "Das" is a seed surname, "Dashboard" is not a leak
function leaks(values = forbidden) {
  const res = values.map(v => [v, wordRe(v)]);
  const out = [];
  for (const r of cloudSent()) for (const [v, re] of res) if (re.test(r.body)) out.push(`${r.provider}: "${v}"`);
  return out;
}

before(async () => {
  await h.bootMain();
  sc = h.src('modules/security/student-crypto');
  guard = h.src('modules/security/pii-guard');
  aiRouter = h.src('modules/ai/model-router');
  router = h.src('modules/ai/module-router');
  const Database = require(path.join(h.ROOT, 'node_modules', 'better-sqlite3'));
  db = new Database(path.join(h.tmpRoot, 'userData', 'facultymind.db'));
  cid = db.prepare("SELECT id FROM courses WHERE lower(code)='ice301'").get().id;
  const q = h.src('modules/shadsync/shadsync-queries');
  for (const s of [REAL, BANGLA, CAPS, KARIM]) q.saveStudent(db, { courseId: cid, ...s });
  for (const p of CLOUD) await h.invoke('keys:save', { service: p, key: `test-key-${p}` });
  forbidden = [...new Set(guard.knownIdentifiers(db).map(i => i.value)), NEW_STUDENT, ...SHEET_NAMES];
  assert.ok(forbidden.includes(REAL.name) && forbidden.includes(BANGLA.name) && forbidden.includes(CAPS.name));
});
after(() => { h.src('modules/security/auth').endSession(); db.close(); });
beforeEach(() => { sent.length = 0; replyFor = () => 'Noted: [STUDENT_1] ([SID_1]).'; ollamaUp = false; aiRouter.resetOllamaCheck(); });

// ── 1. Cloud-allowed paths are redacted ──────────────────────────────────────
describe('S2: cloud-allowed paths carry no identifiers', () => {
  for (const provider of CLOUD) {
    test(`${provider}: chat, Bloom's, syllabus, Cortex`, async () => {
      aiRouter.setActiveModel(provider);
      const key = `test-key-${provider}`;
      const keystore = { getKey: async (s) => (s === provider ? key : null) };

      // Multi-turn chat (goes straight to the model)
      const chat = await h.invoke('ai:send', { message: `And her enrollment ${REAL.enrollmentNo}? Also ${BANGLA.name} and ${CAPS.name}.`, context: {},
        options: { history: [{ role: 'user', content: `Tell me about ${REAL.name}, ID ${REAL.studentId}. How are Karim's marks?` },
                             { role: 'assistant', content: `Rahman and ${REAL.name} are in ICE301.` }] } });
      assert.equal(chat.ok, true, chat.error);
      assert.match(chat.text, new RegExp(REAL.name), 'reply placeholders are restored locally');

      const count = () => cloudSent().length;
      const made = {};
      made.chat = count();

      // Bloom's / CLO mapping (document-level; OpenRouter is its cloud route)
      await h.src('modules/blooms/blooms-engine').mapCLOsToBlooms(
        // no Bloom's verb, so the AI pass runs
        `CLO1: Signal sampling concepts and their relevance, with feedback from student ${REAL.name} (${REAL.studentId}).`, 'ICE301', db, key, provider, null,
        'test-key-openrouter').catch(() => {});
      made.blooms = count() - made.chat;
      // Syllabus (OpenRouter route; Ollama is down)
      await h.src('modules/blooms/syllabus-mapper').analyzeSyllabus(
        Buffer.from(`Week 1: Sampling. Course rep: student ${REAL.name}, ID ${REAL.studentId}.\nWeek 2: Quantisation.`), 'text/plain', null, 'test-key-openrouter').catch(() => {});
      made.syllabus = count() - made.chat - made.blooms;
      // Cortex: rule parsing, daily training (needs >= 3 logged events), proactive engine (may be gated by quiet hours)
      let c0 = count();
      await h.src('modules/cortex/rules-engine').parseAndSaveRule(db, `Remind me before ICE301 if ${REAL.name} has a re-sit`, aiRouter, key, provider).catch(() => {});
      for (let i = 0; i < 3; i++) {
        db.prepare("INSERT INTO activity_log (event_type, module, payload_json, session_date) VALUES ('query_sent', 'shadsync', ?, date('now'))")
          .run(JSON.stringify({ note: `Looked up ${REAL.name} ${REAL.studentId}` }));
      }
      db.prepare("DELETE FROM settings WHERE key LIKE 'cortex_last_train%'").run();
      await h.src('modules/cortex/daily-trainer').runDailyTraining(db, aiRouter, key, provider).catch(() => {});
      await h.src('modules/ai/proactive-engine').triggerPeriodic(db, aiRouter, keystore).catch(() => {});
      made.cortex = count() - c0;

      assert.ok(cloudSent().some(r => r.provider === provider), `${provider} received no requests`);
      for (const [p, n] of Object.entries(made)) assert.ok(n >= 1, `${p}: no cloud request captured (${JSON.stringify(made)})`);
      assert.deepEqual(leaks(), []);
    });
  }
});

// ── 2. Local-only policy ─────────────────────────────────────────────────────
const MARKS_CSV = 'Student ID,Name,CT1,CT2,Mid\n' + SHEET_NAMES.map((n, i) => `221-15-90${10 + i},${n},${12 + i},${13 + i},${20 + i}`).join('\n');
const MARKS_TSV = 'Roll\tStudent Name\tAttendance\n' + SHEET_NAMES.map((n, i) => `${i + 1}\t${n}\t${80 + i}%`).join('\n');

describe('S2: student-data paths never reach a cloud model (cloud active)', () => {
  const route = (intent, raw) => router.route({ intent, raw_query: raw, entities: {} },
    { db, aiRouter, apiKey: 'test-key-claude', activeModel: 'claude' });

  test('Ollama down: data-add, marks, attendance, email, dropped sheets are refused, nothing sent', async () => {
    aiRouter.setActiveModel('claude');
    // "add student ..." is a clear command: the intent rules classify it without any model call, so the refusal
    // comes from the add-student handler's local-only check (data.action) instead of from the classifier (error code).
    // Either way: refused, with the "start Ollama" message, and nothing is sent anywhere.
    const r1 = await h.invoke('ai:send', { message: `add student ${NEW_STUDENT} to ICE301`, context: {} });
    assert.ok((r1.ok === false && r1.code === 'LOCAL_ONLY_UNAVAILABLE') || r1.data?.action === 'local_ai_required', `not refused: ${JSON.stringify(r1).slice(0, 200)}`);
    assert.match(r1.error || r1.text, /Start Ollama/);
    const r2 = await h.invoke('ai:send', { message: "What are Karim's CT1 marks and attendance?", context: {} });
    assert.equal(r2.code, 'LOCAL_ONLY_UNAVAILABLE');

    for (const [intent, raw] of [['DATA_ADD', `add student ${NEW_STUDENT} to ICE301`], ['SHADSYNC_QUERY', `show ${REAL.name}'s marks`],
                                 ['DATA_EDIT', `change ${REAL.name}'s attendance to 90%`], ['DATA_DELETE', `remove student ${REAL.name}`]]) {
      const r = await route(intent, raw);
      assert.equal(r.data?.action, 'local_ai_required', `${intent}: ${r.text}`);
    }

    await h.src('modules/email/email-classifier').classifyBatch(aiRouter, [{ id: 'm1', from_name: REAL.name, from_email: 'n@diu.edu.bd',
      subject: `Re-sit ${REAL.studentId}`, body: `I am ${REAL.name}.` }], 'test-key-claude', 'claude');

    for (const [buf, mime, file] of [[MARKS_CSV, 'text/csv', 'ICE301_marks.csv'], [MARKS_TSV, 'text/plain', 'attendance.txt'],
                                     [MARKS_CSV, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'marks.xlsx']]) {
      const r = await aiRouter.smartClassifyDocument(Buffer.from(buf), mime, file, db, null);
      assert.equal(r.code, 'LOCAL_ONLY_UNAVAILABLE', `${file}: ${r.error}`);
    }
    assert.deepEqual(cloudSent().map(r => r.provider), [], 'no cloud request at all');
  });

  test('Ollama up: the same tasks run locally; data-add saves the student', async () => {
    ollamaUp = true;
    aiRouter.setActiveModel('claude');
    replyFor = (provider, body) => {
      if (body.includes("classify the user's message into exactly one intent"))
        return JSON.stringify({ intent: 'DATA_ADD', confidence: 0.9, entities: {}, raw_query: `add student ${NEW_STUDENT} to ICE301` });
      if (body.includes('rule|course|schedule|student|reminder'))
        return JSON.stringify({ target: 'student', summary: 'add', fields: { name: NEW_STUDENT, course_code: 'ICE301' } });
      return JSON.stringify({ category: 'GENERAL', reason: 'marks sheet' });
    };
    const r = await h.invoke('ai:send', { message: `add student ${NEW_STUDENT} to ICE301`, context: {} });
    assert.equal(r.ok, true, r.error);
    const rows = db.prepare('SELECT name_enc FROM students WHERE course_id=?').all(cid);
    assert.ok(rows.some(x => sc.reveal(x.name_enc, null) === NEW_STUDENT), 'student saved (encrypted)');
    await aiRouter.smartClassifyDocument(Buffer.from(MARKS_CSV), 'text/csv', 'ICE301_marks.csv', db, null);
    await h.src('modules/email/email-classifier').classifyBatch(aiRouter, [{ id: 'm2', from_name: REAL.name, from_email: 'n@diu.edu.bd',
      subject: 's', body: `I am ${REAL.name}.` }], 'test-key-claude', 'claude');
    // data-add parse + dropped-sheet classification + email classification (the intent classification itself is a
    // deterministic rule for this command, so it no longer needs a model call)
    assert.ok(sent.filter(x => x.provider === 'ollama').length >= 3, 'tasks ran on Ollama');
    assert.deepEqual(cloudSent().map(x => x.provider), [], 'no cloud request at all');
  });

  test('decision is per call: preferLocal goes to Ollama unredacted, the plain cloud call is redacted', async () => {
    replyFor = () => 'OK';
    const msg = `Summarise ${REAL.name} (${REAL.studentId})`;
    ollamaUp = true;
    await aiRouter.send(msg, {}, { model: 'claude', apiKey: 'test-key-claude', preferLocal: true, systemPrompt: 'x' });
    await aiRouter.send(msg, {}, { model: 'claude', apiKey: 'test-key-claude', systemPrompt: 'x' });
    const local = sent.find(r => r.provider === 'ollama');
    const cloud = sent.find(r => r.provider === 'claude');
    assert.ok(local && local.body.includes(REAL.name), 'local call keeps the real name');
    assert.ok(cloud && !cloud.body.includes(REAL.name) && !cloud.body.includes(REAL.studentId), 'cloud call is redacted');
  });
});

// ── 3. Fail closed ───────────────────────────────────────────────────────────
describe('S2: fail closed — no redaction, no cloud call', () => {
  const call = () => aiRouter.send(`Summarise ${REAL.name}`, {}, { model: 'claude', apiKey: 'test-key-claude', systemPrompt: 'x' });

  test('student DB not available → blocked with a clear error', async () => {
    guard.setDbSource(() => null);
    try { await assert.rejects(call(), (e) => e.code === 'PII_GUARD_BLOCKED' && /Nothing was sent/.test(e.message)); }
    finally { guard.setDbSource(() => db); }
    assert.equal(cloudSent().length, 0);
  });

  test('student data key not loaded (names can\'t be decrypted) → blocked', async () => {
    sc.useKey(null);
    try { await assert.rejects(call(), (e) => e.code === 'PII_GUARD_BLOCKED' && /key not loaded/.test(e.message)); }
    finally { sc.useKey(h.TEST_STUDENT_KEY); }
    assert.equal(cloudSent().length, 0);
  });

  test('redactor throws → blocked', async () => {
    const orig = guard.createRedactor;
    guard.createRedactor = () => ({ redact: () => { throw new Error('boom'); }, restore: (t) => t, size: 0 });
    try { await assert.rejects(call(), (e) => e.code === 'PII_GUARD_BLOCKED' && /boom/.test(e.message)); }
    finally { guard.createRedactor = orig; }
    assert.equal(cloudSent().length, 0);
  });

  test('chat shows the block to the user instead of a fallback', async () => {
    aiRouter.setActiveModel('claude');
    guard.setDbSource(() => null);
    try {
      const r = await h.invoke('ai:send', { message: 'Plan my week', context: {}, options: { history: [{ role: 'user', content: 'hi' }] } });
      assert.equal(r.ok, false); assert.equal(r.code, 'PII_GUARD_BLOCKED');
    } finally { guard.setDbSource(() => db); }
    assert.equal(cloudSent().length, 0);
  });
});
