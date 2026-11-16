/**
 * Migration 002 — Cortex Intelligence Layer
 * Activity log, AI thought journal, cortex state tracker.
 * All tables use CREATE TABLE IF NOT EXISTS — safe to re-run.
 */

function runMigration002(db) {
  db.exec(`
    -- ─── Activity Log ─────────────────────────────────────────────────────────
    -- Every meaningful user action is logged here for daily AI training.
    -- payload_json stores contextual details (course code, query text, etc.)
    CREATE TABLE IF NOT EXISTS activity_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type   TEXT NOT NULL,       -- app_open|module_visit|query_sent|marks_entered|email_viewed|...
      module       TEXT,                -- chat|schedule|shadsync|blooms|email|vault|settings
      payload_json TEXT DEFAULT '{}',   -- event-specific data (no PII, anonymised)
      session_date TEXT NOT NULL,       -- YYYY-MM-DD — for daily rollup queries
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ─── AI Thought Journal ────────────────────────────────────────────────────
    -- The AI writes its own observations here. These feed back into context.
    -- This is how it "learns itself" — a persistent scratchpad the AI owns.
    CREATE TABLE IF NOT EXISTS ai_thoughts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      category     TEXT NOT NULL,       -- pattern|insight|rule_suggestion|reminder|observation
      thought      TEXT NOT NULL,       -- the AI's written observation (max ~200 tokens)
      triggered_by TEXT,                -- what event caused this thought
      confidence   REAL DEFAULT 0.7,   -- 0.0–1.0, decays over time if not reinforced
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ─── Cortex State ─────────────────────────────────────────────────────────
    -- Key-value store for Cortex runtime state: last_trained_date, proactive counts, etc.
    CREATE TABLE IF NOT EXISTS cortex_state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Default cortex state
    INSERT OR IGNORE INTO cortex_state (key, value) VALUES ('last_trained_date', '');
    INSERT OR IGNORE INTO cortex_state (key, value) VALUES ('proactive_count_today', '0');
    INSERT OR IGNORE INTO cortex_state (key, value) VALUES ('proactive_last_at', '');
    INSERT OR IGNORE INTO cortex_state (key, value) VALUES ('session_open_time', '');
    INSERT OR IGNORE INTO cortex_state (key, value) VALUES ('training_enabled', '1');
    INSERT OR IGNORE INTO cortex_state (key, value) VALUES ('proactive_enabled', '1');
    INSERT OR IGNORE INTO cortex_state (key, value) VALUES ('proactive_interval_min', '120');
  `);

  console.log('[db] Migration 002 (Cortex) complete');
}

module.exports = { runMigration002 };
