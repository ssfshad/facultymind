/**
 * blooms-clo-reconciler.js — Pass 3 of the CLO mapping verification chain.
 *
 * Receives the original Pass 1 mapping and the Pass 2 critic's corrections,
 * and produces the final reconciled mapping. Output uses the EXACT same
 * schema as Pass 1 plus a top-level "improvements_summary" string so the
 * renderer can show a self-review trail to the professor.
 */

'use strict';

const { BLOOMS_VERBS_TEXT } = require('./blooms-verbs');

function bloomsCloReconcilerPrompt(originalMapping, corrections) {
  const system = `You receive an initial CLO-to-Bloom's mapping and a list of corrections from a senior reviewer. Apply ALL corrections to produce the final mapping.

Rules:
- Apply EVERY correction in the corrections list. Do not silently drop any.
- Do not introduce new changes beyond what the corrections specify.
- Keep all unchanged fields exactly as they were in the original mapping.
- After applying corrections, recompute the level_distribution counts so they match the corrected bloom_level values.
- All verbs in the final output MUST be base form (infinitive without "to") and MUST come from the dictionary below.
- Output JSON with EXACTLY the same schema as the original mapping, plus one extra top-level field "improvements_summary" describing what was changed.

═══════════════════════════════════════════════════════════════════════
AUTHORITATIVE BLOOM'S VERB DICTIONARY
═══════════════════════════════════════════════════════════════════════
${BLOOMS_VERBS_TEXT}
═══════════════════════════════════════════════════════════════════════

Respond ONLY with valid JSON. No markdown. No preamble.
Schema:
{
  "course_code": "string",
  "clo_mappings": [
    {
      "clo_code": "string",
      "clo_text": "string",
      "bloom_level": "C1|C2|C3|C4|C5|C6",
      "bloom_name": "Remember|Understand|Apply|Analyze|Evaluate|Create",
      "detected_verbs": ["string"],
      "suggested_verbs": ["string"],
      "justification": "string",
      "alignment_issue": true,
      "alignment_note": "string or null"
    }
  ],
  "level_distribution": { "C1": 0, "C2": 0, "C3": 0, "C4": 0, "C5": 0, "C6": 0 },
  "recommendations": ["string"],
  "improvements_summary": "string — one or two sentences describing the corrections that were applied"
}`;

  const user = `ORIGINAL MAPPING (from junior colleague):
${JSON.stringify(originalMapping, null, 2)}

CORRECTIONS (from senior reviewer):
${JSON.stringify(corrections, null, 2)}

Apply every correction and return the final reconciled mapping.`;

  return { system, user };
}

module.exports = { bloomsCloReconcilerPrompt };
