/**
 * Reusable database query functions.
 * All queries live here. Modules import from this file.
 */

// ─── Settings ─────────────────────────────────────────────────────────────────

function getSetting(db, key, defaultVal = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
}

function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
}

// ─── Active Model ─────────────────────────────────────────────────────────────

function updateActiveModel(db, model) {
  setSetting(db, 'model_active', model);
}

function getActiveModel(db) {
  return getSetting(db, 'model_active', 'claude');
}

// ─── API Key References ────────────────────────────────────────────────────────

function saveKeyRef(db, service) {
  db.prepare(`
    INSERT OR REPLACE INTO api_keys (service, key_reference)
    VALUES (?, ?)
  `).run(service, `facultymind_${service}`);
}

// ─── Courses ──────────────────────────────────────────────────────────────────

function getAllCourses(db) {
  return db.prepare('SELECT * FROM courses ORDER BY year DESC, semester DESC').all();
}

function getCourse(db, id) {
  return db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
}

function saveCourse(db, course) {
  if (course.id) {
    db.prepare(`
      UPDATE courses SET code=?, name=?, section=?, semester=?, year=?
      WHERE id=?
    `).run(course.code, course.name, course.section, course.semester, course.year, course.id);
    return course.id;
  }
  const info = db.prepare(`
    INSERT INTO courses (code, name, section, semester, year)
    VALUES (?, ?, ?, ?, ?)
  `).run(course.code, course.name, course.section, course.semester, course.year);
  return info.lastInsertRowid;
}

// ─── Students ─────────────────────────────────────────────────────────────────

function getStudentsByCourse(db, courseId) {
  return db.prepare('SELECT * FROM students WHERE course_id = ? ORDER BY student_id_anon').all(courseId);
}

function saveStudent(db, student) {
  if (student.id) {
    db.prepare(`
      UPDATE students SET name_enc=?, student_id_enc=?, enrollment_no_enc=?
      WHERE id=?
    `).run(student.name_enc, student.student_id_enc, student.enrollment_no_enc, student.id);
    return student.id;
  }
  const info = db.prepare(`
    INSERT INTO students (course_id, student_id_anon, name_anon, enrollment_no_anon,
                          name_enc, student_id_enc, enrollment_no_enc)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    student.course_id, student.student_id_anon, student.name_anon,
    student.enrollment_no_anon, student.name_enc, student.student_id_enc,
    student.enrollment_no_enc
  );
  return info.lastInsertRowid;
}

// ─── Marks ────────────────────────────────────────────────────────────────────

function getMarksByCourse(db, courseId) {
  return db.prepare(`
    SELECT m.*, s.student_id_anon, s.name_anon
    FROM marks m
    JOIN students s ON s.id = m.student_id
    WHERE m.course_id = ?
    ORDER BY s.student_id_anon
  `).all(courseId);
}

function saveMarks(db, marks) {
  const upsert = db.prepare(`
    INSERT INTO marks (student_id, course_id, q1, q2, midterm, final, assignment, lab)
    VALUES (@student_id, @course_id, @q1, @q2, @midterm, @final, @assignment, @lab)
    ON CONFLICT(student_id, course_id) DO UPDATE SET
      q1=excluded.q1, q2=excluded.q2, midterm=excluded.midterm,
      final=excluded.final, assignment=excluded.assignment, lab=excluded.lab
  `);
  const runMany = db.transaction((rows) => rows.forEach(r => upsert.run(r)));
  runMany(Array.isArray(marks) ? marks : [marks]);
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

function getSchedule(db) {
  return db.prepare(`
    SELECT s.*, c.code AS course_code, c.name AS course_name
    FROM schedule s
    LEFT JOIN courses c ON c.id = s.course_id
    ORDER BY s.day_of_week, s.start_time
  `).all();
}

function saveScheduleEntry(db, entry) {
  if (entry.id) {
    db.prepare(`
      UPDATE schedule SET course_id=?, day_of_week=?, start_time=?, end_time=?, room=?, zoom_link=?
      WHERE id=?
    `).run(entry.course_id, entry.day_of_week, entry.start_time, entry.end_time,
           entry.room, entry.zoom_link, entry.id);
    return entry.id;
  }
  const info = db.prepare(`
    INSERT INTO schedule (course_id, day_of_week, start_time, end_time, room, zoom_link)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entry.course_id, entry.day_of_week, entry.start_time, entry.end_time,
         entry.room, entry.zoom_link);
  return info.lastInsertRowid;
}

function deleteScheduleEntry(db, id) {
  db.prepare('DELETE FROM schedule WHERE id = ?').run(id);
}

// ─── Lesson Log ───────────────────────────────────────────────────────────────

function getLessonLog(db, courseId) {
  return db.prepare(`
    SELECT * FROM lesson_log WHERE course_id = ? ORDER BY date DESC
  `).all(courseId);
}

function saveLessonLog(db, entry) {
  if (entry.id) {
    db.prepare(`
      UPDATE lesson_log SET topic_covered=?, topic_next=?, notes=? WHERE id=?
    `).run(entry.topic_covered, entry.topic_next, entry.notes, entry.id);
    return entry.id;
  }
  const info = db.prepare(`
    INSERT INTO lesson_log (course_id, date, topic_covered, topic_next, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(entry.course_id, entry.date, entry.topic_covered, entry.topic_next, entry.notes);
  return info.lastInsertRowid;
}

module.exports = {
  getSetting, setSetting, getSettings,
  updateActiveModel, getActiveModel,
  saveKeyRef,
  getAllCourses, getCourse, saveCourse,
  getStudentsByCourse, saveStudent,
  getMarksByCourse, saveMarks,
  getSchedule, saveScheduleEntry, deleteScheduleEntry,
  getLessonLog, saveLessonLog,
};
