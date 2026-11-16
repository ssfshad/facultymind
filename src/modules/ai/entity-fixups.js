'use strict';
/**
 * Deterministic repairs for entities a small local model often drops or mangles.
 * Runs after the model in classifyIntent, never overrides a clean model value.
 *  - REMINDER_SET: fills `datetime` from "tomorrow", "ajke 3tay", "on Friday at 2pm" ...
 *  - VAULT_SAVE:   fills `password` from "password hunter42", "... it is Tiger2026".
 */

const pad = (n) => String(n).padStart(2, '0');
const iso = (d, h, m) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}:00`;

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** "tomorrow", "ajke 3tay", "on Friday at 2pm" -> local ISO date-time, or null when there is no day/time cue. Default time is 09:00. */
function parseWhen(text, now = new Date()) {
  const t = String(text || '').toLowerCase();
  let dayOffset = null;
  let defaultHour = 9;

  if (/\b(tomorrow|kal)\b/.test(t)) dayOffset = 1;
  else if (/\btonight\b/.test(t)) { dayOffset = 0; defaultHour = 20; }
  else if (/\b(today|ajke|aj)\b/.test(t)) dayOffset = 0;
  else {
    const wd = t.match(/\b(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)day\b/);
    if (wd) {
      const target = WEEKDAYS.indexOf(wd[1].slice(0, 3));
      dayOffset = (target - now.getDay() + 7) % 7 || 7;                 // "on Wednesday" said on a Wednesday = next week
    }
  }

  if (/\bafternoon\b/.test(t)) defaultHour = 15;
  else if (/\bevening\b/.test(t)) defaultHour = 18;

  let hour = null, minute = 0;
  const en = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  const bn = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*tay\b/);                // Banglish "3tay" = at 3 o'clock
  if (en) {
    hour = Number(en[1]) % 12 + (en[3] === 'pm' ? 12 : 0);
    minute = Number(en[2] || 0);
  } else if (bn) {
    const h = Number(bn[1]);
    hour = h >= 1 && h <= 6 ? h + 12 : h;                                  // 1-6 -> afternoon, 7-11 -> morning
    minute = Number(bn[2] || 0);
  }
  if (hour !== null && (hour > 23 || minute > 59)) return null;
  if (dayOffset === null && hour === null) return null;

  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dayOffset !== null) {
    day.setDate(day.getDate() + dayOffset);
  } else if (new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute) <= now) {
    day.setDate(day.getDate() + 1);                                        // time only, already passed today -> tomorrow
  }
  return iso(day, hour !== null ? hour : defaultHour, hour !== null ? minute : 0);
}

const NOT_A_PASSWORD = new Set(['in', 'to', 'for', 'the', 'of', 'on', 'a', 'an', 'and', 'is', 'it', 'my', 'as', 'with', 'from', 'at',
  'into', 'here', 'there', 'that', 'this', 'now', 'please', 'also', 'safe', 'safely', 'securely', 'somewhere']);

/** The password value written in the message, or null. */
function parsePassword(text) {
  const m = String(text || '');
  const re = /\bpassword\s*(?:is|=|:)?\s*["']?([^\s"',;]+)/gi;
  let hit;
  while ((hit = re.exec(m))) {
    if (!NOT_A_PASSWORD.has(hit[1].toLowerCase())) return hit[1];
  }
  const tail = m.match(/\b(?:it is|it's)\s+["']?([^\s"',;]+)["']?\s*[.!]?\s*$/i);
  return tail && /password/i.test(m) ? tail[1] : null;
}

function fixEntities(intent, text, entities, now = new Date()) {
  const e = { ...(entities || {}) };
  if (intent === 'REMINDER_SET' && !e.datetime) {
    const when = parseWhen(text, now);
    if (when) e.datetime = when;
  }
  if (intent === 'VAULT_SAVE') {
    const clean = typeof e.password === 'string' && e.password && !/\s/.test(e.password);
    if (!clean) {
      const pw = parsePassword(text);
      if (pw) e.password = pw;
    }
  }
  return e;
}

module.exports = { fixEntities, parseWhen, parsePassword };
