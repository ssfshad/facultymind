'use strict';

/**
 * Migration 007 — flexible assessment marks
 *
 * The original `marks` table has six fixed columns (q1, q2, midterm, final, assignment, lab).
 * Real marks sheets (e.g. DIU CIA sheets) have an arbitrary set of columns — Attendance, Quiz,
 * Presentation, Assignment, Mid Term question 1..7 — each with its own maximum and CO/PO mapping.
 *
 *   assessment_columns : one row per sheet column of a course (key, label, max marks, CO/PO codes)
 *   assessment_marks   : one row per (student, column); value NULL = blank cell (not graded)
 *
 * Purely additive: the legacy `marks` table is untouched and still drives courses that have no
 * assessment_columns (the seeded ICE301 demo).
 */
function runMigration007(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assessment_columns (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id  INTEGER NOT NULL REFERENCES courses(id),
      col_key    TEXT    NOT NULL,           -- e.g. quiz_1, mt_3
      indicator  TEXT    NOT NULL,           -- e.g. Quiz, MT
      ordinal    INTEGER NOT NULL DEFAULT 1, -- 1.. within the indicator
      max_marks  REAL    NOT NULL,
      co_codes   TEXT    NOT NULL DEFAULT '[]',  -- JSON array, e.g. ["CO1","CO2"]
      po_codes   TEXT    NOT NULL DEFAULT '[]',
      bloom_levels TEXT  NOT NULL DEFAULT '[]',  -- JSON array, e.g. ["C3"] (optional row in the sheet)
      position   INTEGER NOT NULL DEFAULT 0, -- column order in the sheet
      UNIQUE (course_id, col_key)
    );

    CREATE TABLE IF NOT EXISTS assessment_marks (
      student_id INTEGER NOT NULL REFERENCES students(id),
      column_id  INTEGER NOT NULL REFERENCES assessment_columns(id),
      value      REAL,                       -- NULL = blank in the sheet
      PRIMARY KEY (student_id, column_id)
    );

    CREATE INDEX IF NOT EXISTS idx_assessment_columns_course ON assessment_columns(course_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_marks_column   ON assessment_marks(column_id);
  `);
  console.log('[db] Migration 007 (assessment columns) applied');
}

module.exports = { runMigration007 };
