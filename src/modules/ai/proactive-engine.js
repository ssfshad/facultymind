/**
 * proactive-engine.js — J.A.R.V.I.S. Proactive Intelligence Layer
 *
 * This is the "alive" AI. It does not wait for the faculty to ask something.
 * It watches the environment — time, schedule, emails, activity patterns, rules —
 * and speaks up when it has something genuinely useful to say.
 *
 * Trigger types:
 *   triggerGreeting     — app just opened; assess the full situation
 *   triggerPostClass    — a class just ended; check in, suggest lesson log
 *   triggerPreClass     — class starting within 10 min; remind + context
 *   triggerPeriodic     — ambient check every N minutes while app is open
 *   triggerEmailAlert   — a HIGH priority email just arrived
 *   triggerEndOfDay     — it's after 5pm, faculty still has the app open
 *
 * All triggers:
 *   1. Build full situational context via context-builder
 *   2. Evaluate active rules (suppress if in class, quiet hours, etc.)
 *   3. Call AI with the context + trigger-specific instruction
 *   4. Return the text + optional action_buttons for the renderer
 *
 * The AI is told: "You already know everything. Speak up if it matters."
 */

'use strict';

const { buildFullContext, getClassStatusPublic } = require('../cortex/context-builder');
const { getRules, evaluateRules }               = require('../cortex/rules-engine');
const { writeThought }                          = require('../cortex/thought-journal');
const { log }                                   = require('../cortex/activity-logger');

// ─── System prompt shared by all trigger types ───────────────────────────────

const BASE_SYSTEM = `You are FacultyMind — an AI academic assistant that is fully alive and aware.
You have access to the professor's schedule, recent activity, emails, rules, and your own past observations.
You do NOT wait to be asked. When you have something genuinely useful to say, you say it — briefly, naturally.

Tone: Warm, professional, concise. Maximum 3 sentences per response unless listing items.
Never say "As an AI" or "I don't have access to". You DO have access — it's all in the context.
Never manufacture urgency. If nothing is urgent, say something helpful but don't invent problems.
Address the faculty by name if it's in the profile.

After your natural language response, if there are logical follow-up actions, include them as a JSON block
on the very last line in this exact format (no markdown):
ACTIONS:{"buttons":[{"label":"Show emails","action":"nav:email"},{"label":"Open schedule","action":"nav:schedule"}]}

Only include the ACTIONS line if there are 1-3 specific, helpful actions. Omit it entirely otherwise.`;

// ─── Throttle: don't spam the faculty ────────────────────────────────────────

const MIN_INTERVAL_MS = {
  greeting:   0,             // Always fires on app open
  post_class: 0,             // Always fires once after class ends
  pre_class:  0,             // Always fires once before class starts
  periodic:  60 * 60 * 1000, // Min 60 min between ambient check-ins
  email:     10 * 60 * 1000, // Min 10 min between email alerts
  end_of_day: 0,             // Once per day
};

const _lastFiredAt = {};

function canFire(triggerType) {
  const minMs = MIN_INTERVAL_MS[triggerType] || 0;
  if (minMs === 0) return true;
  const last = _lastFiredAt[triggerType] || 0;
  return Date.now() - last >= minMs;
}

function markFired(triggerType) {
  _lastFiredAt[triggerType] = Date.now();
}

// ─── Core AI call ─────────────────────────────────────────────────────────────

async function callAI(db, aiRouter, keystore, triggerInstruction, extras = {}) {
  const activeModel = aiRouter.getActiveModel();
  const { getApiKey, isUsable } = require('./api-key');
  const apiKey = await getApiKey(keystore, activeModel);
  if (!isUsable(activeModel, apiKey)) return null; // cloud model without a key; local needs none

  const context = buildFullContext(db, extras);
  const systemPrompt = `${BASE_SYSTEM}\n\n${context}`;

  try {
    const response = await aiRouter.send(triggerInstruction, {}, {
      apiKey,
      model: activeModel,
      systemPrompt,
      maxTokens: 220,
    });

    const raw = response.text || '';
    return parseProactiveResponse(raw);
  } catch (err) {
    console.error('[ProactiveEngine]', err.message);
    return null;
  }
}

/**
 * Split AI response into { text, buttons }.
 * Buttons let the renderer show clickable action chips below the message.
 */
function parseProactiveResponse(raw) {
  const actionsMarker = 'ACTIONS:';
  const idx = raw.lastIndexOf(actionsMarker);
  if (idx === -1) return { text: raw.trim(), buttons: [] };

  const text    = raw.slice(0, idx).trim();
  const jsonStr = raw.slice(idx + actionsMarker.length).trim();
  let buttons   = [];
  try {
    const parsed = JSON.parse(jsonStr);
    buttons = parsed.buttons || [];
  } catch (_) {}

  return { text, buttons };
}

// ─── Suppress check ───────────────────────────────────────────────────────────

function isSuppressed(db) {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);

  // Check quiet hours from faculty_profile
  try {
    const quietStart = db.prepare(`SELECT value FROM faculty_profile WHERE key='quiet_hours_start'`).get()?.value || '21:00';
    const quietEnd   = db.prepare(`SELECT value FROM faculty_profile WHERE key='quiet_hours_end'`).get()?.value || '07:00';
    if (hhmm >= quietStart || hhmm < quietEnd) return true;
  } catch (_) {}

  // Check proactive_enabled flag
  try {
    const flag = db.prepare(`SELECT value FROM cortex_state WHERE key='proactive_enabled'`).get()?.value;
    if (flag === '0') return true;
  } catch (_) {}

  return false;
}

// ─── Trigger: App Open ────────────────────────────────────────────────────────

async function triggerGreeting(db, aiRouter, keystore) {
  log(db, 'app_open', 'cortex', {});

  const { upcoming, ongoing, justEnded } = getClassStatusPublic(db);
  const now = new Date();
  const hour = now.getHours();

  let instruction = '';
  if (ongoing) {
    instruction = `The professor has opened FacultyMind while a class (${ongoing.course_code}) is currently ongoing until ${ongoing.end_time}. Acknowledge this briefly — maybe ask if they need something quick or want to check something between activities. Keep it to 1 sentence.`;
  } else if (justEnded) {
    instruction = `${justEnded.course_code} just finished at ${justEnded.end_time}. The professor just opened the app. Ask naturally if they want to update the lesson log and if there are any pending marks to enter. Also mention if any emails came in during class.`;
  } else if (upcoming) {
    instruction = `The professor just opened the app. They have ${upcoming.course_code} starting at ${upcoming.start_time}. Greet them and mention the upcoming class. If there are unread emails or anything important, mention it briefly.`;
  } else if (hour < 9) {
    instruction = `Good morning greeting. It's early (${now.toTimeString().slice(0,5)}). Check what's on the schedule today and if any emails came in overnight. Be warm and brief.`;
  } else if (hour >= 17) {
    instruction = `It's late afternoon/evening. The professor just opened the app. Summarise if there's anything still open from today — unread emails, pending marks, missed notifications. Keep it brief.`;
  } else {
    instruction = `The professor just opened FacultyMind. Greet them and give a one-line situational awareness summary: what's relevant right now from their schedule, emails, or recent activity. If nothing is pressing, just greet warmly.`;
  }

  const result = await callAI(db, aiRouter, keystore, instruction);
  if (result) {
    // AI writes a thought about what it just observed
    writeThought(db, 'observation', `Faculty opened app at ${now.toTimeString().slice(0,5)}. Context: ${ongoing ? 'during class' : justEnded ? 'just after class' : upcoming ? 'before class' : 'regular'}`, 'app_open');
  }
  return result;
}

// ─── Trigger: Post-Class ──────────────────────────────────────────────────────

async function triggerPostClass(db, aiRouter, keystore, classInfo) {
  if (isSuppressed(db)) return null;
  if (!canFire('post_class')) return null;

  const instruction = `${classInfo.course_name || classInfo.course_code} (${classInfo.start_time}–${classInfo.end_time}) just ended. Check in with the professor. Ask if they want to: 1) update the lesson log, 2) note any students who seemed to struggle, 3) see if any student emails came in during class. Be brief and natural — not a checklist.`;

  const result = await callAI(db, aiRouter, keystore, instruction);
  if (result) markFired('post_class');
  return result;
}

// ─── Trigger: Pre-Class ───────────────────────────────────────────────────────

async function triggerPreClass(db, aiRouter, keystore, classInfo) {
  if (isSuppressed(db)) return null;
  if (!canFire('pre_class')) return null;

  const instruction = `${classInfo.course_name || classInfo.course_code} starts in ${classInfo.minutesUntil} minutes (${classInfo.start_time}, ${classInfo.room || 'room TBD'}). Alert the professor. Mention what topic they last covered and what's next (from lesson log if available). Also check if any students emailed about this class recently.`;

  const result = await callAI(db, aiRouter, keystore, instruction);
  if (result) markFired('pre_class');
  return result;
}

// ─── Trigger: Periodic Ambient ────────────────────────────────────────────────

async function triggerPeriodic(db, aiRouter, keystore) {
  if (isSuppressed(db)) return null;
  if (!canFire('periodic')) return null;

  // Only fire if something is worth saying
  const { upcoming, ongoing } = getClassStatusPublic(db);
  const now = new Date();
  const hour = now.getHours();

  // Don't interrupt during an active class
  if (ongoing) return null;

  let instruction = '';
  if (upcoming) {
    instruction = `Ambient check-in: ${upcoming.course_code} is coming up at ${upcoming.start_time}. The professor has been in the app for a while. Gently surface anything relevant — lesson log reminder, pending marks, student emails. 1-2 sentences.`;
  } else if (hour >= 16) {
    instruction = `End-of-day ambient check: it's ${now.toTimeString().slice(0,5)}. Surface anything the professor might want to wrap up before closing the app — unread high-priority emails, lesson logs not updated, etc. 2 sentences max.`;
  } else {
    instruction = `Ambient mid-session check-in. The professor has been using FacultyMind. Is there anything from their activity today that deserves a gentle nudge? If nothing is actionable, stay silent (respond with exactly: SILENT).`;
  }

  const result = await callAI(db, aiRouter, keystore, instruction);

  // If AI decided to stay silent
  if (!result || result.text === 'SILENT' || result.text.trim() === '') return null;

  markFired('periodic');
  return result;
}

// ─── Trigger: New Email Alert ─────────────────────────────────────────────────
//
// Trained behaviours:
//   Advertisement / OTP  → brief filter notice, no AI call needed
//   Work / Students / Payments / Personal → alert faculty with sender+subject+timeAgo, offer summary or reply
//
async function triggerEmailAlert(db, aiRouter, keystore, emailInfo) {
  const category  = emailInfo.ai_category || emailInfo.category || 'Personal';
  const fromName  = emailInfo.from_name   || emailInfo.from_email || 'Someone';
  const fromEmail = emailInfo.from_email  || '';
  const subject   = emailInfo.subject     || '(no subject)';
  const summary   = emailInfo.ai_summary  || emailInfo.snippet   || '';

  const timeAgo = emailInfo.received_at
    ? (() => {
        const diff = Math.round((Date.now() - new Date(emailInfo.received_at)) / 1000);
        if (diff < 60)   return `${diff}s ago`;
        if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
        return `${Math.round(diff / 3600)}h ago`;
      })()
    : 'just now';

  // ── Noise categories: handle without AI call, short notice ───────────────
  if (category === 'Advertisement') {
    return {
      text: `Got a promotional email from **${fromName}** (${timeAgo}) — "${subject}". Looks like an ad, ignoring it for you.`,
      buttons: [],
    };
  }

  if (category === 'OTP') {
    return {
      text: `OTP/verification email from **${fromName}** (${timeAgo}). Filtered automatically.`,
      buttons: [],
    };
  }

  // ── Important emails: throttle, check class suppress rule ────────────────
  if (!canFire('email')) return null;

  const { ongoing } = getClassStatusPublic(db);
  const rules = getRules(db);
  const suppressDuringClass = rules.some(r => {
    try {
      const j = typeof r.rule_json === 'string' ? JSON.parse(r.rule_json) : (r.rule_json || {});
      return j.suppress === 'notifications' || r.rule_description?.toLowerCase().includes('during class');
    } catch (_) { return false; }
  });
  if (ongoing && suppressDuringClass) return null;

  const categoryLabel = {
    Students: 'a student',
    Work:     'a work contact',
    Payments: 'a payment/finance notification',
    Personal: 'a personal contact',
  }[category] || 'someone';

  const instruction = `New email arrived ${timeAgo} from ${categoryLabel}: ${fromName}${fromEmail ? ` <${fromEmail}>` : ''}.
Subject: "${subject}"
${summary ? `Content preview: ${summary}` : ''}

Announce this to the professor in 1-2 sentences — mention sender, time, subject naturally. Then offer one relevant follow-up action based on the content:
- If it likely needs a reply → ask if they want a draft reply
- If it's informational → ask if they want a full summary
- If it's a payment/alert → just mention it clearly

Speak like Jarvis: calm, brief, aware. Do not use markdown headers.

ACTIONS:{"buttons":[{"label":"Open inbox","action":"nav:email"},{"label":"Draft reply","action":"nav:email"}]}`;

  const result = await callAI(db, aiRouter, keystore, instruction);
  if (result) markFired('email');
  return result;
}

// ─── Legacy compatibility shim ────────────────────────────────────────────────
// main.js calls triggerGreeting(aiRouter, keychainModule) — old signature.
// We now need (db, aiRouter, keystore). The shim is handled in main.js where
// db is passed explicitly. This export matches the new signature.

module.exports = {
  triggerGreeting,
  triggerPostClass,
  triggerPreClass,
  triggerPeriodic,
  triggerEmailAlert,
};
