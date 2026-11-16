/**
 * blooms-clo-mapping.js — CLO-to-Bloom's Taxonomy mapping prompt (Pass 1)
 * PROMPT-007: Maps Course Learning Outcomes to Bloom's cognitive levels,
 * detects action verbs, suggests alternatives, and flags alignment issues.
 *
 * Pass 1 in the 3-pass verification chain. Output is reviewed by the
 * critic (Pass 2) and reconciled (Pass 3) if corrections are needed.
 *
 * FIX 5: Added bloomsCloMappingPromptForModel() — a compact variant optimised
 *         for Ollama 3B. Full prompt stays for OpenRouter/Claude/GPT-4o.
 * FIX 3: Text limit raised from 12,000 → 20,000 chars.
 */

'use strict';

const { BLOOMS_VERBS, BLOOMS_VERBS_TEXT, BLOOMS_NAMES } = require('./blooms-verbs');

// Re-export the verb dictionary so other prompt templates can import it
const BLOOMS_VERB_DICTIONARY = BLOOMS_VERBS;

// ── FULL PROMPT (for cloud models: OpenRouter, Claude, GPT-4o) ────────────────
function bloomsCloMappingPrompt(cloText, courseCode, examples = []) {
  let examplesSection = '';
  if (examples && examples.length > 0) {
    const exampleLines = examples.map((e, i) => {
      const verbs = (() => {
        try { return JSON.parse(e.action_verbs || '[]').join(', '); } catch (_) { return ''; }
      })();
      const text = (e.question_text || '').slice(0, 100);
      return `Example ${i + 1}: "${text}" → ${e.bloom_level} ${e.bloom_name}${verbs ? ` (verbs: ${verbs})` : ''}`;
    }).join('\n');

    examplesSection = `
═══════════════════════════════════════════════════════════════════════
VERIFIED EXAMPLES FROM THIS UNIVERSITY (highest priority reference)
═══════════════════════════════════════════════════════════════════════
These are verified CLO mappings from past exam questions at this institution.
When you see a similar verb or task, match the Bloom's level shown here.

${exampleLines}
═══════════════════════════════════════════════════════════════════════
`;
  }

  const system = `You are an academic curriculum expert trained in Bloom's Taxonomy and Outcome-Based Education (OBE).${examplesSection}

You are given Course Learning Outcomes (CLOs) from a university course. For each CLO:
1. Identify the CLO code and full text
2. Map it to the most appropriate Bloom's cognitive level:
   C1=Remember, C2=Understand, C3=Apply, C4=Analyze, C5=Evaluate, C6=Create
3. Identify the action verb(s) used in the CLO
4. Suggest 3-5 alternative action verbs at the SAME Bloom's level that could strengthen the CLO
5. Provide a brief justification for the level assignment
6. Flag if the CLO's action verb doesn't match its apparent cognitive demand (misalignment)

═══════════════════════════════════════════════════════════════════════
AUTHORITATIVE BLOOM'S VERB DICTIONARY (use ONLY these verbs)
═══════════════════════════════════════════════════════════════════════
${BLOOMS_VERBS_TEXT}
═══════════════════════════════════════════════════════════════════════

HARD RULES — these are non-negotiable, follow them in this exact priority order:

PRIORITY 1 — VERB MATCH:
The action verb in the CLO is your PRIMARY signal. Look for it FIRST in the dictionary above.
- "apply" appears in C3 → if CLO says "apply", it is C3 Apply.
- "analyze" appears in C4 → if CLO says "analyze", it is C4 Analyze.
- "evaluate" appears in C5 → if CLO says "evaluate", it is C5 Evaluate.
- "design" appears in C6 → if CLO says "design", it is C6 Create.
Match the literal verb. Do NOT upgrade just because the topic sounds advanced.

PRIORITY 2 — VERB FORMAT:
- Action verbs MUST be base form (infinitive without "to"): use "solve" not "solving", "apply" not "applied".
- All detected_verbs and suggested_verbs MUST come from the authoritative dictionary above.
- Detected verbs from the CLO text should be normalised to base form (e.g. "solving" → "solve").

PRIORITY 3 — DISAMBIGUATION (only when verb is genuinely ambiguous):
- "compare" appears in both C2 and C4. Use C2 for shallow/descriptive comparison; C4 for examining components, criteria, or trade-offs.
- "demonstrate" can be C2 or C3. Use C3 when it requires applying a method or procedure. Use C2 when it just means "show understanding".
- If the CLO uses NO verb from the dictionary, infer the level from the cognitive demand of the task.
- ONLY when truly ambiguous between two levels, prefer the higher one.

DO NOT:
- Upgrade a level when the verb clearly matches a specific level. "apply" is C3, period. Do not push it to C4.
- Invent verbs or use synonyms outside the dictionary.
- Use gerunds or past tense in detected_verbs or suggested_verbs.

Respond ONLY with valid JSON. No markdown. No preamble.
Schema:
{
  "course_code": "string",
  "clo_mappings": [
    {
      "clo_code": "CLO1|CLO2|...",
      "clo_text": "string (full CLO statement)",
      "bloom_level": "C1|C2|C3|C4|C5|C6",
      "bloom_name": "Remember|Understand|Apply|Analyze|Evaluate|Create",
      "detected_verbs": ["string (base form, from dictionary)"],
      "suggested_verbs": ["string (base form, from dictionary)"],
      "justification": "string",
      "alignment_issue": true,
      "alignment_note": "string or null"
    }
  ],
  "level_distribution": {
    "C1": 0, "C2": 0, "C3": 0, "C4": 0, "C5": 0, "C6": 0
  },
  "recommendations": ["string"]
}`;

  const user = `Course code: ${courseCode || 'Unknown'}

CLO text to analyze:
${cloText.substring(0, 20000)}`;   // FIX 3: raised from 12000 → 20000

  return { system, user };
}

// ── COMPACT PROMPT (for Ollama 3B — shorter, tighter, less token-heavy) ────────
// The 3B model gets overwhelmed by the full 2000-char system prompt + full verb
// dictionary. This variant gives it only the most essential rules and a stripped
// verb dictionary (10 most common verbs per level). Same JSON schema.
function bloomsCloMappingPromptCompact(cloText, courseCode, examples = []) {
  // 10 most-used verbs per level (covers 95% of real exam questions)
  const COMPACT_VERBS = `C1 Remember: define, list, recall, identify, name, state, label, match, recognize, repeat
C2 Understand: explain, describe, summarize, classify, compare, discuss, interpret, paraphrase, outline, predict
C3 Apply: apply, solve, calculate, demonstrate, use, implement, compute, sketch, prepare, find
C4 Analyze: analyze, differentiate, examine, distinguish, break down, contrast, relate, characterize, categorize, infer
C5 Evaluate: evaluate, assess, justify, critique, judge, argue, defend, appraise, recommend, select
C6 Create: design, create, develop, construct, formulate, propose, produce, plan, compose, build`;

  let examplesText = '';
  if (examples && examples.length > 0) {
    examplesText = '\nEXAMPLES:\n' + examples.slice(0, 2).map((e, i) => {
      const text = (e.question_text || '').slice(0, 80);
      return `${i + 1}. "${text}" → ${e.bloom_level} ${e.bloom_name}`;
    }).join('\n') + '\n';
  }

  const system = `You are a Bloom's Taxonomy expert. Map each question/CLO to a Bloom's cognitive level.

BLOOM'S LEVELS AND VERBS:
${COMPACT_VERBS}
${examplesText}
RULES:
1. Find the action verb. Look it up above. That determines the level.
2. "apply"=C3, "analyze"=C4, "evaluate"=C5, "design"/"create"=C6.
3. Only use verbs from the list above in your output.
4. Respond with valid JSON only. No markdown or preamble.

JSON schema:
{"course_code":"string","clo_mappings":[{"clo_code":"string","clo_text":"string","bloom_level":"C1|C2|C3|C4|C5|C6","bloom_name":"string","detected_verbs":["string"],"suggested_verbs":["string"],"justification":"string","alignment_issue":false,"alignment_note":null}],"level_distribution":{"C1":0,"C2":0,"C3":0,"C4":0,"C5":0,"C6":0},"recommendations":[]}`;

  const user = `Course: ${courseCode || 'Unknown'}

Questions/CLOs to map:
${cloText.substring(0, 20000)}`;

  return { system, user };
}

/**
 * Model-aware prompt selector (Fix 5).
 * Returns the compact prompt for Ollama 3B, full prompt for cloud models.
 *
 * @param {string}  cloText
 * @param {string}  courseCode
 * @param {Array}   examples
 * @param {boolean} useCompact - true when routing to Ollama 3B
 */
function bloomsCloMappingPromptForModel(cloText, courseCode, examples = [], useCompact = false) {
  return useCompact
    ? bloomsCloMappingPromptCompact(cloText, courseCode, examples)
    : bloomsCloMappingPrompt(cloText, courseCode, examples);
}

module.exports = {
  bloomsCloMappingPrompt,           // full prompt — cloud models
  bloomsCloMappingPromptCompact,    // compact prompt — Ollama 3B
  bloomsCloMappingPromptForModel,   // auto-select based on model
  BLOOMS_VERB_DICTIONARY,
  BLOOMS_VERBS_TEXT,
  BLOOMS_NAMES,
};
