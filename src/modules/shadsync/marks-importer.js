'use strict';

/**
 * marks-importer.js — read a teacher's marks sheet (.xls / .xlsx) into ShadSync.
 *
 * Expected layout (DIU CIA sheet): a header block of "Label | value" rows (Program, Curriculum, Term,
 * Section, Course), then
 *   Indicators   | | | Attendance (7M) | Quiz (15M) | ... | MT (25M) | (blank = same indicator)
 *   Description  | | | 1 (7.00M)       | 1 (15.00M) | ... | 1 (3.00M) | 2 (3.00M) ...   <- ordinal + max marks
 *   CO Mapping   | | | CO1 | CO2 | ...                                                   (optional)
 *   PO Mapping   | | | PO1 | PO1, PO2 | ...                                              (optional)
 *   SL No. | Student ID | Student Name | <column captions>
 *   1      | 221-15-1.. | Name         | marks ...
 * Rows below the last student (totals, "% of students ...") are ignored.
 *
 * parseMarksSheet() only reads the file. importMarksSheet() writes it to the database in ONE
 * transaction; students are encrypted exactly like every other student record (student-crypto).
 */

const fs = require('fs');
const XLSX = require('xlsx');
const studentCrypto = require('../security/student-crypto');
const queries = require('./shadsync-queries');
const { saveCourse, getAllCourses } = require('../../database/queries');

const slug = (s) => String(s || 'col').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'col';
const cell = (row, i) => (row && i >= 0 && i < row.length ? row[i] : null);
const text = (v) => (v == null ? '' : String(v).trim());
const CAPTION = /^\s*(\d+)\s*\(\s*([\d.]+)\s*M?\s*\)\s*$/i; // "1 (7.00M)"
const ID_HEADER = /student\s*(id|usn|roll|reg)|^usn$/i;                // "Student ID", "Student USN"

function codes(v, prefix) {
  const re = new RegExp(`${prefix}\\s*[-]?\\s*(\\d+)`, 'gi');
  return [...text(v).matchAll(re)].map(m => `${prefix}${parseInt(m[1], 10)}`).filter((c, i, a) => a.indexOf(c) === i);
}

/**
 * @param {Buffer|string} input  file contents or a path
 * @returns {{course, columns, students, warnings, skippedRows}}
 */
function parseMarksSheet(input) {
  const wb = Buffer.isBuffer(input) || input instanceof Uint8Array
    ? XLSX.read(input, { type: 'buffer' })
    : XLSX.read(fs.readFileSync(input), { type: 'buffer' });
  const warnings = [];

  // first sheet that has a "Student ID" header
  let rows = null;
  for (const name of wb.SheetNames) {
    const r = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, blankrows: false, raw: true });
    if (r.some(row => row.slice(0, 4).some(c => ID_HEADER.test(text(c))))) { rows = r; break; }
  }
  if (!rows) throw new Error('This does not look like a marks sheet: no "Student ID" (or USN) header row was found.');

  const headerIdx = rows.findIndex(row => row.slice(0, 4).some(c => ID_HEADER.test(text(c))));
  const header = rows[headerIdx];
  const idCol = header.findIndex(c => ID_HEADER.test(text(c)));
  let nameCol = header.findIndex(c => /student\s*name|^name$/i.test(text(c)));
  if (nameCol < 0) nameCol = idCol + 1;

  // labelled rows above the header
  const byLabel = {};
  for (const row of rows.slice(0, headerIdx)) {
    const label = text(row[0]).toLowerCase().replace(/\s+/g, ' ');
    if (label) byLabel[label] = row;
  }
  const info = (label) => text(cell(byLabel[label], 1));

  const courseCell = info('course');
  const codeMatch = /\(([A-Za-z]{2,}\s*-?\s*\d+[A-Za-z]?)\)\s*$/.exec(courseCell);
  const course = {
    program: info('program'), curriculum: info('curriculum'), term: info('term'), section: info('section'),
    name: courseCell.replace(/\([^)]*\)\s*$/, '').trim() || courseCell,
    code: codeMatch ? codeMatch[1].replace(/[\s-]+/g, '').toUpperCase() : null,
  };

  // assessment columns: captions on the Description row, else on the header row
  const descRow = byLabel['description'] || header;
  const indRow = byLabel['indicators'];
  const coRow = byLabel['co mapping'] || byLabel['co'];
  const poRow = byLabel['po mapping'] || byLabel['po'];
  const bloomRow = byLabel['bloom level'] || byLabel['bloom'];

  const columns = [];
  let indicator = '';
  for (let c = 0; c < Math.max(descRow.length, header.length); c++) {
    const ind = text(cell(indRow, c));
    if (ind) indicator = ind.replace(/\s*\(.*?\)\s*$/, '').trim();
    const m = CAPTION.exec(text(cell(descRow, c)) || text(cell(header, c)));
    if (!m || c <= nameCol) continue;
    const ordinal = parseInt(m[1], 10);
    columns.push({
      col: c, indicator: indicator || 'Column', ordinal, max_marks: parseFloat(m[2]),
      col_key: `${slug(indicator)}_${ordinal}`,
      co_codes: codes(cell(coRow, c), 'CO'), po_codes: codes(cell(poRow, c), 'PO'),
      bloom: [...text(cell(bloomRow, c)).matchAll(/C?\s*-?\s*([1-6])/gi)].map(m => `C${m[1]}`).filter((b, i, a) => a.indexOf(b) === i),
      position: columns.length,
    });
  }
  if (!columns.length) throw new Error('No assessment columns found (expected captions like "1 (7.00M)").');
  const seen = new Set();
  for (const c of columns) {
    if (seen.has(c.col_key)) { c.col_key = `${c.col_key}_${c.position}`; warnings.push(`Duplicate column name, renamed to ${c.col_key}`); }
    seen.add(c.col_key);
  }

  // students
  const students = [];
  const skippedRows = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const sid = text(cell(row, idCol));
    const isStudent = sid && /\d/.test(sid) && typeof cell(row, 0) === 'number';
    if (!isStudent) { if (row.some(c => c != null)) skippedRows.push(text(row[0]).slice(0, 40)); continue; }
    const values = columns.map(c => {
      const v = cell(row, c.col);
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : Number(String(v).trim());
      if (!Number.isFinite(n)) { warnings.push(`Row ${r + 1}: "${v}" in ${c.col_key} is not a number (stored as blank)`); return null; }
      if (n < 0 || n > c.max_marks) warnings.push(`Row ${r + 1}: ${n} in ${c.col_key} is outside 0..${c.max_marks}`);
      return n;
    });
    students.push({ sl: cell(row, 0), studentId: sid, name: text(cell(row, nameCol)), values });
  }
  if (!students.length) throw new Error('No student rows found under the "Student ID" header.');
  const ids = students.map(s => s.studentId);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) warnings.push(`Duplicate student IDs in the sheet: ${[...new Set(dup)].length}`);

  return { course, columns, students, warnings, skippedRows };
}

/** Counts only — safe to show before anything is written. */
function previewMarksSheet(parsed) {
  const cells = parsed.students.length * parsed.columns.length;
  const blanks = parsed.students.reduce((n, s) => n + s.values.filter(v => v == null).length, 0);
  return {
    course: parsed.course,
    columns: parsed.columns.map(c => ({ key: c.col_key, max: c.max_marks, co: c.co_codes, po: c.po_codes, bloom: c.bloom || [] })),
    students: parsed.students.length, cells, blanks,
    totalMax: parsed.columns.reduce((n, c) => n + c.max_marks, 0),
    warnings: parsed.warnings, skippedRows: parsed.skippedRows.length,
  };
}

/**
 * Write a parsed sheet. Re-importing the same course replaces its assessment columns and marks but keeps
 * the existing student rows (matched by real student ID), so tokens stay stable.
 */
function importMarksSheet(db, parsed, { courseCode } = {}) {
  // normalise "ICE 415" / "ice-415" -> ICE415; refuse anything that is not a plain course code
  // (the code is shown in the UI and typed by the teacher when the sheet does not name the course)
  const raw = String(courseCode || parsed.course.code || '').trim();
  if (!raw) throw new Error('The course code is not in the sheet. Tell me which course this is.');
  const code = raw.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z]{2,}\d+[A-Z]?$/.test(code)) throw new Error(`"${raw.slice(0, 30)}" does not look like a course code (e.g. ICE415).`);
  if (!studentCrypto.isReady()) throw new Error('Student data key is not loaded — marks cannot be imported.');

  const run = db.transaction(() => {
    const norm = (v) => String(v ?? '').trim().toLowerCase();
    let course = getAllCourses(db).find(c => norm(c.code) === norm(code));
    const createdCourse = !course;
    if (!course) {
      const id = saveCourse(db, {
        code, name: parsed.course.name || code, section: parsed.course.section || '',
        semester: parsed.course.term || '', year: new Date().getFullYear(),
      });
      course = { id };
    }
    const courseId = course.id;

    // columns (replace)
    db.prepare('DELETE FROM assessment_marks WHERE column_id IN (SELECT id FROM assessment_columns WHERE course_id=?)').run(courseId);
    db.prepare('DELETE FROM assessment_columns WHERE course_id=?').run(courseId);
    const insCol = db.prepare(`INSERT INTO assessment_columns (course_id, col_key, indicator, ordinal, max_marks, co_codes, po_codes, bloom_levels, position)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const colIds = parsed.columns.map(c =>
      insCol.run(courseId, c.col_key, c.indicator, c.ordinal, c.max_marks, JSON.stringify(c.co_codes), JSON.stringify(c.po_codes), JSON.stringify(c.bloom || []), c.position).lastInsertRowid);

    // COs / POs / CO->PO links implied by the column mappings
    const coIds = {};
    for (const c of parsed.columns) for (const co of c.co_codes) {
      if (!coIds[co]) coIds[co] = queries.saveCo(db, { courseId, code: co, description: `${co} (imported from ${code} marks sheet)` });
    }
    const poIds = {};
    for (const c of parsed.columns) for (const po of c.po_codes) {
      if (poIds[po]) continue;
      const row = db.prepare('SELECT id FROM pos WHERE code=?').get(po);
      poIds[po] = row ? row.id : queries.savePo(db, { code: po, description: `Programme outcome ${po}`, category: 'BAETE' });
    }
    let linked = 0;
    for (const c of parsed.columns) for (const co of c.co_codes) for (const po of c.po_codes) {
      const has = db.prepare('SELECT 1 FROM co_po_map WHERE co_id=? AND po_id=?').get(coIds[co], poIds[po]);
      if (!has) { db.prepare('INSERT INTO co_po_map (co_id, po_id, weight) VALUES (?, ?, 1.0)').run(coIds[co], poIds[po]); linked++; }
    }

    // students (match by real ID, else create)
    const existing = new Map();
    for (const s of db.prepare('SELECT * FROM students WHERE course_id=?').all(courseId)) {
      existing.set(studentCrypto.reveal(s.student_id_enc, s.student_id_anon), s.id);
    }
    const insStudent = db.prepare(`INSERT INTO students (course_id, student_id_anon, name_anon, enrollment_no_anon, name_enc, student_id_enc, enrollment_no_enc)
                                   VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const putMark = db.prepare('INSERT OR REPLACE INTO assessment_marks (student_id, column_id, value) VALUES (?, ?, ?)');
    let created = 0, matched = 0, marksWritten = 0, blanks = 0;
    for (const st of parsed.students) {
      let sid = existing.get(st.studentId);
      if (sid == null) {
        const s = studentCrypto.newStudentColumns(db, courseId, { name: st.name, studentId: st.studentId });
        sid = insStudent.run(s.course_id, s.student_id_anon, s.name_anon, s.enrollment_no_anon, s.name_enc, s.student_id_enc, s.enrollment_no_enc).lastInsertRowid;
        existing.set(st.studentId, sid); created++;
      } else matched++;
      st.values.forEach((v, i) => { putMark.run(sid, colIds[i], v); if (v == null) blanks++; else marksWritten++; });
    }
    return { courseId, courseCode: code, createdCourse, columns: parsed.columns.length, cos: Object.keys(coIds).length,
             pos: Object.keys(poIds).length, coPoLinksAdded: linked,
             students: { total: parsed.students.length, created, matched }, marksWritten, blanks, warnings: parsed.warnings };
  });
  return run();
}

module.exports = { parseMarksSheet, previewMarksSheet, importMarksSheet };
