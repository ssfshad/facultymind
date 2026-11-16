/**
 * rules-engine.js — Faculty Rules Engine
 *
 * Faculty can teach the AI rules in plain English:
 *   "Never disturb me during class hours"
 *   "Always flag emails from the Dean as urgent"
 *   "Remind me to update lesson log after each OOP class"
 *   "Show me email summary first thing every morning"
 *
 * Rules are stored in faculty_rules_memory and injected into every AI context.
 * The AI also evaluates rules against the current situation to decide what to surface.
 */

'use strict';

/**
 * Get all active rules.
 */
function getRules(db) {
  try {
    return db.prepare(`
      SELECT id, rule_type, rule_description, rule_json, source, created_at
      FROM faculty_rules_memory
      WHERE active = 1
      ORDER BY created_at DESC
    `).all();
  } catch (_) { return []; }
}

/**
 * Add a new rule directly (structured).
 * @param {string} ruleType — 'time'|'event'|'email'|'behaviour'|'reminder'|'general'
 * @param {string} description — plain English description shown in UI
 * @param {object} ruleJson — structured rule data
 * @param {string} source — 'explicit' (faculty typed it) | 'inferred' (AI learned it)
 */
function addRule(db, ruleType, description, ruleJson = {}, source = 'explicit') {
  try {
    const info = db.prepare(`
      INSERT INTO faculty_rules_memory (rule_type, rule_description, rule_json, source, active)
      VALUES (?, ?, ?, ?, 1)
    `).run(ruleType, description, JSON.stringify(ruleJson), source);

    db.prepare(`
      INSERT INTO memory_log (action, key, new_value, source)
      VALUES ('rule_added', ?, ?, ?)
    `).run(`rule_${info.lastInsertRowid}`, description, source);

    return info.lastInsertRowid;
  } catch (e) {
    throw new Error(`Failed to add rule: ${e.message}`);
  }
}

/**
 * Deactivate a rule by ID (soft delete — keeps audit trail).
 */
function deleteRule(db, id) {
  try {
    db.prepare(`UPDATE faculty_rules_memory SET active = 0 WHERE id = ?`).run(id);
    db.prepare(`
      INSERT INTO memory_log (action, key, source) VALUES ('rule_deleted', ?, 'explicit')
    `).run(`rule_${id}`);
    return true;
  } catch (_) { return false; }
}

/**
 * Use the AI to parse a natural language rule string into a structured rule object,
 * then save it. Returns the new rule ID.
 *
 * Example input: "Don't bother me with emails during my 10am OOP class"
 * AI output: { type: "time", description: "...", json: { suppress: "notifications", during: "class_hours" } }
 */
async function parseAndSaveRule(db, nlText, aiRouter, apiKey, activeModel) {
  const systemPrompt = `You are FacultyMind's rule parser. The faculty just stated a preference or rule in plain English.
Extract it into a structured JSON object with these fields:
{
  "rule_type": one of: time|event|email|behaviour|reminder|general,
  "rule_description": a clean, one-line English summary of the rule,
  "rule_json": a structured object describing when and how to apply the rule
}

Examples:
"Never notify me after 9pm" → { rule_type: "time", rule_description: "No notifications after 21:00", rule_json: { suppress_after: "21:00", suppress_before: "07:00" } }
"Always flag dean emails as urgent" → { rule_type: "email", rule_description: "Emails from dean are always HIGH priority", rule_json: { sender_contains: "dean", set_priority: "HIGH" } }
"Remind me to update lesson log after every OOP class" → { rule_type: "reminder", rule_description: "Remind after OOP class to update lesson log", rule_json: { trigger: "post_class", course_keyword: "OOP", action: "remind_lesson_log" } }

Respond ONLY with the JSON object — no markdown, no explanation.`;

  const response = await aiRouter.send(
    `Parse this faculty rule: "${nlText}"`,
    {},
    { apiKey, model: activeModel, systemPrompt, maxTokens: 200 }
  );

  let parsed;
  try {
    const text = response.text.trim().replace(/^```json?|```$/g, '').trim();
    parsed = JSON.parse(text);
  } catch (_) {
    // Fallback: save as generic rule with the original text
    parsed = {
      rule_type: 'general',
      rule_description: nlText,
      rule_json: { raw: nlText }
    };
  }

  return addRule(db, parsed.rule_type, parsed.rule_description, parsed.rule_json || {}, 'explicit');
}

/**
 * Evaluate which rules are relevant to the current context.
 * Returns a filtered list of rule descriptions that should be honoured right now.
 *
 * @param {object[]} rules — from getRules()
 * @param {object} context — { currentTime, isClassHour, moduleActive, ... }
 */
function evaluateRules(rules, context) {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5); // "HH:MM"
  const active = [];

  for (const rule of rules) {
    let json = {};
    try { json = JSON.parse(rule.rule_json); } catch (_) {}

    // Time-based: suppress if we're inside quiet hours
    if (rule.rule_type === 'time') {
      if (json.suppress_after && json.suppress_before) {
        if (hhmm >= json.suppress_after || hhmm < json.suppress_before) {
          active.push({ ...rule, reason: 'quiet_hours' });
          continue;
        }
      }
    }

    // Class-hour suppression
    if (rule.rule_type === 'time' && json.suppress === 'notifications' && context.isClassHour) {
      active.push({ ...rule, reason: 'class_hour' });
      continue;
    }

    // General rules are always active
    if (rule.rule_type === 'general' || rule.rule_type === 'behaviour') {
      active.push({ ...rule, reason: 'always_active' });
    }
  }

  return active;
}

/**
 * Build a plain-text rules block for AI context injection.
 */
function buildRulesContext(db) {
  const rules = getRules(db);
  if (rules.length === 0) return 'ACTIVE RULES:\nNone set yet.';
  let out = `ACTIVE RULES (${rules.length}):\n`;
  rules.forEach((r, i) => {
    out += `${i + 1}. [${r.rule_type.toUpperCase()}] ${r.rule_description}\n`;
  });
  return out;
}

module.exports = {
  getRules,
  addRule,
  deleteRule,
  parseAndSaveRule,
  evaluateRules,
  buildRulesContext,
};
