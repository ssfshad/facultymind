'use strict';
// ShadSync attainment math vs hand-computed references (QUALITY.md: ±0.1%, 100%).
// Deterministic, so every case counts; there is nothing to tune on a dev split.

const h = require('../../tests/helpers/harness');
const engine = h.src('modules/shadsync/shadsync-engine');
const cases = require('../data/shadsync-math.json');

const TOL = 0.1001; // ±0.1 percentage points (float-safe)

function build(db, c, n) {
  const code = `EV${n}`;
  const course = db.prepare('INSERT INTO courses (code, name) VALUES (?, ?)').run(code, c.id).lastInsertRowid;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(`${code.toLowerCase()}_assessment_meta`, JSON.stringify({ threshold: c.threshold, max_marks: c.max_marks, clo_map: c.clo_map }));

  const cloIds = {};
  for (const code2 of new Set([...Object.keys(c.clo_map), ...(c.clos || [])])) {
    cloIds[code2] = db.prepare('INSERT INTO clos (course_id, code, description, weight) VALUES (?, ?, ?, 1.0)').run(course, code2, code2).lastInsertRowid;
  }
  const coIds = {};
  for (const [co, map] of Object.entries(c.cos)) {
    coIds[co] = db.prepare('INSERT INTO cos (course_id, code, description) VALUES (?, ?, ?)').run(course, co, co).lastInsertRowid;
    for (const [clo, w] of Object.entries(map)) db.prepare('INSERT INTO co_clo_map (co_id, clo_id, weight) VALUES (?, ?, ?)').run(coIds[co], cloIds[clo], w);
  }
  for (const [po, map] of Object.entries(c.pos)) {
    const poId = db.prepare('INSERT INTO pos (code, description, category) VALUES (?, ?, ?)').run(`${code}-${po}`, po, 'x').lastInsertRowid;
    for (const [co, w] of Object.entries(map)) db.prepare('INSERT INTO co_po_map (co_id, po_id, weight) VALUES (?, ?, ?)').run(coIds[co], poId, w);
  }
  c.students.forEach((s, i) => {
    const sid = db.prepare('INSERT INTO students (course_id, student_id_anon, name_anon, enrollment_no_anon) VALUES (?, ?, ?, ?)')
      .run(course, `E${n}S${i}`, `Student_${i}`, `EN${n}${i}`).lastInsertRowid;
    if (s.ungraded) return;
    db.prepare('INSERT INTO marks (student_id, course_id, q1, q2, midterm, final, assignment, lab) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(sid, course, s.q1 || 0, s.q2 || 0, s.midterm || 0, s.final || 0, s.assignment || 0, s.lab || 0);
  });
  return { course, code };
}

function near(a, b) { return a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= TOL); }

module.exports = async function run() {
  const { db } = h.freshDb();
  let checks = 0, passed = 0;
  const failures = [];
  const check = (caseId, what, actual, expected, tol = true) => {
    checks++;
    const ok = tol ? near(actual, expected) : actual === expected;
    if (ok) passed++; else failures.push(`${caseId}: ${what} = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  };

  // All cases live in ONE database to also catch cross-course leakage (B4)
  cases.forEach((c, n) => {
    const { course } = build(db, c, n);
    let r;
    try { r = engine.calculateCourseAttainment(db, course); }
    catch (e) { checks++; failures.push(`${c.id}: threw ${e.message}`); return; }

    const exp = c.expected;
    check(c.id, 'CLO set', Object.keys(r.clo).sort().join(','), Object.keys(exp.clo).sort().join(','), false);
    for (const [k, v] of Object.entries(exp.clo)) {
      check(c.id, `${k}.avg`, r.clo[k]?.avg, v.avg);
      check(c.id, `${k}.below_count`, r.clo[k]?.below_count, v.below_count, false);
      check(c.id, `${k}.below_threshold`, r.clo[k]?.below_threshold, v.below_threshold, false);
    }
    for (const [k, v] of Object.entries(exp.co)) {
      check(c.id, `${k}.avg`, r.co[k]?.avg, v.avg);
      check(c.id, `${k}.below_threshold`, r.co[k]?.below_threshold, v.below_threshold, false);
    }
    for (const [k, v] of Object.entries(exp.po)) check(c.id, `${k}.avg`, r.po[`EV${n}-${k}`]?.avg, v.avg);
  });

  return {
    name: 'ShadSync attainment math',
    metric: 'checks matching hand-computed reference (±0.1%)',
    target: 1.0, value: passed / checks, n: checks, unit: 'checks',
    note: `${cases.length} cases; deterministic, no dev/test split needed`,
    failures,
  };
};
