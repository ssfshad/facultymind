'use strict';

function runMigration005(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clo_knowledge_base (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      course_code   TEXT NOT NULL,
      question_text TEXT NOT NULL,
      clo_code      TEXT NOT NULL,
      bloom_level   TEXT NOT NULL,
      bloom_name    TEXT NOT NULL,
      action_verbs  TEXT DEFAULT '[]',
      source        TEXT DEFAULT 'manual',
      verified      INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_clo_kb_course   ON clo_knowledge_base(course_code);
    CREATE INDEX IF NOT EXISTS idx_clo_kb_bloom    ON clo_knowledge_base(bloom_level);
    CREATE INDEX IF NOT EXISTS idx_clo_kb_verified ON clo_knowledge_base(verified);
  `);
  console.log('[db] Migration 005 (CLO Knowledge Base) complete');
}

module.exports = { runMigration005 };
