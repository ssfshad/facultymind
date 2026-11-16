/**
 * keychain.js — keytar wrapper for OS credential storage
 * Windows: Credential Manager | macOS: Keychain
 *
 * Requires: keytar (native module — needs VS Build Tools on Windows)
 */

let keytar;
try {
  keytar = require('keytar');
} catch (e) {
  console.warn('[keychain] keytar not available. Install VS Build Tools then run npm install.');
  keytar = null;
}

const SERVICE_PREFIX = 'facultymind';

function serviceKey(service) {
  return `${SERVICE_PREFIX}_${service}`;
}

/**
 * Store an API key in the OS keychain.
 * @param {string} service - 'claude' | 'openai' | 'gemini'
 * @param {string} key     - The actual API key
 */
async function setKey(service, key) {
  if (!keytar) throw new Error('keytar not available — install VS Build Tools');
  await keytar.setPassword(serviceKey(service), service, key);
}

/**
 * Retrieve an API key from the OS keychain.
 * Returns null if not found.
 */
async function getKey(service) {
  if (!keytar) return null;
  return keytar.getPassword(serviceKey(service), service);
}

/**
 * Delete an API key from the OS keychain.
 */
async function deleteKey(service) {
  if (!keytar) return false;
  return keytar.deletePassword(serviceKey(service), service);
}

/**
 * Check if keytar is available on this system.
 */
function isAvailable() {
  return !!keytar;
}

module.exports = { setKey, getKey, deleteKey, isAvailable };
