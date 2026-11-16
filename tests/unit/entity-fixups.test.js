'use strict';
// Deterministic repairs for entities a small local model often drops: reminder time and vault password.

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fixEntities, parseWhen } = h.src('modules/ai/entity-fixups');

const NOW = new Date(2026, 10, 11, 10, 30);   // Wed 11 Nov 2026 10:30 local

describe('entity fixups: reminder time', () => {
  const CASES = [
    ['remind me to call the dean tomorrow', '2026-11-12T09:00:00'],
    ["don't let me forget to email the dean about the lab budget tomorrow", '2026-11-12T09:00:00'],
    ['remind me tomorrow morning to print the papers', '2026-11-12T09:00:00'],
    ['ajke 3tay amake meeting er kotha mone koriye dio', '2026-11-11T15:00:00'],
    ['kal 10tay reminder dao', '2026-11-12T10:00:00'],
    ['remind me on Friday at 2pm to submit grades', '2026-11-13T14:00:00'],
    ['remnid me to submmit grades on friday', '2026-11-13T09:00:00'],
    ['remind me at 4pm to review scripts', '2026-11-11T16:00:00'],
    ['remind me at 9am to start the lab', '2026-11-12T09:00:00'],        // 9am has passed today: next day
    ['remind me on Wednesday to renew the lab license', '2026-11-18T09:00:00'],
    ['remind me tonight to upload marks', '2026-11-11T20:00:00'],
    ['remind me tomorrow at 3:30pm about the viva', '2026-11-12T15:30:00'],
  ];
  for (const [msg, want] of CASES) test(`"${msg}" -> ${want}`, () => assert.equal(parseWhen(msg, NOW), want));

  test('no day or time cue -> null', () => assert.equal(parseWhen('remind me to breathe', NOW), null));
  test('keeps a datetime the model already produced', () => {
    const e = fixEntities('REMINDER_SET', 'remind me tomorrow', { datetime: '2026-12-01T08:00:00' }, NOW);
    assert.equal(e.datetime, '2026-12-01T08:00:00');
  });
  test('fills a missing datetime', () => {
    const e = fixEntities('REMINDER_SET', 'remind me tomorrow to call the dean', { reminder_text: 'call the dean', datetime: null }, NOW);
    assert.equal(e.datetime, '2026-11-12T09:00:00');
    assert.equal(e.reminder_text, 'call the dean');
  });
  test('only touches reminders', () => {
    const e = fixEntities('GENERAL_CHAT', 'what is the plan for tomorrow', {}, NOW);
    assert.equal(e.datetime, undefined);
  });
});

describe('entity fixups: vault password', () => {
  const CASES = [
    ['store my lab wifi password hunter42 in the vault', 'hunter42'],
    ['store my wifi password in the vault, it is Tiger2026', 'Tiger2026'],
    ['save my router login in the vault: user admin password Blue77', 'Blue77'],
    ['save password: Zx9!kLm for the portal', 'Zx9!kLm'],
    ['keep my gmail password is Abc12345 safe', 'Abc12345'],
  ];
  for (const [msg, want] of CASES) test(`"${msg}" -> ${want}`, () => {
    const e = fixEntities('VAULT_SAVE', msg, { content: msg }, NOW);
    assert.equal(e.password, want);
  });

  test('model value that swallowed words is replaced', () => {
    const e = fixEntities('VAULT_SAVE', 'save my router login in the vault: user admin password Blue77', { password: 'admin password Blue77' }, NOW);
    assert.equal(e.password, 'Blue77');
  });
  test('keeps a clean model value', () => {
    const e = fixEntities('VAULT_SAVE', 'save password Blue77 in the vault', { password: 'Blue77' }, NOW);
    assert.equal(e.password, 'Blue77');
  });
  test('no value given -> no password invented', () => {
    const e = fixEntities('VAULT_SAVE', 'save my wifi password in the vault', { content: 'wifi password' }, NOW);
    assert.equal(e.password, undefined);
  });
  test('only touches VAULT_SAVE', () => {
    const e = fixEntities('VAULT_SEARCH', 'find my wifi password hunter42', { query: 'wifi password' }, NOW);
    assert.equal(e.password, undefined);
  });
});
