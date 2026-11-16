'use strict';
// Wraps the hand-written accuracy scripts in scripts/test-*.js.
// Many of them exit 0 even when cases fail, so this parses their final
// "passed/total" line and asserts it never drops below today's baseline.
// Raise a floor when accuracy improves; never lower one to make a run pass.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// Baseline measured 2026-10-29 (see STATUS.md §2)
const FLOORS = {
  'test-10q-stress.js':      [10, 10],
  'test-20q.js':             [20, 20],
  'test-25q.js':             [25, 25],
  'test-clo-mapper-fast.js': [18, 19],
  'test-dbms-gaps.js':       [6, 6],
  'test-finite-automata.js': [10, 10],
  'test-ice2345.js':         [4, 10],
  'test-ice431.js':          [8, 8],
  'test-ice431-audit.js':    [8, 8],
  'test-ice431-word.js':     [8, 8],
  'test-word-format.js':     [8, 8],
};

function lastScore(output) {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const matches = [...clean.matchAll(/(\d+)\s*\/\s*(\d+)\s*=\s*\d+%/g)];
  if (!matches.length) return null;
  const m = matches[matches.length - 1];
  return [Number(m[1]), Number(m[2])];
}

for (const [script, [floor, total]] of Object.entries(FLOORS)) {
  test(`${script} ≥ ${floor}/${total}`, () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script)], {
      cwd: ROOT, encoding: 'utf8', timeout: 120_000, env: process.env,
    });
    const score = lastScore((r.stdout || '') + (r.stderr || ''));
    assert.ok(score, `could not find a score line in output:\n${(r.stdout || '').slice(-400)}\n${r.stderr || ''}`);
    assert.equal(score[1], total, 'number of cases changed — update FLOORS deliberately');
    assert.ok(score[0] >= floor, `accuracy regressed: ${score[0]}/${total} < baseline ${floor}/${total}`);
  });
}

test('test-syllabus-mapper.js: at most 1 failed check (baseline)', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'test-syllabus-mapper.js')], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  const failed = (r.stdout.match(/✗/g) || []).length;
  assert.ok(failed <= 1, `${failed} failed checks`);
});

test('test-orin-doc.js', { skip: 'needs C:\\Users\\Anxiety\\Desktop\\Course_Profile.docx (not present)' }, () => {});
