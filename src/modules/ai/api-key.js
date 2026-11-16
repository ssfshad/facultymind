'use strict';
// One place that answers "which key does this model use?".
// Fixes B2 (gpt4o looked up under the wrong service), B3 (local model needs no key)
// and B8 (never borrow another provider's key).

// model id -> keychain service(s), in lookup order. null = no key needed (local).
const MODEL_SERVICES = {
  claude:     ['claude', 'anthropic'],
  gpt4o:      ['openai', 'gpt4o'],
  gemini:     ['gemini'],
  openrouter: ['openrouter'],
  ollama:     null,
};

function needsKey(model) {
  return MODEL_SERVICES[model] !== null;
}

/** True when the model can be used with the given key (local models always can). */
function isUsable(model, key) {
  return !needsKey(model) || !!key;
}

/**
 * Key for `model` from `keystore` (keychain or portable-config), or null.
 * Local models return null because they need none; callers must use needsKey()
 * / isUsable() to tell "no key needed" apart from "key missing".
 */
async function getApiKey(keystore, model) {
  const services = MODEL_SERVICES[model];
  if (!services || !keystore) return null;
  for (const s of services) {
    try {
      const k = await Promise.resolve(keystore.getKey(s));
      if (k) return k;
    } catch (_) {}
  }
  return null;
}

module.exports = { MODEL_SERVICES, needsKey, isUsable, getApiKey };
