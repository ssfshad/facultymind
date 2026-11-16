'use strict';
// Bloom's level per question (QUALITY.md: exact agreement ≥90%, also report ±1).
// Headline = held-out TEST split, single-level (non-ambiguous, measurable) items, exact match.
// Also reported: ±1 level, ambiguous items (accepted if in the defensible set), refusal of
// non-measurable objectives, confidence calibration, and how often a question is sent to review.
// Failure details are printed for DEV only (no peeking at test). Runs the pure rule engine with no DB,
// i.e. what a fresh install does before any teacher-verified KB entries exist.

const h = require('../../tests/helpers/harness');
const { mapDeterministic } = h.src('modules/blooms/clo-mapper-fast');
const items = require('../data/bloom-questions.json');
const { loadSplit } = require('../lib/split');

const lvl = (s) => Number(String(s).replace('C', ''));

function predict(text) {
  try {
    const r = mapDeterministic(`Q1. ${text}`, 'EVAL');
    const m = (r.clo_mappings || [])[0];
    if (!m) return { level: null, confidence: 'none', verbs: [] };
    return { level: m.bloom_level || null, confidence: m.confidence || 'none', verbs: m.detected_verbs || [], all: m.bloom_levels };
  } catch (e) { return { level: null, confidence: 'error', verbs: [], error: e.message }; }
}

function score(set) {
  const s = { single: 0, exact: 0, adj: 0, rejectN: 0, rejectOk: 0, ambN: 0, ambOk: 0, review: 0, total: set.length, byConf: {}, fails: [], confusion: {} };
  for (const it of set) {
    const p = predict(it.text);
    const isRejected = p.confidence === 'rejected';
    if (p.confidence === 'low' || p.confidence === 'flag' || p.confidence === 'none' || isRejected) s.review++;
    if (it.gold === 'REJECT') {
      s.rejectN++;
      if (isRejected) s.rejectOk++; else s.fails.push(`${it.id} should be REJECTED, got ${p.level} (${p.confidence}): ${it.text.slice(0, 70)}`);
      continue;
    }
    const got = isRejected ? null : p.level;
    if (it.ambiguous) {
      s.ambN++;
      if (got && it.accept.includes(got)) s.ambOk++; else s.fails.push(`${it.id} [ambiguous ${it.accept}] got ${got} (${p.confidence})`);
      continue;
    }
    s.single++;
    const ok = got === it.gold;
    const near = got && Math.abs(lvl(got) - lvl(it.gold)) <= 1;
    if (ok) s.exact++;
    if (near) s.adj++;
    const c = (s.byConf[p.confidence] = s.byConf[p.confidence] || { n: 0, ok: 0 });
    c.n++; if (ok) c.ok++;
    const key = `${it.gold}->${got}`; if (!ok) s.confusion[key] = (s.confusion[key] || 0) + 1;
    if (!ok) s.fails.push(`${it.id} expected ${it.gold} got ${got} (${p.confidence}, verbs=${p.verbs.join(',')}) [${it.source}]: ${it.text.slice(0, 80)}`);
  }
  return s;
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : 'n/a');

module.exports = async function run() {
  const split = loadSplit('bloom-level', items.map(i => i.id));
  const dev = score(items.filter(i => split.dev.includes(i.id)));
  const test = score(items.filter(i => split.test.includes(i.id)));
  const calib = Object.entries(test.byConf).map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(', ');
  return {
    name: "Bloom's level per question (rule engine)",
    metric: 'exact level agreement (test split, unambiguous items)',
    target: 0.90, value: test.exact / test.single, n: test.single, unit: 'questions (test)',
    note: `test: exact ${test.exact}/${test.single}, ±1 ${pct(test.adj, test.single)}; ambiguous ${test.ambOk}/${test.ambN} in the defensible set; ` +
      `non-measurable refused ${test.rejectOk}/${test.rejectN}; sent to review ${pct(test.review, test.total)}; accuracy by confidence: ${calib}. ` +
      `dev: exact ${dev.exact}/${dev.single} (${pct(dev.exact, dev.single)}), ±1 ${pct(dev.adj, dev.single)}, refused ${dev.rejectOk}/${dev.rejectN}. ` +
      `Author-labelled data shares an author with the mapper: expect real teacher phrasing to score lower.`,
    failures: dev.fails.map(f => `[dev] ${f}`),
  };
};
