'use strict';
const path = require('path');
const { mapDeterministic, splitQuestions } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

const raw = `Question 1 [5 Marks] [CLO2, C4]You are reviewing a Flutter application that users report as slow, laggy, and occasionally unresponsive, especially when navigating between screens or scrolling through long lists. After profiling the app, you discover frequent widget rebuilds, large images loading inefficiently, and computational tasks blocking the UI thread. Break down the overall performance strategy you would use to evaluate these issues and determine the most effective optimizations to enhance rendering speed, responsiveness, and smoothness across the app.Question 2 [5 Marks] [CLO1, C4]GestureDetector plays a crucial role in Flutter applications by affecting the smoothness and responsiveness of user interactions. Break down how GestureDetector processes gestures such as taps, drags, and swipes, and explain the ways in which it improves the overall user experience.Question 3 [5 Marks] [CLO3, C2]Describe the ideal architecture for a large-scale Flutter application that includes modules such as user authentication, product listing, order history, dashboard analytics, personalized user notifications and ensure scalability, maintainability, and clean separation of concerns.Question 4 [5 Marks] [CLO4, C2]In a large-scale Flutter application handling sensitive user information, determine the essential components required to build a secure authentication flow. Your answer should focus on modern token-based authentication methods, secure storage practices, safe API communication, proper token refresh mechanisms, and the importance of avoiding hardcoded secrets.Question 5 [5 Marks] [CLO3, C5]You are building an AI-powered grocery companion app in Flutter. Your client now wants users to operate the app hands-free by issuing spoken instructions-such as searching for items, browsing categories, and adding products to the cart. Assess the most effective tools and techniques to integrate voice command functionality into your Flutter application, taking into account platform compatibility, performance, and overall user experience.Question 6 [5 Marks] [CLO4, C6]Design and develop a complete barcode scanning feature in Flutter that retrieves product data from an external API. Your solution should include camera integration, barcode recognition, API fetching, and display of results in a user-friendly interface.Question 7 [5 Marks] [CLO2, C4]a) Differentiate between stateful and stateless widget with proper examples.Or, b) Identify a use case of a StatefulWidget in your final Flutter project, and provide a relevant code template to demonstrate its implementation.`;

const expected = {
  'Q1':    'C4',  // Break down → analyze
  'Q2':    'C4',  // Break down → analyze
  'Q3':    'C2',  // Describe
  'Q4':    'C2',  // determine essential components
  'Q5':    'C5',  // Assess
  'Q6':    'C6',  // Design
  'Q7(a)': 'C4',  // Differentiate
  'Q7(b)': 'C4',  // Identify use case
};

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag}  ${label.padEnd(22)} ${detail}`);
}

header('Splitter output');
const qs = splitQuestions(raw);
console.log(`  Detected ${qs.length} questions`);
for (const q of qs) console.log(`    ${q.id.padEnd(8)} ${q.text.slice(0, 90)}`);

header('Mapping accuracy');
const result = mapDeterministic(raw, 'ICE431');
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
