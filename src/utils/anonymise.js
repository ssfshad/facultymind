/**
 * anonymise.js — Re-export for convenience
 * All anonymisation logic lives in security/encryption.js
 * Import from here inside modules so they don't depend on security paths directly.
 */
const { anonymise, reAssociate } = require('../modules/security/encryption');
module.exports = { anonymise, reAssociate };
