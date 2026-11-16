'use strict';
// Marks-sheet importer: parsing, cell-exact import, encryption, re-import, hand-computed attainment

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require(require('path').join(h.ROOT, 'node_modules', 'xlsx'));

const importer = h.src('modules/shadsync/marks-importer');
const engine = h.src('modules/shadsync/shadsync-engine');
const crypto = h.src('modules/security/student-crypto');

// Synthetic sheet in the DIU CIA layout. Columns: quiz_1 (10, CO1/PO1), mt_1 (12, CO1/PO1), mt_2 (8, CO2/PO2)
const HEAD = [
  ['Program', 'B. Sc in TEST'], ['Curriculum', 'Test 2020'], ['Term', 'Level4-Term1'], ['Section', 'A'],
  ['Course', 'Test Engineering (TST415)'],
  ['Indicators', null, null, 'Quiz (10M)', 'MT (20M)', null],
  ['Description', null, null, '1 (10.00M)', '1 (12.00M)', '2 (8.00M)'],
  ['CO Mapping', null, null, 'CO1', 'CO1', 'CO2'],
  ['PO Mapping', null, null, 'PO1', 'PO1', 'PO2'],
  ['Marks Range', null, null, null, null, null],
  ['SL No.', 'Student ID', 'Student Name', '1 (10.00M)', '1 (12.00M)', '2 (8.00M)'],
];
const STUDENTS = [
  [1, '111-11-001', 'Test Student One', 10, 12, 8],
  [2, '111-11-002', 'Test Student Two', 5, 6, 4],
  [3, '111-11-003', 'Test Student Three', 8, 6, null],   // blank MT2
  [4, '111-11-004', 'Test Student Four', null, null, null], // not graded at all
];
const TAIL = [['No. of Students', null, null, 3, 3, 2], ['% of students above', null, null, 66.7, 66.7, 50]];

function sheet(extra = {}) {
  const rows = [...HEAD, ...(extra.students || STUDENTS), ...TAIL];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: extra.type || 'xlsx' });
}

describe('marks sheet: parsing', () => {
  test('reads course info, columns (forward-filled indicator, max, CO/PO) and students', () => {
    const p = importer.parseMarksSheet(sheet());
    assert.equal(p.course.code, 'TST415');
    assert.equal(p.course.name, 'Test Engineering');
    assert.equal(p.course.section, 'A');
    assert.deepEqual(p.columns.map(c => [c.col_key, c.max_marks, c.co_codes.join(), c.po_codes.join()]),
      [['quiz_1', 10, 'CO1', 'PO1'], ['mt_1', 12, 'CO1', 'PO1'], ['mt_2', 8, 'CO2', 'PO2']]);
    assert.equal(p.students.length, 4);
    assert.deepEqual(p.students[2].values, [8, 6, null]);
    assert.equal(p.skippedRows.length, 2, 'summary rows below the students are skipped');
  });

  test('works for old .xls files too', () => {
    const p = importer.parseMarksSheet(sheet({ type: 'biff8' }));
    assert.equal(p.students.length, 4);
    assert.deepEqual(p.students[0].values, [10, 12, 8]);
  });

  test('warns about marks outside 0..max and keeps them as typed', () => {
    const p = importer.parseMarksSheet(sheet({ students: [[1, '111-11-001', 'A B', 11, 12, 8]] }));
    assert.equal(p.students[0].values[0], 11);
    assert.ok(p.warnings.some(w => /outside 0\.\.10/.test(w)), p.warnings.join('|'));
  });

  test('a file that is not a marks sheet is rejected with a clear message', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['just', 'some'], ['cells', 'here']]), 'S');
    assert.throws(() => importer.parseMarksSheet(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), /Student ID/);
  });
});

describe('marks sheet: import into the database', () => {
  test('cell-exact: every mark in the sheet is in the database, blanks stay NULL', () => {
    const { db } = h.freshDb();
    const parsed = importer.parseMarksSheet(sheet());
    const r = importer.importMarksSheet(db, parsed);
    assert.equal(r.students.created, 4);
    assert.equal(r.marksWritten, 8);
    assert.equal(r.blanks, 4);
    const cols = db.prepare('SELECT * FROM assessment_columns WHERE course_id=? ORDER BY position').all(r.courseId);
    let checked = 0;
    for (const st of parsed.students) {
      const id = db.prepare('SELECT id, student_id_enc FROM students WHERE course_id=?').all(r.courseId)
        .find(s => crypto.reveal(s.student_id_enc) === st.studentId).id;
      cols.forEach((c, i) => {
        const v = db.prepare('SELECT value FROM assessment_marks WHERE student_id=? AND column_id=?').get(id, c.id).value;
        assert.equal(v, st.values[i], `${st.studentId} ${c.col_key}`); checked++;
      });
    }
    assert.equal(checked, 12);
  });

  test('student names and IDs are encrypted at rest; tokens only in the anon columns', () => {
    const { db } = h.freshDb();
    const r = importer.importMarksSheet(db, importer.parseMarksSheet(sheet()));
    const rows = db.prepare('SELECT * FROM students WHERE course_id=?').all(r.courseId);
    for (const s of rows) {
      assert.ok(!/Test Student/.test(JSON.stringify(s)), 'real name leaked into a stored column');
      assert.ok(!/111-11-/.test(JSON.stringify(s)), 'real ID leaked into a stored column');
      assert.match(s.name_anon, /^Student_S\d+$/);
    }
    assert.equal(crypto.reveal(rows[0].name_enc, 'x'), 'Test Student One');
  });

  test('re-import replaces the marks, keeps the same student rows (matched by real ID)', () => {
    const { db } = h.freshDb();
    const first = importer.importMarksSheet(db, importer.parseMarksSheet(sheet()));
    const ids1 = db.prepare('SELECT id FROM students WHERE course_id=? ORDER BY id').all(first.courseId).map(r => r.id);
    const changed = STUDENTS.map(r => r.slice()); changed[0][3] = 9;
    const second = importer.importMarksSheet(db, importer.parseMarksSheet(sheet({ students: changed })));
    assert.equal(second.students.created, 0);
    assert.equal(second.students.matched, 4);
    assert.deepEqual(db.prepare('SELECT id FROM students WHERE course_id=? ORDER BY id').all(first.courseId).map(r => r.id), ids1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM assessment_columns WHERE course_id=?').get(first.courseId).n, 3);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM assessment_marks').get().n, 12);
  });

  test('importing into an existing course matches its code case-insensitively (no duplicate course)', () => {
    const { db } = h.freshDb();
    db.prepare("INSERT INTO courses (code, name) VALUES ('tst415', 'Existing')").run();
    const before = db.prepare('SELECT COUNT(*) n FROM courses').get().n;
    const r = importer.importMarksSheet(db, importer.parseMarksSheet(sheet()));
    assert.equal(r.createdCourse, false);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM courses').get().n, before);
  });

  test('a course code typed by the teacher is normalised, and markup is refused', () => {
    const { db } = h.freshDb();
    const parsed = importer.parseMarksSheet(sheet());
    assert.throws(() => importer.importMarksSheet(db, parsed, { courseCode: '<img src=x onerror=alert(1)>' }), /does not look like a course code/);
    const r = importer.importMarksSheet(db, parsed, { courseCode: 'tst 415' });
    assert.equal(r.courseCode, 'TST415');
  });

  test('a failed import writes nothing (one transaction)', () => {
    const { db } = h.freshDb();
    const parsed = importer.parseMarksSheet(sheet());
    parsed.students[3].values = [{}, 1, 2]; // an object cannot be bound -> the insert throws part-way through
    const before = db.prepare('SELECT COUNT(*) n FROM students').get().n;
    assert.throws(() => importer.importMarksSheet(db, parsed));
    assert.equal(db.prepare('SELECT COUNT(*) n FROM students').get().n, before);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM assessment_columns').get().n, 0);
  });
});

describe('ShadSync on an imported marks sheet (hand-computed)', () => {
  // CO1 = quiz_1 + mt_1 (max 22): S1 100, S2 50, S3 63.64 -> mean 71.2, one below 60
  // CO2 = mt_2 (max 8): S1 100, S2 50; S3 blank and S4 ungraded are excluded -> mean 75.0
  // PO1 <- CO1 = 71.2, PO2 <- CO2 = 75.0
  test('CO and PO attainment come straight from the sheet columns', () => {
    const { db } = h.freshDb();
    const r = importer.importMarksSheet(db, importer.parseMarksSheet(sheet()));
    const a = engine.calculateCourseAttainment(db, r.courseId);
    assert.equal(a.co.CO1.avg, 71.2);
    assert.equal(a.co.CO1.below_count, 1);
    assert.equal(a.co.CO2.avg, 75.0);
    assert.equal(a.co.CO2.below_count, 1);
    const po = (code) => Object.entries(a.po).find(([k]) => k === code)?.[1];
    assert.equal(po('PO1').avg, 71.2);
    assert.equal(po('PO2').avg, 75.0);
    assert.deepEqual(a.clo, {}, 'no CLOs in this sheet: reported as none, not 0%');
  });

  test('the seeded ICE301 demo course is unchanged', () => {
    const { db } = h.freshDb();
    const cid = db.prepare("SELECT id FROM courses WHERE lower(code)='ice301'").get().id;
    assert.equal(engine.calculateCourseAttainment(db, cid).clo.CLO1.avg, 66.3);
  });
});
