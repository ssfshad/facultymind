/**
 * thought-journal.js — AI's Private Thought Journal
 *
 * The AI writes its own observations here. This is its persistent memory
 * beyond the standard faculty_profile and rules. It can store:
 *   - Patterns it notices: "Faculty always checks email first after opening the app"
 *   - Insights: "ICE401 students are struggling with linked lists based on mark patterns"
 *   - Rule suggestions: "Faculty seems to ignore notifications after 9pm — suggest adding quiet hours rule"
 *   - Open loops: "Faculty started entering marks for ICE301 midterm but didn't finish"
 *
 * The AI reads these thoughts back in every context window.
 */

'use strict';

/**
 * Write a new thought to the journal.
 */
function writeThought(db, category, thought, triggeredBy = '') {
  try {
    db.prepare(`
      INSERT INTO ai_thoughts (category, thought, triggered_by)
      VALUES (?, ?, ?)
    `).run(category, thought, triggeredBy);
  } catch (_) {}
}

/**
 * Get the N most recent thoughts, optionally filtered by category.
 */
function getRecentThoughts(db, limit = 10, category = null) {
  try {
    if (category) {
      return db.prepare(`
        SELECT id, category, thought, triggered_by, confidence, created_at
        FROM ai_thoughts
        WHERE category = ?
        ORDER BY id DESC LIMIT ?
      `).all(category, limit);
    }
    return db.prepare(`
      SELECT id, category, thought, triggered_by, confidence, created_at
      FROM ai_thoughts
      ORDER BY id DESC LIMIT ?
    `).all(limit);
  } catch (_) { return []; }
}

/**
 * Build the thought journal context block for AI prompts.
 * Only surfaces high-confidence or very recent thoughts.
 */
function buildThoughtsContext(db) {
  const thoughts = getRecentThoughts(db, 8);
  if (thoughts.length === 0) return 'AI THOUGHT JOURNAL:\nNo observations yet.';
  let out = `AI THOUGHT JOURNAL (your own observations):\n`;
  thoughts.forEach(t => {
    const date = t.created_at.slice(0, 10);
    out += `[${date}][${t.category}] ${t.thought}\n`;
  });
  return out;
}

/**
 * Reinforce a thought (increase confidence) when pattern is observed again.
 */
function reinforceThought(db, id, boostAmount = 0.1) {
  try {
    db.prepare(`
      UPDATE ai_thoughts
      SET confidence = MIN(1.0, confidence + ?)
      WHERE id = ?
    `).run(boostAmount, id);
  } catch (_) {}
}

/**
 * Prune thoughts older than retainDays OR with confidence below 0.2.
 */
function pruneThoughts(db, retainDays = 30) {
  try {
    db.prepare(`
      DELETE FROM ai_thoughts
      WHERE created_at < datetime('now', ? || ' days')
      OR confidence < 0.2
    `).run(`-${retainDays}`);
  } catch (_) {}
}

module.exports = {
  writeThought,
  getRecentThoughts,
  buildThoughtsContext,
  reinforceThought,
  pruneThoughts,
};
