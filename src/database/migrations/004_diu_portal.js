/**
 * Migration 004 — DIU Teachers Portal
 * Creates diu_marks table and populates from existing marks data.
 */

function runMigration004(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS diu_marks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id   INTEGER NOT NULL REFERENCES students(id),
      course_id    INTEGER NOT NULL REFERENCES courses(id),
      attendance   REAL DEFAULT 0,
      ct1          REAL DEFAULT 0,
      ct2          REAL DEFAULT 0,
      ct3          REAL DEFAULT 0,
      presentation REAL DEFAULT 0,
      assignment   REAL DEFAULT 0,
      midterm      REAL DEFAULT 0,
      final_exam   REAL DEFAULT 0,
      UNIQUE(student_id, course_id)
    );
  `);

  // Migrate existing marks into DIU format if table is empty
  const count = db.prepare('SELECT COUNT(*) as n FROM diu_marks').get().n;
  if (count === 0) {
    const existing = db.prepare(`
      SELECT m.*,
        COALESCE((SELECT COUNT(*) FROM attendance a
                  WHERE a.student_id = m.student_id AND a.course_id = m.course_id AND a.present = 1), 0) AS days_present,
        COALESCE((SELECT COUNT(*) FROM attendance a
                  WHERE a.student_id = m.student_id AND a.course_id = m.course_id), 20) AS total_days
      FROM marks m
    `).all();

    if (existing.length > 0) {
      const ins = db.prepare(`
        INSERT OR IGNORE INTO diu_marks
          (student_id, course_id, attendance, ct1, ct2, ct3, presentation, assignment, midterm, final_exam)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const migrate = db.transaction(() => {
        for (const m of existing) {
          const tot  = m.total_days > 0 ? m.total_days : 20;
          const att  = Math.min(7,  Math.round((m.days_present / tot) * 7  * 10) / 10);
          const ct1  = Math.min(15, Math.round((m.q1  || 0) * 1.5  * 10) / 10);
          const ct2  = Math.min(15, Math.round((m.q2  || 0) * 1.5  * 10) / 10);
          const ct3  = Math.min(15, Math.round((m.lab || 0) * 1.5  * 10) / 10);
          const pres = Math.min(8,  Math.round((m.lab || 0) * 0.8  * 10) / 10);
          const asgn = Math.min(5,  Math.round((m.assignment || 0) * 0.5 * 10) / 10);
          const mid  = Math.min(25, Math.round((m.midterm || 0) * 1.25 * 10) / 10);
          ins.run(m.student_id, m.course_id, att, ct1, ct2, ct3, pres, asgn, mid, Math.min(40, m.final || 0));
        }
      });
      migrate();
    }
  }

  console.log('[db] Migration 004 (DIU Portal) complete');
}

module.exports = { runMigration004 };
