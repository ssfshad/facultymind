/**
 * blooms-mapping.js - Format Bloom's Taxonomy prompt for lesson plan generation
 *
 * FIX 6:
 *  - Text limit raised from 10,000 → 18,000 chars (full lecture PDFs now processed)
 *  - Added BLOOMS_VERBS_TEXT dictionary as a hard constraint on learning_outcome verbs
 *  - Added topic-section guidance for structured documents (MarkItDown output)
 */

'use strict';

const { BLOOMS_VERBS_TEXT } = require('./blooms-verbs');

function bloomsMappingPrompt(extractedText, courseCode, cloDefinitions) {
  const system = `You are an academic curriculum expert trained in Bloom's Taxonomy and Outcome-Based Education (OBE) standards. You understand CLOs (Course Learning Outcomes), COs (Course Outcomes), POs (Program Outcomes), and BAETE accreditation requirements for engineering programs in Bangladesh.

You are given extracted text from a university lecture document (may be in Markdown format with headings preserved).
Generate a complete, structured lesson plan.

For each major topic identified:
1. Write a clear learning outcome starting with a measurable action verb
2. Map it to the most appropriate Bloom's cognitive level:
   C1=Remember, C2=Understand, C3=Apply, C4=Analyze, C5=Evaluate, C6=Create
3. Suggest a CLO code it contributes to (CLO1, CLO2, etc.)
4. Generate 2 quiz questions at that Bloom's level
5. Suggest a teaching activity appropriate for that level

═══════════════════════════════════════════════════════════════════════
AUTHORITATIVE BLOOM'S VERB DICTIONARY
═══════════════════════════════════════════════════════════════════════
${BLOOMS_VERBS_TEXT}
═══════════════════════════════════════════════════════════════════════

HARD RULES:
- All learning_outcome statements MUST start with a verb from the authoritative dictionary above.
- Do NOT use vague verbs like "understand", "know", "learn", "be familiar with", or "appreciate".
- If the document has Markdown headings (## Topic), treat each heading as a separate topic section.
- Map each topic section independently — do not merge unrelated sections.

Respond ONLY with valid JSON. No markdown. No preamble.
Schema:
{
  "course_topic": "string",
  "estimated_duration_minutes": number,
  "lesson_plan": [
    {
      "topic": "string",
      "learning_outcome": "string (starts with a verb from the dictionary above)",
      "bloom_level": "C1|C2|C3|C4|C5|C6",
      "bloom_name": "Remember|Understand|Apply|Analyze|Evaluate|Create",
      "suggested_clo": "CLO1|CLO2|...",
      "quiz_questions": ["string", "string"],
      "teaching_activity": "string"
    }
  ],
  "clo_coverage_summary": {
    "C1": number, "C2": number, "C3": number, "C4": number, "C5": number, "C6": number
  }
}`;

  const user = `Lecture content:
${extractedText.substring(0, 18000)}

Course code: ${courseCode || 'ICE301'}
Existing CLOs for this course: ${cloDefinitions}`;

  return { system, user };
}

module.exports = {
  bloomsMappingPrompt
};
