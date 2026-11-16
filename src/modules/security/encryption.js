/**
 * encryption.js — AES-256 field-level encryption + student anonymisation
 *
 * anonymise()    — replace real student names/IDs with tokens before AI calls
 * reAssociate()  — map tokens back to real identifiers after AI response
 * encryptField() / decryptField() — AES-256-GCM for sensitive field storage
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

// No default key (BUG-S3): callers pass the per-install key from
// student-crypto.js. The old hard-coded vault key lives only in the vault
// migration there, to re-encrypt pre-S3 rows.

function keyBuffer(key) {
  if (!key) throw new Error('Encryption key required');
  return Buffer.isBuffer(key) ? key : Buffer.from(key, 'hex');
}

// ─── Field Encryption ─────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * @param {string} plaintext
 * @param {Buffer|string} key - 32-byte key (hex or Buffer)
 * @returns {string} - "iv:authTag:ciphertext" (all hex)
 */
function encryptField(plaintext, key) {
  const keyBuf = keyBuffer(key);
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuf, iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext ?? ''), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypt a field encrypted by encryptField().
 * @param {string} ciphertext - "iv:authTag:ciphertext"
 * @param {Buffer|string} key
 * @returns {string}
 */
function decryptField(ciphertext, key) {
  const keyBuf  = keyBuffer(key);
  const [ivHex, tagHex, encHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(ALGO, keyBuf, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

// ─── Student Anonymisation ────────────────────────────────────────────────────

/**
 * Replace real student names and IDs with anonymous tokens.
 *
 * Input:  [{ id, name, student_id, enrollment_no, ...marks }]
 * Output: { anonymised: [...], mapping: Map<token, realData> }
 *
 * The mapping is kept IN MEMORY only — never persisted or sent to any API.
 */
function anonymise(students) {
  const mapping = new Map(); // token → { name, student_id, enrollment_no }

  const anonymised = students.map((s, i) => {
    const token = `S${String(i + 1).padStart(3, '0')}`; // S001, S002...
    mapping.set(token, {
      name:          s.name,
      student_id:    s.student_id,
      enrollment_no: s.enrollment_no,
      db_id:         s.id,
    });
    return {
      ...s,
      name:          `Student_${token}`,
      student_id:    token,
      enrollment_no: `E${String(i + 1).padStart(3, '0')}`,
    };
  });

  return { anonymised, mapping };
}

/**
 * After an AI response, replace any anonymous tokens back to real identifiers.
 *
 * @param {string} aiResponseText
 * @param {Map} mapping - from anonymise()
 * @returns {string} - response with real names/IDs restored
 */
function reAssociate(aiResponseText, mapping) {
  let result = aiResponseText;
  for (const [token, real] of mapping.entries()) {
    // Replace token references: S001, Student_S001, E001
    const eToken = `E${token.slice(1)}`; // S001 → E001
    // Function replacers: a name like "Mr. $& Rahman" is inserted literally (BUG-R1)
    result = result
      .replace(new RegExp(`Student_${token}`, 'g'), () => real.name)
      .replace(new RegExp(`\\b${token}\\b`, 'g'), () => real.student_id)
      .replace(new RegExp(`\\b${eToken}\\b`, 'g'), () => real.enrollment_no);
  }
  return result;
}

module.exports = { encryptField, decryptField, anonymise, reAssociate };
