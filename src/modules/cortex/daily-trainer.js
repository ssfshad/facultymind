/**
 * daily-trainer.js — Daily AI Self-Training Loop
 *
 * Runs once per day on app open (if last run was >20 hours ago).
 * Reads yesterday's activity log, then asks the AI to:
 *   1. Identify patterns ("Faculty checks email every morning before anything else")
 *   2. Detect open loops ("Marks entry for ICE301 was started but not completed")
 *   3. Suggest rules ("Faculty dismissed OTP notifications 4 times — add a filter rule?")
 *   4. Write a day summary to ai_reflections
 *   5. Write individual thoughts to ai_thoughts
 *
 * The AI's output is stored and then read back tomorrow as context.
 * This is how it gets "smarter" — not by retraining weights, but by
 * accumulating structured self-written observations.
 */

'use strict';

const { getEventsForDate } = require('./activity-logger');
const { writeThought, pruneThoughts } = require('./thought-journal');
const { learnBatch, pruneKnowledge } = require('../memory/memory-manager');

const TRAINING_SYSTEM_PROMPT = `You are the FacultyMind intelligence engine performing your daily self-training.
You have been given yesterday's activity log — a timeline of what the faculty did in the app.

Your job:
1. Identify 2-3 behavioural PATTERNS (things the faculty does consistently).
2. Note any OPEN LOOPS (tasks started but not finished).
3. Suggest 0-1 RULES if a clear preference is evident that has no rule yet.
4. Extract 2-4 KNOWLEDGE FACTS — durable things you have learned about this faculty member
   that should be remembered permanently (e.g. "Faculty prefers checking email before schedule",
   "Faculty's heaviest teaching day is Sunday", "Marks entry usually happens on weekends").
   Each fact must have a topic (schedule_habits | email_habits | teaching_style | workload | preferences | student_patterns).
5. Write a SHORT SUMMARY of the day (2-3 sentences) as your daily reflection.

Respond ONLY with this JSON (no markdown):
{
  "patterns": ["...", "..."],
  "open_loops": ["...", "..."],
  "rule_suggestion": "..." or null,
  "knowledge": [{"topic": "...", "fact": "..."}],
  "daily_summary": "..."
}`;

/**
 * Check whether training should run today.
 * Returns true if last_trained_date is not today.
 */
function shouldTrain(db) {
  try {
    const row = db.prepare(`SELECT value FROM cortex_state WHERE key = 'last_trained_date'`).get();
    const today = new Date().toISOString().split('T')[0];
    return !row || row.value !== today;
  } catch (_) { return false; }
}

/**
 * Mark training as done for today.
 */
function markTrained(db) {
  const today = new Date().toISOString().split('T')[0];
  try {
    db.prepare(`UPDATE cortex_state SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'last_trained_date'`).run(today);
  } catch (_) {}
}

/**
 * Run the daily training loop.
 * @param {Database} db
 * @param {object} aiRouter
 * @param {string} apiKey
 * @param {string} activeModel
 */
async function runDailyTraining(db, aiRouter, apiKey, activeModel) {
  if (!shouldTrain(db)) return;

  try {
    // Get yesterday's events
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    const events = getEventsForDate(db, dateStr);

    if (events.length < 3) {
      // Not enough data to train on — mark as done and skip
      markTrained(db);
      return;
    }

    // Build a compact log string for the AI
    const logSummary = events.map(e => {
      const time = e.created_at.slice(11, 16);
      let payload = {};
      try { payload = JSON.parse(e.payload_json); } catch (_) {}
      const detail = payload.course || payload.intent || payload.module || '';
      return `[${time}] ${e.event_type}${detail ? ` (${detail})` : ''}`;
    }).join('\n');

    const prompt = `Yesterday's activity log (${dateStr}):\n${logSummary}\n\nAnalyse and respond with JSON as instructed.`;

    const response = await aiRouter.send(prompt, {}, {
      apiKey,
      model: activeModel,
      systemPrompt: TRAINING_SYSTEM_PROMPT,
      maxTokens: 400
    });

    let parsed;
    try {
      const text = response.text.trim().replace(/^```json?|```$/g, '').trim();
      parsed = JSON.parse(text);
    } catch (_) {
      // AI returned non-parseable output — store raw as a general observation
      writeThought(db, 'observation', `Daily training ran for ${dateStr}. ${events.length} events processed.`, 'daily_trainer');
      markTrained(db);
      return;
    }

    // Write patterns as thoughts
    if (Array.isArray(parsed.patterns)) {
      parsed.patterns.forEach(p => {
        if (p && p.trim()) writeThought(db, 'pattern', p.trim(), `daily_training_${dateStr}`);
      });
    }

    // Write open loops
    if (Array.isArray(parsed.open_loops)) {
      parsed.open_loops.forEach(ol => {
        if (ol && ol.trim()) writeThought(db, 'open_loop', ol.trim(), `daily_training_${dateStr}`);
      });
    }

    // Write rule suggestion as a thought (faculty will confirm via UI)
    if (parsed.rule_suggestion && parsed.rule_suggestion.trim()) {
      writeThought(db, 'rule_suggestion', parsed.rule_suggestion.trim(), `daily_training_${dateStr}`);
    }

    // Store the daily reflection
    if (parsed.daily_summary) {
      db.prepare(`
        INSERT INTO ai_reflections (reflection_date, synthesis_text, action_items)
        VALUES (?, ?, ?)
      `).run(dateStr, parsed.daily_summary, (parsed.open_loops || []).join('; '));
    }

    // Write durable knowledge facts to the knowledge base
    if (Array.isArray(parsed.knowledge)) {
      learnBatch(parsed.knowledge.map(k => ({
        topic:      k.topic || 'general',
        fact:       k.fact,
        source:     `daily_training_${dateStr}`,
        confidence: 0.7,
      })));
    }

    // Prune old data
    pruneThoughts(db, 30);
    pruneKnowledge(60);

    markTrained(db);
    console.log(`[Cortex] Daily training complete for ${dateStr}. ${events.length} events → ${(parsed.patterns||[]).length} patterns.`);

  } catch (err) {
    console.error('[Cortex] Daily training failed:', err.message);
    markTrained(db); // Mark done anyway to avoid retrying every open
  }
}

module.exports = { runDailyTraining, shouldTrain };
