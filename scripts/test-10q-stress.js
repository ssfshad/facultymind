/**
 * 10-question stress test — the exact questions Shad submitted.
 * Expected results derived from the analysis in the chat.
 */
'use strict';

const path = require('path');
const { mapDeterministic } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

const text = `
1. State the specific terminal command required to build a deterministic, split-per-abi release bundle for an Android deployment footprint.

2. Contrast the architectural state mutations of a widget subtree when invoking setState() versus dispatching a state change event through a Riverpod Notifier.

3. Students will develop an intuitive understanding of memory management profile trees when diagnosing heavy garbage collection leaks in application lifecycles.

4. Design an end-to-end local data synchronization framework that utilizes an offline-first conflict-free replicated data type (CRDT) engine over WebSockets.

5. Appreciate the structural clean aesthetic principles of minimalist UI layout designs when arranging system dashboard elements.

6. Implement a custom sliver scrolling layout wrapper to orchestrate complex sticky-header coordinate transformations inside a nested custom scroll view.

7. Classify the various network error exceptions into distinct runtime category mappings based on their respective HTTP status layer codes.

8. Coordinate with peer repository maintainers during live codebase migration sprints to ensure collaborative alignment on code review guidelines.

9. Appraise the security vulnerabilities of executing third-party JavaScript sidecars within a native desktop application container, and justify an isolation sandboxing approach based on system safety metrics.

10. Students will be thoroughly familiar with the performance optimization differences between rendering vector graphic assets versus rasterized bitmaps inside a compilation pipeline.
`;

const expected = {
  'Q1':  'C1',        // State → C1 Remember
  'Q2':  'C4',        // Contrast → C4 Analyze
  'Q3':  'REJECTED',  // "develop an intuitive understanding" → NON_MEASURABLE
  'Q4':  'C6',        // Design → C6 Create
  'Q5':  'REJECTED',  // Appreciate → NON_COGNITIVE (Affective)
  'Q6':  'C3',        // Implement → C3 Apply
  'Q7':  'C2',        // Classify → C2 Understand
  'Q8':  'REJECTED',  // Coordinate with peers → NON_COGNITIVE (Affective)
  'Q9':  'C5',        // Appraise + justify → C5 Evaluate
  'Q10': 'REJECTED',  // "thoroughly familiar with" → NON_MEASURABLE
};

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${tag}  ${label}${detail ? '  — ' + detail : ''}`);
}

header('10-Question Stress Test');
const result = mapDeterministic(text, 'STRESS');
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
    gotStr = got
      ? `REJECTED (${(got.alignment_note || '').slice(8, 60)})`
      : 'NOT FOUND / NOT REJECTED';
  } else {
    ok     = got && got.bloom_level === exp;
    gotStr = got
      ? `${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs || []).join(',')})`
      : 'NOT FOUND';
  }
  row(`${id}: expected ${exp}`, ok, gotStr);
  ok ? pass++ : fail++;
}

const acc = (pass / (pass + fail) * 100).toFixed(0);
console.log(`\n  Accuracy: ${pass}/${pass+fail} = ${acc}%`);
process.exit(0);
