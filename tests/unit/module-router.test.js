'use strict';
// Safety net + bug repros for the intent → module dispatcher

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const router = h.src('modules/ai/module-router');

function deps(db, ai = h.fakeAiRouter()) {
  return { db, aiRouter: ai, apiKey: 'test-key', activeModel: ai.getActiveModel() };
}

describe('module-router: routing', () => {
  test('unknown intent falls back to general chat', async () => {
    const { db } = h.freshDb();
    const ai = h.fakeAiRouter({ reply: 'hello there' });
    const r = await router.route({ intent: 'NOT_A_REAL_INTENT', raw_query: 'hi' }, deps(db, ai));
    assert.equal(r.text, 'hello there');
    assert.equal(ai.calls.length, 1);
  });

  test('handler exceptions are caught and reported, not thrown', async () => {
    const r = await router.route({ intent: 'SCHEDULE_QUERY', raw_query: 'today' }, { db: { prepare() { throw new Error('boom'); } } });
    assert.match(r.text, /boom/);
  });

  test('schedule query for a named day lists that day only', async () => {
    const { db } = h.freshDb();
    const day = db.prepare('SELECT day_of_week FROM schedule LIMIT 1').get().day_of_week;
    const name = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][day];
    const r = await router.route({ intent: 'SCHEDULE_QUERY', raw_query: `what do I have on ${name}` }, deps(db));
    assert.ok(Array.isArray(r.data) && r.data.length > 0);
    assert.ok(r.data.every(c => c.day_of_week === day));
  });

  test('reminder with ISO datetime is stored', async () => {
    const { db } = h.freshDb();
    const r = await router.route({ intent: 'REMINDER_SET', entities: { reminder_text: 'Grade quizzes', datetime: '2026-11-02T09:00:00' } }, deps(db));
    assert.match(r.text, /Reminder set/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM tasks WHERE title='Grade quizzes'").get().n, 1);
  });

  test('vault save of a link encrypts content and stores the URL', async () => {
    const { db } = h.freshDb();
    await router.route({ intent: 'VAULT_SAVE', entities: { url: 'https://example.edu/syllabus', content: 'ICE301 syllabus' } }, deps(db));
    const row = db.prepare("SELECT * FROM vault_items WHERE url='https://example.edu/syllabus'").get();
    assert.equal(row.type, 'link');
    assert.ok(!row.content_enc.includes('ICE301'));
  });

  test('DIU portal "failing" query lists only students below 40', async () => {
    const { db } = h.freshDb();
    const cid = db.prepare("SELECT id FROM courses WHERE lower(code)='ice301'").get().id;
    const [a, b] = db.prepare('SELECT id FROM students WHERE course_id=? LIMIT 2').all(cid);
    const ins = db.prepare(`INSERT INTO diu_marks (student_id, course_id, attendance, ct1, ct2, ct3, presentation, assignment, midterm, final_exam)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    ins.run(a.id, cid, 7, 15, 15, 15, 8, 5, 25, 35);  // grand total 95
    ins.run(b.id, cid, 2, 3, 3, 3, 1, 1, 5, 10);      // grand total 22
    const r = await router.route({ intent: 'DIU_PORTAL_QUERY', raw_query: 'who is failing' }, deps(db));
    assert.match(r.text, /1 student\(s\) currently failing/);
    assert.match(r.text, /22\/100/);
    assert.ok(!r.text.includes('95/100'));
  });
});

describe('module-router: bugs', () => {
  test('BUG-S2: the data-add prompt, as a cloud provider would receive it, has no student name', async () => {
    // Redaction happens at the cloud boundary (model-router sendCloud); the full
    // provider-level check is tests/integration/pii-leak.test.js.
    const { db } = h.freshDb();
    const ai = h.fakeAiRouter({ reply: JSON.stringify({ target: 'student', summary: 'add', fields: { name: 'Karim Hossain', course_code: 'ICE301' } }) });
    await router.route({ intent: 'DATA_ADD', raw_query: 'add student Karim Hossain to ICE301' }, deps(db, ai));
    const outgoing = h.src('modules/security/pii-guard').createRedactor({ db }).redact(ai.calls[0].message);
    assert.ok(!outgoing.includes('Karim') && !outgoing.includes('Hossain'), outgoing);
  });

  test('BUG-S1: chat-added student is stored with the real name in plaintext', async () => {
    const { db } = h.freshDb();
    const ai = h.fakeAiRouter({ reply: JSON.stringify({ target: 'student', summary: 'add', fields: { name: 'Karim Hossain', course_code: 'ICE301' } }) });
    const r = await router.route({ intent: 'DATA_ADD', raw_query: 'add student Karim Hossain to ICE301' }, deps(db, ai));
    assert.match(r.text, /has been added/);
    const row = db.prepare("SELECT name_enc FROM students ORDER BY id DESC LIMIT 1").get();
    assert.notEqual(row.name_enc, 'Karim Hossain');
  });

  test('BUG-MR1: AI JSON wrapped in prose (typical for small local models) is rejected', { todo: 'BUG-MR1 brittle JSON.parse' }, async () => {
    const { db } = h.freshDb();
    const ai = h.fakeAiRouter({ reply: 'Sure! Here is the JSON:\n{"target":"course","summary":"add","fields":{"course_code":"CSE401","course_name":"Compilers"}}' });
    const r = await router.route({ intent: 'DATA_ADD', raw_query: 'add course CSE401 Compilers' }, deps(db, ai));
    assert.match(r.text, /added/, r.text);
  });

  test('BUG-B9: "switch to local AI" via chat is refused', { todo: 'BUG-B9 model switch list' }, async () => {
    const ai = h.fakeAiRouter();
    const r = await router.route({ intent: 'MODEL_SWITCH', entities: { model: 'ollama' } }, { aiRouter: ai });
    assert.equal(ai.getActiveModel(), 'ollama', r.text);
  });

  test('BUG-V1: a saved password never appears in the plaintext title', async () => {
    const { db } = h.freshDb();
    const last = () => db.prepare('SELECT * FROM vault_items ORDER BY id DESC LIMIT 1').get();
    await router.route({ intent: 'VAULT_SAVE', entities: { password: 'Hunter2-secret' } }, deps(db));
    assert.ok(!last().title.includes('Hunter2-secret'), `title is "${last().title}"`);
    assert.match(last().title, /Saved password/);
    assert.equal(h.src('modules/security/student-crypto').vaultDecrypt(last().password_enc), 'Hunter2-secret');
    // secret also typed into the note text / an AI-proposed title
    await router.route({ intent: 'VAULT_SAVE', entities: { content: 'my BLC password is Hunter3-x', password: 'Hunter3-x', title: 'BLC Hunter3-x' } }, deps(db));
    assert.ok(!last().title.includes('Hunter3-x'), `title is "${last().title}"`);
  });

  test('BUG-V2: vault search ignores the user query when the classifier omits entities.query', { todo: 'BUG-V2 reads intent.raw instead of raw_query' }, async () => {
    const { db } = h.freshDb();
    db.prepare("INSERT INTO vault_items (title, type) VALUES ('BLC login', 'password')").run();
    const r = await router.route({ intent: 'VAULT_SEARCH', raw_query: 'BLC login', entities: {} }, deps(db));
    assert.match(r.text, /Found/, r.text);
  });

  test('BUG-RM1: natural-language datetime crashes reminder saving', { todo: 'BUG-RM1 Invalid Date → toISOString' }, async () => {
    const { db } = h.freshDb();
    const r = await router.route({ intent: 'REMINDER_SET', entities: { reminder_text: 'Submit grades', datetime: 'next Friday 5pm' } }, deps(db));
    assert.match(r.text, /Reminder set/, r.text);
  });

  test('BUG-MR2: "open BLC" still answers that the portal module is coming in Sprint 3', { todo: 'BUG-MR2 stale text' }, async () => {
    const r = await router.route({ intent: 'PORTAL_OPEN', entities: { portal: 'blc' } }, {});
    assert.ok(!/coming in Sprint 3/.test(r.text), r.text);
  });
});
