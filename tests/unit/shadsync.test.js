'use strict';
// Safety net + bug repros for the ShadSync OBE engine

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const engine  = h.src('modules/shadsync/shadsync-engine');
const queries = h.src('modules/shadsync/shadsync-queries');

function ice301(db) {
  return db.prepare("SELECT id FROM courses WHERE lower(code)='ice301'").get().id;
}

describe('ShadSync attainment (seeded ICE301 demo data)', () => {
  // Values documented in .claude/DUMMYDATA.md and verified against the live DB.
  const EXPECTED = {
    clo: { CLO1: 66.3, CLO2: 67.9, CLO3: 64.4, CLO4: 65.7 },
    co:  { CO1: 67.1, CO2: 64.9 },
    po:  { PO1: 66.2, PO2: 65.8, PO3: 64.9, PO5: 66.0 },
  };

  test('CLO / CO / PO percentages match DUMMYDATA.md', () => {
    const { db } = h.freshDb();
    const r = engine.calculateCourseAttainment(db, ice301(db));
    for (const [k, v] of Object.entries(EXPECTED.clo)) assert.equal(r.clo[k].avg, v, k);
    for (const [k, v] of Object.entries(EXPECTED.co))  assert.equal(r.co[k].avg, v, k);
    for (const [k, v] of Object.entries(EXPECTED.po))  assert.equal(r.po[k].avg, v, k);
  });

  test('CLO3 at-risk list: 13 of 35 students below 60%, sorted ascending', () => {
    const { db } = h.freshDb();
    const r = engine.calculateCourseAttainment(db, ice301(db));
    assert.equal(r.clo.CLO3.below_count, 13);
    assert.equal(r.clo.CLO3.below_threshold, false);
    const pcts = r.clo.CLO3.students_below.map(s => s.pct);
    assert.deepEqual(pcts, [...pcts].sort((a, b) => a - b));
  });

  test('saveMarks updates a student and changes attainment', () => {
    const { db } = h.freshDb();
    const cid = ice301(db);
    const before = engine.calculateCourseAttainment(db, cid).clo.CLO1.avg;
    const sid = db.prepare('SELECT student_id FROM marks WHERE course_id=? LIMIT 1').get(cid).student_id;
    queries.saveMarks(db, { studentId: sid, courseId: cid, q1: 0, q2: 0, midterm: 0, final: 0, assignment: 0, lab: 0 });
    assert.ok(engine.calculateCourseAttainment(db, cid).clo.CLO1.avg < before);
  });
});

describe('ShadSync bugs', () => {
  test('BUG-B4: every course uses ICE301 assessment metadata', () => {
    const { db } = h.freshDb();
    const c = db.prepare("INSERT INTO courses (code, name) VALUES ('CSE999','Other')").run().lastInsertRowid;
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('cse999_assessment_meta', ?)")
      .run(JSON.stringify({ threshold: 50, max_marks: { final: 100 }, clo_map: { CLO1: { final: 1 } } }));
    const data = queries.getCourseData(db, c);
    assert.equal(data.meta.threshold, 50, 'course-specific metadata should be used');
  });

  test('BUG-SH1: course with no data reports PO attainment as 0% instead of "no data"', () => {
    const { db } = h.freshDb();
    const c = db.prepare("INSERT INTO courses (code, name) VALUES ('EMPTY1','Empty')").run().lastInsertRowid;
    const r = engine.calculateCourseAttainment(db, c);
    for (const [po, v] of Object.entries(r.po)) {
      assert.notEqual(v.avg, 0, `${po} shows 0% for a course with no students`);
    }
  });

  test('BUG-SH2: one student missing a marks row drags every CLO average down', () => {
    const { db } = h.freshDb();
    const cid = ice301(db);
    const before = engine.calculateCourseAttainment(db, cid).clo.CLO1.avg;
    // Add a student without a marks row (e.g. enrolled but not yet graded)
    db.prepare(`INSERT INTO students (course_id, student_id_anon, name_anon, enrollment_no_anon)
                VALUES (?, 'S999', 'Student_S999', 'E999')`).run(cid);
    const after = engine.calculateCourseAttainment(db, cid).clo.CLO1.avg;
    assert.equal(after, before, 'ungraded student should not change the average');
  });

  test('course whose students were all removed still returns finite numbers', () => {
    const { db } = h.freshDb();
    const cid = ice301(db);
    for (const t of ['marks', 'attendance', 'diu_marks']) db.prepare(`DELETE FROM ${t} WHERE course_id=?`).run(cid);
    db.prepare('DELETE FROM students WHERE course_id=?').run(cid);
    const r = engine.calculateCourseAttainment(db, cid);
    assert.equal(r.clo.CLO1.avg, 0);
    assert.equal(typeof r.clo.CLO1.below_threshold, 'boolean');
  });

  test('BUG-S1: saveStudent stores names as plaintext "<name>_enc"', () => {
    const { db } = h.freshDb();
    const cid = ice301(db);
    const id = queries.saveStudent(db, { courseId: cid, studentIdAnon: 'S500', nameAnon: 'Karim Hossain', enrollAnon: 'E500' });
    const row = db.prepare('SELECT name_anon, name_enc FROM students WHERE id=?').get(id);
    assert.ok(!row.name_enc.includes('Karim'), `name_enc is "${row.name_enc}"`);
    assert.ok(!row.name_anon.includes('Karim'), `real name stored in the *anon* column: "${row.name_anon}"`);
  });

  test('BUG-S1: seeded demo students are stored the same way', () => {
    const { db } = h.freshDb();
    const row = db.prepare("SELECT name_enc FROM students WHERE name_enc != '' LIMIT 1").get();
    assert.ok(!/_enc$/.test(row.name_enc), `name_enc is "${row.name_enc}"`);
  });
});
