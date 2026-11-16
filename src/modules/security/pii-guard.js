/**
 * pii-guard.js — keep student identifiers out of cloud AI requests (BUG-S2)
 *
 * model-router.js runs every cloud-bound request (Claude, GPT-4o, Gemini,
 * OpenRouter) through a redactor; local Ollama calls are not redacted. The
 * decision is made per call, from the provider that call actually uses.
 *
 * What gets replaced, in every text the request carries (system prompt,
 * history, current message):
 *   - every known student's real name, student ID and enrollment number
 *     (decrypted from the local DB at request time), and each part of a
 *     name on its own ("Karim's marks" for Karim Hossain)
 *   - anything shaped like a DIU student ID (e.g. 201-15-1234)
 *   - a capitalised name written right after "student"/"named"/"name:"
 *     (catches students that aren't in the DB yet: "add student Karim Hossain")
 * Matching is whole-word and case-insensitive, and works for Bangla script.
 * Each value becomes a placeholder ([STUDENT_1], [SID_1], [ENR_1]) and the
 * response is mapped back locally. The mapping lives only for that request.
 *
 * Fail closed: if the student list can't be read or decrypted, knownIdentifiers()
 * throws and the cloud call is blocked (model-router sendCloud).
 *
 * Local-only policy helpers (isStudentDataText, looksLikeStudentTable,
 * isSpreadsheet) decide which requests must never go to a cloud model.
 */

const sc = require('./student-crypto');

const STORED_TOKEN = /^(?:Student_)?[SE]\d+$/;     // seed/anon tokens — not identifiers
const DIU_ID       = /\b\d{3}-\d{2}-\d{3,5}\b/g;
// Word characters for boundaries: letters, combining marks (Bangla vowel signs), digits
const WORD_CHAR    = String.raw`[\p{L}\p{M}\p{N}]`;
// Name words: Capitalised then lower-case (so course codes like ICE301/CLO1 aren't names)
const NAME_WORD    = String.raw`\p{Lu}\p{Ll}[\p{L}.'-]*(?![\p{L}\p{N}])`;
// No 'i' flag: with /iu, \p{Lu} would also match lower-case letters
// Same line only ([ \t], not \s): a heading or list item on the next line is not a name
const NAME_AFTER   = new RegExp(String.raw`\b(?:[Ss]tudents?|[Nn]amed|[Cc]alled|[Nn]ame[ \t]*(?::|is))[ \t]+((?:${NAME_WORD})(?:[ \t]+${NAME_WORD}){0,3})`, 'gu');
// Words that follow "student" but are not names
const NOT_NAMES    = new Set(['ID', 'IDs', 'Id', 'List', 'Data', 'Marks', 'Records', 'Record', 'Attendance', 'Name', 'Names', 'Report', 'Reports', 'Performance', 'Results', 'Result', 'Who', 'With', 'In', 'To', 'From', 'The', 'A', 'An', 'All', 'Each', 'Every', 'Of', 'And',
  'Professor', 'Prof', 'Sir', 'Madam', 'Dr', 'Mr', 'Mrs', 'Ms', 'Teacher', 'Lecturer', 'Faculty', 'Course', 'Courses',
  'Section', 'Batch', 'Can', 'Should', 'Must', 'Will', 'Has', 'Have', 'Is', 'Are', 'Was', 'Were']);
// Name parts too common or too short to stand alone as an identifier
const NAME_PART_SKIP = new Set(['md', 'md.', 'mohammad', 'mohammed', 'muhammad', 'mohd', 'mst', 'mst.', 'mosammat', 'most', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'dr', 'dr.', 'sk', 'sk.', 'abu', 'al', 'bin', 'binte', 'bint', 'and', 'the']);

let _dbSource = null;

/** Where to read students from (main.js passes () => dbHandle). */
function setDbSource(fn) { _dbSource = fn; }

function currentDb() {
  if (_dbSource) return _dbSource();
  try { return require('../../database/db').getDb(); } catch (_) { return null; }
}

class PiiGuardError extends Error {
  constructor(reason) {
    super(`Cloud AI call blocked: student names could not be checked (${reason}). Nothing was sent. Use the local AI (Ollama), or restore the student data key in Settings.`);
    this.code = 'PII_GUARD_BLOCKED';
  }
}

/**
 * Real identifiers of every student in the local DB: [{ value, kind }].
 * Throws PiiGuardError when the list can't be built completely (no DB,
 * query error, key missing, value that won't decrypt).
 */
function knownIdentifiers(db = currentDb()) {
  if (!db) throw new PiiGuardError('database not available');
  let rows;
  try { rows = db.prepare('SELECT name_enc, student_id_enc, enrollment_no_enc, name_anon, student_id_anon, enrollment_no_anon FROM students').all(); }
  catch (e) { throw new PiiGuardError(`could not read students: ${e.message}`); }
  const UNREADABLE = Symbol('unreadable');
  const out = [];
  const add = (v, kind) => {
    const s = v == null ? '' : String(v).trim();
    if (s.length >= 3 && !STORED_TOKEN.test(s)) out.push({ value: s, kind });
  };
  for (const r of rows) {
    const plain = (c) => {
      const v = r[c];
      if (v && sc.CIPHERTEXT.test(v)) {
        if (!sc.isReady()) throw new PiiGuardError('student data key not loaded');
        const p = sc.reveal(v, UNREADABLE);
        if (p === UNREADABLE) throw new PiiGuardError('a student record could not be decrypted');
        return p;
      }
      return sc.reveal(v, null);
    };
    const name = plain('name_enc');
    add(name, 'STUDENT');
    add(plain('student_id_enc'), 'SID');
    add(plain('enrollment_no_enc'), 'ENR');
    // pre-S1 form path stored real values in the *_anon columns
    add(r.name_anon, 'STUDENT'); add(r.student_id_anon, 'SID'); add(r.enrollment_no_anon, 'ENR');
    // each part of the name on its own: "Karim's marks"
    for (const n of [name, r.name_anon]) {
      if (!n || STORED_TOKEN.test(n)) continue;
      const parts = String(n).split(/\s+/);
      if (parts.length < 2) continue;
      for (const p of parts) {
        const w = p.replace(/[.,]+$/, '');
        if ([...w].length >= 3 && !NAME_PART_SKIP.has(w.toLowerCase())) add(w, 'STUDENT');
      }
    }
  }
  return out;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * A redactor for one request. redact() can be called on several strings; the
 * same value always gets the same placeholder. restore() maps placeholders in
 * the response back to the real values.
 */
function createRedactor({ db, identifiers } = {}) {
  const known = identifiers || knownIdentifiers(db);
  const toToken = new Map();          // lower-cased value → placeholder
  const toValue = new Map();          // placeholder → real value
  const counters = { STUDENT: 0, SID: 0, ENR: 0 };

  const tokenFor = (value, kind) => {
    const key = value.toLowerCase();
    if (!toToken.has(key)) {
      const t = `[${kind}_${++counters[kind]}]`;
      toToken.set(key, t);
      toValue.set(t, value);
    }
    return toToken.get(key);
  };

  // Longest first so "Karim Hossain" wins over "Karim"; duplicates dropped
  const seen = new Set();
  const patterns = [...known].sort((a, b) => b.value.length - a.value.length)
    .filter(({ value }) => !seen.has(value.toLowerCase()) && seen.add(value.toLowerCase()))
    .map(({ value, kind }) => ({ value, kind, re: new RegExp(`(?<!${WORD_CHAR})${escapeRe(value)}(?!${WORD_CHAR})`, 'giu') }));

  function redact(text) {
    if (typeof text !== 'string' || !text) return text;
    let out = text;
    for (const p of patterns) out = out.replace(p.re, () => tokenFor(p.value, p.kind));
    out = out.replace(DIU_ID, m => tokenFor(m, 'SID'));
    out = out.replace(NAME_AFTER, (m, name) => {
      const words = name.split(/[ \t]+/);
      while (words.length && NOT_NAMES.has(words[0])) words.shift();
      if (!words.length) return m;
      const real = words.join(' ');
      return m.slice(0, m.length - name.length) + name.replace(real, () => tokenFor(real, 'STUDENT'));
    });
    return out;
  }

  function restore(text) {
    if (typeof text !== 'string' || !toValue.size) return text;
    let out = text;
    for (const [t, v] of toValue) out = out.split(t).join(v);
    return out;
  }

  return { redact, restore, get size() { return toValue.size; } };
}

// ─── Local-only policy ────────────────────────────────────────────────────────

const STUDENT_DATA_WORDS = /\b(?:students?|marks?|attendance|absent|present|roll|ct\s?-?\d|class\s?tests?|quiz(?:zes)?|mid-?term|finals?|grades?|c?gpa|results?|enrol(?:l)?(?:ment)?s?|re-?sit|retake)\b/i;
const BANGLA_STUDENT_WORDS = /(?:ছাত্র|ছাত্রী|শিক্ষার্থী|নম্বর|উপস্থিতি|রোল|ফলাফল)/u;

/** Does a chat message deal with student records? (→ classify locally) */
function isStudentDataText(text, { db, identifiers } = {}) {
  const t = String(text || '');
  if (STUDENT_DATA_WORDS.test(t) || BANGLA_STUDENT_WORDS.test(t)) return true;
  DIU_ID.lastIndex = 0;
  if (DIU_ID.test(t)) { DIU_ID.lastIndex = 0; return true; }
  DIU_ID.lastIndex = 0;
  // Mentions a known student by name or ID
  try { const g = createRedactor({ db, identifiers }); g.redact(t); return g.size > 0; }
  catch (_) { return true; }   // can't check → treat as student data (fail closed)
}

const SPREADSHEET_EXT  = /\.(xlsx?|xlsm|xlsb|ods|csv|tsv)$/i;
const SPREADSHEET_MIME = /spreadsheet|ms-excel|text\/csv|tab-separated|opendocument\.spreadsheet/i;

function isSpreadsheet(mimeType, fileName) {
  return SPREADSHEET_MIME.test(mimeType || '') || SPREADSHEET_EXT.test(fileName || '');
}

/**
 * Tabular text with a name column and an ID/roll column, or many rows that
 * carry student-ID-shaped values → a roster or marks sheet.
 */
function looksLikeStudentTable(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const cells = (l) => l.split(/\t|,|;|\|/).map(c => c.trim().toLowerCase()).filter(Boolean);
  const header = lines.slice(0, 5).map(cells).find(c => c.length >= 2) || [];
  const hasName = header.some(c => /\bname\b|নাম/.test(c));
  const hasId   = header.some(c => /\b(?:id|roll|reg(?:istration)?|enrol(?:l)?ment|student\s*no)\b|আইডি|রোল/.test(c));
  if (hasName && hasId) return true;
  const idRows = lines.filter(l => /\b\d{3}-\d{2}-\d{3,5}\b/.test(l)).length;
  return idRows >= 3;
}

module.exports = {
  setDbSource, knownIdentifiers, createRedactor, PiiGuardError,
  isStudentDataText, looksLikeStudentTable, isSpreadsheet,
};
