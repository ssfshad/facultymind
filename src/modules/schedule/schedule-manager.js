/**
 * schedule-manager.js — Smart Schedule Manager
 * Timetable CRUD, upcoming class detection, lesson log, OS notification support
 */

const queries = require('../../database/queries');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Schedule CRUD ────────────────────────────────────────────────────────────

function getFullSchedule(db) {
  return queries.getSchedule(db);
}

function saveEntry(db, entry) {
  return queries.saveScheduleEntry(db, entry);
}

function deleteEntry(db, id) {
  queries.deleteScheduleEntry(db, id);
}

// ─── Upcoming Class Detection ─────────────────────────────────────────────────

/**
 * Returns all classes starting within `leadMinutes` from now that
 * haven't been notified yet today.
 *
 * @param {object} db
 * @param {number} leadMinutes - how many minutes ahead to check (default 30)
 */
function getUpcomingClasses(db, leadMinutes = 30) {
  const now     = new Date();
  const dayIdx  = now.getDay(); // 0=Sun ... 6=Sat
  const todayKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

  const schedule = queries.getSchedule(db);
  const upcoming = [];

  for (const cls of schedule) {
    if (cls.day_of_week !== dayIdx) continue;

    // Parse start_time "HH:MM"
    const [h, m]     = cls.start_time.split(':').map(Number);
    const classStart = new Date(now);
    classStart.setHours(h, m, 0, 0);

    const diffMs  = classStart - now;
    const diffMin = diffMs / 60_000;

    // Within the lead window and hasn't fired today
    if (diffMin > 0 && diffMin <= leadMinutes) {
      // Check if notified today
      const notifiedToday = db.prepare(`
        SELECT value FROM settings WHERE key = ?
      `).get(`notified_${cls.id}_${todayKey}`);

      if (!notifiedToday) {
        upcoming.push({ ...cls, notified: false });
      }
    }
  }

  return upcoming;
}

/**
 * Mark a class notification as fired for today so we don't re-notify.
 */
function markNotified(db, classId) {
  const todayKey = new Date().toISOString().split('T')[0];
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    `notified_${classId}_${todayKey}`, '1'
  );
}

// ─── Lesson Log ───────────────────────────────────────────────────────────────

function getLessonLog(db, courseId) {
  return queries.getLessonLog(db, courseId);
}

function saveLessonLog(db, entry) {
  return queries.saveLessonLog(db, entry);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dayName(idx) {
  return DAYS[idx] || 'Unknown';
}

module.exports = {
  getFullSchedule,
  saveEntry,
  deleteEntry,
  getUpcomingClasses,
  markNotified,
  getLessonLog,
  saveLessonLog,
  dayName,
  DAYS,
};
