/**
 * PROMPT: CLO gap explanation
 * ShadSync (code) works out which CLOs are weak and gives the model the exact list in FACTS.weak_clos;
 * the model only writes the "why" and the "what to change". The reply is checked by
 * modules/shadsync/explain-check.js: every number must come from FACTS, every weak CLO must be covered.
 */

const SYSTEM = `You are an outcome-based-education (OBE) advisor for a university teacher.
You are given FACTS about one course: the CLO attainment and the assessments mapped to each CLO.
"weak_clos" lists the CLOs that need explaining. It was computed by ShadSync: do not second-guess it.

Rules:
- Explain exactly the CLOs in "weak_clos", in that order, and no others. Do not put any other CLO in "clos".
  If "weak_clos" is empty, return an empty "clos" list.
- Use ONLY numbers that appear in FACTS, or simple differences or shares of them (for example threshold minus avg,
  or below_count out of graded). Never invent a number, student, assessment or CLO.
- For each weak CLO: "why" is at most 2 sentences and points at the specific assessments and their avg_pct;
  "actions" has 1 or 2 concrete teaching or assessment changes, each under 25 words.
- "summary" is one sentence.
- Respond ONLY with valid JSON, no markdown:
{"summary": "...", "clos": [{"code": "CLO2", "why": "...", "actions": ["..."]}]}`;

function cloGapExplanationPrompt(facts) {
  const { failingClos } = require('../../modules/shadsync/explain-check');
  const withList = { ...facts, weak_clos: failingClos(facts).map(c => c.code) };
  return { system: SYSTEM, user: `FACTS:\n${JSON.stringify(withList)}` };
}

/**
 * JSON schema for the reply, built from the facts: exactly one entry per weak CLO, codes limited to the weak CLOs,
 * short text fields. The model cannot loop, skip a weak CLO or explain one that is fine.
 */
function cloGapExplanationSchema(facts) {
  const { failingClos } = require('../../modules/shadsync/explain-check');
  const weak = failingClos(facts).map(c => c.code);
  const entry = {
    type: 'object',
    properties: {
      code: weak.length ? { type: 'string', enum: weak } : { type: 'string' },
      why: { type: 'string', maxLength: 420 },
      actions: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', maxLength: 170 } },
    },
    required: ['code', 'why', 'actions'], additionalProperties: false,
  };
  return {
    type: 'object',
    properties: {
      summary: { type: 'string', maxLength: 260 },
      clos: { type: 'array', minItems: weak.length, maxItems: weak.length, items: entry },
    },
    required: ['summary', 'clos'], additionalProperties: false,
  };
}

module.exports = { cloGapExplanationPrompt, cloGapExplanationSchema, CLO_GAP_SYSTEM_PROMPT: SYSTEM };
