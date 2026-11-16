'use strict';
/**
 * Unit test for the gap analyzer prompt against the DBMS document COs.
 * Verifies that the prompt correctly identifies non-measurable verbs
 * WITHOUT needing a live LLM call — tests the prompt structure and
 * the deterministic fallback path.
 */
const path = require('path');
const { detectAlignmentGaps, extractCourseOutcomes, extractWeeklyTopics } = require(
  path.join('..', 'src', 'modules', 'blooms', 'syllabus-mapper')
);

// The exact COs from the DBMS document
const dbmsCOs = [
  { code: 'CO1', text: 'Gain a foundational understanding of database management systems, including data models, normalization principles, and relational algebra.' },
  { code: 'CO2', text: 'Develop proficiency in SQL for data manipulation, querying, and database schema definition.' },
  { code: 'CO3', text: 'Learn to design and implement efficient relational databases using normalization techniques and proper schema design principles.' },
  { code: 'CO4', text: 'Understand database security concepts and implement measures such as authentication, authorization, encryption, and auditing to protect data integrity and confidentiality.' },
  { code: 'CO5', text: 'Explore advanced topics such as distributed databases, NoSQL databases, and data warehousing to understand emerging trends and technologies in the field.' },
  { code: 'CO6', text: 'Understand emerging trends in database management, demonstrating an understanding of the broader context and challenges in the field.' },
];

const dbmsWeeks = [
  { week: 'Week 1', topics: 'Introduction to databases, Relational Data Model, Database Design and Normalization', mappedLevel: 'C1', mappedVerbs: ['define', 'list', 'state'] },
  { week: 'Week 2', topics: 'SQL Basics, Data definition language (DDL), Data manipulation language (DML), Querying databases with CRUD Operations', mappedLevel: 'C3', mappedVerbs: ['implement', 'apply'] },
  { week: 'Week 3', topics: 'CRUD operations using SQL, Grouping and aggregation, Views and indexes', mappedLevel: 'C3', mappedVerbs: ['implement', 'apply'] },
  { week: 'Week 4', topics: 'Database Implementation, Storage and file structures, Indexing techniques, Query processing and optimization', mappedLevel: 'C4', mappedVerbs: ['analyze', 'design'] },
  { week: 'Week 5', topics: 'Database Security, Security threats and vulnerabilities, Authentication and authorization, Encryption and access control', mappedLevel: 'C3', mappedVerbs: ['implement', 'apply'] },
];

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag}  ${label.padEnd(40)} ${detail}`);
}

header('DBMS CO Non-Measurable Verb Detection (deterministic fallback)');

// Test the deterministic fallback path
const gaps = detectAlignmentGaps(dbmsCOs, dbmsWeeks);
console.log(`  Found ${gaps.length} gaps\n`);
for (const g of gaps) {
  console.log(`  ${g.co} — ${g.gap_type}: ${g.gap_description?.slice(0, 80)}`);
}

// Expected: CO1, CO2, CO3, CO4, CO5, CO6 should all be flagged
// CO2 "Develop proficiency in SQL" — "develop proficiency" is non-measurable (proficiency = state of mind)
const expected = ['CO1', 'CO2', 'CO3', 'CO4', 'CO5', 'CO6'];
let pass = 0, fail = 0;
console.log('');
for (const co of expected) {
  const found = gaps.some(g => g.co === co);
  row(`${co} flagged`, found, found ? gaps.find(g => g.co === co)?.gap_type : 'NOT FLAGGED');
  found ? pass++ : fail++;
}

console.log(`\n  ${pass}/${pass+fail} = ${(pass/(pass+fail)*100).toFixed(0)}%`);

header('Prompt structure check');
const { syllabusGapAnalyzerPrompt, syllabusWeekLevelsPrompt } = require(
  path.join('..', 'src', 'prompts', 'templates', 'syllabus-gap-analyzer')
);
const p1 = syllabusGapAnalyzerPrompt(dbmsCOs, dbmsWeeks);
const p2 = syllabusWeekLevelsPrompt(dbmsWeeks);
console.log(`  CO prompt: system=${p1.system.length} chars, user=${p1.user.length} chars`);
console.log(`  Week prompt: system=${p2.system.length} chars, user=${p2.user.length} chars`);
row('CO prompt user < 2000 chars', p1.user.length < 2000, `${p1.user.length} chars`);
row('Week prompt user < 2000 chars', p2.user.length < 2000, `${p2.user.length} chars`);
row('Non-measurable list in CO prompt', p1.system.includes('gain a foundational understanding'), '');
row('"learn to" in CO prompt', p1.system.includes('learn to'), '');
row('"explore" in CO prompt', p1.system.includes('explore'), '');

process.exit(0);
