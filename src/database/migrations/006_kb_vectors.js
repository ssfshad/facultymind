'use strict';

/**
 * Migration 006 — Add hybrid-search columns to clo_knowledge_base
 *
 * Adds:
 *   root_verb   TEXT  — the leading action verb extracted from question_text
 *                       (used as the BM25 keyword gate in hybrid search)
 *   vector_blob BLOB  — Float32Array serialised as a raw buffer
 *                       (all-MiniLM-L6-v2 produces 384-dim vectors = 1536 bytes)
 *
 * Both columns are nullable so existing rows are not broken.
 * The embedding worker populates them lazily when a record is first searched.
 *
 * Also back-fills root_verb for any existing rows that have question_text
 * but no root_verb yet (e.g. records imported before this migration).
 */
function runMigration006(db) {
  // Add columns only if they don't already exist (idempotent)
  const cols = db.prepare(`PRAGMA table_info(clo_knowledge_base)`).all().map(c => c.name);

  if (!cols.includes('root_verb')) {
    db.exec(`ALTER TABLE clo_knowledge_base ADD COLUMN root_verb TEXT`);
  }
  if (!cols.includes('vector_blob')) {
    db.exec(`ALTER TABLE clo_knowledge_base ADD COLUMN vector_blob BLOB`);
  }

  // Index on root_verb for fast BM25 keyword gate
  db.exec(`CREATE INDEX IF NOT EXISTS idx_clo_kb_root_verb ON clo_knowledge_base(root_verb)`);

  // Back-fill root_verb for existing rows where it is NULL
  // Extract the first word of question_text (lowercased) as a best-effort root verb
  const rows = db.prepare(
    `SELECT id, question_text FROM clo_knowledge_base WHERE root_verb IS NULL AND question_text IS NOT NULL`
  ).all();

  const update = db.prepare(`UPDATE clo_knowledge_base SET root_verb = ? WHERE id = ?`);
  const backfill = db.transaction(() => {
    for (const row of rows) {
      const firstWord = (row.question_text || '').trim().toLowerCase().split(/\s+/)[0] || '';
      if (firstWord) update.run(firstWord, row.id);
    }
  });
  backfill();

  console.log('[db] Migration 006 (KB vector columns) complete');
}

module.exports = { runMigration006 };
