#!/usr/bin/env node
/**
 * Eval runner — `npm run eval`  (see QUALITY.md for targets and rules)
 *
 * Runs every component in eval/components under Electron's Node (native modules),
 * prints a summary, and writes eval/REPORT.md with metric, target, pass/fail,
 * sample size and the commit it ran on. Exits non-zero if any component misses its
 * target. Uses only synthetic / seeded data; never the real userData or student DB.
 *
 *   npm run eval                  all components
 *   npm run eval -- shadsync-math one component
 */
'use strict';

const { spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

if (process.env.FM_EVAL_CHILD !== '1') {
  const res = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FM_TEST: '1', FM_EVAL_CHILD: '1' },
  });
  process.exit(res.status ?? 1);
}

const COMPONENTS = ['shadsync-math', 'marks-import', 'question-split', 'bloom-level', 'intent-router'];
const SLOW = new Set(['intent-router']); // minutes long (runs a local model): only with its name or --all
const STORE = path.join(__dirname, 'results.json');

function git(args) { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return 'unknown'; } }

(async () => {
  const args = process.argv.slice(2);
  const only = args.filter(a => !a.startsWith('-'));
  const all = args.includes('--all');
  const names = only.length ? COMPONENTS.filter(c => only.includes(c)) : COMPONENTS.filter(c => all || !SLOW.has(c));
  const commit = git(['rev-parse', '--short', 'HEAD']);
  const dirty = git(['status', '--porcelain']) ? ' (+ uncommitted changes)' : '';
  const results = [];
  const quiet = { log: console.log, warn: console.warn, error: console.error };
  for (const name of names) {
    try {
      console.log = console.warn = console.error = () => {}; // silence module chatter
      const r = await require(`./components/${name}`)();
      Object.assign(console, quiet);
      results.push({ id: name, ...r, pass: r.skipped ? null : r.value >= r.target });
    } catch (e) {
      Object.assign(console, quiet);
      results.push({ id: name, name, metric: 'run failed', target: 1, value: 0, n: 0, unit: '', note: e.message, failures: [e.stack], pass: false });
    }
  }

  // keep the latest result of every component, so a slow component's last run stays in the report
  let store = {};
  try { store = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (_) {}
  for (const r of results) if (!r.skipped) store[r.id] = { ...r, commit: commit + dirty, at: new Date().toISOString() };
  fs.writeFileSync(STORE, JSON.stringify(store, null, 1) + '\n');
  const shown = COMPONENTS.map(c => results.find(r => r.id === c && r.skipped) || store[c]).filter(Boolean);

  const pct = (v) => (v * 100).toFixed(1) + '%';
  const when = (r) => (names.includes(r.id) ? '' : ` _(last run ${String(r.at).slice(0, 10)} on ${r.commit})_`);
  const lines = [
    '# FacultyMind eval report', '',
    `Commit: \`${commit}\`${dirty} · Run: ${new Date().toISOString()}`, '',
    '| Component | Metric | Result | Target | n | Status |', '|---|---|---|---|---|---|',
    ...shown.map(r => `| ${r.name}${when(r)} | ${r.metric} | ${pct(r.value)} | ${pct(r.target)} | ${r.n} ${r.unit} | ${r.pass === null || r.skipped ? 'SKIPPED' : r.value >= r.target ? 'PASS' : 'FAIL'} |`),
    '', '## Details', '',
    ...shown.flatMap(r => [`### ${r.name}`, r.note ? `${r.note}` : '', '',
      ...((r.failures || []).length ? ['Failures:', ...r.failures.slice(0, 40).map(f => `- ${f}`)] : ['No failures.']), '']),
    '## Not yet measured', '',
    '- Bloom\'s level, question→CLO map, Syllabus Doctor gaps, gap explanations: see ROADMAP Day 4.', '',
  ];
  fs.writeFileSync(path.join(__dirname, 'REPORT.md'), lines.join('\n'));

  for (const r of results) console.log(r.pass === null ? `SKIP  ${r.name}: ${r.note}` : `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}: ${pct(r.value)} (target ${pct(r.target)}, n=${r.n})`);
  console.log('Report: eval/REPORT.md');
  process.exit(results.every(r => r.pass !== false) ? 0 : 1);
})();
