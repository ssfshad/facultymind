'use strict';

/**
 * memory-manager.js — Persistent AI Memory Layer
 *
 * Loads from three sources in the DB:
 *   1. ai_identity    — permanent core identity (who I am, what I own, my responsibilities)
 *   2. ai_knowledge   — accumulated learnings written by the AI over time
 *   3. faculty_profile, faculty_rules_memory, behavioral_memory — user-specific context
 *   4. ai_reflections — most recent daily self-reflection
 *
 * The identity and knowledge base travel with the DB — fully portable.
 * Only the faculty profile rows change when a new user adopts the system.
 */

const db = require('../../database/db');

// ─── Build full memory context string for system prompt injection ─────────────

function buildContext() {
  let liveDb;
  try { liveDb = db.getDb(); } catch (_) { return ''; }
  if (!liveDb) return '';

  const parts = [];

  // ── 1. AI Identity (permanent, always included) ──────────────────────────
  try {
    const rows = liveDb.prepare(`SELECT key, value FROM ai_identity ORDER BY rowid`).all();
    if (rows.length) {
      const identity = rows.map(r => `[${r.key}]\n${r.value}`).join('\n\n');
      parts.push(`### MY IDENTITY & RESPONSIBILITIES\n${identity}`);
    }
  } catch (_) {}

  // ── 2. Faculty Profile (who the current user is) ─────────────────────────
  try {
    const rows = liveDb.prepare(`SELECT key, value FROM faculty_profile`).all();
    if (rows.length) {
      const profile = rows.map(r => `  ${r.key}: ${r.value}`).join('\n');
      parts.push(`### FACULTY PROFILE\n${profile}`);
    }
  } catch (_) {}

  // ── 3. Active Rules (what the faculty has told me to always do/not do) ───
  try {
    const rows = liveDb.prepare(`SELECT rule_description FROM faculty_rules_memory WHERE active = 1`).all();
    if (rows.length) {
      const rules = rows.map((r, i) => `  ${i + 1}. ${r.rule_description}`).join('\n');
      parts.push(`### FACULTY-DEFINED RULES (I MUST FOLLOW THESE)\n${rules}`);
    }
  } catch (_) {}

  // ── 4. Accumulated Knowledge Base (what I have learned over time) ────────
  try {
    const rows = liveDb.prepare(
      `SELECT topic, fact, confidence, reinforced
       FROM ai_knowledge
       WHERE confidence >= 0.5
       ORDER BY reinforced DESC, confidence DESC
       LIMIT 20`
    ).all();
    if (rows.length) {
      const knowledge = rows.map(r =>
        `  [${r.topic}] ${r.fact}${r.reinforced > 1 ? ` (confirmed ${r.reinforced}×)` : ''}`
      ).join('\n');
      parts.push(`### WHAT I HAVE LEARNED ABOUT THIS FACULTY\n${knowledge}`);
    }
  } catch (_) {}

  // ── 5. Observed Behavioural Patterns ─────────────────────────────────────
  try {
    const rows = liveDb.prepare(
      `SELECT behavior_value, confidence FROM behavioral_memory
       WHERE active = 1 ORDER BY confidence DESC LIMIT 8`
    ).all();
    if (rows.length) {
      const patterns = rows.map(r =>
        `  - ${r.behavior_value} (${(r.confidence * 100).toFixed(0)}% confidence)`
      ).join('\n');
      parts.push(`### OBSERVED BEHAVIOURAL PATTERNS\n${patterns}`);
    }
  } catch (_) {}

  // ── 6. Recent AI Thoughts (my own short-term observations) ───────────────
  try {
    const rows = liveDb.prepare(
      `SELECT category, thought FROM ai_thoughts
       WHERE confidence >= 0.6
       ORDER BY created_at DESC LIMIT 5`
    ).all();
    if (rows.length) {
      const thoughts = rows.map(r => `  [${r.category}] ${r.thought}`).join('\n');
      parts.push(`### MY RECENT OBSERVATIONS\n${thoughts}`);
    }
  } catch (_) {}

  // ── 7. Last Daily Reflection ──────────────────────────────────────────────
  try {
    const row = liveDb.prepare(
      `SELECT reflection_date, synthesis_text FROM ai_reflections ORDER BY created_at DESC LIMIT 1`
    ).get();
    if (row) {
      parts.push(`### MY LAST DAILY REFLECTION (${row.reflection_date})\n  "${row.synthesis_text}"`);
    }
  } catch (_) {}

  return parts.join('\n\n');
}

// ─── Write a new learned fact to the knowledge base ──────────────────────────

function learnFact(topic, fact, source = 'post_response', confidence = 0.65) {
  let liveDb;
  try { liveDb = db.getDb(); } catch (_) { return; }

  try {
    // Check if a very similar fact already exists for this topic
    const existing = liveDb.prepare(
      `SELECT id, fact, confidence, reinforced FROM ai_knowledge
       WHERE topic = ? AND fact = ?`
    ).get(topic, fact);

    if (existing) {
      // Reinforce — raise confidence, increment count
      const newConf = Math.min(1.0, existing.confidence + 0.05);
      liveDb.prepare(
        `UPDATE ai_knowledge SET confidence = ?, reinforced = reinforced + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(newConf, existing.id);
    } else {
      liveDb.prepare(
        `INSERT INTO ai_knowledge (topic, fact, source, confidence, reinforced)
         VALUES (?, ?, ?, ?, 1)`
      ).run(topic, fact, source, confidence);
    }
  } catch (_) {}
}

// ─── Teach the AI a batch of facts (used by daily trainer) ───────────────────

function learnBatch(facts) {
  // facts: [{ topic, fact, source, confidence }]
  for (const f of facts) {
    if (f && f.topic && f.fact) learnFact(f.topic, f.fact, f.source || 'daily_training', f.confidence || 0.7);
  }
}

// ─── Decay old low-confidence knowledge ──────────────────────────────────────

function pruneKnowledge(retainDays = 60) {
  let liveDb;
  try { liveDb = db.getDb(); } catch (_) { return; }
  try {
    liveDb.prepare(
      `DELETE FROM ai_knowledge
       WHERE confidence < 0.4
       AND created_at < datetime('now', '-${retainDays} days')`
    ).run();
  } catch (_) {}
}

// ─── Faculty profile helpers ──────────────────────────────────────────────────

function updateProfile(key, value, source = 'explicit') {
  let liveDb;
  try { liveDb = db.getDb(); } catch (_) { return; }
  liveDb.prepare(`INSERT OR REPLACE INTO faculty_profile (key, value) VALUES (?, ?)`).run(key, value);
  try {
    liveDb.prepare(`INSERT INTO memory_log (action, key, new_value, source) VALUES ('profile_update', ?, ?, ?)`).run(key, value, source);
  } catch (_) {}
}

function storeReflection(synthesisText, actionItems = '') {
  let liveDb;
  try { liveDb = db.getDb(); } catch (_) { return; }
  const dateStr = new Date().toISOString().split('T')[0];
  liveDb.prepare(
    `INSERT INTO ai_reflections (reflection_date, synthesis_text, action_items) VALUES (?, ?, ?)`
  ).run(dateStr, synthesisText, actionItems);
}

function observe(behaviorKey, value, increment = 1, confIncrease = 0.1) {
  let liveDb;
  try { liveDb = db.getDb(); } catch (_) { return; }
  const existing = liveDb.prepare(`SELECT * FROM behavioral_memory WHERE behavior_key = ?`).get(behaviorKey);
  if (existing) {
    const newConf = Math.min(1.0, existing.confidence + confIncrease);
    liveDb.prepare(
      `UPDATE behavioral_memory SET behavior_value = ?, observed_count = ?, confidence = ?, active = ? WHERE behavior_key = ?`
    ).run(value, existing.observed_count + increment, newConf, newConf >= 0.8 ? 1 : 0, behaviorKey);
  } else {
    liveDb.prepare(
      `INSERT INTO behavioral_memory (behavior_key, behavior_value, observed_count, confidence) VALUES (?, ?, ?, ?)`
    ).run(behaviorKey, value, increment, confIncrease);
  }
}

module.exports = { buildContext, learnFact, learnBatch, pruneKnowledge, updateProfile, storeReflection, observe };
