'use strict';
const path = require('path');
const { splitQuestions, mapDeterministic } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

const text = `Question 1 [5 Marks]
You are reviewing a Flutter application that users report as slow, laggy, and occasionally unresponsive, especially when navigating between screens or scrolling through long lists. After profiling the app, you discover frequent widget rebuilds, large images loading inefficiently, and computational tasks blocking the UI thread. Break down the overall performance strategy you would use to evaluate these issues and determine the most effective optimizations to enhance rendering speed, responsiveness, and smoothness across the app.

Question 2 [5 Marks]
GestureDetector plays a crucial role in Flutter applications by affecting the smoothness and responsiveness of user interactions. Break down how GestureDetector processes gestures such as taps, drags, and swipes, and explain the ways in which it improves the overall user experience.

Question 3 [5 Marks]
Describe the ideal architecture for a large-scale Flutter application that includes modules such as user authentication, product listing, order history, dashboard analytics, personalized user notifications and ensure scalability, maintainability, and clean separation of concerns.

Question 4 [5 Marks]
In a large-scale Flutter application handling sensitive user information, determine the essential components required to build a secure authentication flow. Your answer should focus on modern token-based authentication methods, secure storage practices, safe API communication, proper token refresh mechanisms, and the importance of avoiding hardcoded secrets.

Question 5 [5 Marks]
You are building an AI-powered grocery companion app in Flutter. Your client now wants users to operate the app hands-free by issuing spoken instructions-such as searching for items, browsing categories, and adding products to the cart. Assess the most effective tools and techniques to integrate voice command functionality into your Flutter application, taking into account platform compatibility, performance, and overall user experience.

Question 6 [5 Marks]
Design and develop a complete barcode scanning feature in Flutter that retrieves product data from an external API. Your solution should include camera integration, barcode recognition, API fetching, and display of results in a user-friendly interface.

Question 7 [5 Marks]
a) Differentiate between stateful and stateless widget with proper examples.
Or,
b) Identify a use case of a StatefulWidget in your final Flutter project, and provide a relevant code template to demonstrate its implementation.`;

const expected = {
  'Q1':    'C4',
  'Q2':    'C4',
  'Q3':    'C2',
  'Q4':    'C2',
  'Q5':    'C5',
  'Q6':    'C6',
  'Q7(a)': 'C4',
  'Q7(b)': 'C4',
};

console.log('\n── Splitter output ──');
const qs = splitQuestions(text);
console.log(`Detected ${qs.length} questions`);
for (const q of qs) {
  console.log(`  ${q.id.padEnd(8)} ${q.text.slice(0, 80)}${q.text.length > 80 ? '…' : ''}`);
}

console.log('\n── Mapping ──');
const result = mapDeterministic(text, 'ICE431-WORD');
const byId = {};
for (const m of result.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

let pass = 0, fail = 0;
for (const id of Object.keys(expected)) {
  const got = byId[id];
  const exp = expected[id];
  const ok  = got && got.bloom_level === exp;
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag} ${id}: expected ${exp}, got ${got ? got.bloom_level + ' (' + got.confidence + ', verb=' + (got.detected_verbs||[]).join(',') + ')' : 'NOT FOUND'}`);
  ok ? pass++ : fail++;
}
console.log(`\nAccuracy: ${pass}/${pass+fail} = ${(pass/(pass+fail)*100).toFixed(0)}%`);
