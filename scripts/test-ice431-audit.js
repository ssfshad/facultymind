/**
 * Validation audit — the exact 8 questions from the ICE431 CLO mapping
 * output that Shad ran through the engine. Tests the pre-validation gate
 * (domain + measurability) as well as the cognitive mapping.
 *
 * Expected results per the audit report:
 *   Q1  — engine skipped (not in output) — we test it explicitly
 *   Q2  — C2 Understand  ✓
 *   Q3  — C3 Apply       ✓
 *   Q4  — C4 Analyze     ✓
 *   Q5  — C5 Evaluate    ✓
 *   Q6  — C6 Create      ✓
 *   Q7  — REJECT / NON_COGNITIVE (Affective + Psychomotor)
 *   Q8  — REJECT / NON_MEASURABLE ("develop a deep familiarity with")
 */

'use strict';

const path = require('path');
const { mapDeterministic, validateObjective } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${tag}  ${label}${detail ? '  — ' + detail : ''}`);
}

// ── Unit tests for validateObjective ─────────────────────────────────────────
header('STEP 0: Pre-validation gate unit tests');

const gateTests = [
  {
    label: 'Q7 — Affective/Psychomotor (Collaborate + demonstrate appreciation)',
    text:  'Collaborate with cross-functional designer circles to demonstrate an appreciation for UI aesthetics by polishing individual asset animations during live team prototyping sprints.',
    expect: 'NON_COGNITIVE',
  },
  {
    label: 'Q8 — Non-measurable ("develop a deep familiarity with")',
    text:  'Students will develop a deep familiarity with the fundamental inner operations of Skia and Impeller rendering subsystems inside modern compilation pipelines.',
    expect: 'NON_MEASURABLE',
  },
  {
    label: 'Q2 — Valid cognitive objective (Classify)',
    text:  'Classify the primary operational differences between an asynchronous FutureBuilder component and a reactive StreamBuilder ecosystem in asynchronous state management.',
    expect: 'VALID',
  },
  {
    label: 'Q5 — Valid cognitive objective (Appraise + justify)',
    text:  'Appraise the security parameters of using native keystore storage versus local unencrypted shared preferences for handling sensitive user authentication web tokens, and justify your choice based on production safety metrics.',
    expect: 'VALID',
  },
  {
    label: 'Extra — "understanding of" phrase',
    text:  'Students should develop an understanding of the MVC pattern.',
    expect: 'NON_MEASURABLE',
  },
  {
    label: 'Extra — "appreciation for" phrase',
    text:  'Show an appreciation for clean code principles.',
    expect: 'NON_COGNITIVE',
  },
];

let gPass = 0, gFail = 0;
for (const t of gateTests) {
  const result = validateObjective(t.text);
  const got = result.valid ? 'VALID' : result.reason;
  const ok  = got === t.expect;
  row(t.label, ok, `expected ${t.expect}, got ${got}${!result.valid ? ' — ' + result.detail.slice(0, 60) : ''}`);
  ok ? gPass++ : gFail++;
}
console.log(`\n  Gate accuracy: ${gPass}/${gPass+gFail}`);

// ── Full mapping test on the 8-question audit set ────────────────────────────
header('Full mapping — ICE431 audit questions');

const auditText = `
1. List the exact sequential steps of the Flutter widget lifecycle from initState to dispose, including all intermediate callback hooks.

2. Classify the primary operational differences between an asynchronous FutureBuilder component and a reactive StreamBuilder ecosystem in asynchronous state management.

3. Implement a local database caching service using the SQLite package to handle offline-first data retention when a network disconnect event occurs.

4. Contrast the architectural responsibilities, data layer boundaries, and state mutations found when comparing the BLoC pattern against the Riverpod provider engine.

5. Appraise the security parameters of using native keystore storage versus local unencrypted shared preferences for handling sensitive user authentication web tokens, and justify your choice based on production safety metrics.

6. Design a complete, highly-scalable micro-frontend folder structure and state synchronization blueprint for a multiplatform workspace application that supports dynamic plugin loading.

7. Collaborate with cross-functional designer circles to demonstrate an appreciation for UI aesthetics by polishing individual asset animations during live team prototyping sprints.

8. Students will develop a deep familiarity with the fundamental inner operations of Skia and Impeller rendering subsystems inside modern compilation pipelines.
`;

const expected = {
  'Q1': 'C1',          // List → C1 Remember
  'Q2': 'C2',          // Classify → C2 Understand
  'Q3': 'C3',          // Implement → C3 Apply
  'Q4': 'C4',          // Contrast → C4 Analyze
  'Q5': 'C5',          // Appraise + justify → C5 Evaluate
  'Q6': 'C6',          // Design → C6 Create
  'Q7': 'REJECTED',    // Affective/Psychomotor — must be rejected
  'Q8': 'REJECTED',    // Non-measurable — must be rejected
};

const result = mapDeterministic(auditText, 'ICE431-AUDIT');
console.log(`  Detected ${result.clo_mappings.length} questions`);
console.log(`  Confidence: high=${result.confidence_summary.high} medium=${result.confidence_summary.medium} low=${result.confidence_summary.low} flagged=${result.confidence_summary.flagged}`);
console.log('');

const byId = {};
for (const m of result.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

let pass = 0, fail = 0;
for (const id of Object.keys(expected)) {
  const got = byId[id];
  const exp = expected[id];
  let gotStr, ok;
  if (exp === 'REJECTED') {
    ok     = got && got.confidence === 'rejected';
    gotStr = got ? `${got.confidence} (${(got.alignment_note || '').slice(0, 50)})` : 'NOT FOUND';
  } else {
    ok     = got && got.bloom_level === exp;
    gotStr = got ? `${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs || []).join(',')})` : 'NOT FOUND';
  }
  row(`${id}: expected ${exp}`, ok, gotStr);
  ok ? pass++ : fail++;
}

const acc = pass / (pass + fail);
console.log(`\n  Accuracy: ${pass}/${pass+fail} = ${(acc*100).toFixed(0)}%`);

process.exit(pass === pass + fail ? 0 : 1);
