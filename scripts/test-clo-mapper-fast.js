/**
 * Smoke test for clo-mapper-fast.js — validates against the ICE301 result
 * the user got back, and against the ICE2343 Digital Logic Design answer key.
 *
 * Run: node scripts/test-clo-mapper-fast.js
 */

'use strict';

const path = require('path');
const { mapDeterministic, splitQuestions } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));

function header(s) { console.log('\n' + '═'.repeat(70) + '\n  ' + s + '\n' + '═'.repeat(70)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✗ FAIL\x1b[0m';
  console.log(`  ${tag}  ${label}${detail ? '  — ' + detail : ''}`);
}

// ─── ICE301 sample (from the actual run output the user pasted earlier) ────
const ice301 = `
Q1(a) Explain the function of each bit in the TOCON register.
Q1(b) Briefly discuss the purpose of a prescaler in timer operations.
Q2(a) Design a circuit between a 16x2 LCD and a PIC18 microcontroller to display the message
Q2(b) Develop a C18 program to implement it
Q3(a) Describe the procedure to interface the sensor with the microcontroller
Q3(b) Explain the signal conditioning techniques required for accurate sensing
Q4 Describe the following, a. Electromechanical relays, b. Solid-state relays
Q5 Explain how Pulse Width Modulation (PWM) is used to control the speed of a DC motor with a suitable figure
`;

const ice301Expected = {
  'Q1(a)': 'C2',  // explain
  'Q1(b)': 'C2',  // discuss (default C2)
  'Q2(a)': 'C6',  // design
  'Q2(b)': 'C3',  // develop (no "design"/"new"/"original" cue, default C3)
  'Q3(a)': 'C2',  // describe
  'Q3(b)': 'C2',  // explain
  'Q4':    'C2',  // describe
  'Q5':    'C2',  // explain
};

// ─── ICE2343 Digital Logic Design (answer key from the printed paper) ───────
// Q1a/b: CLO4 [C2,C3]
// Q2a/b: CLO3 [C4,C6]
// Q3a:   CLO2 [C3]
// Q4a:   CLO3 [C6]
// Q5a/b: CLO3 [C1,C4]
// Q6a/b/c: CLO2,CLO3 [C2,C3]
//
// We don't have the paper text, so we use representative phrasing and just
// validate that the splitter handles Q1(a)/Q1(b) numbering and that level
// assignments come out roughly aligned.
const ice2343 = `
Q1(a) Explain the operation of a 4-bit synchronous counter using JK flip-flops.
Q1(b) Apply Boolean algebra to simplify F(A,B,C) = AB + A'B + BC.
Q2(a) Analyze the given combinational circuit and determine its output equation.
Q2(b) Design a 4-to-1 multiplexer using only NAND gates.
Q3(a) Implement a half-adder using XOR and AND gates and verify with truth table.
Q4(a) Construct a finite state machine that detects the binary sequence "1011".
Q5(a) Define the term "race-around condition" in flip-flops.
Q5(b) Categorize the different types of flip-flops based on their triggering mechanism.
Q6(a) Describe the working principle of a decoder.
Q6(b) Apply De Morgan's theorem to convert F = (A + B)(A + C) into NAND form.
Q6(c) Explain the difference between latch and flip-flop with an example.
`;

const ice2343Expected = {
  'Q1(a)': 'C2',  // explain
  'Q1(b)': 'C3',  // apply
  'Q2(a)': 'C4',  // analyze
  'Q2(b)': 'C6',  // design
  'Q3(a)': 'C3',  // implement (C3 only)
  'Q4(a)': 'C6',  // construct + "FSM that detects" → design cue
  'Q5(a)': 'C1',  // define
  'Q5(b)': 'C4',  // categorize → multiple levels, our rule picks C4 if not C1 cue
  'Q6(a)': 'C2',  // describe
  'Q6(b)': 'C3',  // apply
  'Q6(c)': 'C2',  // explain
};

function evaluate(label, raw, expected) {
  header(label);
  const result = mapDeterministic(raw, label);
  console.log(`  Detected ${result.clo_mappings.length} questions`);
  console.log(`  Confidence: high=${result.confidence_summary.high} medium=${result.confidence_summary.medium} low=${result.confidence_summary.low} flagged=${result.confidence_summary.flagged}`);
  console.log(`  Level distribution: ${JSON.stringify(result.level_distribution)}`);
  console.log('');

  let pass = 0, fail = 0;
  const byId = {};
  for (const m of result.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

  for (const id of Object.keys(expected)) {
    const got = byId[id];
    const exp = expected[id];
    const ok = got && got.bloom_level === exp;
    row(`${id}: expected ${exp}`,
      ok,
      got ? `got ${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs || []).join(',')})` : 'NOT FOUND');
    ok ? pass++ : fail++;
  }
  const acc = pass / (pass + fail);
  console.log(`\n  Accuracy: ${pass}/${pass+fail} = ${(acc*100).toFixed(0)}%`);
  return { pass, fail, total: pass + fail };
}

const r1 = evaluate('ICE301 Microcontroller Engineering', ice301, ice301Expected);
const r2 = evaluate('ICE2343 Digital Logic Design',         ice2343, ice2343Expected);

const totalPass = r1.pass + r2.pass;
const totalAll  = r1.total + r2.total;
header(`OVERALL: ${totalPass}/${totalAll} = ${(totalPass/totalAll*100).toFixed(0)}%  ${totalPass === totalAll ? '✓ ALL PASS' : ''}`);

process.exit(totalPass === totalAll ? 0 : 1);
