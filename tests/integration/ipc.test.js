'use strict';
// Boots the real main.js against fake Electron/keytar and drives its IPC
// handlers exactly as the renderer would. The DB lives in a temp userData dir.

const h = require('../helpers/harness');
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Database = require(path.join(h.ROOT, 'node_modules', 'better-sqlite3'));

let ice301Id;
before(async () => {
  await h.bootMain();
  const courses = (await h.invoke('diu:courses')).courses;
  ice301Id = courses.find(c => c.code.toLowerCase() === 'ice301').id;
});
// auth.startSession() arms a real 15-minute timer; clear it so the process can exit
after(() => h.src('modules/security/auth').endSession());

describe('IPC: core flows (safety net)', () => {
  test('first launch → PIN setup → verify → session active', async () => {
    assert.equal(await h.invoke('auth:is-first-launch'), true);
    assert.deepEqual(await h.invoke('auth:setup-pin', '2468'), { ok: true });
    assert.equal(await h.invoke('auth:is-first-launch'), false);
    assert.deepEqual(await h.invoke('auth:verify-pin', '0000'), { ok: false });
    assert.deepEqual(await h.invoke('auth:verify-pin', '2468'), { ok: true });
    assert.deepEqual(await h.invoke('auth:session'), { active: true });
  });

  test('API keys: save → check-all reflects it', async () => {
    assert.deepEqual(await h.invoke('keys:save', { service: 'claude', key: 'sk-ant-test' }), { ok: true });
    const all = await h.invoke('keys:check-all');
    assert.equal(all.claude, true);
    assert.equal(all.gemini, false);
  });

  test('model switch persists and rejects unknown models', async () => {
    assert.equal((await h.invoke('ai:model-switch', 'gemini')).ok, true);
    assert.equal(await h.invoke('ai:get-active-model'), 'gemini');
    assert.equal((await h.invoke('ai:model-switch', 'gpt-5-turbo')).ok, false);
    await h.invoke('ai:model-switch', 'ollama');
  });

  test('vault: save password → list → decrypt', async () => {
    assert.equal((await h.invoke('vault:save', { title: 'BLC', type: 'password', username: 'shad', password: 'p@ss-123' })).ok, true);
    const item = (await h.invoke('vault:get')).data.find(i => i.title === 'BLC');
    assert.ok(item && !item.password_enc.includes('p@ss'));
    assert.equal((await h.invoke('vault:decrypt', item.password_enc)).data, 'p@ss-123');
  });

  test('vault: delete and favourite', async () => {
    const item = (await h.invoke('vault:get')).data.find(i => i.title === 'BLC');
    await h.invoke('vault:favorite', { id: item.id, isFavorite: true });
    assert.equal((await h.invoke('vault:get')).data.find(i => i.id === item.id).is_favorite, 1);
    await h.invoke('vault:delete', item.id);
    assert.equal((await h.invoke('vault:get')).data.find(i => i.id === item.id), undefined);
  });

  test('ShadSync attainment via IPC (case-insensitive course code)', async () => {
    const r = await h.invoke('shadsync:attainment', 'ICE301');
    assert.equal(r.ok, true);
    assert.equal(r.data.clo.CLO1.avg, 66.3);
    assert.deepEqual(await h.invoke('shadsync:attainment', 'NOPE999'), { ok: false, error: 'Course not found' });
  });

  test('schedule: save → get → delete for an existing course', async () => {
    const before = (await h.invoke('schedule:get')).data.length;
    const { id } = await h.invoke('schedule:save', { course_code: 'ICE401', day_of_week: 2, start_time: '14:00', end_time: '15:30', room: '701' });
    assert.equal((await h.invoke('schedule:get')).data.length, before + 1);
    await h.invoke('schedule:delete', id);
    assert.equal((await h.invoke('schedule:get')).data.length, before);
  });

  test('lesson log: save → get', async () => {
    await h.invoke('lesson-log:save', { course_id: ice301Id, date: '2026-10-28', topics_covered: 'Polymorphism', next_topic: 'Interfaces' });
    const rows = (await h.invoke('lesson-log:get', ice301Id)).data;
    assert.ok(rows.some(r => (r.topics_covered || r.topic || JSON.stringify(r)).includes('Polymorphism')));
  });

  test('DIU attendance: save a day → read back', async () => {
    const students = (await h.invoke('diu:students', ice301Id)).students;
    const records = students.map((s, i) => ({ studentId: s.id, present: i % 2 === 0 }));
    assert.equal((await h.invoke('diu:saveAttendance', { courseId: ice301Id, date: '2026-10-20', records })).ok, true);
    const att = await h.invoke('diu:attendance', ice301Id);
    assert.ok(att.dates.includes('2026-10-20'));
  });

  test('cortex rules: add structured → list → delete', async () => {
    const { id } = await h.invoke('cortex:add-rule', { type: 'quiet', description: 'No alerts during class', ruleJson: { suppress: 'notifications' } });
    assert.ok((await h.invoke('cortex:get-rules')).data.some(r => r.id === id));
    await h.invoke('cortex:delete-rule', id);
    assert.ok(!(await h.invoke('cortex:get-rules')).data.some(r => r.id === id && r.active === 1));
  });

  test('syllabus manual analysis via IPC', async () => {
    const r = await h.invoke('blooms:analyze-syllabus-manual', {
      cosText: 'CO1: Explain the laws of electrical circuit analysis.\nCO2: Design filters for a given specification.',
      weeksText: 'Week 1: Ohm and Kirchhoff laws explained\nWeek 2: Design of RC filters and responses',
    });
    assert.equal(r.ok, true);
    assert.equal(r.result.summary.totalCOs, 2);
  });

  test('CLO knowledge base is seeded', async () => {
    const r = await h.invoke('clo-kb:stats');
    assert.equal(r.ok, true);
    assert.ok(JSON.stringify(r.stats).match(/\d{3}/), JSON.stringify(r.stats));
  });
});

describe('IPC: marks sheet import', () => {
  const XLSX = require(require('path').join(h.ROOT, 'node_modules', 'xlsx'));
  const rows = [
    ['Course', 'IPC Test Course (IPC501)'], ['Section', 'A'],
    ['Indicators', null, null, 'Quiz (10M)'], ['Description', null, null, '1 (10.00M)'], ['CO Mapping', null, null, 'CO1'],
    ['SL No.', 'Student USN', 'Student Name', '1 (10.00M)'],
    [1, '900-00-001', 'Ipc Student One', 10], [2, '900-00-002', 'Ipc Student Two', 4],
  ];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S');
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  test('dry run returns counts only and writes nothing', async () => {
    const before = (await h.invoke('diu:courses')).courses.length;
    const r = await h.invoke('shadsync:import-marks-sheet', { data, fileName: 'sheet.xlsx', dryRun: true });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.preview.students, 2);
    assert.equal(r.preview.existing, null, 'course does not exist yet');
    assert.ok(!JSON.stringify(r).includes('Ipc Student'), 'preview must not contain student names');
    assert.equal((await h.invoke('diu:courses')).courses.length, before);
  });

  test('import creates the course, then ShadSync reports CO attainment (and names never come back in the summary)', async () => {
    const r = await h.invoke('shadsync:import-marks-sheet', { data, fileName: 'sheet.xlsx' });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.result.students.created, 2);
    assert.ok(!JSON.stringify(r).includes('Ipc Student'));
    const a = await h.invoke('shadsync:attainment', 'IPC501');
    assert.equal(a.ok, true, a.error);
    assert.equal(a.data.co.CO1.avg, 70); // (100 + 40) / 2
  });

  test('a second dry run says the course already exists (counts only)', async () => {
    const r = await h.invoke('shadsync:import-marks-sheet', { data, fileName: 'sheet.xlsx', dryRun: true });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.preview.existing, { students: 2, columns: 1 });
  });

  test('wrong file types are refused', async () => {
    const r = await h.invoke('shadsync:import-marks-sheet', { data, fileName: 'sheet.pdf' });
    assert.equal(r.ok, false);
  });
});

describe('IPC: bugs', () => {
  test('BUG-B2: GPT-4o is unusable — key saved as "openai", looked up as "gpt4o"', async () => {
    await h.invoke('keys:save', { service: 'openai', key: 'sk-openai-test' }); // exactly what Settings does
    await h.invoke('ai:model-switch', 'gpt4o');
    const r = await h.invoke('ai:send', { message: 'hello', context: {}, options: {} });
    await h.invoke('ai:model-switch', 'ollama');
    assert.ok(!/No API key set for gpt4o/.test(r.error || ''), r.error);
  });

  test('BUG-S5: renderer learns only "set / not set", never the raw API key', async () => {
    const r = await h.invoke('keys:get', 'claude');
    assert.deepEqual(r, { ok: true, set: true });
    assert.ok(!JSON.stringify(r).includes('sk-ant-test'), 'raw secret returned to renderer');
    assert.deepEqual(await h.invoke('keys:get', 'gemini'), { ok: true, set: false });
  });

  test('BUG-S5: renderer cannot read or overwrite the student master key or OAuth tokens', async () => {
    const sc = h.src('modules/security/student-crypto');
    const slot = `facultymind_${sc.KEY_SERVICE}|${sc.KEY_SERVICE}`;
    const before = h.keyStore.get(slot);
    for (const service of [sc.KEY_SERVICE, 'gmail_access', 'gmail_refresh']) {
      const g = await h.invoke('keys:get', service);
      assert.equal(g.ok, false, service);
      assert.ok(!JSON.stringify(g).includes(String(before)), 'master key leaked');
      assert.equal((await h.invoke('keys:save', { service, key: 'attacker' })).ok, false, service);
    }
    assert.equal(h.keyStore.get(slot), before, 'master key unchanged');
  });

  test('BUG-S6: locked app refuses vault, student, AI, key and export requests', async () => {
    h.src('modules/security/auth').endSession(); // same state as the 15-min auto-lock
    assert.deepEqual(await h.invoke('auth:session'), { active: false });
    for (const [ch, arg] of [['vault:get'], ['vault:decrypt', 'x'], ['diu:students', ice301Id], ['shadsync:data', 'ICE301'],
                             ['ai:send', { message: 'hi', context: {} }], ['keys:save', { service: 'claude', key: 'x' }],
                             ['db:export', {}], ['student-key:save-recovery', { passphrase: 'aaaaaaaa' }]]) {
      const r = await h.invoke(ch, arg);
      assert.equal(r?.ok, false, `${ch} answered while locked`);
      assert.equal(r.locked, true, ch);
    }
    // The lock screen still works
    assert.equal(await h.invoke('auth:is-first-launch'), false);
    assert.equal((await h.invoke('auth:verify-pin', '2468')).ok, true);
    assert.equal((await h.invoke('vault:get')).ok, true, 'unlocked again');
    h.src('modules/security/auth').endSession();   // leave it locked for the next test
  });

  test('BUG-A3: PIN cannot be replaced without the current PIN', async () => {
    // attacker / curious student at a locked laptop
    assert.deepEqual(await h.invoke('auth:setup-pin', '1111'), { ok: false, error: 'Current PIN is incorrect' });
    assert.equal((await h.invoke('auth:setup-pin', '1111', '9999')).ok, false, 'wrong current PIN');
    assert.equal((await h.invoke('auth:verify-pin', '1111')).ok, false, 'takeover PIN must not work');
    // the owner can change it with the current PIN
    assert.equal((await h.invoke('auth:setup-pin', '1357', '2468')).ok, true);
    assert.equal((await h.invoke('auth:verify-pin', '1357')).ok, true);
    assert.equal((await h.invoke('auth:setup-pin', '2468', '1357')).ok, true);   // restore
    assert.equal((await h.invoke('auth:verify-pin', '2468')).ok, true);          // and leave unlocked
  });

  test('BUG-B5: db:export includes recent writes (WAL included)', async () => {
    await h.invoke('vault:save', { title: 'written-just-before-export', type: 'note', content: 'x' });
    const live = (await h.invoke('vault:get')).data.length;
    const out = path.join(h.tmpRoot, 'export-test.db');
    h.dialogQueue.save.push({ canceled: false, filePath: out });
    assert.equal((await h.invoke('db:export', { passphrase: 'export passphrase' })).ok, true);
    const copy = new Database(out, { readonly: true });
    const exported = copy.prepare('SELECT COUNT(*) n FROM vault_items').get().n;
    const hasIt = copy.prepare("SELECT COUNT(*) n FROM vault_items WHERE title='written-just-before-export'").get().n;
    copy.close();
    assert.equal(exported, live, `export has ${exported} vault rows, live DB has ${live}`);
    assert.equal(hasIt, 1);
  });

  test('BUG-D1: a bad attendance record leaves the saved day untouched', async () => {
    const students = (await h.invoke('diu:students', ice301Id)).students;
    const good = students.map(s => ({ studentId: s.id, present: true }));
    await h.invoke('diu:saveAttendance', { courseId: ice301Id, date: '2026-10-21', records: good });
    const before = (await h.invoke('diu:attendance', ice301Id)).students.reduce((a, s) => a + s.totalDays, 0);
    const r = await h.invoke('diu:saveAttendance', { courseId: ice301Id, date: '2026-10-21',
      records: [...good, { studentId: 999999, present: true }] }); // e.g. a student deleted in another view
    const after = (await h.invoke('diu:attendance', ice301Id)).students.reduce((a, s) => a + s.totalDays, 0);
    assert.equal(r.ok, false);
    assert.equal(after, before, `attendance rows before=${before} after failed save=${after}`);
  });

  // Not reachable from today's UI (diu-portal.js always sends every field, blanks → 0),
  // so this is hardening, not a user-facing bug.
  test('HARDEN-2: diu:saveMarks accepts an incomplete payload and zeroes the other marks', { todo: 'HARDEN-2 no IPC validation' }, async () => {
    const s = (await h.invoke('diu:students', ice301Id)).students[0];
    await h.invoke('diu:saveMarks', { courseId: ice301Id, marks: [{ studentId: s.id, attendance: 7, ct1: 14, ct2: 13, ct3: 12, presentation: 8, assignment: 5, midterm: 22, finalExam: 30 }] });
    const r = await h.invoke('diu:saveMarks', { courseId: ice301Id, marks: [{ studentId: s.id, finalExam: 31 }] }); // only one field edited
    const now = (await h.invoke('diu:students', ice301Id)).students.find(x => x.id === s.id);
    assert.ok(r.ok === false || now.midterm === 22, `ok=${r.ok}, midterm now ${now.midterm}`);
  });

  test('BUG-SC1: schedule:save is case-sensitive and duplicates the course', async () => {
    const before = (await h.invoke('diu:courses')).courses.length;
    const { id } = await h.invoke('schedule:save', { course_code: 'ICE301', day_of_week: 3, start_time: '08:30', end_time: '10:00' });
    const after = (await h.invoke('diu:courses')).courses.length;
    await h.invoke('schedule:delete', id);
    assert.equal(after, before, `course count ${before} → ${after} (seeded code is "ice301")`);
  });

  // Destructive: leaves the DB handle closed. Must stay the last test in this file.
  test('BUG-D3: a failed db:import keeps the current database open', async () => {
    h.dialogQueue.open.push({ canceled: false, filePaths: [path.join(h.tmpRoot, 'does-not-exist.db')] });
    const r = await h.invoke('db:import');
    assert.equal(r.ok, false);
    const after = await h.invoke('vault:get');
    assert.equal(after.ok, true, `vault:get after failed import: ${after.error}`);
  });
});
