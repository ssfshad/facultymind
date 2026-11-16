'use strict';

/**
 * clo-knowledge.js — CRUD + Hybrid Search for the CLO Knowledge Base
 *
 * Layer architecture (called in order by searchSimilar / queryHybridKnowledgeBase):
 *
 *   Layer 1 — BM25 keyword gate
 *     Filter the KB to rows whose root_verb matches the leading action token
 *     of the query. This is a fast SQLite index scan — O(log n).
 *
 *   Layer 2 — Dense vector cosine similarity
 *     For the candidate rows from Layer 1, compute cosine similarity between
 *     the query embedding and each stored vector_blob. Return the best match
 *     above the 88% threshold.
 *
 *   Fallback — Fuse.js text search
 *     When the embedding model is unavailable (first launch before model
 *     downloads, or offline with no cache), fall back to the original Fuse.js
 *     fuzzy text search so the system always returns something.
 *
 * RULES:
 * - Do NOT auto-verify records — professor must explicitly call verify()
 * - searchSimilar() is the public API — callers don't need to know which
 *   layer resolved the match
 * - Knowledge base is optional — CLO Mapper works with 0 records
 */

const Fuse = require('fuse.js');
const { BLOOMS_VERBS, BLOOMS_NAMES } = require('../../prompts/templates/blooms-verbs');

// Embedding engine — lazy-loaded so the module is usable without the model
let _embEngine = null;
function _getEmbEngine() {
  if (!_embEngine) {
    try { _embEngine = require('./embedding-engine'); } catch (_) {}
  }
  return _embEngine;
}

// ── Cosine similarity (inline — no dependency on embedding-engine) ────────────
function _cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

// ── Extract root verb from question text ──────────────────────────────────────
// Mirrors the logic in clo-mapper-fast.js so root_verb is consistent.
function extractRootVerb(text) {
  return (text || '').trim().toLowerCase().split(/\s+/)[0] || '';
}

// ── Poison-prevention: check if a proposed level contradicts the standard ─────
/**
 * Returns a warning string if the proposed bloom_level contradicts the
 * authoritative verb dictionary for the root verb, or null if it's fine.
 *
 * @param {string} rootVerb   e.g. "list"
 * @param {string} bloomLevel e.g. "C5"
 * @returns {string|null}
 */
function checkLevelConflict(rootVerb, bloomLevel) {
  if (!rootVerb || !bloomLevel) return null;
  const v = rootVerb.toLowerCase();

  // Find which levels the verb appears in
  const standardLevels = [];
  for (const [level, verbs] of Object.entries(BLOOMS_VERBS)) {
    if (verbs.includes(v)) standardLevels.push(level);
  }

  if (standardLevels.length === 0) return null; // unknown verb — no conflict
  if (standardLevels.includes(bloomLevel)) return null; // matches standard

  const levelNames = standardLevels.map(l => `${l} ${BLOOMS_NAMES[l]}`).join(' / ');
  return `⚠️ OBE Standard Mismatch: The verb "${rootVerb}" is natively mapped to ${levelNames} in the authoritative Bloom's Taxonomy dictionary. Mapping this to ${bloomLevel} ${BLOOMS_NAMES[bloomLevel] || ''} will create a custom workspace override. Confirm only if this reflects your institution's specific CLO convention.`;
}

// ── Insert ────────────────────────────────────────────────────────────────────

/**
 * Insert a single CLO knowledge record.
 * Automatically extracts root_verb from question_text.
 * vector_blob is populated lazily by saveEmbedding() after insert.
 *
 * @param {object} db
 * @param {object} record - { course_code, question_text, clo_code, bloom_level,
 *                            bloom_name, action_verbs?, source? }
 * @returns {number} inserted row id
 */
function addRecord(db, record) {
  const rootVerb = extractRootVerb(record.question_text);
  const stmt = db.prepare(`
    INSERT INTO clo_knowledge_base
      (course_code, question_text, clo_code, bloom_level, bloom_name,
       action_verbs, source, verified, root_verb)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const info = stmt.run(
    record.course_code || 'UNKNOWN',
    record.question_text,
    record.clo_code || '',
    record.bloom_level || '',
    record.bloom_name || '',
    Array.isArray(record.action_verbs)
      ? JSON.stringify(record.action_verbs)
      : (record.action_verbs || '[]'),
    record.source || 'manual',
    rootVerb,
  );
  return info.lastInsertRowid;
}

/**
 * Insert multiple records in a single transaction.
 * @param {object} db
 * @param {object[]} records
 * @returns {number[]} array of inserted row ids
 */
function addBatch(db, records) {
  const ids = [];
  const insert = db.transaction((recs) => {
    for (const r of recs) ids.push(addRecord(db, r));
  });
  insert(records);
  return ids;
}

// ── Embedding save ────────────────────────────────────────────────────────────

/**
 * Compute and persist the embedding vector for a KB record.
 * Called asynchronously after addRecord() — never blocks the insert.
 *
 * @param {object} db
 * @param {number} id          - row id returned by addRecord()
 * @param {string} questionText
 */
async function saveEmbedding(db, id, questionText) {
  const eng = _getEmbEngine();
  if (!eng) return;

  try {
    // ── Token cache: skip if this exact string already has a vector ──────
    // Exact string match → load the stored vector instead of recomputing.
    // This makes repeated exam forms (same questions next semester) instant.
    const existing = db.prepare(
      `SELECT vector_blob FROM clo_knowledge_base WHERE question_text = ? AND vector_blob IS NOT NULL LIMIT 1`
    ).get(questionText);

    if (existing && existing.vector_blob) {
      // Copy the cached vector to this record — 0ms computation
      db.prepare(`UPDATE clo_knowledge_base SET vector_blob = ? WHERE id = ?`)
        .run(existing.vector_blob, id);
      return;
    }

    // No cache hit — compute fresh embedding
    const vec = await eng.embed(questionText);
    if (!vec) return;
    const blob = eng.vecToBuffer(vec);
    db.prepare(`UPDATE clo_knowledge_base SET vector_blob = ? WHERE id = ?`).run(blob, id);
  } catch (e) {
    console.warn('[clo-knowledge] saveEmbedding failed for id', id, ':', e.message);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

function getAll(db, courseCode) {
  if (courseCode) {
    return db.prepare(
      'SELECT * FROM clo_knowledge_base WHERE course_code = ? ORDER BY created_at DESC'
    ).all(courseCode);
  }
  return db.prepare('SELECT * FROM clo_knowledge_base ORDER BY created_at DESC').all();
}

function getStats(db) {
  const total    = db.prepare('SELECT COUNT(*) AS n FROM clo_knowledge_base').get().n;
  const verified = db.prepare('SELECT COUNT(*) AS n FROM clo_knowledge_base WHERE verified = 1').get().n;

  const courseRows = db.prepare(
    'SELECT course_code, COUNT(*) AS n FROM clo_knowledge_base GROUP BY course_code'
  ).all();
  const byCourse = {};
  courseRows.forEach(r => { byCourse[r.course_code] = r.n; });

  const levelRows = db.prepare(
    'SELECT bloom_level, COUNT(*) AS n FROM clo_knowledge_base GROUP BY bloom_level'
  ).all();
  const byLevel = {};
  levelRows.forEach(r => { byLevel[r.bloom_level] = r.n; });

  return { total, verified, byCourse, byLevel };
}

// ── Verify / Unverify ─────────────────────────────────────────────────────────

function verify(db, id) {
  db.prepare('UPDATE clo_knowledge_base SET verified = 1 WHERE id = ?').run(id);
}

function unverify(db, id) {
  db.prepare('UPDATE clo_knowledge_base SET verified = 0 WHERE id = ?').run(id);
}

// ── Delete ────────────────────────────────────────────────────────────────────

function deleteRecord(db, id) {
  db.prepare('DELETE FROM clo_knowledge_base WHERE id = ?').run(id);
}

// ── Hybrid Search ─────────────────────────────────────────────────────────────

/**
 * Core hybrid search — BM25 keyword gate + dense vector cosine similarity.
 *
 * @param {object}     db
 * @param {string}     cleanedQuestion  — lowercase, stripped question text
 * @param {Float32Array|null} queryVec  — embedding of cleanedQuestion (or null)
 * @param {number}     [threshold=0.88] — cosine similarity cutoff
 * @returns {{ bloom_level, root_verb, score, source } | null}
 */
function _hybridSearch(db, cleanedQuestion, queryVec, threshold = 0.88) {
  const primaryWord = extractRootVerb(cleanedQuestion);
  if (!primaryWord) return null;

  // ── Layer 1: BM25 keyword gate ────────────────────────────────────────
  // Pull only rows whose root_verb matches the leading action token.
  // Prefer verified rows; fall back to all rows if fewer than 3 verified.
  let candidates = db.prepare(
    `SELECT id, question_text, root_verb, bloom_level, vector_blob
     FROM clo_knowledge_base
     WHERE root_verb = ? AND verified = 1`
  ).all(primaryWord);

  if (candidates.length < 3) {
    candidates = db.prepare(
      `SELECT id, question_text, root_verb, bloom_level, vector_blob
       FROM clo_knowledge_base
       WHERE root_verb = ?`
    ).all(primaryWord);
  }

  if (candidates.length === 0) return null;

  // ── Layer 2: Dense vector cosine similarity ───────────────────────────
  if (queryVec) {
    const eng = _getEmbEngine();
    let bestScore = threshold;
    let bestRow   = null;

    for (const row of candidates) {
      if (!row.vector_blob) continue; // embedding not yet computed — skip
      const storedVec = eng
        ? eng.bufferToVec(row.vector_blob)
        : new Float32Array(row.vector_blob.buffer, row.vector_blob.byteOffset, row.vector_blob.byteLength / 4);
      const score = _cosine(queryVec, storedVec);
      if (score > bestScore) {
        bestScore = score;
        bestRow   = row;
      }
    }

    if (bestRow) {
      return {
        bloom_level: bestRow.bloom_level,
        root_verb:   primaryWord,
        score:       bestScore,
        source:      'vector',
      };
    }
  }

  // ── Layer 2 fallback: if no vectors available, use the first keyword match ──
  // This handles the period before embeddings are computed (e.g. seed data
  // inserted but embedding worker hasn't run yet).
  if (candidates.length > 0) {
    return {
      bloom_level: candidates[0].bloom_level,
      root_verb:   primaryWord,
      score:       0.75, // medium confidence — keyword match only
      source:      'keyword',
    };
  }

  return null;
}

/**
 * Public hybrid search entry point.
 * Computes the query embedding, runs the hybrid search, returns a result
 * object compatible with the existing searchSimilar() callers.
 *
 * @param {object} db
 * @param {string} queryText
 * @param {number} [limit=5]   — kept for API compatibility; hybrid returns top-1
 * @returns {Promise<object[]>} array of matching KB rows (empty if no match)
 */
async function searchSimilarHybrid(db, queryText, limit = 5) {
  if (!queryText || queryText.trim().length === 0) return [];

  const cleaned = queryText.trim().toLowerCase();
  const eng     = _getEmbEngine();

  // Compute query embedding (null if model not ready)
  let queryVec = null;
  if (eng && eng.isReady()) {
    queryVec = await eng.embed(cleaned);
  }

  const hit = _hybridSearch(db, cleaned, queryVec);
  if (!hit) return [];

  // Return in the same shape as the old searchSimilar() so callers don't break
  return [{
    bloom_level:   hit.bloom_level,
    bloom_name:    BLOOMS_NAMES[hit.bloom_level] || '',
    clo_code:      '',
    question_text: cleaned,
    root_verb:     hit.root_verb,
    verified:      1,
    _score:        hit.score,
    _source:       hit.source,
  }];
}

/**
 * Synchronous fallback search using Fuse.js.
 * Used by clo-mapper-fast.js which cannot await (it's synchronous).
 * When the embedding model is ready, prefer searchSimilarHybrid() instead.
 *
 * @param {object} db
 * @param {string} queryText
 * @param {number} [limit=5]
 * @returns {object[]}
 */
function searchSimilar(db, queryText, limit = 5) {
  if (!queryText || queryText.trim().length === 0) return [];

  // Try keyword-only hybrid first (synchronous, no embedding needed)
  const cleaned     = queryText.trim().toLowerCase();
  const primaryWord = extractRootVerb(cleaned);

  if (primaryWord) {
    let candidates = db.prepare(
      `SELECT * FROM clo_knowledge_base WHERE root_verb = ? AND verified = 1`
    ).all(primaryWord);
    if (candidates.length < 3) {
      candidates = db.prepare(
        `SELECT * FROM clo_knowledge_base WHERE root_verb = ?`
      ).all(primaryWord);
    }
    if (candidates.length > 0) {
      return candidates.slice(0, limit);
    }
  }

  // Fuse.js fallback for when root_verb column is empty or no keyword match
  const verified = db.prepare(
    'SELECT * FROM clo_knowledge_base WHERE verified = 1'
  ).all();
  let corpus = verified;
  if (verified.length < 3) {
    corpus = db.prepare('SELECT * FROM clo_knowledge_base').all();
  }
  if (corpus.length === 0) return [];

  const fuse = new Fuse(corpus, {
    keys: ['question_text', 'clo_code'],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 3,
  });
  return fuse.search(queryText.substring(0, 500)).slice(0, limit).map(r => r.item);
}

module.exports = {
  // CRUD
  addRecord,
  addBatch,
  getAll,
  getStats,
  verify,
  unverify,
  deleteRecord,
  // Embedding
  saveEmbedding,
  // Search
  searchSimilar,          // synchronous — used by clo-mapper-fast.js
  searchSimilarHybrid,    // async — used by blooms-engine.js
  // Utilities
  extractRootVerb,
  checkLevelConflict,
};
