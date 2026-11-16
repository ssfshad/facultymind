'use strict';

/**
 * syllabus-gap-analyzer.js — LLM prompts for CO-to-syllabus gap analysis
 *
 * NOTE: Gap analysis now runs deterministically via detectAlignmentGaps()
 * in syllabus-mapper.js. These prompts are kept only for the legacy
 * CLO mapper path (blooms-engine.js) which still uses LLM-assisted analysis.
 * Do not add new LLM gap analysis calls — use the deterministic engine.
 */

const SYSTEM_PREFIX = `You are a strict data-extraction engine. You must output raw JSON immediately. You are strictly forbidden from outputting <think> tags or explaining your reasoning.\n\n`;

const BLOOMS_GUIDE = `BLOOM'S TAXONOMY — VALID MEASURABLE VERBS BY LEVEL:
C1 Remember: define, list, state, recall, identify, name, describe (basic facts)
C2 Understand: describe (concepts), explain, classify, summarize, discuss, outline, differentiate (surface)
C3 Apply: implement, apply, demonstrate, solve, use, calculate, compute, construct, build
C4 Analyze: analyze, differentiate (deep), contrast, compare, examine, investigate, distinguish
C5 Evaluate: evaluate, appraise, critique, justify, assess, argue, judge
C6 Create: design, develop, create, formulate, construct (new), devise, plan, build (new system)

NON-MEASURABLE VERBS (describe mental states, not observable actions — flag these):
understand, know, appreciate, be aware, be familiar, comprehend, realize, gain experience,
gain understanding, gain a foundational understanding, learn, learn to, explore, get familiar,
develop an understanding, develop proficiency in`;

function syllabusGapAnalyzerPrompt(courseOutcomes, weeklyTopics) {
  const system = SYSTEM_PREFIX + `You are an OBE curriculum auditor. Analyze Course Outcomes (COs) for two specific problems.

` + BLOOMS_GUIDE + `

IMPORTANT: differentiate, distinguish, compare, contrast are VALID C4 verbs. They are NOT non-measurable.

PROBLEM TYPE 1 — NON_MEASURABLE_VERB: The CO's primary verb is in the non-measurable list above.
PROBLEM TYPE 2 — DOMAIN_MISMATCH: The CO uses a valid verb but the content doesn't match the weekly topics.
If neither problem exists → status = ALIGNED.

CRITICAL RULE: Never use generic placeholder text. Your rewrite MUST use the technical subject matter from the original statement.

### EXAMPLES OF CORRECT REWRITES ###
Original: "Understand the processes of analog-to-digital conversion."
Correct Rewrite: "Describe the processes of analog-to-digital conversion, including sampling and quantization."

Original: "Learn the design procedures for filter banks."
Correct Rewrite: "Explain the design procedures for filter banks and their frequency responses."
####################################

OUTPUT — minified JSON array only, no markdown, no explanation, no thinking:
[{"co":"CO1","status":"ALIGNED|NON_MEASURABLE|DOMAIN_MISMATCH","gap_type":"NON_MEASURABLE_VERB|DOMAIN_MISMATCH|null","gap_description":"one sentence","expected_level":"C1|C2|C3|C4|C5|C6","suggested_verbs":["v1","v2","v3"],"suggested_rewrite":"rewritten CO statement"}]`;

  const cosText   = courseOutcomes.map(co => `${co.code}: ${co.text}`).join('\n');
  const weeksText = weeklyTopics.slice(0, 8).map(w => `${w.week}: ${(w.topics || '').slice(0, 100)}`).join('\n');
  const user = `COURSE OUTCOMES:\n${cosText}\n\nWEEKLY TOPICS (sample):\n${weeksText}\n\nAnalyze each CO. Return JSON array only.`;
  return { system, user };
}

function syllabusWeekLevelsPrompt(weeklyTopics) {
  const system = SYSTEM_PREFIX + `Map each weekly topic to a Bloom's Taxonomy level based on what students DO that week.

` + BLOOMS_GUIDE + `

UNIT LEVEL MAPPING:
C1: introduction, overview, history, basic concepts, terminology, definitions
C2: describe, explain, classify, compare concepts, how X works
C3: programming, coding, implementation, interfacing, using tools, calculations, lab work, hands-on
C4: design analysis, optimization, debugging, troubleshooting, comparing architectures
C5: evaluate, assess, audit, critique
C6: design from scratch, architect a new system, formulate

IMPORTANT: Any unit involving programming, coding, interfacing hardware, or using a tool = C3 Apply minimum.

OUTPUT — minified JSON array only, no thinking:
[{"week":"Week 1","bloom_level":"C1","bloom_name":"Remember","suggested_verbs":["define","list","state"]}]`;

  const weeksText = weeklyTopics.map(w => `${w.week}: ${(w.topics || '').slice(0, 120)}`).join('\n');
  const user = `Map these weekly topics to Bloom's levels:\n${weeksText}\n\nReturn JSON array only.`;
  return { system, user };
}

module.exports = { syllabusGapAnalyzerPrompt, syllabusWeekLevelsPrompt };
