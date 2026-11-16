/**
 * blooms-clo-parser.js — Prompt to parse OCR'd exam question text into
 * structured CLO knowledge base records.
 *
 * Used by the clo-kb:import-images IPC handler. All AI calls go through
 * model-router.js — never call AI SDKs directly.
 */

'use strict';

/**
 * Build the system + user prompt for parsing raw OCR exam text.
 *
 * @param {string} ocrText    - Raw text extracted from an exam question image
 * @param {string} courseCode - Course code for context (e.g. "EEE1245")
 * @returns {{ system: string, user: string }}
 */
function bloomsCloParserPrompt(ocrText, courseCode) {
  const system = `You are an OBE exam question parser. Extract CLO mapping data from raw exam question text.

Common formats you will encounter:
- "Q1 (CLO2, C3): Apply KVL to find mesh currents..."
- Table format: "Question | CLO | Marks | Bloom's Level"
- "CLO1 (C3-Apply): Students will apply..."
- Questions with Bloom's level in parentheses
- Numbered questions with CLO annotations in margins or headers

For each question or learning outcome found, extract:
- question_text: the actual question or learning outcome text (clean, without CLO/marks annotations)
- clo_code: CLO1, CLO2, etc. (null if not found)
- bloom_level: C1, C2, C3, C4, C5, or C6 (null if not found)
- bloom_name: Remember / Understand / Apply / Analyze / Evaluate / Create (null if not found)
- action_verbs: array of base-form verbs from the question (e.g. ["apply", "determine"])
- confidence: 0.0–1.0 (how confident the parse is — use 0.9+ only when CLO and level are explicit)

Bloom's level mapping:
C1 = Remember, C2 = Understand, C3 = Apply, C4 = Analyze, C5 = Evaluate, C6 = Create

If a question has no CLO or Bloom's annotation, still extract it with null values and a lower confidence.
If the text is a table, parse each row as a separate record.
Skip cover pages, instructions, and administrative text.

Return JSON ONLY — no markdown, no preamble, no explanation.

Schema:
{
  "parsed_questions": [
    {
      "question_text": "string",
      "clo_code": "CLO1|null",
      "bloom_level": "C1|C2|C3|C4|C5|C6|null",
      "bloom_name": "Remember|Understand|Apply|Analyze|Evaluate|Create|null",
      "action_verbs": ["string"],
      "confidence": 0.0
    }
  ],
  "parse_notes": "string — any issues or observations during parsing"
}`;

  const user = `Course code: ${courseCode || 'Unknown'}

Raw exam text to parse:
${ocrText.substring(0, 8000)}`;

  return { system, user };
}

module.exports = { bloomsCloParserPrompt };
