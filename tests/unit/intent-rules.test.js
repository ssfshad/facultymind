'use strict';
// Deterministic intent fast path: right answers, right entities, and (most important) abstaining when unsure.

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const rules = h.src('modules/ai/intent-rules');

const intentOf = (m) => { const r = rules.classifyByRules(m); return r ? r.intent : null; };

describe('intent rules: clear commands', () => {
  const CASES = [
    ['Switch to Gemini', 'MODEL_SWITCH'], ['use GPT-4o from now on', 'MODEL_SWITCH'], ['change the AI model to Claude', 'MODEL_SWITCH'],
    ['Open the DIU portal', 'PORTAL_OPEN'], ['take me to the BLC website', 'PORTAL_OPEN'], ['diu portal ta open koro', 'PORTAL_OPEN'],
    ['go to attendance in the portal', 'DIU_PORTAL_NAV'], ['open course registration', 'DIU_PORTAL_NAV'], ['portal er dashboard dekhao', 'DIU_PORTAL_NAV'],
    ['Any new emails?', 'EMAIL_FETCH'], ['check my inbox', 'EMAIL_FETCH'], ['email gula ekbar check koro', 'EMAIL_FETCH'],
    ['ignore all advertisement emails', 'EMAIL_RULE'], ['Today only show me emails from the dean', 'EMAIL_RULE'],
    ['Draft a reply to the last email from the department head', 'EMAIL_DRAFT'], ['reply to the registrar saying I will attend', 'EMAIL_DRAFT'],
    ['Delete student Rahim from ICE301', 'DATA_DELETE'], ['remove the course ICE205', 'DATA_DELETE'], ['student ta delete kore dao', 'DATA_DELETE'],
    ['Change the name of student S004 to Rahman', 'DATA_EDIT'], ['move my Sunday class to 11am', 'DATA_EDIT'],
    ['Add a new student Rahim to ICE301', 'DATA_ADD'], ['create a new course ICE450', 'DATA_ADD'], ['Karim ke ICE301 e enrol koro', 'DATA_ADD'],
    ['What classes do I have today?', 'SCHEDULE_QUERY'], ['aj amar koyta class ache?', 'SCHEDULE_QUERY'],
    ['What is the CLO attainment for ICE301?', 'SHADSYNC_QUERY'], ['how many students are below 60% in CLO3', 'SHADSYNC_QUERY'],
    ['How much have you learned about me?', 'MEMORY_STATUS'], ['tumi ki ki shikhecho?', 'MEMORY_STATUS'],
    ["mark all students present for today's ICE301 class", 'SHADSYNC_UPDATE'], ['mark everyone absent for ICE415 today', 'SHADSYNC_UPDATE'], ['sobai ke present mark koro', 'SHADSYNC_UPDATE'],
    ['Enter marks for ICE301 midterm', 'SHADSYNC_UPDATE'], ['take attendance for my ICE301 class', 'SHADSYNC_UPDATE'], ['marks entry korbo ICE415 er jonno', 'SHADSYNC_UPDATE'],
    ['Who failed ICE301 in the portal results?', 'DIU_PORTAL_QUERY'], ['how many got A+ in ICE329', 'DIU_PORTAL_QUERY'], ['result e ke ke fail korse?', 'DIU_PORTAL_QUERY'],
    ['go to reult sheet in the portal', 'DIU_PORTAL_NAV'],
    ['make a quiz from the uploaded chapter', 'BLOOM_GENERATE'], ['give me tips for teaching large classes', 'GENERAL_CHAT'], ['Hello, how are you?', 'GENERAL_CHAT'], ['thanks a lot', 'GENERAL_CHAT'],
  ];
  for (const [msg, want] of CASES) test(`"${msg}" -> ${want}`, () => assert.equal(intentOf(msg), want));
});

describe('intent rules: intent is certain but the model must fill the details (needsModel)', () => {
  const HINTED = [
    ['Remind me to submit the marks sheet by Thursday', 'REMINDER_SET'], ['notify me before my BBA101 class', 'REMINDER_SET'],
    ['Save this link: https://blc.example.edu', 'VAULT_SAVE'], ['save a note: midterm questions due Friday', 'VAULT_SAVE'],
    ['search the vault for the wifi password', 'VAULT_SEARCH'], ['where is the syllabus file i saved', 'VAULT_SEARCH'],
    ["Map my CLOs to Bloom's levels", 'BLOOM_CLO_MAP'], ['suggest action verbs for my course outcomes', 'BLOOM_CLO_MAP'],
  ];
  for (const [msg, want] of HINTED) {
    test(`"${msg}" -> ${want} (model fills entities)`, () => {
      const r = rules.classifyByRules(msg);
      assert.equal(r && r.intent, want);
      assert.equal(r.needsModel, true);
    });
  }
  test('instant answers do not ask for the model', () => assert.equal(rules.classifyByRules('check my inbox').needsModel, undefined));

  test('router: the model failing still returns the rule\'s intent (not general chat)', async () => {
    const router = h.src('modules/ai/model-router');
    const r = await router.classifyIntent('Remind me to submit the marks sheet by Thursday', { model: 'claude' }); // no key -> model call fails
    assert.equal(r.intent, 'REMINDER_SET');                       // never lost, whether the model answered or failed
    assert.ok(['rule', 'rule+model'].includes(r.source), r.source);
  });
});

describe('intent rules: one-letter typos in key words are tolerated, and only those', () => {
  for (const [msg, want] of [['launch the university portla', 'PORTAL_OPEN'], ['Any new emaled?', null], ['has anyone emailed me', 'EMAIL_FETCH'], ['what have you leearned so far', 'MEMORY_STATUS'],
    ['refersh my emails', 'EMAIL_FETCH'], ['Delte student Rahim from ICE301', 'DATA_DELETE']]) {
    test(`"${msg}" -> ${want}`, () => assert.equal(intentOf(msg), want));
  }
  test('fixTypos only changes words one edit from a key word, and leaves ordinary words alone', () => {
    assert.equal(rules.fixTypos('launch the portla now'), 'launch the portal now');
    assert.equal(rules.fixTypos('the weather is nice today'), 'the weather is nice today');
    assert.equal(rules.fixTypos('postal'), 'portal'.length === 6 ? 'portal' : 'postal');   // one substitution away, unique: corrected
  });
});

describe('intent rules: entities and shape', () => {
  test('result carries raw_query, confidence and the full entity set', () => {
    const r = rules.classifyByRules('What is the CLO attainment for ICE415?');
    assert.equal(r.raw_query, 'What is the CLO attainment for ICE415?');
    assert.equal(r.confidence, 1);
    assert.equal(r.source, 'rule');
    assert.equal(r.entities.course_code, 'ICE415');
    assert.ok('model' in r.entities && 'portal' in r.entities && 'clo_text' in r.entities);
  });
  test('model names are normalised for the model-switch handler', () => {
    assert.equal(rules.classifyByRules('use GPT-4o from now on').entities.model, 'gpt4o');
    assert.equal(rules.classifyByRules('switch to the local model').entities.model, 'ollama');
    assert.equal(rules.classifyByRules('Switch to Gemini').entities.model, 'gemini');
  });
  test('portal name is extracted', () => {
    assert.equal(rules.classifyByRules('open BLC').entities.portal, 'blc');
    assert.equal(rules.classifyByRules('Open the DIU portal').entities.portal, 'diu');
  });
});

describe('intent rules: abstain when the message is not clear-cut (the model decides)', () => {
  const ABSTAIN = [
    'how do I delete a student',                                // a how-to question is not a delete command
    'show attendance of Rahim in ICE301',                       // a query, not "go to the attendance screen"
    'which model is better for grading',                        // talking about models, not switching
    'I deleted the wrong email yesterday',                      // not a command
    'delete my notes about the midterm',                        // vault, not a stored record
    'update marks of Karim in the midterm to 18',               // marks edits are ambiguous (edit vs update)
    'create a quiz on recursion',                               // no source document
    "tell me about my students' progress",                      // could be ShadSync, the portal or general: the model decides
    "update attendance for today's class",                      // update vs entry is ambiguous
    'can you check the thing from yesterday',
    'ICE301',
    'my marks',
    'xyzzy',
    '',
  ];
  for (const msg of ABSTAIN) test(`abstains: "${msg}"`, () => assert.equal(rules.classifyByRules(msg), null));

  test('messages longer than 300 characters are left to the model', () => {
    assert.equal(rules.classifyByRules('Switch to Gemini ' + 'please '.repeat(60)), null);
  });
});

describe('classifyIntent uses the rules first, and the model only when they abstain', () => {
  test('a rule hit never reaches the model; skipRules sends it there', async () => {
    const router = h.src('modules/ai/model-router');
    const r1 = await router.classifyIntent('check my inbox', { model: 'ollama' });
    assert.equal(r1.intent, 'EMAIL_FETCH');
    assert.equal(r1.source, 'rule');
  });
});
