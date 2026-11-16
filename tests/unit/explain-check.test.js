'use strict';
// Fact-check for AI explanations of weak CLOs: every number must exist in the data, every weak CLO must be covered.

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { checkExplanation, failingClos, numbersIn } = h.src('modules/shadsync/explain-check');
const scenarios = require('../../eval/data/explain-scenarios.json');

const S1 = scenarios.find(s => s.id === 'exp-1-one-weak-midterm');   // CLO2 weak: avg 52.3, 17 of 31 below, Midterm 41.5%
const S3 = scenarios.find(s => s.id === 'exp-3-none-weak');
const S4 = scenarios.find(s => s.id === 'exp-4-borderline-share');   // CLO2 avg 61.8 but 15 of 31 (48%) below -> weak

const good = {
  summary: 'Only CLO2 needs attention.',
  clos: [{ code: 'CLO2', why: 'The average of 52.3 is 7.7 points under the threshold of 60, and 17 of 31 students (54.8%) are below it. The Midterm averaged 41.5%.',
           actions: ['Add a short revision quiz on the midterm topics before the exam.', 'Rewrite the midterm so it matches the CLO verbs.'] }],
};

describe('failing CLO rule', () => {
  test('weak = average under threshold, or more than 40% of graded students under it', () => {
    assert.deepEqual(failingClos(S1).map(c => c.code), ['CLO2']);
    assert.deepEqual(failingClos(S4).map(c => c.code), ['CLO2'], '61.8 is above 60 but 15/31 = 48% are below');
    assert.deepEqual(failingClos(S3).map(c => c.code), []);
  });
});

describe('checkExplanation', () => {
  test('a correct explanation passes, including derived numbers (gap to threshold, share below)', () => {
    const r = checkExplanation(S1, good);
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  test('accepts the reply as JSON text, and JSON inside surrounding prose', () => {
    assert.equal(checkExplanation(S1, JSON.stringify(good)).ok, true);
    assert.equal(checkExplanation(S1, `Here you go:\n${JSON.stringify(good)}\nHope that helps.`).ok, true);
  });

  test('a made-up number is caught', () => {
    const bad = JSON.parse(JSON.stringify(good)); bad.clos[0].why = 'The average of 47.9 is well under the threshold of 60.';
    const r = checkExplanation(S1, bad);
    assert.equal(r.ok, false);
    assert.deepEqual(r.unsupported, ['47.9']);
  });

  test('a made-up percentage is caught even when it is small', () => {
    const bad = JSON.parse(JSON.stringify(good)); bad.summary = 'Only CLO2 needs attention; 3% of students dropped out.';
    assert.deepEqual(checkExplanation(S1, bad).unsupported, ['3%']);
  });

  test('identifiers (CLO2, ICE415, years) are not mistaken for data', () => {
    assert.deepEqual(numbersIn('CLO2 in ICE415 for 2026 averaged 52.3%').map(n => n.value), [52.3]);
  });

  test('a missing weak CLO is caught', () => {
    const r = checkExplanation(S1, { summary: 'Fine.', clos: [] });
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, ['CLO2']);
  });

  test('explaining a CLO that is not weak is caught', () => {
    const extra = JSON.parse(JSON.stringify(good)); extra.clos.push({ code: 'CLO1', why: 'CLO1 is fine.', actions: ['Keep doing what you are doing now.'] });
    const r = checkExplanation(S1, extra);
    assert.equal(r.ok, false);
    assert.deepEqual(r.extra, ['CLO1']);
  });

  test('a CLO that is not in the data is caught', () => {
    const bad = JSON.parse(JSON.stringify(good)); bad.summary = 'CLO9 also needs a look.';
    assert.deepEqual(checkExplanation(S1, bad).mentionedUnknownClo, ['CLO9']);
  });

  test('no weak CLO: an empty list is the right answer', () => {
    assert.equal(checkExplanation(S3, { summary: 'No CLO is below the threshold of 60.', clos: [] }).ok, true);
  });

  test('every weak CLO needs at least one real action', () => {
    const bad = JSON.parse(JSON.stringify(good)); bad.clos[0].actions = [];
    assert.equal(checkExplanation(S1, bad).actionsOk, false);
  });

  test('invalid JSON fails and says all weak CLOs are missing', () => {
    const r = checkExplanation(S1, '{"summary": "x", "clos": [{"code": "CLO2"}}]}');
    assert.equal(r.jsonValid, false);
    assert.deepEqual(r.missing, ['CLO2']);
  });
});
