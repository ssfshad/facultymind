/**
 * clo-mapper-fast.js — FacultyMind ShadSync OBE Engine
 *                      Deterministic CLO → Bloom's Taxonomy Mapper
 *
 * RUNTIME EXECUTION PIPELINE (authoritative spec — do not deviate)
 * ═══════════════════════════════════════════════════════════════════
 *
 * STATE 0 — SANITIZATION & LAYOUT CLEANING
 *   Strip leading metadata: "Question N", "CLO-N", "[N Marks]"
 *   Trim whitespace. Empty string → immediate REJECT.
 *
 * STATE 1 — PRE-VALIDATION FILTER (Measurability & Domain Guardrails)
 *   1a. MEASURABILITY CHECKER
 *       Scan for unmeasurable state-of-mind phrases from VERBS_TO_AVOID
 *       + UNMEASURABLE_PHRASES list. If found → REJECTED (NON_MEASURABLE).
 *   1b. CORE DOMAIN GATEKEEPER
 *       Scan for behavioral coordination, affective engagement, or fine
 *       motor execution (AFFECTIVE_INDICATORS + PSYCHOMOTOR_INDICATORS).
 *       If found → REJECTED (NON_COGNITIVE).
 *   Domain check runs BEFORE measurability so "Collaborate...demonstrate
 *   appreciation" gets the correct NON_COGNITIVE label.
 *
 * STATE 2 — TOKEN EXTRACTION & ALIGNMENT
 *   1. MULTI-WORD PHRASE HIGHEST PRIORITY
 *      Check PHRASE_VERBS table first ("set up" → C6, "break down" → C4).
 *      Once matched, terminate search. Do not read downstream tokens.
 *   2. CASE-INSENSITIVE FIRST-TOKEN COMMAND MATCHING
 *      Scan sentence-by-sentence. First sentence that starts with a
 *      dictionary verb is the command sentence. Take its verb.
 *      Scenario sentences ("You are reviewing...") are skipped.
 *   3. FALLBACK
 *      If no imperative sentence found, take the first dictionary verb
 *      anywhere in the question text.
 *
 * STATE 3 — ANTI-DISTRACTION NOUN DECOUPLING
 *   Cognitive level is determined SOLELY by the root command verb.
 *   Technical nouns ("riverpod notifier", "CRDT engine", "widget tree")
 *   do NOT influence the level. Once the leading verb is identified,
 *   its classification stands absolute.
 *
 * OUTPUT SCHEMA (per question)
 *   { status, blooms_level, matched_verb, confidence }
 *   status: "ACCEPTED" | "REJECTED (NON_MEASURABLE)" | "REJECTED (NON_COGNITIVE)"
 *
 * This module never calls any AI. It is 100% deterministic and offline.
 * The LLM is only invoked downstream for genuinely low-confidence residue
 * (typically 0 questions on well-formed exam papers).
 */

'use strict';

const { BLOOMS_VERBS, BLOOMS_NAMES, VERBS_TO_AVOID } = require('../../prompts/templates/blooms-verbs');

// ── Verb index (built once at module load) ────────────────────────────────────
// Map of base-form verb → array of Bloom's levels it appears in.
//   "apply"   → ['C3']
//   "compare" → ['C4', 'C5']
//   "select"  → ['C1', 'C2', 'C4', 'C5']
const VERB_INDEX = (() => {
  const idx = {};
  for (const level of Object.keys(BLOOMS_VERBS)) {
    for (const verb of BLOOMS_VERBS[level]) {
      const v = verb.toLowerCase();
      if (!idx[v]) idx[v] = [];
      if (!idx[v].includes(level)) idx[v].push(level);
    }
  }
  return idx;
})();

// Avoid-set for O(1) check (single-word entries)
const AVOID_SET = new Set(VERBS_TO_AVOID.map(v => v.toLowerCase()));

// ── STEP 0: PRE-VALIDATION GATE ──────────────────────────────────────────────
// Before any Bloom's mapping, every objective must pass two absolute checks:
//
//   CHECK A — MEASURABILITY:
//     Scan for phrases that describe unmeasurable states of mind.
//     These are explicitly banned by Bloom's best practices.
//     Source: VERBS_TO_AVOID in blooms-verbs.js + extended multi-word phrases.
//     Output: { valid: false, reason: 'NON_MEASURABLE', phrase }
//
//   CHECK B — COGNITIVE DOMAIN:
//     Bloom's C1–C6 covers only the COGNITIVE domain.
//     Affective domain (values, attitudes, collaboration, appreciation) and
//     Psychomotor domain (fine motor, physical execution, asset polishing)
//     must be rejected — they cannot be mapped to C1–C6.
//     Output: { valid: false, reason: 'NON_COGNITIVE', domain, indicator }
//
// If both checks pass: { valid: true }
// Callers must check valid === false and surface the rejection to the user
// instead of attempting a C1–C6 mapping.

// Multi-word unmeasurable phrases not caught by single-word AVOID_SET
const UNMEASURABLE_PHRASES = [
  'develop a familiarity', 'develop familiarity', 'develop a deep familiarity',
  'develop an understanding', 'develop understanding',
  'develop an appreciation', 'develop appreciation',
  'develop a knowledge', 'develop knowledge of',
  'gain familiarity', 'gain an understanding', 'gain appreciation',
  'build familiarity', 'build an understanding',
  'become familiar', 'become acquainted',
  'be familiar with', 'be acquainted with',
  'be aware of', 'be knowledgeable about',
  'have an understanding', 'have knowledge of',
  'appreciation for', 'awareness of', 'understanding of',
  'knowledge of', 'familiarity with', 'acquainted with',
  'familiar with',
  'thoroughly familiar', 'intuitively familiar', 'deeply familiar',
  'intuitive understanding', 'develop an intuitive',
  'completely memorize', 'memorize the entire', 'memorize all',
  'interested in', 'interest in', 'enjoyment of',
  'capable of', 'comprehension of', 'cognizant of',
];

// Affective domain indicators — interpersonal, emotional, values-based actions
// that belong to Krathwohl's Affective Taxonomy, not Bloom's Cognitive.
const AFFECTIVE_INDICATORS = [
  { pattern: /\bcollaborate\b/i,                    domain: 'Affective', note: 'interpersonal coordination' },
  { pattern: /\bcoordinate\s+with\b/i,              domain: 'Affective', note: 'interpersonal coordination' },
  { pattern: /\bcooperate\b/i,                      domain: 'Affective', note: 'interpersonal coordination' },
  { pattern: /\bappreciate\b/i,                     domain: 'Affective', note: 'values/attitude' },
  { pattern: /\binternalize\b/i,                    domain: 'Affective', note: 'values internalization' },
  { pattern: /\bvalue\b.{0,30}\bteam\b/i,           domain: 'Affective', note: 'team values' },
  { pattern: /\bembrace\b.{0,30}\b(team|culture|diversity)\b/i, domain: 'Affective', note: 'cultural attitude' },
  { pattern: /\bshow\s+(?:an?\s+)?appreciation\b/i, domain: 'Affective', note: 'appreciation (affective)' },
  { pattern: /\bdevelop\s+(?:a\s+)?(?:deep\s+)?(?:sense\s+of|appreciation\s+for|respect\s+for)\b/i, domain: 'Affective', note: 'affective growth' },
  { pattern: /\balign\b.{0,40}\b(team|peer|stakeholder|collaborat)\b/i, domain: 'Affective', note: 'team alignment' },
  { pattern: /\bengag[ei]\b.{0,30}\b(peer|team|stakeholder)\b/i,        domain: 'Affective', note: 'peer engagement' },
];

// Psychomotor domain indicators — physical execution, fine motor, asset manipulation
const PSYCHOMOTOR_INDICATORS = [
  { pattern: /\bpolish(?:ing)?\b.{0,40}\b(animation|asset|ui|visual|graphic)\b/i, domain: 'Psychomotor', note: 'fine motor / asset execution' },
  { pattern: /\bmanipulate\b.{0,30}\b(asset|animation|sprite|texture)\b/i,        domain: 'Psychomotor', note: 'physical asset manipulation' },
  { pattern: /\bdemonstrate\b.{0,40}\b(appreciation|aesthetic|interpersonal)\b/i, domain: 'Psychomotor/Affective', note: 'non-cognitive demonstration' },
  { pattern: /\bdemonstrate\b.{0,50}\b(ownership|professionalism|leadership|attitude|commitment|responsibility)\b/i, domain: 'Affective', note: 'professional attitude (affective)' },
];

/**
 * Pre-validation gate — run BEFORE any Bloom's mapping.
 * @param {string} text  — the raw objective / question text
 * @returns {{ valid: boolean, reason?: string, detail?: string }}
 */
function validateObjective(text) {
  const t = text.toLowerCase();

  // ── Check B first: non-cognitive domain ──────────────────────────────
  // Domain check runs BEFORE measurability so "Collaborate...demonstrate
  // appreciation" gets labelled NON_COGNITIVE, not NON_MEASURABLE.
  for (const ind of AFFECTIVE_INDICATORS) {
    if (ind.pattern.test(text)) {
      return {
        valid:  false,
        reason: 'NON_COGNITIVE',
        detail: `Objective belongs to the Affective domain (${ind.note}), not Bloom's Cognitive C1–C6. Rewrite with a cognitive action verb.`,
      };
    }
  }
  for (const ind of PSYCHOMOTOR_INDICATORS) {
    if (ind.pattern.test(text)) {
      return {
        valid:  false,
        reason: 'NON_COGNITIVE',
        detail: `Objective belongs to the Psychomotor domain (${ind.note}), not Bloom's Cognitive C1–C6. Rewrite with a cognitive action verb.`,
      };
    }
  }

  // ── Check A: unmeasurable phrases ────────────────────────────────────
  for (const phrase of UNMEASURABLE_PHRASES) {
    if (t.includes(phrase.toLowerCase())) {
      return {
        valid:  false,
        reason: 'NON_MEASURABLE',
        detail: `Contains non-measurable phrase: "${phrase}". Rewrite using a measurable action verb (e.g. "explain", "apply", "analyze").`,
      };
    }
  }
  for (const phrase of VERBS_TO_AVOID) {
    if (phrase.includes(' ') && t.includes(phrase.toLowerCase())) {
      return {
        valid:  false,
        reason: 'NON_MEASURABLE',
        detail: `Contains non-measurable phrase: "${phrase}". Rewrite using a measurable action verb.`,
      };
    }
  }

  return { valid: true };
}

// ── Tiny morphology — strip common English suffixes to reach base form ───────
// Not perfect, but covers 99% of textbook verb forms. We deliberately avoid
// shipping a full lemmatiser (heavy, async, and not needed for verb matching).
function toBaseForm(word) {
  let w = word.toLowerCase().replace(/[^a-z\-]/g, '');
  if (!w) return '';

  // Direct match wins
  if (VERB_INDEX[w]) return w;

  // Common irregulars we care about
  const IRREG = {
    'wrote': 'write', 'written': 'write',
    'drew': 'draw', 'drawn': 'draw',
    'told': 'tell',
    'built': 'build',
    'chose': 'choose', 'chosen': 'choose',
    'gave': 'give',
    'made': 'make',
    'shown': 'show', 'showed': 'show',
    'taught': 'teach',
    'thought': 'think',  // in VERBS_TO_AVOID — that's fine
  };
  if (IRREG[w]) return IRREG[w];

  // Suffix stripping — try most specific first
  const trials = [];
  if (w.endsWith('ies'))  trials.push(w.slice(0, -3) + 'y');     // applies → apply
  if (w.endsWith('ied'))  trials.push(w.slice(0, -3) + 'y');     // applied → apply
  if (w.endsWith('ying')) trials.push(w.slice(0, -4) + 'y');     // applying → apply
  if (w.endsWith('ing'))  trials.push(w.slice(0, -3));           // building → build
  if (w.endsWith('ing'))  trials.push(w.slice(0, -3) + 'e');     // writing → write
  if (w.endsWith('ed'))   trials.push(w.slice(0, -2));           // analyzed → analyze (close)
  if (w.endsWith('ed'))   trials.push(w.slice(0, -1));           // → analyze (with 'e' kept)
  if (w.endsWith('ed'))   trials.push(w.slice(0, -2) + 'e');     // → analyze
  if (w.endsWith('s'))    trials.push(w.slice(0, -1));           // applies (handled), develops → develop
  if (w.endsWith('es'))   trials.push(w.slice(0, -2));           // analyzes → analyze
  if (w.endsWith('ses'))  trials.push(w.slice(0, -2));

  for (const t of trials) {
    if (VERB_INDEX[t]) return t;
  }
  return w; // unknown — return as-is, caller will treat as unresolved
}

// ── Question splitter ────────────────────────────────────────────────────────
// Split raw exam text (often OCR-noisy) into a list of individual questions.
//
// Strategy:
//   Pass 1 — find main question boundaries (1., 2., Q1, Question 1) at the
//            start of a line OR after sentence punctuation. Use offsets so
//            we can capture each main's body exactly.
//   Pass 2 — within each main's body, find sub-letter parts (a), b), c.).
//            Re-split into Q1(a), Q1(b) etc.
//   Pre-pass — strip exam metadata (CLO labels, [4] marks, |) so they don't
//            confuse the markers.
function splitQuestions(rawText) {
  if (!rawText) return [];

  // ── 0. OCR artifact normalization ─────────────────────────────────────
  // Fix specific, confirmed OCR errors before any splitting or verb matching.
  // Rules are conservative — only fix patterns we've seen in real DIU scans.
  // Do NOT use broad character-swap rules (they corrupt valid words).
  let rawNorm = String(rawText)
    // Strip Bangla/non-ASCII blocks that confuse the tokenizer (Fix 7)
    .replace(/[\u0980-\u09FF]+/g, ' ')
    // Spaced question number: "Q 1" → "Q1" (Fix 7)
    .replace(/\bQ\s+(\d{1,2})\b/g, 'Q$1')
    // Fix split spaces inside specific known verbs (OCR line-wrap artifacts)
    .replace(/\bAnaly\s+ze\b/gi, 'Analyze')
    .replace(/\bEval\s+uate\b/gi, 'Evaluate')
    .replace(/\bDes\s+ign\b/gi, 'Design')
    .replace(/\bIm\s+plement\b/gi, 'Implement')
    .replace(/\bCon\s+trast\b/gi, 'Contrast')
    .replace(/\bClas\s+sify\b/gi, 'Classify')
    .replace(/\bDif\s+ferentiate\b/gi, 'Differentiate')
    .replace(/\bCon\s+struct\b/gi, 'Construct')
    .replace(/\bFor\s+mulate\b/gi, 'Formulate')
    .replace(/\bCri\s+tique\b/gi, 'Critique')
    .replace(/\bDes\s+cribe\b/gi, 'Describe')
    .replace(/\bDis\s+cuss\b/gi, 'Discuss')
    .replace(/\bCom\s+pare\b/gi, 'Compare')
    .replace(/\bAp\s+praise\b/gi, 'Appraise')
    // Fix capital I misread as lowercase l — only for specific known verbs
    .replace(/\blmplement\b/g, 'Implement')
    .replace(/\blllustrate\b/g, 'Illustrate')
    .replace(/\blnstall\b/g, 'Install')
    .replace(/\blntegrate\b/g, 'Integrate')
    .replace(/\blnvestigate\b/g, 'Investigate')
    .replace(/\blnfer\b/g, 'Infer')
    .replace(/\blnterpret\b/g, 'Interpret')
    .replace(/\blnspect\b/g, 'Inspect')
    // "rn" misread as "m" in common Bloom's verbs (Fix 7)
    .replace(/\blnform\b/g, 'Inform')
    .replace(/\blnstruct\b/g, 'Instruct')
    .replace(/\bExam\s+ine\b/gi, 'Examine')
    .replace(/\bSurn\s+marise\b/gi, 'Summarise');

  // ── 1. Normalize whitespace and table junk ────────────────────────────
  let text = String(rawNorm)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/\|/g, ' ')                      // markdown / OCR table pipes
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  // ── 2. Strip exam-paper metadata and normalize question boundaries ──────
  // Step A: strip marks indicators and CLO annotations in all known formats
  text = text
    .replace(/\[\s*\d+\s*[Mm]arks?\s*\]/g, ' ')                      // "[5 Marks]" / "[10 marks]"
    .replace(/\(\s*\d+\s*[Mm]arks?\s*\)/g, ' ')                      // "(5 Marks)"
    .replace(/CLO\s*\d+\s*\[\s*C\d+(?:\s*,\s*C\d+)*\s*\]/gi, ' ')   // "CLO2 [C1,C3]"
    .replace(/\[CLO\s*\d+\s*,\s*C\d+\]/gi, ' ')                      // "[CLO2, C4]"
    .replace(/\bCLO[-\s]*\d+\b/gi, ' ')                              // "CLO3"
    .replace(/\[\s*C\d+(?:\s*,\s*C\d+)*\s*\]/gi, ' ')                // "[C1,C3]"
    .replace(/\[\s*\d+\s*\]/g, ' ')                                  // "[4]"
    .replace(/\(\s*CO\s*\d+\s*\)/gi, ' ')                            // "(CO2)"
    .replace(/[ \t]+/g, ' ');

  // Step D (moved up): strip N.B. / Note: lines first. They are instructions, not questions,
  // and often mention "Question 3" ("Only any one from Question 3"), which Step B would
  // otherwise break onto its own line and mistake for a question marker.
  text = text.replace(/^n\.?b\.?:.*$/gim, '').replace(/^note:.*$/gim, '').trim();

  // Step B: insert a newline before every "Question N" marker so the splitter
  // can find them even when the entire paper is pasted as one long line.
  // This handles: "...across the app.Question 2 [5 Marks]GestureDetector..."
  text = text.replace(/(?<=[^\n])(Question\s+\d{1,2}\b)/gi, '\n$1');

  // Step C: re-normalize whitespace after all substitutions
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();


  // ── 3. Pass 1: find main question markers ─────────────────────────────
  // Two styles are accepted, and we run two regexes then merge:
  //   Style Q: "Q1", "Q1(a)", "Q.1", "Question 1", "Q1." — flexible after the digit
  //   Style N: "1.", "1)", "1.(a)" — bare numeric, must NOT be preceded by a
  //                                  letter or digit (so "step3" / "1.5" never match)
  //                                  but ANY non-alphanum boundary is OK — including
  //                                  "]" from "[5]" marks brackets in table rows.
  // Both capture: (1) main number, (2) optional inline sub-letter
  // The word may be "Q", "Question", "Ques", or a typo such as "Questrion"; the number may be
  // followed by ".", ")", ":" (e.g. "Question-1:", "Q.2", "Q3)").
  const Q_STYLE = /(?:^|[^A-Za-z0-9])Q(?:u[a-z]{2,9})?[-.\s]*(\d{1,2})(?:\s*\(([a-h])\))?\s*[.):]?\s+(?=[A-Za-z(])/gi;
  // N_STYLE: bare number must be at start of line (after optional whitespace).
  // This prevents "divisible by 5." from being treated as question marker "5."
  // Also accepts a bare number alone on its own line ("4") when text / a sub-part follows.
  const N_STYLE = /(?:^|\n)[ \t]*(\d{1,2})(?:[ \t]*\(([a-h])\))?(?:[ \t]*[.):][ \t]+(?=[A-Za-z(])|[ \t]*(?=\n[ \t]*[A-Za-z(])|[ \t]+(?=\(?[a-h][.)][ \t]+[A-Za-z])|[ \t]+(?=[A-Z][a-z]+[ \t]+\S+[ \t]+\S+))/g;
  // (last alternative: "3 Represent the number ..." - a number cell directly followed by a
  //  sentence of 3+ words, as in a table row with an empty sub-letter cell; "2 Hours" is not)

  const markers = [];
  let m;
  Q_STYLE.lastIndex = 0;
  while ((m = Q_STYLE.exec(text)) !== null) {
    markers.push({ idx: m.index, len: m[0].length, num: String(parseInt(m[1], 10)), sub: m[2] || null });
    if (Q_STYLE.lastIndex === m.index) Q_STYLE.lastIndex++;
  }
  N_STYLE.lastIndex = 0;
  while ((m = N_STYLE.exec(text)) !== null) {
    markers.push({ idx: m.index, len: m[0].length, num: String(parseInt(m[1], 10)), sub: m[2] || null });
    if (N_STYLE.lastIndex === m.index) N_STYLE.lastIndex++;
  }

  // OCR often reads the digit 1 as a capital I or lower-case l ("Q.I", "Q-l"). Accept that only with an
  // explicit "Q." / "Q-" prefix and a capitalised word after it, so ordinary text is not affected.
  const Q_OCR = /(?:^|[^A-Za-z0-9])Q[-.][ \t]*([Il])[.):]?[ \t]+(?=[A-Z])/g;
  Q_OCR.lastIndex = 0;
  while ((m = Q_OCR.exec(text)) !== null) {
    markers.push({ idx: m.index, len: m[0].length, num: '1', sub: null });
  }

  // Sort and de-dupe overlapping matches (Q-style and N-style can overlap)
  markers.sort((a, b) => a.idx - b.idx);
  const mains = [];
  for (const mk of markers) {
    const last = mains[mains.length - 1];
    if (last && mk.idx < last.idx + last.len) continue; // overlap → skip
    mains.push({
      num:       mk.num,
      sub:       mk.sub,                    // inline sub-letter (e.g. Q1(a))
      bodyStart: mk.idx + mk.len,
    });
  }

  // Compute each main's body slice — from end-of-marker to start of next marker
  for (let i = 0; i < mains.length; i++) {
    const start = mains[i].bodyStart;
    const end   = (i + 1 < mains.length) ? findMarkerStart(text, mains[i + 1]) : text.length;
    mains[i].body = text.slice(start, end).trim();
  }

  // Helper: from a main's bodyStart, walk back to find where its marker began.
  function findMarkerStart(t, mainObj) {
    let i = mainObj.bodyStart - 1;
    // Skip back through: optional whitespace, then optional .),
    // then optional (sub-letter), then optional . or ), then digits,
    // then optional "Q" or full word "Question"
    while (i > 0 && /\s/.test(t[i])) i--;
    if (t[i] === '.' || t[i] === ')') i--;
    if (t[i] === ')') {
      i--;
      while (i > 0 && /[a-h]/i.test(t[i])) i--;
      if (t[i] === '(') i--;
    }
    while (i > 0 && /\s/.test(t[i])) i--;
    if (t[i] === '.' || t[i] === ')') i--;
    while (i > 0 && /\d/.test(t[i])) i--;
    while (i > 0 && /\s/.test(t[i])) i--;
    // Walk back through "Question" or "Q" (case-insensitive)
    if (/[nN]/.test(t[i])) {
      // Possibly end of "Question" — walk back the whole word
      const wordStart = Math.max(0, i - 7);
      const candidate = t.slice(wordStart, i + 1).toLowerCase();
      if (candidate.endsWith('question')) i = wordStart - 1;
      else if (/[qQ]/.test(t[i])) i--;
    } else if (/[qQ]/.test(t[i])) {
      i--;
    }
    return Math.max(0, i + 1);
  }

  // ── 4. Pass 2: split each main body into sub-letter parts ─────────────
  // Skip pass-2 if the main already had an inline sub-letter (Q1(a)) — then
  // its body is already a single sub-question.
  // Sub-marker patterns include the typical "(a)" / "a)" but also "Or, b)"
  // which is common in DIU papers when offering an alternative sub-question.
  const SUB_RE = /(?:^|[\n\r.;]|\bOr,?\s*)\s*\(?([a-h])\)?[.)]\s+(?=[A-Za-z])/gi;

  const out = [];
  for (const main of mains) {
    if (!main.body || main.body.length < 5) continue;

    // Inline sub from the marker (Q1(a)) — emit as single sub-question
    if (main.sub) {
      out.push({
        id:    `Q${main.num}(${main.sub.toLowerCase()})`,
        text:  main.body.replace(/\s+/g, ' ').trim(),
        marks: null,
      });
      continue;
    }

    SUB_RE.lastIndex = 0;
    const subs = [];
    let s;
    while ((s = SUB_RE.exec(main.body)) !== null) {
      subs.push({
        letter:    s[1].toLowerCase(),
        bodyStart: s.index + s[0].length,
      });
      if (SUB_RE.lastIndex === s.index) SUB_RE.lastIndex++;
    }
    for (let i = 0; i < subs.length; i++) {
      const start = subs[i].bodyStart;
      let end;
      if (i + 1 < subs.length) {
        let j = subs[i + 1].bodyStart - 1;
        while (j > 0 && /\s/.test(main.body[j])) j--;
        if (main.body[j] === '.' || main.body[j] === ')') j--;
        if (/[a-h]/i.test(main.body[j])) j--;
        if (main.body[j] === '(') j--;
        end = Math.max(start, j + 1);
      } else {
        end = main.body.length;
      }
      subs[i].body = main.body.slice(start, end).trim();
    }

    if (subs.length > 0) {
      for (const sub of subs) {
        if (sub.body.length >= 5) {
          out.push({
            id:    `Q${main.num}(${sub.letter})`,
            text:  sub.body.replace(/\s+/g, ' ').trim(),
            marks: null,
          });
        }
      }
    } else {
      out.push({
        id:    `Q${main.num}`,
        text:  main.body.replace(/\s+/g, ' ').trim(),
        marks: null,
      });
    }
  }

  if (out.length > 0) return out;

  // ── 5. Fallback: line-based split if no markers were detected ─────────
  // Page-header / instruction lines are not questions; a line that starts in lower case continues the
  // previous line (OCR output wraps one sentence over several lines).
  const HEADER_LINE = /\b(university|department|faculty|course\s+(code|title|teacher)|section|semester|level\s*&|full\s+marks|total\s+marks|time\s*:|examination|answer\s+(all|any))\b/i;
  const joined = [];
  for (const l of text.split('\n').map(x => x.trim()).filter(Boolean)) {
    if (HEADER_LINE.test(l) && l.length < 120) continue;
    if (joined.length && /^[a-z]/.test(l)) joined[joined.length - 1] += ' ' + l;
    else joined.push(l);
  }
  const lines = joined.filter(l => l.length > 15);
  return lines.map((l, i) => ({ id: `Q${i + 1}`, text: l, marks: null }));
}

// ── Context overrides (run BEFORE dictionary lookup) ─────────────────────────
// Some verbs are listed in only one Bloom's level by the dictionary, but
// engineering / science exams use them with a clearly different meaning.
// These overrides catch those cases. Each entry is { verb, contextRegex, level }.
//
// Example: "find" is in C1 (find facts), but "Find the parity bits" / "Find
// the duration" / "Find error" is C3 Apply (compute / solve). The override
// rule says: when "find" is followed by a quantitative or computed noun, it
// should be treated as C3.
const CONTEXT_OVERRIDES = [
  {
    verb:  'find',
    test:  (t) => /\bfind\b.{0,80}\b(error|parity|bit|rate|duration|frequency|value|voltage|current|resistance|impedance|capacitance|inductance|gain|loss|power|energy|root|solution|equation|answer|result|formula|sum|product|integral|derivative|limit|maximum|minimum|range|domain|angle|distance|speed|velocity|acceleration|mass|force|weight|area|volume|length|width|height|time|period|wavelength|amplitude|phase|complement|inverse|gcd|lcm|hcf|prime|factor|matrix|determinant|eigenvalue|magnitude|vector|degree|radian)/i.test(t),
    level: 'C3',
  },
  {
    verb:  'calculate',
    test:  () => true,
    level: 'C3',
  },
  {
    verb:  'compute',
    test:  () => true,
    level: 'C3',
  },
  {
    verb:  'solve',
    test:  () => true,
    level: 'C3',
  },
  {
    verb:  'show',
    // "Show how X works" → C3 Apply (demonstrate procedure)
    test:  (t) => /\bshow\s+(?:how|that|the)\b/i.test(t),
    level: 'C3',
  },
  {
    verb:  'sketch',
    // "Sketch and explain" — diagram + explanation, C3 Apply
    test:  () => true,
    level: 'C3',
  },
  {
    verb:  'illustrate',
    // "Illustrate the block diagram" — drawing application, C3
    test:  (t) => /\b(diagram|circuit|graph|figure|chart|block|flowchart|schematic)\b/i.test(t),
    level: 'C3',
  },
  {
    verb:  'prepare',
    // "Prepare transmitted data" — applying a procedure, C3
    test:  () => true,
    level: 'C3',
  },
  {
    verb:  'complete',
    // "Complete the execution logic / implementation" — C3 Apply
    test:  () => true,
    level: 'C3',
  },
  {
    // "What happens when X" — asking to describe a process = C2 Understand
    // This is a special case: "what" is not a verb but the question is C2.
    // We handle it by treating "what" as a trigger for describe-level mapping.
    verb:  'what',
    test:  (t) => /\bwhat\s+happens?\b/i.test(t),
    level: 'C2',
  },
  {
    verb:  'translate',
    // "Translate X into Y" — converting/transforming = C3 Apply (not just C2 paraphrase)
    // when it involves producing a new artefact (code, interface, protocol)
    test:  (t) => /\b(into|to\s+a|to\s+an|protocol|interface|format|structure|code|implementation)\b/i.test(t),
    level: 'C3',
  },
  {
    verb:  'set',
    // "Set up a scheme/system/configuration" — C6 Create
    test:  (t) => /\bset\s+up\b/i.test(t),
    level: 'C6',
  },
  {
    verb:  'determine',
    // "Determine the essential components" / "Determine the requirements" — listing,
    // not solving. Teachers commonly grade this as C2 Understand.
    test:  (t) => /\b(essential|required|key|necessary|important)\s+(components?|requirements?|elements?|features?|factors?)\b/i.test(t),
    level: 'C2',
  },
];

function applyContextOverride(verb, questionText) {
  for (const o of CONTEXT_OVERRIDES) {
    if (o.verb === verb && o.test(questionText)) return o.level;
  }
  return null;
}


// When a verb maps to multiple Bloom's levels, decide which one based on
// the rest of the question text. These are conservative — if no rule matches,
// we mark the question medium-confidence and keep the LOWEST level (safer
// than over-classifying).

function disambiguate(verb, questionText) {
  const t = questionText.toLowerCase();
  const candidates = VERB_INDEX[verb];
  if (!candidates || candidates.length === 1) return candidates ? candidates[0] : null;

  // verb-specific rules
  switch (verb) {
    case 'compare':
    case 'contrast':
      // RULE 3: Differentiating or drawing direct operational/structural contrasts = ALWAYS C4
      // "contrast" defaults to C4 — it implies examining components, not just describing.
      // Only downgrade to C2 for explicitly shallow/surface comparisons.
      // Only upgrade to C5 when there's a clear judgement/recommendation cue.
      if (/\b(better|best|recommend|justify|which.*should|prefer)\b/.test(t)) return 'C5';
      return 'C4';

    case 'demonstrate':
      // "demonstrate using" / "demonstrate with code" → C3 Apply
      if (/\b(using|with|via|by means of|through)\b/.test(t)) return 'C3';
      return 'C2';

    case 'describe':
      // "describe how X works step-by-step" still C2; rare case for C5 only when judgemental
      return 'C2';

    case 'explain':
      // C2 Understand by default; only C5 if there's judgement language
      if (/\b(why.*better|justify|defend|support your|argue)\b/.test(t)) return 'C5';
      return 'C2';

    case 'select':
      // Used in C1, C2, C4, C5 — default to C1 unless there's reasoning
      if (/\b(criteria|justify|best|appropriate|why|most\s+effective|optimal)\b/.test(t)) return 'C5';
      if (/\b(category|categorize|group)\b/.test(t)) return 'C4';
      return 'C1';

    case 'classify':
      // C2 (intro) vs C4 (deeper analysis)
      if (/\b(criteria|distinguish|breakdown|attributes)\b/.test(t)) return 'C4';
      return 'C2';

    case 'identify':
      // C1 by default; C4 when "identify the differences/components/parts"
      if (/\b(differences?|components?|parts?|relationships?|patterns?|use\s+cases?|essential|critical|key)\b/.test(t)) return 'C4';
      return 'C1';

    case 'distinguish':
      // C2 or C4 — default C4 (analysis)
      return 'C4';

    case 'predict':
      // C2 (extrapolate trend) vs C3 (apply formula) vs C5 (judge outcome)
      if (/\b(using|formula|calculate|compute|equation)\b/.test(t)) return 'C3';
      if (/\b(judge|best|optimal|appropriate)\b/.test(t)) return 'C5';
      return 'C2';

    case 'assess':
    case 'appraise':
      // "appraise" defaults to C5 Evaluate — it implies forming a judgement.
      // Only downgrade to C3 when the question is clearly about applying a
      // known assessment procedure (rare — "assess using the rubric").
      // C5 is the correct default for all "appraise X versus Y" patterns.
      return 'C5';

    case 'develop':
    case 'construct':
    case 'produce':
      // RULE 3: Creating a completely new, whole system from scratch = ALWAYS C6
      if (/\b(design|new|original|invent|formulate|propose|from\s+scratch|complete|full|entire|whole|end.to.end|fsm|finite\s+state\s+machine|state\s+machine|circuit\s+that|machine\s+that|system\s+that|sequence\s+that|framework\s+that|protocol\s+that|that\s+detects|that\s+performs|that\s+computes|that\s+generates)\b/.test(t)) return 'C6';
      return 'C3';

    case 'examine':
      // C3 (apply procedure) vs C4 (analyze)
      if (/\b(parts?|components?|structure|relationships?|differences?)\b/.test(t)) return 'C4';
      return 'C3';

    case 'extend':
      return 'C2';

    case 'interpret':
      return 'C2';

    case 'choose':
      // C3 (apply rule to choose) vs C5 (judge best option)
      if (/\b(best|appropriate|optimal|justify|defend)\b/.test(t)) return 'C5';
      return 'C3';

    case 'arrange':
    case 'order':
    case 'sequence':
      // C1 (recall sequence) vs C6 (compose new arrangement)
      if (/\b(new|original|design|compose|create)\b/.test(t)) return 'C6';
      return 'C1';

    case 'modify':
      // C3 vs C6
      if (/\b(create|new|original|design|propose)\b/.test(t)) return 'C6';
      return 'C3';

    case 'characterize':
      // "Characterize the mechanics/phases/behaviour" — C4 Analyze
      // Only C2 for surface-level description without structural examination
      if (/\b(surface|basic|simple|general|overview)\b/.test(t)) return 'C2';
      return 'C4';

    case 'discuss':
      // C2 (explain) vs C5 (debate)
      if (/\b(merits?|drawbacks?|criticis|defend|justify|argue|trade.?off)\b/.test(t)) return 'C5';
      return 'C2';

    case 'criticize':
    case 'critique':
      // C5 Evaluate — forming a judgement based on criteria. Always C5.
      return 'C5';

    case 'recognize':
      // C1 (recall) vs C2 (identify in context)
      if (/\b(in the context|from the figure|in the passage|in the diagram)\b/.test(t)) return 'C2';
      return 'C1';

    case 'relate':
      // "Relate the role of X to Y" — explaining a connection = C2 Understand
      // Only C4 when examining causal/structural relationships
      if (/\b(cause|effect|impact|influence|why|mechanism|structural)\b/.test(t)) return 'C4';
      return 'C2';

    case 'outline':
      // "Outline the sequence/steps" — C2 Understand (summarise/describe)
      return 'C2';

    case 'write':
      // C1 (write definition) vs C3 (write a program) vs C6 (write an essay/design)
      if (/\b(program|code|implementation|algorithm)\b/.test(t)) return 'C3';
      if (/\b(essay|argument|critique|original|design)\b/.test(t)) return 'C6';
      return 'C1';

    case 'tell':
      return candidates[0]; // first listed level

    default:
      // Generic rule: prefer the LOWER level when in doubt — penalises
      // over-classification, which is the more common mistake
      return candidates.slice().sort()[0];
  }
}

// ── Multi-word verb phrases that map to a single Bloom's verb ────────────────
// Many exam questions use compound imperatives — "Break down", "Set up",
// "Find out". We map these to the canonical base verb in our dictionary.
const PHRASE_VERBS = {
  'break down': 'analyze',     // C4
  'broke down': 'analyze',
  'broken down': 'analyze',
  'breaking down': 'analyze',
  'breaks down': 'analyze',
  'set up':     'set',         // → context override picks C6
  'sets up':    'set',
  'find out':   'discover',    // C3
  'point out':  'identify',    // C1/C4
  'figure out': 'solve',       // C3
  'work out':   'solve',
  'put together': 'assemble',  // C6
  'come up with': 'create',    // C6
};
function tryPhraseVerb(tokens, startIdx) {
  // Try 3-word, then 2-word phrase starting at startIdx
  for (const len of [3, 2]) {
    if (startIdx + len > tokens.length) continue;
    const phrase = tokens.slice(startIdx, startIdx + len).join(' ').toLowerCase();
    if (PHRASE_VERBS[phrase]) {
      return { base: PHRASE_VERBS[phrase], length: len, raw: phrase };
    }
  }
  return null;
}


// ── RULE 1: FIRST-TOKEN IMPERATIVE PRIORITY ──────────────────────────────────
// The primary execution command is the FIRST imperative verb in the question.
// Scan sentence-by-sentence. The first sentence that STARTS with a dictionary
// verb (possibly after 1-2 skip words) is the command sentence. Take its verb.
// Scenario sentences ("You are reviewing...") start with a subject pronoun —
// they are skipped. The command sentence ("Break down the strategy...") starts
// with the verb — that is the one we use.
//
// RULE 2: cognitive level is determined SOLELY by the verb, not by noun
// complexity. "architectural blueprint" does not elevate the level.
//
// RULE 3: overlap resolution uses context qualifiers (see disambiguate()).
function classifyQuestion(question) {
  const text = question.text || '';
  const cleaned = text
    .replace(/^(briefly|in detail|in your own words|using.*?,\s*)/i, '')
    .trim();

  const SKIP = new Set([
    'a','an','the','is','are','was','were','be','been','being',
    'to','for','of','in','on','at','by','with','from','as','that','which',
    'what','how','why','where','when','who','whom','whose',
    'and','or','but','if','then','also','please','briefly','clearly','correctly',
    'do','does','did','can','could','should','would','will','shall','may','might','must',
    'has','have','had','so','it','this','that','they','them',
    // Subject pronouns that start scenario sentences — not commands
    'you','your','students','student','our','its',
  ]);

  let leadVerb  = null;
  let leadToken = null;
  let firstAvoid = null;

  // ── Step 1: scan ALL sentences for imperative verbs, pick highest level ──
  // "Define X. Justify Y." has two imperatives. We collect all of them and
  // pick the highest Bloom's level — the question demands the highest cognitive
  // skill even if it also asks for lower-level recall.
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const imperativeVerbs = []; // { base, token }

  for (const sentence of sentences) {
    const toks = sentence.split(/[\s,;:.()\[\]]+/).filter(Boolean);
    if (toks.length === 0) continue;

    for (let start = 0; start <= Math.min(2, toks.length - 1); start++) {
      if (start > 0 && !SKIP.has(toks[start - 1].toLowerCase())) break;

      const phrase = tryPhraseVerb(toks, start);
      if (phrase) {
        const phraseOverride = applyContextOverride(phrase.base, sentence);
        if (phraseOverride || VERB_INDEX[phrase.base]) {
          imperativeVerbs.push({ base: phrase.base, token: phrase.raw });
          break;
        }
      }

      const base = toBaseForm(toks[start]);
      if (!base) continue;
      if (AVOID_SET.has(base) && !VERB_INDEX[base]) {
        if (!firstAvoid) firstAvoid = { base, raw_token: toks[start] };
        break;
      }
      if (VERB_INDEX[base]) {
        imperativeVerbs.push({ base, token: toks[start] });
        break;
      }
      break; // first token not a verb → scenario sentence, skip
    }
  }

  // Pick the highest-level imperative verb as the primary, but keep all levels
  if (imperativeVerbs.length > 0) {
    const resolved = imperativeVerbs.map(v => {
      const override = applyContextOverride(v.base, cleaned);
      const level = override
        ? override
        : VERB_INDEX[v.base]?.length === 1
          ? VERB_INDEX[v.base][0]
          : disambiguate(v.base, cleaned);
      return { ...v, level };
    }).filter(v => v.level);

    // Sort highest → lowest
    resolved.sort((a, b) => b.level.localeCompare(a.level));
    leadVerb  = resolved[0].base;
    leadToken = resolved[0].token;

    // If multiple distinct levels found, return them all
    const allLevels = [...new Set(resolved.map(v => v.level))];
    if (allLevels.length > 1) {
      return {
        confidence:     'high',
        detected_verbs: resolved.map(v => v.base),
        matched_token:  leadToken,
        bloom_level:    resolved[0].level,          // primary (highest)
        bloom_name:     BLOOMS_NAMES[resolved[0].level],
        bloom_levels:   allLevels,                  // all levels e.g. ['C5','C1']
      };
    }
  }

  // ── Step 2: fallback — first dictionary verb anywhere in the question ──
  if (!leadVerb) {
    // Special case: "What happens when X" — asking to describe a process = C2
    if (/^\s*what\s+happens?\b/i.test(cleaned)) {
      return {
        confidence:    'high',
        detected_verbs: ['describe'],
        matched_token: 'what happens',
        bloom_level:   'C2',
        bloom_name:    BLOOMS_NAMES['C2'],
      };
    }

    const allToks = cleaned.split(/[\s,;:.()\[\]]+/).filter(Boolean);
    for (const tok of allToks) {
      if (SKIP.has(tok.toLowerCase())) continue;
      const base = toBaseForm(tok);
      if (!base) continue;
      if (AVOID_SET.has(base) && !VERB_INDEX[base]) {
        if (!firstAvoid) firstAvoid = { base, raw_token: tok };
        continue;
      }
      if (VERB_INDEX[base]) { leadVerb = base; leadToken = tok; break; }
    }
  }

  if (!leadVerb) {
    if (firstAvoid) return { confidence: 'flag', avoidVerb: firstAvoid.base, raw_token: firstAvoid.raw_token };
    return { confidence: 'low', detected_verbs: [] };
  }

  // ── Collect conjoined verbs (and/or within 60 chars of lead) ─────────
  const detected = [{ base: leadVerb, raw_token: leadToken }];
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const leadMatch = cleaned.match(new RegExp('\\b' + escapeRe(leadToken) + '\\b', 'i'));
  if (leadMatch) {
    const after = cleaned.slice(leadMatch.index + leadMatch[0].length).slice(0, 60);
    const conjRe = /\b(?:and|or)\s+(\w+)/gi;
    let cm; let collected = 0;
    while ((cm = conjRe.exec(after)) !== null && collected < 2) {
      const conjVerb = toBaseForm(cm[1]);
      if (conjVerb && VERB_INDEX[conjVerb] && !detected.find(d => d.base === conjVerb)) {
        detected.push({ base: conjVerb, raw_token: cm[1] });
        collected++;
      }
    }
  }

  // ── Resolve each verb to a Bloom's level ─────────────────────────────
  const resolved = detected.map(v => {
    const override = applyContextOverride(v.base, cleaned);
    if (override) return { verb: v.base, level: override, source: 'override' };
    const candidates = VERB_INDEX[v.base];
    if (!candidates) return null;
    if (candidates.length === 1) return { verb: v.base, level: candidates[0], source: 'unique' };
    return { verb: v.base, level: disambiguate(v.base, cleaned), source: 'disambig' };
  }).filter(Boolean);

  if (resolved.length === 0) return { confidence: 'low', detected_verbs: [leadVerb] };

  // Pick HIGHEST level — higher cognitive demand wins for multi-verb questions
  resolved.sort((a, b) => b.level.localeCompare(a.level));
  const winner = resolved[0];
  const confidence = (resolved.length > 1 || winner.source === 'disambig') ? 'medium' : 'high';

  return {
    confidence,
    detected_verbs: detected.map(v => v.base),
    matched_token:  leadToken,
    bloom_level:    winner.level,
    bloom_name:     BLOOMS_NAMES[winner.level],
  };
}

// ── KB suggestion (optional) ─────────────────────────────────────────────────
// Use the existing fuzzy-search KB to suggest a CLO code AND override the
// Bloom's level when a high-confidence verified record matches.
// We treat a KB record as "high confidence" when it's been marked verified
// by the professor — those override the dictionary.
function suggestCloFromKb(db, questionText) {
  if (!db) return null;
  try {
    const cloKnowledge = require('./clo-knowledge');
    const matches = cloKnowledge.searchSimilar(db, questionText, 1);
    if (matches && matches.length > 0) {
      return {
        clo_code:          matches[0].clo_code  || null,
        kb_bloom_level:    matches[0].bloom_level || null,
        kb_verified:       Boolean(matches[0].verified),
        confidence_source: 'kb',
      };
    }
  } catch (_) {}
  return null;
}

// ── Public entry point ───────────────────────────────────────────────────────
/**
 * Map raw exam / CLO text to a structured Bloom's mapping.
 * @param {string} rawText
 * @param {string} courseCode
 * @param {object} db   - sqlite handle (optional, for KB-assisted CLO suggestion)
 * @returns matches the schema produced by the LLM-based mapper, plus a
 *          confidence_summary block so callers know what the LLM should
 *          re-examine.
 */
function mapDeterministic(rawText, courseCode, db) {
  const questions = splitQuestions(rawText || '');

  const cloMappings = [];
  const dist = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0 };
  const confSummary = { high: 0, medium: 0, low: 0, flagged: 0 };

  for (const q of questions) {
    // ── KB override: if a verified KB record matches this question, use
    // its bloom_level even when our engine would say something different.
    // This is how teacher-specific conventions get learned (e.g. "find
    // error" → C5 at DIU, even though strict Bloom's says C3).
    const kbHint = suggestCloFromKb(db, q.text);
    let kbOverride = null;
    if (kbHint && kbHint.kb_bloom_level && kbHint.kb_verified) {
      kbOverride = kbHint.kb_bloom_level;
    }

    // ── STEP 0: Pre-validation gate (STATE 0 + STATE 1) ─────────────────
    // STATE 0: sanitize — strip metadata from the question text before validation
    const sanitized = q.text
      .replace(/Question\s+\d+/gi, '')
      .replace(/CLO[-\s]*\d+/gi, '')
      .replace(/\[\s*\d+\s*[Mm]arks?\s*\]/g, '')
      .trim();

    if (!sanitized) {
      confSummary.flagged++;
      continue; // empty after sanitization — skip silently
    }

    // STATE 1: measurability + domain guardrails
    const validation = validateObjective(sanitized);
    if (!validation.valid) {
      const statusStr = validation.reason === 'NON_MEASURABLE'
        ? 'REJECTED (NON_MEASURABLE)'
        : 'REJECTED (NON_COGNITIVE)';
      cloMappings.push({
        clo_code:        kbHint?.clo_code || `CLO-${q.id}`,
        clo_text:        q.text,
        // Spec-compliant fields
        status:          statusStr,
        blooms_level:    null,
        matched_verb:    null,
        // Legacy fields (kept for UI compatibility)
        bloom_level:     null,
        bloom_name:      null,
        detected_verbs:  [],
        suggested_verbs: [],
        justification:   validation.detail,
        alignment_issue: true,
        alignment_note:  `${statusStr}: ${validation.detail}`,
        confidence:      'rejected',
      });
      confSummary.flagged++;
      continue;
    }

    const res = classifyQuestion(q);

    if (res.confidence === 'flag') {
      // Avoid-verb hit — flag it
      cloMappings.push({
        clo_code:        kbHint?.clo_code || `CLO-${q.id}`,
        clo_text:        q.text,
        bloom_level:     null,
        bloom_name:      null,
        detected_verbs:  [res.avoidVerb],
        suggested_verbs: [],
        justification:   `Verb "${res.avoidVerb}" is in the avoid list (not measurable). Replace with a base-form action verb.`,
        alignment_issue: true,
        alignment_note:  `Question uses ambiguous/non-measurable verb "${res.avoidVerb}". Pick a measurable verb from the dictionary.`,
        confidence:      'flag',
      });
      confSummary.flagged++;
      continue;
    }

    if (res.confidence === 'low') {
      // Could not detect a dictionary verb — needs LLM help downstream
      cloMappings.push({
        clo_code:        kbHint?.clo_code || `CLO-${q.id}`,
        clo_text:        q.text,
        bloom_level:     kbHint?.kb_bloom_level || null,
        bloom_name:      kbHint?.kb_bloom_level ? BLOOMS_NAMES[kbHint.kb_bloom_level] : null,
        detected_verbs:  [],
        suggested_verbs: [],
        justification:   'No dictionary verb detected — flagged for AI review.',
        alignment_issue: true,
        alignment_note:  'No measurable action verb found in the first 30 tokens of the question.',
        confidence:      'low',
      });
      confSummary.low++;
      continue;
    }

    // High or medium confidence — record the mapping
    // KB override wins if a verified record agrees there's a question match.
    let lvl = res.bloom_level;
    let lvlSource = res.confidence;
    let justification;
    if (kbOverride && kbOverride !== lvl) {
      justification = `Action verb "${res.detected_verbs[0]}" suggests ${lvl} ${BLOOMS_NAMES[lvl]}, but a verified KB record overrides to ${kbOverride} ${BLOOMS_NAMES[kbOverride]}.`;
      lvl = kbOverride;
      lvlSource = 'kb-verified';
    } else {
      justification = res.confidence === 'high'
        ? `Action verb "${res.detected_verbs[0]}" maps unambiguously to ${lvl} ${BLOOMS_NAMES[lvl]}.`
        : `Action verb "${res.detected_verbs[0]}" is ambiguous; resolved to ${lvl} ${BLOOMS_NAMES[lvl]} based on question context.`;
    }
    // Multi-level: when a question has multiple imperative verbs at different
    // Bloom's levels (e.g. "Define X. Justify Y." → C1 + C5), store all levels.
    const allLevels = res.bloom_levels || [lvl];
    // Update distribution for all levels
    for (const l of allLevels) dist[l] = (dist[l] || 0) + 1;
    if (lvlSource === 'high' || lvlSource === 'kb-verified') confSummary.high++;
    else if (lvlSource === 'medium') confSummary.medium++;

    // Format multi-level display: "C1, C5" sorted lowest→highest
    const levelsDisplay = allLevels.length > 1
      ? [...allLevels].sort().join(', ')
      : lvl;

    cloMappings.push({
      clo_code:        kbHint?.clo_code || `CLO-${q.id}`,
      clo_text:        q.text,
      // Spec-compliant fields
      status:          'ACCEPTED',
      blooms_level:    lvl,
      bloom_levels:    allLevels,          // all levels for multi-verb questions
      bloom_levels_display: levelsDisplay, // "C1, C5" for UI
      matched_verb:    res.detected_verbs[0] || null,
      // Legacy fields (kept for UI compatibility)
      bloom_level:     lvl,
      bloom_name:      BLOOMS_NAMES[lvl],
      detected_verbs:  res.detected_verbs,
      suggested_verbs: similarVerbs(lvl, res.detected_verbs[0], 4),
      justification,
      alignment_issue: false,
      alignment_note:  null,
      confidence:      lvlSource,
    });
  }

  // Recommendations — soft hints based on what we saw
  const recommendations = [];
  if (confSummary.flagged > 0) {
    recommendations.push(`${confSummary.flagged} question(s) use non-measurable verbs and should be rewritten.`);
  }
  if (dist.C1 + dist.C2 > 0 && dist.C3 + dist.C4 + dist.C5 + dist.C6 === 0) {
    recommendations.push('All questions are at lower Bloom\'s levels (Remember/Understand). Consider adding Apply or Analyze level questions.');
  }
  if (cloMappings.length === 0) {
    recommendations.push('No questions were extracted from the text. Check the input formatting.');
  }

  return {
    course_code:        courseCode || 'Unknown',
    clo_mappings:       cloMappings,
    level_distribution: dist,
    recommendations,
    confidence_summary: confSummary,
  };
}

// ── Helper: produce N alternative verbs from the same Bloom's level ──────────
function similarVerbs(level, exclude, n = 4) {
  const list = (BLOOMS_VERBS[level] || []).filter(v => v !== exclude);
  // Stable, course-independent picking — first N (alphabetical)
  return list.slice(0, n);
}

module.exports = {
  mapDeterministic,
  splitQuestions,
  classifyQuestion,
  validateObjective,
  toBaseForm,
  VERB_INDEX,
};
