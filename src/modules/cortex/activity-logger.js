/**
 * activity-logger.js — Cortex Activity Logger
 *
 * Every meaningful action the faculty takes is logged here.
 * The daily trainer reads these logs to teach the AI about usage patterns.
 *
 * Logging rules:
 *   - Never log real names, student IDs, or email content — only event types and counts.
 *   - payload_json stores only structural info: module name, query intent, course code.
 */

'use strict';

/**
 * Log an activity event to the database.
 * @param {Database} db
 * @param {string} eventType  — e.g. 'app_open', 'query_sent', 'module_visit'
 * @param {string} module     — which module: 'chat'|'schedule'|'shadsync'|'email'|'vault'|'blooms'
 * @param {object} payload    — sanitised metadata (no PII)
 */
function log(db, eventType, module = '', payload = {}) {
  try {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO activity_log (event_type, module, payload_json, session_date)
      VALUES (?, ?, ?, ?)
    `).run(eventType, module, JSON.stringify(payload), today);
  } catch (_) {
    // Never crash the app over a logging failure
  }
}

/**
 * Get today's activity summary: event counts by type.
 * Used by context-builder for proactive situational awareness.
 */
function getTodaySummary(db) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rows = db.prepare(`
      SELECT event_type, module, COUNT(*) as count
      FROM activity_log
      WHERE session_date = ?
      GROUP BY event_type, module
      ORDER BY count DESC
    `).all(today);
    return rows;
  } catch (_) { return []; }
}

/**
 * Get the last N activity events (for near-realtime context).
 */
function getRecentEvents(db, limit = 15) {
  try {
    return db.prepare(`
      SELECT event_type, module, payload_json, created_at
      FROM activity_log
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  } catch (_) { return []; }
}

/**
 * Get all events for a specific date (used by daily trainer).
 */
function getEventsForDate(db, dateStr) {
  try {
    return db.prepare(`
      SELECT event_type, module, payload_json, created_at
      FROM activity_log
      WHERE session_date = ?
      ORDER BY created_at ASC
    `).all(dateStr);
  } catch (_) { return []; }
}

/**
 * Count how many times the faculty has visited a module today.
 */
function getModuleVisitCount(db, module) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM activity_log
      WHERE session_date = ? AND module = ? AND event_type = 'module_visit'
    `).get(today, module);
    return row ? row.count : 0;
  } catch (_) { return 0; }
}

/**
 * Prune activity logs older than retainDays to keep the DB lean.
 */
function pruneOldLogs(db, retainDays = 30) {
  try {
    db.prepare(`
      DELETE FROM activity_log
      WHERE session_date < date('now', ? || ' days')
    `).run(`-${retainDays}`);
  } catch (_) {}
}

module.exports = {
  log,
  getTodaySummary,
  getRecentEvents,
  getEventsForDate,
  getModuleVisitCount,
  pruneOldLogs,
};
