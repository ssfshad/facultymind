/**
 * portable-config.js — AES-256 encrypted fallback for API key storage
 *
 * Used when OS keychain (keytar) is unavailable — e.g., pendrive/portable mode.
 * Keys are stored in: [userData]/portable.enc
 * Encrypted with the user's PIN-derived key.
 */

const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const { app } = require('electron');

const ALGO = 'aes-256-gcm';
let _key = null;
let _portableModeEnabled = false;

function getEncPath() {
  return path.join(app.getPath('userData'), 'portable.enc');
}

function setPortableMode(enabled, pin) {
  _portableModeEnabled = enabled;
  if (enabled && pin) {
    _key = crypto.pbkdf2Sync(pin, 'portable-config-salt', 310_000, 32, 'sha256');
  }
}

function isEnabled() {
  return _portableModeEnabled;
}

function _loadConfig() {
  const encPath = getEncPath();
  if (!fs.existsSync(encPath)) return {};
  if (!_key) throw new Error('Portable mode key not set');

  const raw  = fs.readFileSync(encPath, 'utf8');
  const [ivHex, tagHex, encHex] = raw.split(':');
  const dec  = crypto.createDecipheriv(ALGO, _key, Buffer.from(ivHex, 'hex'));
  dec.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([dec.update(Buffer.from(encHex, 'hex')), dec.final()]).toString('utf8');
  return JSON.parse(plain);
}

function _saveConfig(config) {
  if (!_key) throw new Error('Portable mode key not set');
  const iv      = crypto.randomBytes(12);
  const cipher  = crypto.createCipheriv(ALGO, _key, iv);
  const enc     = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  const tag     = cipher.getAuthTag();
  fs.writeFileSync(getEncPath(), `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`);
}

function setKey(service, key) {
  const config = _loadConfig();
  config[service] = key;
  _saveConfig(config);
}

function getKey(service) {
  try {
    const config = _loadConfig();
    return config[service] || null;
  } catch (_) { return null; }
}

function deleteKey(service) {
  const config = _loadConfig();
  delete config[service];
  _saveConfig(config);
}

module.exports = { setPortableMode, isEnabled, setKey, getKey, deleteKey };
