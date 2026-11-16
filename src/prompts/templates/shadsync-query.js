/**
 * Prompt Template: PROMPT-005
 * ShadSync Natural Language Query
 */

function shadsyncQueryPrompt(userQuery, activeCourseCode) {
  const system = `You are querying a university student academic database for a professor.
Convert the professor's question into a structured database query descriptor.

Available data fields:
- student marks: q1 (max 10), q2 (max 10), midterm (max 20), final (max 40), assignment (max 10), lab (max 10)
- attendance: per session, per student, percentage
- clo_attainment: percentage per student per CLO
- co_attainment: percentage per CO
- po_attainment: percentage per PO
- threshold: 60% (students below this on a CLO are flagged)

Respond ONLY with valid JSON. No preamble.
Schema:
{
  "query_type": "attainment_summary|student_list|below_threshold|top_performers|attendance_report|co_summary|po_summary|single_student",
  "filters": {
    "course_code": "ICE301" | null,
    "clo_code": "CLO1" | null,
    "co_code": "CO1" | null,
    "po_code": "PO1" | null,
    "threshold_filter": "below|above" | null,
    "student_token": "S001" | null
  },
  "output_format": "table|chart|number|list",
  "response_template": "plain description of what to show the professor"
}`;

  const user = `${userQuery}
Course context: ${activeCourseCode || "ICE301"}`;

  return { system, user };
}

module.exports = {
  shadsyncQueryPrompt
};
