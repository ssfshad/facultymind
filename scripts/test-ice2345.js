/**
 * Test the deterministic mapper against the ICE2345 Digital Communication
 * exam paper Shad uploaded. Expected answer key is from the paper itself
 * (right-most column).
 */

'use strict';

const path = require('path');
const { mapDeterministic, splitQuestions } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

// This is approximately what the OCR will yield — table cells with CLO/Bloom
// metadata appended on each row, pipe characters from markdown rendering, etc.
const ocrText = `
Daffodil International University
Faculty of Engineering
Department of Information & Communication Engineering
Final Examination, Spring 2026
Course Code: ICE 2345 Course Title: Digital Communication
Level: 2 Term: 2 Batch: 242
Course Teacher: Abhirup Sarker (AS)
Time: 02:00 Hrs Marks: 40
[Answer any five questions.]

1. a) Define Radio Receiver. [1] CLO2 [C1,C3]
b) Illustrate the block diagram of Superhetrodyne Receiver & Straight Radio Receiver and state how they are different. [7]

2. a) Define Bit Rate and Baud Rate. [1] CLO3 [C1,C4]
b) Assume that a voice channel occupies a bandwidth of 4 kHz. We need to combine five voice channels into a link with a bandwidth of 20 kHz. Let the channel bandwidth be from 30 to 50 kHz. Assuming there are no guard bands, sketch and explain the configuration. [7]

3. a) Define Wavelength Division Multiplexing and Compare with Frequency Division Multiplexing. [4] CLO3 [C2,C5]
b) Four synchronous 2 kbps sources are multiplexed together. Unit of each data is 1 bit. Find, i. The duration of a single input bit ii. The duration of each output bit iii. The output frame rate iv. The transmission rate of the link [4]

4. a) Find the parity bits and prepare transmitted data for given data 1010. [4] CLO4 [C5]
b) Assume at the receiver end the data transmitted in 4(a) gets altered at 2nd bit. Show how hamming code finds the error. [4]

5. a) Find error for given problem: Received data- 100110 Divisor- x3+x+1 [4] CLO3 [C5,C2]
b) Define error and discuss its types with examples. [4]
`;

// Per-sub-question expected level (from the paper's CLO column).
// Where the paper assigns multiple levels per CLO row (e.g. CLO2 [C1,C3]),
// we treat it as: sub a takes the first level, sub b takes the second.
const expected = {
  'Q1(a)': 'C1',  // Define → C1
  'Q1(b)': 'C3',  // Illustrate diagram + state difference → C3 (our override) — paper says C3
  'Q2(a)': 'C1',  // Define → C1
  'Q2(b)': 'C4',  // sketch+explain configuration → C4 (our override sketch=C3, paper says C4)
  'Q3(a)': 'C2',  // Define + Compare → paper says C2
  'Q3(b)': 'C5',  // Find duration/rate (multi-step) → paper says C5 — actually our 'find' override picks C3
  'Q4(a)': 'C5',  // Find parity + prepare → paper says C5 (judgement on encoding) — our override picks C3
  'Q4(b)': 'C5',  // Show how hamming finds error — paper says C5 (verifying)
  'Q5(a)': 'C5',  // Find error for given problem — paper says C5
  'Q5(b)': 'C2',  // Define + discuss → paper says C2
};

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${tag}  ${label}${detail ? '  — ' + detail : ''}`);
}

header('ICE2345 — Splitter check (first)');
const qs = splitQuestions(ocrText);
console.log(`  Detected ${qs.length} questions`);
for (const q of qs) {
  console.log(`    ${q.id.padEnd(8)} ${q.text.slice(0, 80)}${q.text.length > 80 ? '…' : ''}`);
}

header('ICE2345 — Mapping accuracy');
const result = mapDeterministic(ocrText, 'ICE2345');
console.log(`  Confidence: high=${result.confidence_summary.high} medium=${result.confidence_summary.medium} low=${result.confidence_summary.low} flagged=${result.confidence_summary.flagged}`);
console.log('');

const byId = {};
for (const m of result.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

let pass = 0, fail = 0;
for (const id of Object.keys(expected)) {
  const got = byId[id];
  const exp = expected[id];
  const ok  = got && got.bloom_level === exp;
  row(`${id}: expected ${exp}`,
      ok,
      got ? `got ${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs || []).join(',')})` : 'NOT FOUND');
  ok ? pass++ : fail++;
}
console.log(`\n  Accuracy: ${pass}/${pass+fail} = ${((pass/(pass+fail))*100).toFixed(0)}%`);

process.exit(0);
