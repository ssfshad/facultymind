/**
 * Test the deterministic mapper against the ICE431 Mobile Application
 * Development paper (Md. Azizul Hakim).
 *
 * Models the OCR'd text — table rows tend to flatten into one long line,
 * with "[5]" marks brackets and CLO/Bloom annotations appearing inline.
 */

'use strict';

const path = require('path');
const { mapDeterministic, splitQuestions } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

// What Tesseract actually produces on this paper — table rows flattened, marks
// brackets inline, CLO+Bloom annotations packed at the end of each row.
const ocrText = `
Daffodil International University
Department of Information and Communication Engineering (ICE)
Faculty of Engineering
Final Examination, Fall-2025
Course Code: ICE 431 Course Title: Mobile Application Development
Level & Term: L4T2
Course Teacher: Md. Azizul Hakim (MAH)
Time: 2 hours Full Marks: 40
N.B: Answer all the questions. (Any one from question No.7)

1) You are reviewing a Flutter application that users report as slow, laggy, and occasionally unresponsive, especially when navigating between screens or scrolling through long lists. After profiling the app, you discover frequent widget rebuilds, large images loading inefficiently, and computational tasks blocking the UI thread. Break down the overall performance strategy you would use to evaluate these issues and determine the most effective optimizations to enhance rendering speed, responsiveness, and smoothness across the app. [5] CLO2 C4

2) GestureDetector plays a crucial role in Flutter applications by affecting the smoothness and responsiveness of user interactions. Break down how GestureDetector processes gestures such as taps, drags, and swipes, and explain the ways in which it improves the overall user experience. [5] CLO1 C4

3) Describe the ideal architecture for a large-scale Flutter application that includes modules such as user authentication, product listing, order history, dashboard analytics, personalized user notifications and ensure scalability, maintainability, and clean separation of concerns. [5] CLO3 C2

4) In a large-scale Flutter application handling sensitive user information, determine the essential components required to build a secure authentication flow. Your answer should focus on modern token-based authentication methods, secure storage practices, safe API communication, proper token refresh mechanisms, and the importance of avoiding hardcoded secrets. [5] CLO4 C2

5) You are building an AI-powered grocery companion app in Flutter. Your client now wants users to operate the app hands-free by issuing spoken instructions-such as searching for items, browsing categories, and adding products to the cart. Assess the most effective tools and techniques to integrate voice command functionality into your Flutter application, taking into account platform compatibility, performance, and overall user experience. [5] CLO3 C5

6) Design and develop a complete barcode scanning feature in Flutter that retrieves product data from an external API. Your solution should include camera integration, barcode recognition, API fetching, and display of results in a user-friendly interface. [5] CLO4 C6

7) a) Differentiate between stateful and stateless widget with proper examples. Or, b) Identify a use case of a StatefulWidget in your final Flutter project, and provide a relevant code template to demonstrate its implementation. [5] CLO2 C4
`;

// Expected per the paper's CLO column
const expected = {
  'Q1':    'C4',  // Break down + evaluate + determine — paper says C4
  'Q2':    'C4',  // Break down — C4
  'Q3':    'C2',  // Describe — C2
  'Q4':    'C2',  // determine — C2 per paper (could be C3)
  'Q5':    'C5',  // Assess — C5
  'Q6':    'C6',  // Design and develop — C6
  // Q7 has two parts joined by Or — we just check at least one of them
  'Q7(a)': 'C4',  // Differentiate — paper says C4
  'Q7(b)': 'C4',  // Identify + provide — paper says C4
};

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${tag}  ${label}${detail ? '  — ' + detail : ''}`);
}

header('ICE431 — Splitter check');
const qs = splitQuestions(ocrText);
console.log(`  Detected ${qs.length} questions`);
for (const q of qs) {
  console.log(`    ${q.id.padEnd(8)} ${q.text.slice(0, 90)}${q.text.length > 90 ? '…' : ''}`);
}

header('ICE431 — Mapping accuracy');
const result = mapDeterministic(ocrText, 'ICE431');
console.log(`  Confidence: high=${result.confidence_summary.high} medium=${result.confidence_summary.medium} low=${result.confidence_summary.low} flagged=${result.confidence_summary.flagged}`);
console.log(`  Level distribution: ${JSON.stringify(result.level_distribution)}`);
console.log('');

const byId = {};
for (const m of result.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

let pass = 0, fail = 0;
for (const id of Object.keys(expected)) {
  const got = byId[id];
  const exp = expected[id];
  const ok = got && got.bloom_level === exp;
  row(`${id}: expected ${exp}`,
      ok,
      got ? `got ${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs || []).join(',')})` : 'NOT FOUND');
  ok ? pass++ : fail++;
}
console.log(`\n  Accuracy: ${pass}/${pass+fail} = ${((pass/(pass+fail))*100).toFixed(0)}%`);

process.exit(0);
