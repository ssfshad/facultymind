'use strict';
// Bloom's CLO mapper (deterministic engine) + Syllabus Mapper: core behaviour and bad inputs

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const fast = h.src('modules/blooms/clo-mapper-fast');
const syl  = h.src('modules/blooms/syllabus-mapper');

const PAPER = `Q1. Define the term encapsulation. [5 Marks]
Q2. Explain how inheritance supports code reuse. [5 Marks]
Q3. Implement a Java class hierarchy for a library system. [10 Marks]
Q4. Compare abstract classes and interfaces. [5 Marks]
Q5. Evaluate the singleton pattern for a logging service. [5 Marks]
Q6. Design a plugin architecture for a text editor. [10 Marks]`;

describe('clo-mapper-fast: core', () => {
  test('splits a numbered paper into one entry per question', () => {
    assert.equal(fast.splitQuestions(PAPER).length, 6);
  });

  test('maps canonical verbs to the expected Bloom level', () => {
    const { db } = h.freshDb();
    const r = fast.mapDeterministic(PAPER, 'ICE301', db);
    const levels = r.clo_mappings.map(m => m.bloom_level);
    assert.deepEqual(levels, ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
  });

  test('flags non-measurable outcomes as REJECTED', () => {
    const r = fast.mapDeterministic('1. Students will develop a deep appreciation for clean design.', 'X', null);
    const m = r.clo_mappings[0];
    assert.ok(m && /REJECTED/.test(JSON.stringify(m)), JSON.stringify(m));
  });
});

describe('clo-mapper-fast: bad inputs never throw', () => {
  const nasty = {
    empty: '', whitespace: '   \n\t  ', null: null, undefined: undefined,
    numbersOnly: '1. 2. 3. 4.', unicode: '১. বাইনারি সংখ্যা ব্যাখ্যা কর।', emoji: 'Q1. 🔥🔥 Explain 🔥',
    html: '<script>alert(1)</script> Q1. Define <b>RAM</b>',
    huge: Array.from({ length: 2000 }, (_, i) => `Q${i + 1}. Explain concept number ${i}.`).join('\n'),
    noNewlines: 'Q1. Define X. Q2. Explain Y. Q3. Design Z.',
    regexy: 'Q1. Explain (a+)+$ and [a-z]* patterns.',
  };
  for (const [name, input] of Object.entries(nasty)) {
    test(`input: ${name}`, () => {
      const t0 = Date.now();
      const r = fast.mapDeterministic(input, 'X', null);
      assert.ok(r && Array.isArray(r.clo_mappings));
      assert.ok(Date.now() - t0 < 5000, 'should finish in < 5 s');
    });
  }
});

describe('syllabus mapper', () => {
  const COS = `CO1: Explain the fundamentals of circuit analysis.
CO2: Gain experience with laboratory equipment.
CO3: Design analog filters for given specifications.`;
  const WEEKS = `Week 1: Introduction to Ohm's law and Kirchhoff's laws
Week 2: Mesh and nodal analysis of resistive circuits
Week 3: Design of RC and RLC filters with frequency response`;

  test('manual input extracts COs and weeks', async () => {
    const r = await syl.analyzeManualInput(COS, WEEKS);
    assert.equal(r.summary.totalCOs, 3);
    assert.equal(r.summary.totalWeeks, 3);
  });

  test('flags the non-measurable verb "gain experience"', async () => {
    const r = await syl.analyzeManualInput(COS, WEEKS);
    const co2 = r.alignmentGaps.find(g => g.co === 'CO2');
    assert.ok(co2, JSON.stringify(r.alignmentGaps.map(g => [g.co, g.gap_type])));
    assert.equal(co2.gap_type, 'NON_MEASURABLE_VERB');
  });

  for (const [name, cos, weeks] of [['empty', '', ''], ['garbage', '%%%%', '####'], ['only COs', COS, '']]) {
    test(`bad input (${name}) → EXTRACTION_FAILED, no throw`, async () => {
      const r = await syl.analyzeManualInput(cos, weeks);
      assert.equal(r.summary.overallHealth, 'EXTRACTION_FAILED');
    });
  }

  test('BUG-SY1: short but valid CO statements (< 25 chars) are silently dropped', { todo: 'BUG-SY1 length cutoff' }, () => {
    const cos = syl.extractCourseOutcomes('CO1: Analyze DC circuits.\nCO2: Design filters for a given specification.');
    assert.deepEqual(cos.map(c => c.code), ['CO1', 'CO2']);
  });

  test('BUG-X1: without converter.exe (installed app), text PDFs skip pdf-parse and go to OCR', async () => {
    const fs = require('fs'), path = require('path');
    const stub = (rel, exports) => { const p = require.resolve(path.join(h.ROOT, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
    stub('src/modules/blooms/markitdown-extractor', { isAvailable: () => false, extractWithMarkItDown: async () => { throw new Error('absent'); } });
    stub('src/modules/blooms/ocr-engine', { recognizePdfBuffer: async () => { throw new Error('OCR was invoked for a text-layer PDF'); } });
    const bePath = require.resolve(path.join(h.ROOT, 'src/modules/blooms/blooms-engine'));
    delete require.cache[bePath];
    const be = require(bePath);
    const pdf = fs.readFileSync(path.join(h.ROOT, 'assets/samples/blooms/level5-complex.pdf'));
    const text = await be.extractText(pdf, 'application/pdf', () => {});
    assert.ok(text.length > 100);
  });

  test('HARDEN-1: null input throws (unreachable from the UI today — renderer always sends strings)', { todo: 'HARDEN-1 low' }, async () => {
    const r = await syl.analyzeManualInput(null, null);
    assert.equal(r.summary.overallHealth, 'EXTRACTION_FAILED');
  });
});

describe('splitQuestions: real-paper layouts and OCR quirks', () => {
  const ids = (t) => fast.splitQuestions(t).map(q => q.id);

  test('zero-padded numbers (01. 02.) become Q1 Q2', () => {
    const t = '01. Find the resultant of the displacement.\n   a. Graphically\n   b. Analytically\n02. Find whether these four vectors can form a parallelogram.';
    assert.deepEqual(ids(t), ['Q1(a)', 'Q1(b)', 'Q2']);
  });

  test('"Question-1:" header with typo and a)/b) lines underneath', () => {
    const t = 'Question-1:\na) List the four pillars of object oriented programming. (9)\nb) Apply Kirchhoff voltage law to the circuit. (2)\nQuestrion-2:\na) Explain the scheduler in detail. (4)';
    assert.deepEqual(ids(t), ['Q1(a)', 'Q1(b)', 'Q2(a)']);
  });

  test('a bare question number alone on its own line', () => {
    const t = '1\na. Design a class hierarchy for a library system.\nb. Differentiate compile time and run time polymorphism.\n2\na. Write a program to reverse a string.';
    assert.deepEqual(ids(t), ['Q1(a)', 'Q1(b)', 'Q2(a)']);
  });

  test('OCR reads "Q.1" as "Q.I" (capital I): still question 1', () => {
    const t = 'Q.I A team is working on a project to develop a new bridge in an urban area. Describe the steps you would take.';
    assert.deepEqual(ids(t), ['Q1']);
  });

  test('"Question 3" inside an N.B. line is not a question', () => {
    const t = 'N.B: Answer all the questions (Only any one from Question 3)\nQ1. Define encapsulation and explain why it matters.\nQ2. Explain the difference between an interface and an abstract class.';
    assert.deepEqual(ids(t), ['Q1', 'Q2']);
  });

  test('no marker at all: page headers are skipped and wrapped lines are joined', () => {
    const t = 'Daffodil International University\nDepartment of Information Engineering\nDescribe the steps a project manager would take to prioritise risks and\nmanage them effectively over the project timeline.';
    const out = fast.splitQuestions(t);
    assert.equal(out.length, 1);
    assert.ok(out[0].text.includes('manage them effectively'));
  });
});
