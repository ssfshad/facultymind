'use strict';
// Dev-only view of the intent rules (instant, no model): coverage and every wrong rule answer on the DEV split.
//   ELECTRON_RUN_AS_NODE=1 electron eval/tools/rules-dev.js [--abstained]
// Never prints test-split items (QUALITY.md rule 3).
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const rules = require(path.join(ROOT, 'src/modules/ai/intent-rules'));
const commands = require(path.join(ROOT, 'eval/data/intent-commands.json'));
const split = require(path.join(ROOT, 'eval/data/split.json'))['intent-router'];
if (!split) throw new Error('no frozen intent split yet: run the eval once');
const dev = commands.filter(c => split.dev.includes(c.id) && !c.ambiguous);

let answered = 0, correct = 0;
const perIntent = {};
const wrong = [], abstained = [];
for (const c of dev) {
  const r = rules.classifyByRules(c.text);
  const p = (perIntent[c.intent] = perIntent[c.intent] || { n: 0, ans: 0, ok: 0 });
  p.n++;
  if (!r) { abstained.push(c); continue; }
  answered++; p.ans++;
  if (r.intent === c.intent) { correct++; p.ok++; } else wrong.push({ c, got: r.intent });
}
console.log(`DEV: ${dev.length} commands; rules answer ${answered} (${(100 * answered / dev.length).toFixed(1)}%); precision ${correct}/${answered} = ${(100 * correct / Math.max(1, answered)).toFixed(1)}%`);
console.log('per intent (answered/total, correct):');
for (const [k, v] of Object.entries(perIntent).sort()) console.log(`  ${k.padEnd(18)} ${String(v.ans).padStart(3)}/${String(v.n).padEnd(3)} correct ${v.ok}`);
console.log(`\nWRONG rule answers on dev (${wrong.length}):`);
wrong.forEach(w => console.log(`  "${w.c.text}"  expected ${w.c.intent}, rule said ${w.got}`));
if (process.argv.includes('--abstained')) {
  console.log(`\nabstained on dev (${abstained.length}):`);
  abstained.forEach(c => console.log(`  [${c.intent}] ${c.text}`));
}
