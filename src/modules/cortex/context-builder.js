/**
 * context-builder.js — Cortex Full Situational Context Assembler
 *
 * This is the brain's sensory input. It reads from every data source
 * available and compiles a rich, structured context block that the AI
 * receives with every proactive message or ambient trigger.
 *
 * The AI is told:
 *   - What time it is, what day it is
 *   - What classes are happening today and when
 *   - Whether a class just started or just ended
 *   - How many unread emails are sitting there (and if any are HIGH priority)
 *   - What the faculty has been doing in the app today
 *   - All active rules and preferences
 *   - AI's own recent thoughts and observations
 *   - Behavioral patterns detected over time
 *   - Faculty profile (name, university, notification prefs)
 */

'use strict';

const { buildRulesContext } = require('./rules-engine');
const { buildThoughtsContext } = require('./thought-journal');
const { getTodaySummary, getRecentEvents } = require('./activity-logger');

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/**
 * Determine what is happening with classes right now.
 * Returns { upcoming, ongoing, justEnded } — each is null or a schedule row.
 */
function getClassStatus(db) {
  const now = new Date();
  const todayDow = now.getDay(); // 0=Sun ... 6=Sat
  const hhmm = now.toTimeString().slice(0, 5);

  let classes = [];
  try {
    classes = db.prepare(`
      SELECT s.*, c.code as course_code, c.name as course_name
      FROM schedule s
      LEFT JOIN courses c ON c.id = s.course_id
      WHERE s.day_of_week = ?
      ORDER BY s.start_time ASC
    `).all(todayDow);
  } catch (_) {}

  let upcoming = null;   // next class starting within 60 min
  let ongoing  = null;   // class happening right now
  let justEnded = null;  // class that ended within last 15 min

  for (const cls of classes) {
    const start = cls.start_time; // "HH:MM"
    const end   = cls.end_time;   // "HH:MM"

    if (hhmm >= start && hhmm < end) {
      ongoing = cls;
    } else if (hhmm >= end) {
      // ended — check if within last 15 min
      const [eh, em] = end.split(':').map(Number);
      const endMs = eh * 60 + em;
      const nowMs = now.getHours() * 60 + now.getMinutes();
      if (nowMs - endMs <= 15) justEnded = cls;
    } else if (hhmm < start) {
      // future — check if within 60 min
      const [sh, sm] = start.split(':').map(Number);
      const startMs = sh * 60 + sm;
      const nowMs = now.getHours() * 60 + now.getMinutes();
      if (startMs - nowMs <= 60 && !upcoming) upcoming = cls;
    }
  }

  return { upcoming, ongoing, justEnded, todayClasses: classes };
}

/**
 * Build the schedule section of the context block.
 */
function buildScheduleContext(db) {
  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()];
  const timeStr = now.toTimeString().slice(0, 5);
  const { upcoming, ongoing, justEnded, todayClasses } = getClassStatus(db);

  let out = `SCHEDULE AWARENESS:\n`;
  out += `Today: ${dayName} ${now.toDateString()}, Current time: ${timeStr}\n`;

  if (todayClasses.length === 0) {
    out += `No classes scheduled today.\n`;
  } else {
    out += `Today's classes:\n`;
    todayClasses.forEach(cls => {
      const status = (() => {
        const h = now.toTimeString().slice(0, 5);
        if (h >= cls.start_time && h < cls.end_time) return ' ← ONGOING NOW';
        if (h >= cls.end_time) return ' (done)';
        return '';
      })();
      out += `  • ${cls.course_code} | ${cls.start_time}–${cls.end_time} | ${cls.room || 'Room TBD'}${status}\n`;
    });
  }

  if (ongoing)   out += `⚡ IMPORTANT: A class (${ongoing.course_code}) is happening RIGHT NOW until ${ongoing.end_time}.\n`;
  if (justEnded) out += `✅ ${justEnded.course_code} just ended ${justEnded.end_time}. Faculty may want lesson log update.\n`;
  if (upcoming)  out += `⏰ Upcoming: ${upcoming.course_code} starts at ${upcoming.start_time} (${upcoming.room || ''}).\n`;

  return out;
}

/**
 * Build the activity summary section.
 */
function buildActivityContext(db) {
  const summary = getTodaySummary(db);
  const recent  = getRecentEvents(db, 8);

  if (summary.length === 0) return 'TODAY\'S ACTIVITY:\nNo activity logged yet today.';

  let out = `TODAY'S ACTIVITY:\n`;
  summary.forEach(s => {
    out += `  ${s.count}× ${s.event_type}${s.module ? ` [${s.module}]` : ''}\n`;
  });

  if (recent.length > 0) {
    out += `Last actions:\n`;
    recent.slice(0, 5).forEach(e => {
      const time = e.created_at.slice(11, 16);
      let payload = {};
      try { payload = JSON.parse(e.payload_json); } catch (_) {}
      const detail = payload.course || payload.intent || payload.module || '';
      out += `  [${time}] ${e.event_type}${detail ? ` — ${detail}` : ''}\n`;
    });
  }

  return out;
}

/**
 * Build the memory/profile section from memory-manager.
 */
function buildMemoryContext(db) {
  try {
    const profileRows = db.prepare(`SELECT key, value FROM faculty_profile`).all();
    let out = 'FACULTY PROFILE:\n';
    profileRows.forEach(r => { out += `  ${r.key}: ${r.value}\n`; });

    const behaviorRows = db.prepare(`
      SELECT behavior_value, confidence FROM behavioral_memory
      WHERE active = 1 ORDER BY confidence DESC LIMIT 8
    `).all();
    if (behaviorRows.length > 0) {
      out += 'OBSERVED PATTERNS:\n';
      behaviorRows.forEach(b => {
        out += `  • ${b.behavior_value} (${(b.confidence * 100).toFixed(0)}% confidence)\n`;
      });
    }

    const reflection = db.prepare(`
      SELECT synthesis_text FROM ai_reflections ORDER BY created_at DESC LIMIT 1
    `).get();
    if (reflection) {
      out += `LAST DAILY REFLECTION:\n"${reflection.synthesis_text}"\n`;
    }

    return out;
  } catch (_) { return 'FACULTY PROFILE:\nNot available.\n'; }
}

/**
 * Master function: assemble the complete situational context block.
 * This is injected into every proactive AI call as the system prompt environment.
 *
 * @param {Database} db
 * @param {object}  extras  — optional extra snippets (e.g. { emailSummary: '...' })
 * @returns {string} — the full context block
 */
function buildFullContext(db, extras = {}) {
  const sections = [
    '=== FACULTYMIND LIVE CONTEXT ===',
    buildScheduleContext(db),
    buildActivityContext(db),
    buildMemoryContext(db),
    buildRulesContext(db),
    buildThoughtsContext(db),
  ];

  if (extras.emailSummary) {
    sections.push(`EMAIL STATUS:\n${extras.emailSummary}`);
  }

  sections.push('=== END CONTEXT ===');
  return sections.join('\n\n');
}

/**
 * Expose the class-status helper so proactive engine can decide trigger type.
 */
function getClassStatusPublic(db) {
  return getClassStatus(db);
}

module.exports = {
  buildFullContext,
  getClassStatusPublic,
  buildScheduleContext,
};
