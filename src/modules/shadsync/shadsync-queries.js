const studentCrypto = require('../security/student-crypto');

function getCourseData(db, courseId) {
  // Assessment definition is stored per course: settings key "<code lower-case>_assessment_meta"
  const course = db.prepare("SELECT code FROM courses WHERE id=?").get(courseId);
  const metaSetting = course
    ? db.prepare("SELECT value FROM settings WHERE key=?").get(`${String(course.code).toLowerCase()}_assessment_meta`)
    : null;
  // A course with no assessment definition yet has no CLO mapping: report "no data", don't borrow another course's
  const assessmentMeta = metaSetting
    ? JSON.parse(metaSetting.value)
    : { threshold: 60, max_marks: {}, clo_map: {} };
  
  const clos = db.prepare("SELECT * FROM clos WHERE course_id=?").all(courseId);
  const cos = db.prepare("SELECT * FROM cos WHERE course_id=?").all(courseId);
  const pos = db.prepare("SELECT * FROM pos").all();
  
  const coCloMap = db.prepare("SELECT * FROM co_clo_map").all();
  const coPoMap = db.prepare("SELECT * FROM co_po_map").all();

  const students = db.prepare("SELECT * FROM students WHERE course_id=?").all(courseId);
  let marks = db.prepare("SELECT * FROM marks WHERE course_id=?").all(courseId);

  // A course imported from a marks sheet has its own assessment columns (migration 007): they replace the
  // six fixed legacy columns. Rows look like { student_id, <col_key>: value|null }; null = blank cell.
  const cols = db.prepare("SELECT * FROM assessment_columns WHERE course_id=? ORDER BY position").all(courseId);
  if (cols.length) {
    const byId = new Map(cols.map(c => [c.id, c]));
    const rows = new Map();
    for (const m of db.prepare(`SELECT m.student_id, m.column_id, m.value FROM assessment_marks m
                                JOIN assessment_columns c ON c.id = m.column_id WHERE c.course_id=?`).all(courseId)) {
      if (!rows.has(m.student_id)) rows.set(m.student_id, { student_id: m.student_id });
      rows.get(m.student_id)[byId.get(m.column_id).col_key] = m.value;
    }
    marks = [...rows.values()];
    assessmentMeta.max_marks = Object.fromEntries(cols.map(c => [c.col_key, c.max_marks]));
    assessmentMeta.clo_map = assessmentMeta.clo_map || {};
    // each column counts once toward every CO it is mapped to
    assessmentMeta.co_map = {};
    for (const c of cols) for (const co of JSON.parse(c.co_codes || '[]')) {
      (assessmentMeta.co_map[co] = assessmentMeta.co_map[co] || {})[c.col_key] = 1;
    }
    assessmentMeta.flexible = true;
  }
  
  // decrypt names/ids
  const decryptedStudents = students.map(s => {
    return {
      id: s.id,
      token: s.student_id_anon,
      anonName: s.name_anon,
      realName: studentCrypto.reveal(s.name_enc, s.name_anon),
      realId: studentCrypto.reveal(s.student_id_enc, s.student_id_anon)
    }
  });

  return {
    meta: assessmentMeta,
    clos,
    cos,
    pos,
    coCloMap,
    coPoMap,
    students: decryptedStudents,
    marks
  };
}

// ─── Data Entry Mutations (Sprint 2) ──────────────────────────────────────────

// The form sends the real name/ID/enrollment no. (older callers used the
// *Anon keys for the same real values). Tokens are generated here.
function saveStudent(db, { courseId, name, studentId, enrollmentNo, studentIdAnon, nameAnon, enrollAnon }) {
  const s = studentCrypto.newStudentColumns(db, courseId, {
    name:         name ?? nameAnon,
    studentId:    studentId ?? studentIdAnon,
    enrollmentNo: enrollmentNo ?? enrollAnon,
  });

  const stmt = db.prepare(`
    INSERT INTO students (course_id, student_id_anon, name_anon, enrollment_no_anon, name_enc, student_id_enc, enrollment_no_enc)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(s.course_id, s.student_id_anon, s.name_anon, s.enrollment_no_anon, s.name_enc, s.student_id_enc, s.enrollment_no_enc);
  
  // init empty marks
  db.prepare(`INSERT INTO marks (student_id, course_id) VALUES (?, ?)`).run(res.lastInsertRowid, courseId);
  return res.lastInsertRowid;
}

function saveMarks(db, { studentId, courseId, q1, q2, midterm, final, assignment, lab }) {
  const stmt = db.prepare(`
    UPDATE marks SET q1=?, q2=?, midterm=?, final=?, assignment=?, lab=?
    WHERE student_id=? AND course_id=?
  `);
  stmt.run(q1, q2, midterm, final, assignment, lab, studentId, courseId);
  return true;
}

function saveAttendance(db, { studentId, courseId, date, present }) {
  // Check if exists
  const existing = db.prepare("SELECT id FROM attendance WHERE student_id=? AND course_id=? AND date=?").get(studentId, courseId, date);
  if(existing) {
     db.prepare("UPDATE attendance SET present=? WHERE id=?").run(present, existing.id);
  } else {
     db.prepare("INSERT INTO attendance (student_id, course_id, date, present) VALUES (?, ?, ?, ?)").run(studentId, courseId, date, present);
  }
  return true;
}

function saveClo(db, { courseId, code, description, bloomLevel, weight }) {
  const existing = db.prepare("SELECT id FROM clos WHERE course_id=? AND code=?").get(courseId, code);
  if(existing) {
     db.prepare("UPDATE clos SET description=?, bloom_level=?, weight=? WHERE id=?").run(description, bloomLevel, weight, existing.id);
     return existing.id;
  }
  const res = db.prepare("INSERT INTO clos (course_id, code, description, bloom_level, weight) VALUES (?, ?, ?, ?, ?)")
                .run(courseId, code, description, bloomLevel, weight || 1.0);
  return res.lastInsertRowid;
}

function saveCo(db, { courseId, code, description }) {
  const existing = db.prepare("SELECT id FROM cos WHERE course_id=? AND code=?").get(courseId, code);
  if(existing) {
     db.prepare("UPDATE cos SET description=? WHERE id=?").run(description, existing.id);
     return existing.id;
  }
  const res = db.prepare("INSERT INTO cos (course_id, code, description) VALUES (?, ?, ?)").run(courseId, code, description);
  return res.lastInsertRowid;
}

function savePo(db, { code, description, category }) {
  const existing = db.prepare("SELECT id FROM pos WHERE code=?").get(code);
  if(existing) {
     db.prepare("UPDATE pos SET description=?, category=? WHERE id=?").run(description, category, existing.id);
     return existing.id;
  }
  const res = db.prepare("INSERT INTO pos (code, description, category) VALUES (?, ?, ?)").run(code, description, category);
  return res.lastInsertRowid;
}

module.exports = {
  getCourseData,
  saveStudent,
  saveMarks,
  saveAttendance,
  saveClo,
  saveCo,
  savePo
};

