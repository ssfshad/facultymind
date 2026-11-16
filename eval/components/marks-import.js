'use strict';
// Marks-sheet import, cell-exact (QUALITY.md: 100%). Synthetic sheets in several layouts/formats
// (seeded, no real data): import into a fresh DB and compare EVERY cell, including blanks.

const path = require('path');
const h = require('../../tests/helpers/harness');
const XLSX = require(path.join(h.ROOT, 'node_modules', 'xlsx'));
const importer = h.src('modules/shadsync/marks-importer');
const crypto = h.src('modules/security/student-crypto');

function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// layout variants: [indicator groups [name, [max...]]], id header, has CO row, has PO row, has Bloom row, file type
const VARIANTS = [
  { groups: [['Attendance', [7]], ['Quiz', [15]], ['MT', [3, 3, 3, 3, 5, 5, 3]]], idHead: 'Student USN', co: true, po: true, bloom: false, type: 'biff8' },
  { groups: [['Quiz', [10]], ['Final', [40]]], idHead: 'Student ID', co: true, po: false, bloom: false, type: 'xlsx' },
  { groups: [['Assignment', [5, 5]], ['Lab', [20]], ['Final', [30, 30]]], idHead: 'Student ID', co: false, po: false, bloom: false, type: 'xlsx' },
  { groups: [['CT', [10, 10, 10]], ['Project', [25]]], idHead: 'Student Roll', co: true, po: true, bloom: true, type: 'biff8' },
  { groups: [['Midterm', [12, 8]]], idHead: 'Student ID', co: true, po: true, bloom: false, type: 'xlsx' },
  { groups: [['Attendance', [10]], ['Quiz', [5, 5, 5]], ['Viva', [15]], ['Final', [40]]], idHead: 'Student USN', co: true, po: true, bloom: true, type: 'xlsx' },
];

function build(v, n, rnd) {
  const caps = []; const ind = []; const cos = []; const pos = []; const blooms = [];
  let k = 0;
  for (const [name, maxes] of v.groups) maxes.forEach((m, i) => {
    ind.push(i === 0 ? `${name} (${maxes.reduce((a, b) => a + b, 0)}M)` : null);
    caps.push(`${i + 1} (${m.toFixed(2)}M)`);
    cos.push(`CO${1 + (k % 3)}`); pos.push(k % 2 ? 'PO1, PO3' : `PO${1 + (k % 4)}`); blooms.push(`C${1 + (k % 6)}`); k++;
  });
  const pad = [null, null];
  const rows = [['Program', 'B. Sc in EVAL'], ['Term', 'Level1-Term1'], ['Section', 'A'], ['Course', 'Eval Course (EVL' + n + ')'],
    ['Indicators', ...pad, ...ind], ['Description', ...pad, ...caps]];
  if (v.co) rows.push(['CO Mapping', ...pad, ...cos]);
  if (v.po) rows.push(['PO Mapping', ...pad, ...pos]);
  if (v.bloom) rows.push(['Bloom Level', ...pad, ...blooms]);
  rows.push(['SL No.', v.idHead, 'Student Name', ...caps]);
  const maxFlat = v.groups.flatMap(([, m]) => m);
  const students = [];
  for (let s = 0; s < 24 + n * 3; s++) {
    const vals = maxFlat.map(m => (rnd() < 0.06 ? null : Math.round(rnd() * m * 4) / 4));
    students.push({ id: `${200 + n}-${10 + s}-${100 + s * 7}`, name: `Eval Student ${n}-${s}`, vals });
    rows.push([s + 1, students[s].id, students[s].name, ...vals]);
  }
  rows.push(['Total students', null, null, ...maxFlat.map(() => 0)]); // summary row to be ignored
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return { buf: XLSX.write(wb, { type: 'buffer', bookType: v.type }), students, maxFlat };
}

module.exports = async function run() {
  const { db } = h.freshDb();
  const rnd = rng(31415);
  let cells = 0, ok = 0;
  const failures = [];
  VARIANTS.forEach((v, n) => {
    const { buf, students, maxFlat } = build(v, n, rnd);
    let res;
    try { res = importer.importMarksSheet(db, importer.parseMarksSheet(buf)); }
    catch (e) { cells += students.length * maxFlat.length; failures.push(`variant ${n}: import threw ${e.message}`); return; }
    const cols = db.prepare('SELECT * FROM assessment_columns WHERE course_id=? ORDER BY position').all(res.courseId);
    const byId = new Map(db.prepare('SELECT id, student_id_enc FROM students WHERE course_id=?').all(res.courseId).map(s => [crypto.reveal(s.student_id_enc), s.id]));
    if (cols.length !== maxFlat.length) failures.push(`variant ${n}: ${cols.length} columns, expected ${maxFlat.length}`);
    for (const st of students) {
      const sid = byId.get(st.id);
      st.vals.forEach((exp, i) => {
        cells++;
        const row = cols[i] && sid != null ? db.prepare('SELECT value FROM assessment_marks WHERE student_id=? AND column_id=?').get(sid, cols[i].id) : null;
        const got = row ? row.value : undefined;
        if (got === exp && cols[i] && cols[i].max_marks === maxFlat[i]) ok++;
        else if (failures.length < 20) failures.push(`variant ${n} ${st.id} col ${i + 1}: got ${got}, expected ${exp}`);
      });
    }
  });
  return {
    name: 'Marks-sheet import (cell-exact)', metric: 'cells (marks, blanks, column maxima) identical after import',
    target: 1.0, value: cells ? ok / cells : 0, n: cells, unit: 'cells',
    note: `${VARIANTS.length} synthetic sheets (.xls and .xlsx; 1-9 columns; with/without CO, PO, Bloom rows; USN/ID/Roll headers; blanks; summary rows)`,
    failures,
  };
};
