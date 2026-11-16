# FacultyMind eval report

Commit: `16f1ad8` (+ uncommitted changes) · Run: 2026-11-11T20:11:12.380Z

| Component | Metric | Result | Target | n | Status |
|---|---|---|---|---|---|
| ShadSync attainment math _(last run 2026-11-11 on c9bd05d (+ uncommitted changes))_ | checks matching hand-computed reference (±0.1%) | 100.0% | 100.0% | 63 checks | PASS |
| Marks-sheet import (cell-exact) _(last run 2026-11-11 on c9bd05d (+ uncommitted changes))_ | cells (marks, blanks, column maxima) identical after import | 100.0% | 100.0% | 858 cells | PASS |
| Question extraction (synthetic papers) _(last run 2026-11-11 on c9bd05d (+ uncommitted changes))_ | questions correctly split (id + text; spurious extras count against) | 99.2% | 98.0% | 126 questions (test) | PASS |
| Bloom's level per question (rule engine) | exact level agreement (test split, unambiguous items) | 85.4% | 90.0% | 41 questions (test) | FAIL |
| Intent router (rules + local model) _(last run 2026-11-11 on e862d98 (+ uncommitted changes))_ | agreement with intended intent (ambiguous excluded) | 99.1% | 90.0% | 328 commands (test) | PASS |

## Details

### ShadSync attainment math
8 cases; deterministic, no dev/test split needed

No failures.

### Marks-sheet import (cell-exact)
6 synthetic sheets (.xls and .xlsx; 1-9 columns; with/without CO, PO, Bloom rows; USN/ID/Roll headers; blanks; summary rows)

No failures.

### Question extraction (synthetic papers)
test 125/126 correct, 0 spurious; dev 268/270, 0 spurious = 99.3%

Failures:
- [dev] paper-12: missed Q3(b) ("Differentiate between compile …"); Q3(c) ("Implement a stack using an arr…"); 0 spurious (got Q1, Q2, Q3(a), Q4(a), Q4(b), Q4(c), Q5)

### Bloom's level per question (rule engine)
test: exact 35/41, ±1 90.2%; ambiguous 4/4 in the defensible set; non-measurable refused 3/4; sent to review 8.2%; accuracy by confidence: high 21/23, medium 14/18. dev: exact 88/104 (84.6%), ±1 85.6%, refused 2/4. Author-labelled data shares an author with the mapper: expect real teacher phrasing to score lower.

Failures:
- [dev] b011 expected C1 got null (low, verbs=) [author]: What is a primary key in a relational database?
- [dev] b017 expected C1 got C6 (high, verbs=build) [author]: What are the basic building blocks of a Flutter user interface?
- [dev] b021 expected C1 got C6 (high, verbs=propose) [author]: Who proposed the relational model of data?
- [dev] b023 expected C1 got null (low, verbs=) [author]: Mention the functions of the control unit of a CPU.
- [dev] b025 expected C1 got null (low, verbs=) [author]: What is the unit of capacitance?
- [dev] b051 expected C2 got null (low, verbs=) [author]: Why is a cache memory faster than main memory?
- [dev] b065 expected C3 got C1 (high, verbs=draw) [author]: Draw the timing diagram of a 3-bit synchronous up counter.
- [dev] b078 expected C3 got C1 (medium, verbs=sequence,state) [author]: Execute the given sequence of instructions and state the final value of register
- [dev] b085 expected C4 got C3 (medium, verbs=examine,identify) [author]: Examine the given network trace and identify the cause of the high latency.
- [dev] b091 expected C4 got C6 (medium, verbs=plan,locate) [author]: Dissect the given SQL execution plan and locate the bottleneck.
- [dev] b093 expected C4 got C6 (high, verbs=organize) [author]: Organize the given case study data into a table that exposes the relationship be
- [dev] b094 expected C4 got C1 (medium, verbs=identify) [author]: Deconstruct the given algorithm and identify which steps dominate its running ti
- [dev] b120 expected C5 got C3 (medium, verbs=determine) [author]: Determine whether the given encryption scheme is secure enough for patient recor
- [dev] b143 expected C6 got C3 (medium, verbs=produce) [author]: Produce a prototype of a smart door lock using a microcontroller and a keypad.
- [dev] b145 expected C6 got null (low, verbs=) [author]: Architect a fault-tolerant message queue for a banking application.
- [dev] b147 expected C6 got C3 (high, verbs=use) [author]: Draft a project proposal for an automated attendance system using face recogniti
- [dev] b158 should be REJECTED, got C3 (high): Demonstrate professional ethics by respecting the opinions of peers du
- [dev] b161 should be REJECTED, got null (flag): Students will know the fundamentals of electronics.

### Intent router (rules + local model)
TEST: model only 81.4%; rules decide 316/328 = 96.3% (256/328 = 78.0% instant, the rest with the model filling details) with precision 316/316 = 100.0%; combined 325/328 = 99.1%; by tag: clean 163/163, typo 79/81, banglish 83/84. DEV: model-only baseline: test split only; rules decide 717/765 = 93.7% (585/765 = 76.5% instant, the rest with the model filling details) with precision 717/717 = 100.0%; combined 757/765 = 99.0%; by tag: clean 360/361, typo 218/225, banglish 179/179. The 100 hand-written natural commands (all splits): combined 38/38 = 100.0%, model only 34/38 = 89.5%. 7 ambiguous not scored. Median latency 0 ms combined vs 2441 ms model-only.

Failures:
- [dev][LLM] "brig up the DIU portal" (typo): expected PORTAL_OPEN, got DIU_PORTAL_NAV
- [dev][LLM] "can you help me uderstand Ohm's law" (typo): expected GENERAL_CHAT, got MEMORY_STATUS
- [dev][LLM] "wrte a short poem about lab server" (typo): expected GENERAL_CHAT, got VAULT_SAVE
- [dev][LLM] "wrte a short poem about wifi" (typo): expected GENERAL_CHAT, got MEMORY_STATUS
- [dev][LLM] "brng up the DIU portal" (typo): expected PORTAL_OPEN, got DIU_PORTAL_NAV
- [dev][LLM] "what did I save about machine learning" (clean): expected VAULT_SEARCH, got MEMORY_STATUS
- [dev][LLM] "strt the BLC portal" (typo): expected PORTAL_OPEN, got DIU_PORTAL_NAV
- [dev][LLM] "Who failled ICE205 in the portal results?" (typo): expected DIU_PORTAL_QUERY, got SHADSYNC_QUERY

## Not yet measured

- Bloom's level, question→CLO map, Syllabus Doctor gaps, gap explanations: see ROADMAP Day 4.
