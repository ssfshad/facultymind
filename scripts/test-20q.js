'use strict';
const path = require('path');
const { mapDeterministic } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

const raw = `1. State the purpose of the hot-reload feature in Flutter and describe how it interacts with the widget tree state during active development.
2. Classify the differences between a stateless layout lifecycle and a stateful widget initialization sequence.
3. Implement an custom explicit animation controller to rotate a vector asset continuously through 360 degrees of coordinate space.
4. Contrast the layout boundaries and rendering performance of a standard ListView against a ListView.builder when processing ten thousand dataset entries.
5. Appraise the security vulnerabilities of utilizing insecure public HTTP endpoints instead of encrypted HTTPS connections for backend API communication.
6. Design a scalable application folder structure that segregates data repositories, business logic blocks, and UI presentation layers.
7. Classify the following state management architectures into reactive or imperative categories: Provider, BLoC, Riverpod, and vanilla setState.
8. Describe how the InheritedWidget propagates state changes down the element tree to individual consumer nodes.
9. Appraise the performance impact of performing heavy JSON string parsing operations on the main UI thread versus offloading them to a background Isolate task.
10. Design a responsive grid layout configuration that dynamically adjusts its column count when navigating between mobile and desktop viewport dimensions.
11. State the precise role of the pubspec.yaml file inside a workspace ecosystem.
12. Contrast the operational mechanisms of a deep link versus a standard deferred navigation route when handling external user acquisition entries.
13. Implement a dark mode theme toggle system that alters the global application brightness context dynamically.
14. Analyze the geometric layout constraints pass by explaining why constraints go down, sizes go up, and parent positions cells.
15. Appraise the structural benefits of unit testing business logic components using mock data engines instead of hitting live production databases.
16. Design an automated notification registration sequence that secures a unique device token from the Firebase Cloud Messaging gateway.
17. Classify standard error handling exceptions into distinct categories matching network dropouts, storage failures, and runtime null pointer issues.
18. Describe the essential configuration parameters required to initialize a local key-value encrypted storage box on a device.
19. Appraise the differences between compiling an application in debug mode versus release mode regarding asset optimization and runtime speed.
20. Design a multi-step user onboarding form structure that tracks and caches half-completed state information across multiple screen transitions.`;

const expected = {
  'Q1':  'C1', 'Q2':  'C2', 'Q3':  'C3', 'Q4':  'C4',
  'Q5':  'C5', 'Q6':  'C6', 'Q7':  'C2', 'Q8':  'C2',
  'Q9':  'C5', 'Q10': 'C6', 'Q11': 'C1', 'Q12': 'C4',
  'Q13': 'C3', 'Q14': 'C4', 'Q15': 'C5', 'Q16': 'C6',
  'Q17': 'C2', 'Q18': 'C2', 'Q19': 'C5', 'Q20': 'C6',
};

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag}  ${label.padEnd(20)} ${detail}`);
}

header('20-Question Flutter Exam');
const result = mapDeterministic(raw, 'ICE431-20Q');
console.log(`  Detected ${result.clo_mappings.length} questions`);
console.log(`  Confidence: high=${result.confidence_summary.high} medium=${result.confidence_summary.medium} low=${result.confidence_summary.low} flagged=${result.confidence_summary.flagged}\n`);

const byId = {};
for (const m of result.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

let pass = 0, fail = 0;
for (const [id, exp] of Object.entries(expected)) {
  const got = byId[id];
  const ok  = got && got.bloom_level === exp;
  row(`${id}: exp ${exp}`, ok,
    got ? `got ${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs||[]).join(',')})` : 'NOT FOUND');
  ok ? pass++ : fail++;
}
console.log(`\n  ${pass}/${pass+fail} = ${(pass/(pass+fail)*100).toFixed(0)}%`);
process.exit(0);
