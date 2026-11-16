# FacultyMind — Quality Bar (Definition of Done)

Set by Shad, 2026-10-29. A hero-flow component is **done** only when it meets its target
on the held-out **test** split, measured by `npm run eval` (writes `eval/REPORT.md`).

| Component | Metric | Target |
|---|---|---|
| ShadSync attainment math | vs hand-computed reference (±0.1%) | 100% |
| Marks-sheet import | cell-exact | 100% |
| Question extraction PDF/DOCX | questions correctly split | ≥98% |
| Bloom's level | exact agreement with teacher labels (also report ±1) | ≥90% |
| Question→CLO mapping | agreement with teacher map | ≥90% |
| Syllabus Doctor gaps | precision AND recall | ≥90% |
| Gap explanations | cited numbers/questions exist in data (auto-checked) | 100% |
| Intent router | 100-command set incl. typos/Banglish | ≥90% |

## Eval rules

1. **Data:** labelled data lives in `eval/data/`. Anything containing real student
   names/IDs goes in `eval/data/private/`, which is gitignored.
2. **Split:** fixed-seed 70/30 dev/test split. The seed and split are committed so the
   split never changes silently.
3. **No peeking:** tune ONLY on dev. Never read test items while fixing.
4. **No special-casing:** no rules keyed to specific questions, papers or courses.
5. **Confidence:** every Bloom's/CLO prediction carries a confidence score.
   Low-confidence predictions show "please confirm" in the UI. The report gives
   accuracy separately for **confident** and **flagged** items, and the flag rate.
6. **Ambiguity:** items where teachers disagree are reported as "ambiguous" and
   excluded from the accuracy number (but counted and listed).
7. **Report:** `npm run eval` writes `eval/REPORT.md` with per-component metric,
   target, pass/fail, sample size, and the commit it ran on.
