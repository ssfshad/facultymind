'use strict';
// Question extraction: splitQuestions on synthetic exam papers (QUALITY.md ≥98%).
// Headline = held-out TEST split. Failure details are printed for DEV only (no peeking).

const h = require('../../tests/helpers/harness');
const { splitQuestions } = h.src('modules/blooms/clo-mapper-fast');
const papers = require('../data/question-split.json');
const { loadSplit } = require('../lib/split');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// correct = gold ids found with matching text; errors = missed + spurious
function scorePaper(p) {
  let got = [];
  try { got = splitQuestions(p.text) || []; } catch (e) { return { correct: 0, total: p.gold.length, spurious: 0, misses: [`threw ${e.message}`] }; }
  const misses = [];
  let correct = 0;
  const used = new Set();
  for (const g of p.gold) {
    const i = got.findIndex((q, idx) => !used.has(idx) && q.id === g.id && norm(q.text).includes(norm(g.stem)));
    if (i >= 0) { correct++; used.add(i); } else misses.push(`${g.id} ("${g.stem}…")`);
  }
  const spurious = got.length - used.size;
  return { correct, total: p.gold.length, spurious, misses, got: got.map(q => q.id) };
}

function aggregate(items) {
  let correct = 0, total = 0, spurious = 0;
  const details = [];
  for (const p of items) {
    const s = scorePaper(p);
    correct += s.correct; total += s.total; spurious += s.spurious;
    if (s.misses.length || s.spurious) details.push({ id: p.id, ...s });
  }
  return { correct, total, spurious, score: correct / (total + spurious), details };
}

module.exports = async function run() {
  const split = loadSplit('question-split', papers.map(p => p.id));
  const dev = aggregate(papers.filter(p => split.dev.includes(p.id)));
  const test = aggregate(papers.filter(p => split.test.includes(p.id)));
  return {
    name: 'Question extraction (synthetic papers)',
    metric: 'questions correctly split (id + text; spurious extras count against)',
    target: 0.98, value: test.score, n: test.total, unit: 'questions (test)',
    note: `test ${test.correct}/${test.total} correct, ${test.spurious} spurious; dev ${dev.correct}/${dev.total}, ${dev.spurious} spurious = ${(dev.score * 100).toFixed(1)}%`,
    failures: dev.details.map(d => `[dev] ${d.id}: missed ${d.misses.join('; ') || 'none'}; ${d.spurious} spurious (got ${d.got?.join(', ')})`),
  };
};
