'use strict';
// BUG-S2: the redactor used on every cloud-bound request

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const guard = h.src('modules/security/pii-guard');
const ids = [
  { value: 'Nusrat Jahan Mim', kind: 'STUDENT' },
  { value: 'Nusrat', kind: 'STUDENT' },
  { value: '221-15-4821', kind: 'SID' },
  { value: 'ENR-2022-0417', kind: 'ENR' },
  { value: 'Mr. $& Rahman', kind: 'STUDENT' },
];

describe('pii-guard: redact / restore', () => {
  test('known identifiers become placeholders; longest match wins; restore puts them back', () => {
    const g = guard.createRedactor({ identifiers: ids });
    const out = g.redact('Nusrat Jahan Mim (221-15-4821, ENR-2022-0417) and nusrat again');
    assert.equal(out, '[STUDENT_1] ([SID_1], [ENR_1]) and [STUDENT_2] again');
    assert.equal(g.restore('Reply about [STUDENT_1] / [SID_1]'), 'Reply about Nusrat Jahan Mim / 221-15-4821');
  });

  test('same value → same placeholder across the system prompt, history and message', () => {
    const g = guard.createRedactor({ identifiers: ids });
    assert.equal(g.redact('Nusrat Jahan Mim'), g.redact('NUSRAT JAHAN MIM'));
  });

  test('whole words only: "Dashboard" is not the surname "Das"', () => {
    const g = guard.createRedactor({ identifiers: [{ value: 'Das', kind: 'STUDENT' }] });
    assert.equal(g.redact('Open the Dashboard for Das.'), 'Open the Dashboard for [STUDENT_1].');
  });

  test('unknown DIU-style IDs and names written after "student" are caught', () => {
    const g = guard.createRedactor({ identifiers: [] });
    const out = g.redact('add student Karim Hossain to ICE301, ID 201-15-1234; Student Md. Rakib Hasan got 40');
    assert.ok(!/Karim|Hossain|201-15-1234|Rakib|Hasan/.test(out), out);
    assert.match(out, /ICE301/);
  });

  test('course codes, CLOs and ordinary words after "student(s)" are left alone', () => {
    const g = guard.createRedactor({ identifiers: [] });
    const s = 'List all students in ICE301. Students With low CLO1 marks. The student who failed.';
    assert.equal(g.redact(s), s);
  });

  test('BUG-R1 counterpart: a "$&" name round-trips literally', () => {
    const g = guard.createRedactor({ identifiers: ids });
    const out = g.redact('Mr. $& Rahman passed');
    assert.equal(out, '[STUDENT_1] passed');
    assert.equal(g.restore(out), 'Mr. $& Rahman passed');
  });

  test('stored tokens (S001, Student_S001, E001) are not treated as identifiers', () => {
    const { db } = h.freshDb();
    const vals = guard.knownIdentifiers(db).map(i => i.value);
    assert.ok(vals.length > 0);
    assert.ok(!vals.some(v => /^(Student_)?[SE]\d+$/.test(v)), vals.join(','));
  });
});

describe('pii-guard: names as they really appear', () => {
  function dbWith(students) {
    const { db } = h.freshDb();
    const cid = db.prepare("SELECT id FROM courses WHERE lower(code)='ice301'").get().id;
    const q = h.src('modules/shadsync/shadsync-queries');
    for (const s of students) q.saveStudent(db, { courseId: cid, ...s });
    return db;
  }

  test('Bangla-script names from the DB: full name, first name, inside a Bangla sentence', () => {
    const db = dbWith([{ name: 'তানজিলা আক্তার', studentId: '221-15-4822' }]);
    const g = guard.createRedactor({ db });
    const out = g.redact('তানজিলা আক্তার এর নম্বর কত? তানজিলা কি উপস্থিত ছিল?');
    assert.ok(!out.includes('তানজিলা') && !out.includes('আক্তার'), out);
    assert.equal(g.restore(out), 'তানজিলা আক্তার এর নম্বর কত? তানজিলা কি উপস্থিত ছিল?');
  });

  test('Bangla boundaries: a longer word that merely starts with the name is left alone', () => {
    const g = guard.createRedactor({ identifiers: [{ value: 'রহিম', kind: 'STUDENT' }] });
    assert.equal(g.redact('রহিমা এসেছে'), 'রহিমা এসেছে');
    assert.equal(g.redact('রহিম এসেছে'), '[STUDENT_1] এসেছে');
  });

  test('ALL-CAPS names stored in the DB match any casing, and vice versa', () => {
    const db = dbWith([{ name: 'RAFIQUL ISLAM', studentId: '221-15-4823' }, { name: 'Karim Hossain', studentId: '221-15-4824' }]);
    const g = guard.createRedactor({ db });
    const out = g.redact('Rafiqul Islam, rafiqul islam, RAFIQUL; also KARIM HOSSAIN');
    assert.ok(!/rafiqul|islam|karim|hossain/i.test(out), out);
  });

  test('first-name-only and possessive mentions: "Karim\'s marks"', () => {
    const db = dbWith([{ name: 'Karim Hossain', studentId: '221-15-4824' }]);
    const g = guard.createRedactor({ db });
    const out = g.redact("What are Karim's marks? Ask Hossain too.");
    assert.ok(!/Karim|Hossain/.test(out), out);
    assert.match(out, /'s marks\?/);
    assert.equal(g.restore(out), "What are Karim's marks? Ask Hossain too.");
  });

  test('honorifics and very common prefixes are not redacted on their own', () => {
    const db = dbWith([{ name: 'Md. Abdul Karim', studentId: '221-15-4825' }]);
    const vals = guard.knownIdentifiers(db).map(i => i.value);
    assert.ok(vals.includes('Abdul') && vals.includes('Karim'));
    assert.ok(!vals.includes('Md.') && !vals.includes('Md'));
  });

  test('the name heuristic does not cross lines or take titles as names', () => {
    const g = guard.createRedactor({ identifiers: [] });
    const s = 'Summary for students\nProfessor can mark attendance. Ask the student Professor Shad about it.';
    assert.equal(g.redact(s).split('\n')[1].startsWith('Professor can'), true);
  });
});

describe('pii-guard: local-only detectors', () => {
  test('rosters and marks sheets are recognised, with names that are NOT in the DB', () => {
    assert.equal(guard.looksLikeStudentTable('Student ID,Name,CT1\n221-15-9010,Sadia Afrin Lima,12\n221-15-9011,Arif Mahmud,14'), true);
    assert.equal(guard.looksLikeStudentTable('Roll\tStudent Name\tAttendance\n1\tSadia\t80%\n2\tArif\t75%'), true);
    assert.equal(guard.looksLikeStudentTable('ক্রমিক,নাম,রোল\n১,সাদিয়া,১০১\n২,আরিফ,১০২'), true);
    assert.equal(guard.looksLikeStudentTable('x\n221-15-9010 a\n221-15-9011 b\n221-15-9012 c'), true, 'many ID-shaped rows');
    assert.equal(guard.looksLikeStudentTable('Week,Topic\n1,Sampling\n2,Quantisation'), false);
    assert.equal(guard.looksLikeStudentTable('CLO1: Explain sampling.\nCLO2: Apply the DFT.'), false);
  });

  test('spreadsheets by extension or MIME type', () => {
    for (const [m, f] of [['', 'marks.xlsx'], ['', 'ICE415_CIA.xls'], ['text/csv', 'a'], ['application/vnd.ms-excel', 'a'], ['', 'roster.ods']]) {
      assert.equal(guard.isSpreadsheet(m, f), true, `${m} ${f}`);
    }
    assert.equal(guard.isSpreadsheet('application/pdf', 'syllabus.pdf'), false);
  });

  test('student-data chat messages are recognised; ordinary ones are not', () => {
    const ids = [{ value: 'Karim Hossain', kind: 'STUDENT' }, { value: 'Karim', kind: 'STUDENT' }];
    for (const m of ["What are Karim's marks?", 'add student Tanvir to ICE301', 'attendance for ICE301 today', 'CT2 results', 'রোল ১০ এর ফলাফল', 'ID 221-15-4821']) {
      assert.equal(guard.isStudentDataText(m, { identifiers: ids }), true, m);
    }
    for (const m of ['Plan my week', 'Map these CLOs to Bloom levels', 'What is my next class?']) {
      assert.equal(guard.isStudentDataText(m, { identifiers: ids }), false, m);
    }
  });
});
