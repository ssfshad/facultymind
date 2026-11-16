'use strict';
// getApiKey: model -> keychain service mapping (B2, B3, B8)

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { getApiKey, needsKey, isUsable } = h.src('modules/ai/api-key');
const ks = (map) => ({ getKey: async (s) => map[s] || null });

describe('getApiKey', () => {
  test('B2: gpt4o uses the key saved as "openai"', async () => {
    assert.equal(await getApiKey(ks({ openai: 'sk-o' }), 'gpt4o'), 'sk-o');
  });

  test('B3: local model needs no key and is usable without one', async () => {
    assert.equal(needsKey('ollama'), false);
    assert.equal(await getApiKey(ks({ openai: 'sk-o' }), 'ollama'), null);
    assert.equal(isUsable('ollama', null), true);
  });

  test('cloud model without a key is not usable', async () => {
    assert.equal(isUsable('claude', await getApiKey(ks({}), 'claude')), false);
  });

  test('B8: never returns another provider\'s key', async () => {
    const store = ks({ openai: 'sk-o', gemini: 'g' });
    assert.equal(await getApiKey(store, 'claude'), null);
    assert.equal(await getApiKey(store, 'openrouter'), null);
  });

  test('keystore errors and a missing keystore give null', async () => {
    assert.equal(await getApiKey({ getKey: async () => { throw new Error('x'); } }, 'claude'), null);
    assert.equal(await getApiKey(null, 'claude'), null);
  });
});
