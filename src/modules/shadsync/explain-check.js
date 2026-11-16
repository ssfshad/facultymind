'use strict';

/**
 * explain-check.js — automatic fact-check for AI explanations of weak CLOs (QUALITY.md: "cited numbers exist in data, 100%").
 *
 * The explanation is a JSON object { summary, clos: [{ code, why, actions: [..] }] } written by a model from a FACTS object
 * (see prompts/templates/clo-gap-explanation.js). A teacher must never see a number the data does not contain,
 * so every figure in the text is matched against the facts (or a value derived from them).
 *
 * FACTS: { course:{code,name}, threshold, clos:[{code, avg, below_count, graded, assessments:[{name, avg_pct, max}]}] }
 */

const TOL = 0.15; // percentage points

/** A CLO needs explaining when its average is under the threshold or too many students are. */
function isFailing(clo, threshold) {
  const share = clo.graded > 0 ? clo.below_count / clo.graded : 0;
  return clo.avg < threshold || share > 0.4;
}

function failingClos(facts) {
  return facts.clos.filter(c => isFailing(c, facts.threshold));
}

/** Every number a correct explanation may mention, including values derived from the facts. */
function allowedNumbers(facts) {
  const nums = new Set();
  const add = (n) => { if (Number.isFinite(n)) nums.add(Math.round(n * 100) / 100); };
  add(facts.threshold);
  add(facts.threshold != null ? 100 - facts.threshold : NaN);
  for (const c of facts.clos) {
    add(c.avg); add(c.below_count); add(c.graded); add(c.graded - c.below_count);
    add(facts.threshold - c.avg); add(c.avg - facts.threshold);
    if (c.graded > 0) add((100 * c.below_count) / c.graded);
    for (const a of c.assessments || []) {
      add(a.avg_pct); add(a.max); add(facts.threshold - a.avg_pct); add(a.avg_pct - facts.threshold);
      add(a.avg_pct != null ? (a.avg_pct * a.max) / 100 : NaN);
    }
  }
  return nums;
}

/** Numbers written in a text, without identifiers such as CLO2, CO1, PO3, ICE301, Q4, or ordinal words. */
function numbersIn(text) {
  const cleaned = String(text)
    .replace(/\b[A-Z]{1,4}\s?-?\d{1,4}[A-Za-z]?\b/g, ' ')         // CLO2, ICE301, EEE1345, Q4, C3 (upper-case only: "of 47" is a number)
    .replace(/\b(19|20)\d{2}\b/g, ' ');                            // years
  return [...cleaned.matchAll(/(\d+(?:\.\d+)?)(\s*%)?/g)].map(m => ({ value: parseFloat(m[1]), percent: !!m[2], raw: m[0].trim() }));
}

function isAllowed(n, allowed) {
  for (const a of allowed) {
    if (Math.abs(a - n.value) <= TOL) return true;
    if (Number.isInteger(n.value) && Math.abs(Math.round(a) - n.value) < 0.5) return true; // "about 58%" for 57.6
  }
  return false;
}

/**
 * @param {object} facts
 * @param {string|object} output  the model's reply (JSON text or parsed object)
 * @returns {{ ok, jsonValid, covered, missing, unsupported, actionsOk, mentionedUnknownClo }}
 */
function checkExplanation(facts, output) {
  let obj = output;
  if (typeof output === 'string') {
    try { obj = JSON.parse(output); }
    catch (_) {
      const m = /\{[\s\S]*\}/.exec(output);
      try { obj = m ? JSON.parse(m[0]) : null; } catch (__) { obj = null; }
    }
  }
  const valid = !!obj && typeof obj === 'object' && Array.isArray(obj.clos) && typeof obj.summary === 'string';
  if (!valid) return { ok: false, jsonValid: false, covered: [], missing: failingClos(facts).map(c => c.code), extra: [], unsupported: [], actionsOk: false, mentionedUnknownClo: [] };

  const failing = failingClos(facts).map(c => c.code);
  const byCode = new Map(obj.clos.map(c => [String(c.code || '').toUpperCase().replace(/\s+/g, ''), c]));
  const covered = failing.filter(code => byCode.has(code));
  const missing = failing.filter(code => !byCode.has(code));
  const extra = [...byCode.keys()].filter(code => !failing.includes(code));   // the prompt forbids explaining CLOs that are fine
  const actionsOk = covered.every(code => Array.isArray(byCode.get(code).actions) && byCode.get(code).actions.filter(a => String(a).trim().length > 10).length >= 1)
                    && String(obj.summary).trim().length > 0;

  const known = new Set(facts.clos.map(c => c.code));
  const mentionedUnknownClo = [];
  const text = [obj.summary, ...obj.clos.flatMap(c => [c.code, c.why, ...(c.actions || [])])].map(String).join('\n');
  for (const m of text.matchAll(/\bCLO\s?-?(\d+)\b/gi)) {
    const code = `CLO${m[1]}`;
    if (!known.has(code) && !mentionedUnknownClo.includes(code)) mentionedUnknownClo.push(code);
  }

  const allowed = allowedNumbers(facts);
  const unsupported = [];
  for (const n of numbersIn(text)) {
    if (n.value <= 3 && !n.percent) continue;       // "1-2 actions", "two"... small counts of advice, not data
    if (!isAllowed(n, allowed)) unsupported.push(n.raw);
  }

  return {
    ok: missing.length === 0 && extra.length === 0 && unsupported.length === 0 && actionsOk && mentionedUnknownClo.length === 0,
    jsonValid: true, covered, missing, extra, unsupported, actionsOk, mentionedUnknownClo,
  };
}

module.exports = { checkExplanation, failingClos, isFailing, allowedNumbers, numbersIn };
