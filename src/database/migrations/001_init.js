/**
 * Migration 001 — Full schema initialisation
 * All tables defined in ARCHITECTURE.md
 */

function runMigrations(db) {
  db.exec(`
    -- ─── Users & Auth ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pin_hash    TEXT NOT NULL,
      name        TEXT,
      email       TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- ─── Courses ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS courses (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code      TEXT NOT NULL,
      name      TEXT NOT NULL,
      section   TEXT,
      semester  TEXT,
      year      INTEGER
    );

    -- ─── Students (anonymised tokens stored, not real data) ───────────
    CREATE TABLE IF NOT EXISTS students (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id           INTEGER NOT NULL REFERENCES courses(id),
      student_id_anon     TEXT NOT NULL,   -- e.g. S001
      name_anon           TEXT NOT NULL,   -- e.g. Student_S001
      enrollment_no_anon  TEXT NOT NULL,   -- e.g. E001
      -- Real data stored encrypted alongside token in vault or separate enc column
      name_enc            TEXT,            -- AES-256 encrypted real name
      student_id_enc      TEXT,            -- AES-256 encrypted real student ID
      enrollment_no_enc   TEXT             -- AES-256 encrypted real enrollment no
    );

    -- ─── Marks ────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS marks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id  INTEGER NOT NULL REFERENCES students(id),
      course_id   INTEGER NOT NULL REFERENCES courses(id),
      q1          REAL DEFAULT 0,    -- max 10
      q2          REAL DEFAULT 0,    -- max 10
      midterm     REAL DEFAULT 0,    -- max 20
      final       REAL DEFAULT 0,    -- max 40
      assignment  REAL DEFAULT 0,    -- max 10
      lab         REAL DEFAULT 0     -- max 10
    );

    -- ─── Attendance ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS attendance (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id  INTEGER NOT NULL REFERENCES students(id),
      course_id   INTEGER NOT NULL REFERENCES courses(id),
      date        TEXT NOT NULL,
      present     INTEGER DEFAULT 1  -- 1=present, 0=absent
    );

    -- ─── OBE: CLOs ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS clos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id   INTEGER NOT NULL REFERENCES courses(id),
      code        TEXT NOT NULL,       -- e.g. CLO1
      description TEXT,
      bloom_level TEXT,                -- C1..C6
      weight      REAL DEFAULT 1.0
    );

    -- ─── OBE: COs ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS cos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id   INTEGER NOT NULL REFERENCES courses(id),
      code        TEXT NOT NULL,       -- e.g. CO1
      description TEXT
    );

    -- ─── OBE: POs ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS pos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL,       -- e.g. PO1
      description TEXT,
      category    TEXT                 -- BAETE category
    );

    -- ─── Mapping Tables ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS co_clo_map (
      co_id   INTEGER NOT NULL REFERENCES cos(id),
      clo_id  INTEGER NOT NULL REFERENCES clos(id),
      weight  REAL DEFAULT 1.0,
      PRIMARY KEY (co_id, clo_id)
    );

    CREATE TABLE IF NOT EXISTS co_po_map (
      co_id   INTEGER NOT NULL REFERENCES cos(id),
      po_id   INTEGER NOT NULL REFERENCES pos(id),
      weight  REAL DEFAULT 1.0,
      PRIMARY KEY (co_id, po_id)
    );

    -- ─── Schedule ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS schedule (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id   INTEGER REFERENCES courses(id),
      day_of_week INTEGER NOT NULL,   -- 0=Sun, 1=Mon, ... 6=Sat
      start_time  TEXT NOT NULL,      -- HH:MM
      end_time    TEXT NOT NULL,      -- HH:MM
      room        TEXT,
      zoom_link   TEXT,
      notified    INTEGER DEFAULT 0   -- 1 if 30-min notification already fired today
    );

    -- ─── Lesson Log ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS lesson_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id     INTEGER REFERENCES courses(id),
      date          TEXT NOT NULL,
      topic_covered TEXT,
      topic_next    TEXT,
      notes         TEXT
    );

    -- ─── Tasks / Reminders ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tasks (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      title            TEXT NOT NULL,
      due_datetime     TEXT,
      reminder_datetime TEXT,
      done             INTEGER DEFAULT 0,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    -- ─── Vault ────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS vault_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      type         TEXT NOT NULL DEFAULT 'note',  -- note|password|link|file
      title        TEXT NOT NULL,
      content_enc  TEXT,         -- AES-256-GCM encrypted note/content
      username_enc TEXT,         -- AES-256-GCM encrypted username
      password_enc TEXT,         -- AES-256-GCM encrypted password
      url          TEXT,         -- plaintext URL (for link type)
      is_favorite  INTEGER DEFAULT 0,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    -- ─── Email Rules ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS email_rules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_json  TEXT NOT NULL,
      active     INTEGER DEFAULT 1,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vip_senders (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      email    TEXT NOT NULL UNIQUE,
      name     TEXT,
      added_at TEXT DEFAULT (datetime('now'))
    );

    -- ─── API Key References ───────────────────────────────────────────
    -- Stores reference ID only — actual keys are in OS keychain
    CREATE TABLE IF NOT EXISTS api_keys (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      service   TEXT NOT NULL UNIQUE,  -- claude|openai|gemini
      key_reference TEXT               -- keytar service identifier
    );

    -- ─── Sessions ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at   TEXT DEFAULT (datetime('now')),
      model_active TEXT DEFAULT 'claude'
    );

    -- ─── App Settings ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Default settings
    INSERT OR IGNORE INTO settings (key, value) VALUES ('model_active', 'claude');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('portable_mode', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('session_timeout_min', '15');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('notify_lead_min', '30');

    -- ─── J.A.R.V.I.S Memory Engine ────────────────────────────────────
    CREATE TABLE IF NOT EXISTS faculty_profile (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS behavioral_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      behavior_key TEXT NOT NULL,
      behavior_value TEXT NOT NULL,
      observed_count INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0.0,
      last_observed DATETIME DEFAULT CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS faculty_rules_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_type TEXT NOT NULL,
      rule_description TEXT NOT NULL,
      rule_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active BOOLEAN DEFAULT 1,
      source TEXT DEFAULT 'explicit'
    );

    CREATE TABLE IF NOT EXISTS memory_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      key TEXT,
      old_value TEXT,
      new_value TEXT,
      source TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS ai_reflections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reflection_date TEXT NOT NULL,
      synthesis_text TEXT NOT NULL,
      action_items TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Default Profile Injection
    INSERT OR IGNORE INTO faculty_profile (key, value) VALUES ('name', 'Professor');
    INSERT OR IGNORE INTO faculty_profile (key, value) VALUES ('university', 'Daffodil International University');
    INSERT OR IGNORE INTO faculty_profile (key, value) VALUES ('notification_lead_time', '30');
    INSERT OR IGNORE INTO faculty_profile (key, value) VALUES ('quiet_hours_start', '21:00');
    INSERT OR IGNORE INTO faculty_profile (key, value) VALUES ('quiet_hours_end', '07:00');
  `);

  console.log('[db] Migrations complete');
}

module.exports = { runMigrations };
