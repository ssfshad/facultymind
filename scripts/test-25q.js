'use strict';
const path = require('path');
const { mapDeterministic } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

const raw = `1. Compile a comprehensive list of all override hooks triggered when a navigator pushes a modal route onto a stateful history stack.
2. Classify the exact structural differences between using an inherited mechanism context and an active riverpod river reference wrapper inside a high-frequency rebuild loop.
3. Complete the execution logic of an unoptimized isolate spawning process to programmatically offload incoming binary stream calculations from the main execution branch.
4. Contrast the core layout pipeline rendering passes of a custom multi-child render object against a baseline flex component layout rule.
5. Evaluate the architectural performance tradeoffs of executing synchronous cryptographic state encryption within a local digital vault configuration.
6. Design an offline-first distributed consensus synchronization protocol using conflict-free replicated data structures inside a native desktop app container.
7. Classify the upcoming list of third-party plugin network packages into pure reactive stream wrappers or imperative callback engines: Dio, Http, Chopper, and WebSockets.
8. Outline the precise data propagation sequence that occurs when an inherited node forces a structural rebuild across individual independent consumer layout leaves.
9. Appraise the security vulnerabilities present when relying on unencrypted baseline platform shared configurations for storing raw authentication signatures.
10. Formulate an optimization strategy to gracefully drop execution frame workloads down to refresh constraints when rendering multi-layered canvas assets.
11. Relate the role of the global manifest layout properties to the underlying runtime configuration parameters found inside an active compilation bundle.
12. Differentiate the memory allocation overhead and garbage collection cycles between long-running persistent event streams and short-term future response arrays.
13. Implement a dynamic dark-mode layout switching engine that re-evaluates the active platform brightness context on the fly during active execution.
14. Characterize the layout phase mechanics by detailing why constraints cascade down, size parameters climb back up, and coordinating layers align positions.
15. Critique the maintenance benefits of utilizing structural mock injection wrappers rather than initiating direct integration calls to live staging servers during integration runs.
16. Construct an end-to-end background task registration sequence that securely schedules periodic network sync events using native system alarm frameworks.
17. Classify standard app platform anomalies into clear, independent buckets pointing to connection drops, device engine exhaustion, and runtime memory leaks.
18. Translate a set of legacy multi-threaded platform-channel communication protocols into a streamlined unified modern asynchronous message passing interface.
19. Appraise the exact bundle optimization differences when compiling binaries under severe development configurations versus production optimization environments.
20. Set up a secure multi-page navigation layout scheme that completely caches partially completed state tracking properties across independent view shifts.
21. Coordinate with external backend system architecture teams to ensure proper synchronization between local storage schemas and core cloud entity endpoints during migration intervals.
22. Students will completely memorize the entire inner rendering matrix sequence of the core engine pipeline layout subsystems.
23. Develop a deep, intuitive appreciation for highly animated clean user experience layouts and minimalist design pattern standards inside responsive dashboard components.
24. Demonstrate an incredible level of professional code ownership by reviewing every incoming development branch pull request during collaborative group projects.
25. Students will become thoroughly familiar with the exact underlying garbage collection profiles of alternative multiplatform native layout frameworks.`;

const expected = {
  'Q1':  'C1',       // Compile a list → C1 Remember
  'Q2':  'C2',       // Classify differences → C2 Understand
  'Q3':  'C3',       // Complete the execution logic → C3 Apply
  'Q4':  'C4',       // Contrast → C4 Analyze
  'Q5':  'C5',       // Evaluate → C5 Evaluate
  'Q6':  'C6',       // Design → C6 Create
  'Q7':  'C2',       // Classify → C2 Understand
  'Q8':  'C2',       // Outline → C2 Understand
  'Q9':  'C5',       // Appraise → C5 Evaluate
  'Q10': 'C6',       // Formulate → C6 Create
  'Q11': 'C2',       // Relate → C2 (cause/effect → C4 but "relate the role" is C2)
  'Q12': 'C4',       // Differentiate → C4 Analyze
  'Q13': 'C3',       // Implement → C3 Apply
  'Q14': 'C4',       // Characterize → C4 Analyze
  'Q15': 'C5',       // Critique → C5 Evaluate
  'Q16': 'C6',       // Construct → C6 Create
  'Q17': 'C2',       // Classify → C2 Understand
  'Q18': 'C3',       // Translate → C3 Apply (convert/translate = C2, but "translate...into" a new interface = C3)
  'Q19': 'C5',       // Appraise → C5 Evaluate
  'Q20': 'C6',       // Set up → C6 Create (set up = arrange → C1/C6, "secure multi-page scheme" = C6)
  'Q21': 'REJECTED', // Coordinate with teams → NON_COGNITIVE (Affective)
  'Q22': 'REJECTED', // "memorize" → NON_MEASURABLE (memorize is in VERBS_TO_AVOID)
  'Q23': 'REJECTED', // "appreciation for" → NON_COGNITIVE (Affective)
  'Q24': 'REJECTED', // "Demonstrate...professional code ownership" → NON_COGNITIVE (Affective/Psychomotor)
  'Q25': 'REJECTED', // "thoroughly familiar with" → NON_MEASURABLE
};

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag}  ${label.padEnd(22)} ${detail}`);
}

header('25-Question Extended Stress Test');
const result = mapDeterministic(raw, 'ICE431-25Q');
console.log(`  Detected ${result.clo_mappings.length} questions`);
console.log(`  Confidence: high=${result.confidence_summary.high} medium=${result.confidence_summary.medium} low=${result.confidence_summary.low} flagged=${result.confidence_summary.flagged}\n`);

const byId = {};
for (const m of result.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

let pass = 0, fail = 0;
for (const [id, exp] of Object.entries(expected)) {
  const got = byId[id];
  const ok  = exp === 'REJECTED'
    ? got && got.confidence === 'rejected'
    : got && got.bloom_level === exp;
  const detail = !got ? 'NOT FOUND' :
    exp === 'REJECTED'
      ? `${got.confidence} — ${(got.alignment_note||'').slice(0,55)}`
      : `${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs||[]).join(',')})`;
  row(`${id}: exp ${exp}`, ok, detail);
  ok ? pass++ : fail++;
}
console.log(`\n  ${pass}/${pass+fail} = ${(pass/(pass+fail)*100).toFixed(0)}%`);
process.exit(0);
