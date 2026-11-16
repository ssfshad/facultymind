'use strict';
const path = require('path');
const {
  extractCourseOutcomes, extractWeeklyTopics,
  reverseMapTopic, detectAlignmentGaps
} = require(path.join('..', 'src', 'modules', 'blooms', 'syllabus-mapper'));

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag}  ${label.padEnd(40)} ${detail}`);
}

// ── Simulate Orin ma'am's Course Profile text ─────────────────────────────
const sampleDoc = `
Course Title: Electrical Circuits
Instructor: Tasnia Noshin Orin

Course Outcomes:
CO1: Demonstrate systematically to obtain the equations that characterize the performance of an Electric Circuit.
CO2: Be able to gain experience in using various techniques of mathematical induction to prove simple mathematical properties.
CO3: Be able to specify and manipulate basic mathematical objects such as sets, functions, and relations.

Part B: Weekly Course Content

Week 1: Definition of circuit; basic elements; voltage and current sources
Week 2: Ohm's law; KCL; KVL; series and parallel circuits
Week 3: Nodal analysis introduction; mesh analysis introduction
Week 4: Nodal analysis with case study; supernode
Week 5: Mesh analysis; supermesh
Week 6: Thevenin's Theorem; Norton's Theorem
Week 7: Delta-Wye conversions; Superposition theorem
Week 8: Maximum power transfer; source transformation
Week 9: Review and problem solving
Week 10: Midterm examination
Week 11: AC sinusoidal analysis; phasors and phasor diagrams
Week 12: AC power analysis; impedance
Week 13: Capacitor; Inductor; RLC circuits
Week 14: Resonance; frequency response
Week 15: Project Presentation; Hands on Project based on the knowledge of circuit analysis
`;

header('1. CO Extraction');
const cos = extractCourseOutcomes(sampleDoc);
console.log(`  Extracted ${cos.length} COs:`);
for (const co of cos) {
  console.log(`    ${co.code}: ${co.text.slice(0, 80)}`);
}
row('Extracted 3 COs', cos.length === 3, `got ${cos.length}`);
row('CO2 preamble stripped', !cos[1]?.text.startsWith('Be able'), cos[1]?.text.slice(0, 50));

header('2. Weekly Topic Extraction');
const weeks = extractWeeklyTopics(sampleDoc);
console.log(`  Extracted ${weeks.length} weeks`);
row('Found 15 weeks', weeks.length === 15, `got ${weeks.length}`);

header('3. Reverse Mapping');
const tests = [
  { topic: 'Nodal analysis with case study; supernode', expected: 'C4' },
  { topic: 'Thevenin\'s Theorem; Norton\'s Theorem', expected: 'C4' },
  { topic: 'Ohm\'s law; KCL; KVL', expected: 'C2' },
  { topic: 'Definition of circuit; basic elements', expected: 'C1' },
  { topic: 'Project Presentation; Hands on Project', expected: 'C3' },
  { topic: 'AC sinusoidal analysis; phasors', expected: 'C4' },
];
let pass = 0, fail = 0;
for (const t of tests) {
  const result = reverseMapTopic(t.topic);
  const ok = result?.level === t.expected;
  row(`"${t.topic.slice(0, 35)}..."`, ok,
    result ? `${result.level} (matched: "${result.matchedKeyword}")` : 'NO MATCH');
  ok ? pass++ : fail++;
}
console.log(`\n  Reverse map: ${pass}/${pass+fail}`);

header('4. Gap Detection (Orin ma\'am\'s document)');
const mappedWeeks = weeks.map(w => {
  const match = reverseMapTopic(w.topics);
  return { ...w, mappedLevel: match?.level || null, mappedVerbs: match?.verbs || [] };
});
const gaps = detectAlignmentGaps(cos, mappedWeeks);
console.log(`  Found ${gaps.length} gap${gaps.length === 1 ? '' : 's'}:`);
for (const g of gaps) {
  console.log(`\n    ${g.co} — ${g.gap_type}`);
  console.log(`    ${g.gap_description.slice(0, 100)}`);
  console.log(`    Suggested: "${g.suggested_rewrite.slice(0, 80)}"`);
}
row('CO2 gap detected (Domain Mismatch)', gaps.some(g => g.co === 'CO2' && g.gap_type === 'DOMAIN_MISMATCH'), '');
row('CO3 gap detected', gaps.some(g => g.co === 'CO3'), '');
row('CO1 is clean (no gap)', !gaps.some(g => g.co === 'CO1'), '');

process.exit(0);
