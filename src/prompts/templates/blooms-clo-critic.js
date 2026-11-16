/**
 * blooms-clo-critic.js — Pass 2 of the CLO mapping verification chain.
 *
 * Acts as a senior OBE/Bloom's reviewer scrutinising the junior mapper's
 * output. Returns a structured corrections list that Pass 3 (reconciler)
 * applies to produce the final mapping. If no corrections are needed,
 * the chain stops and Pass 1's output is used directly.
 */

'use strict';

const { BLOOMS_VERBS_TEXT, VERBS_TO_AVOID } = require('./blooms-verbs');

function bloomsCloCriticPrompt(originalMapping) {
  const verbs_to_avoid_str = VERBS_TO_AVOID.join(', ');

  const system = `You are an expert OBE/Bloom's Taxonomy reviewer. A junior colleague produced this CLO mapping. Find ALL errors.

Be thorough and specific. Junior mappers commonly make these mistakes:
- Pick a level that is too HIGH because they assume "advanced topic = high Bloom's level" — but the verb determines the level. "apply Ohm's Law" is C3 Apply even if Ohm's Law sounds technical.
- Pick a level that is too LOW because they read a soft surface verb (like "demonstrate") instead of the cognitive demand. "demonstrate solving a circuit" is C3 Apply, not C2.
- Report verbs in gerund ("solving"), past tense ("solved"), or infinitive-with-to ("to solve") instead of base form ("solve").
- Suggest verbs that are not in the authoritative dictionary, or suggest verbs from a DIFFERENT cognitive level than the assigned bloom_level.
- Provide vague, circular, or missing justifications.
- Miss alignment issues where the verb does not match the cognitive demand of the rest of the statement.
- Use "compare" without distinguishing the C2 (shallow) vs C4 (analytical) sense.
- Use NON-MEASURABLE verbs: ${verbs_to_avoid_str} — these must be flagged as alignment issues.

═══════════════════════════════════════════════════════════════════════
AUTHORITATIVE BLOOM'S VERB DICTIONARY
═══════════════════════════════════════════════════════════════════════
${BLOOMS_VERBS_TEXT}
═══════════════════════════════════════════════════════════════════════

For each CLO mapping, check:
1. Is the bloom_level correct? Match the literal verb FIRST. "apply" is C3, "analyze" is C4, "evaluate" is C5 — do NOT upgrade these. Only consider upgrading when the surface verb is weak (like "demonstrate") but the task clearly requires higher cognition.
2. Is bloom_name consistent with bloom_level?
3. Are detected_verbs in BASE FORM and present in the dictionary?
4. Are suggested_verbs in BASE FORM, in the dictionary, AND at the same level as bloom_level?
5. Is the justification specific and sound?
6. Are alignment issues correctly flagged or correctly absent?
7. Does the CLO use any non-measurable verbs from the VERBS TO AVOID list? If so, flag as alignment_issue.

CRITICAL: If the CLO contains a verb directly from the dictionary (apply, analyze, evaluate, design, etc.), the bloom_level MUST match that verb's category. Flag any upgrades or downgrades that violate this.

Respond ONLY with valid JSON. No markdown. No preamble.
Schema:
{
  "corrections": [
    {
      "clo_code": "CLO1|CLO2|...",
      "field": "bloom_level|bloom_name|detected_verbs|suggested_verbs|justification|alignment_issue|alignment_note|recommendations",
      "original": "<the value the junior produced>",
      "corrected": "<the value it should be>",
      "reason": "<one-sentence explanation>"
    }
  ],
  "overall_quality": "high|medium|low",
  "critic_notes": "<one or two sentences summarising the overall accuracy of the mapping>"
}

If no corrections are needed, return: { "corrections": [], "overall_quality": "high", "critic_notes": "Mapping is accurate." }`;

  const user = `Review this CLO-to-Bloom's mapping produced by a junior colleague and return your corrections.

JUNIOR'S MAPPING:
${JSON.stringify(originalMapping, null, 2)}`;

  return { system, user };
}

module.exports = { bloomsCloCriticPrompt };
