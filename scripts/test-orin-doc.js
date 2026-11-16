'use strict';
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

(async () => {
  const filePath = process.argv[2] || 'C:\\Users\\Anxiety\\Desktop\\Course_Profile.docx';
  const buffer = fs.readFileSync(filePath);
  const { value: text } = await mammoth.extractRawText({ buffer });

  const {
    extractCourseOutcomes, extractWeeklyTopics, reverseMapTopic, detectAlignmentGaps
  } = require(path.join('..', 'src', 'modules', 'blooms', 'syllabus-mapper'));

  console.log('═══ COURSE OUTCOMES ═══');
  const cos = extractCourseOutcomes(text);
  console.log(`Found ${cos.length} COs:`);
  for (const co of cos) {
    console.log(`\n  ${co.code}:`);
    console.log(`    "${co.text}"`);
  }

  console.log('\n═══ WEEKLY TOPICS ═══');
  const weeks = extractWeeklyTopics(text);
  console.log(`Found ${weeks.length} weeks:`);
  for (const w of weeks) {
    console.log(`  ${w.week}: ${w.topics.slice(0, 100)}`);
  }

  console.log('\n═══ REVERSE MAPPING ═══');
  const mapped = weeks.map(w => {
    const r = reverseMapTopic(w.topics);
    return { ...w, mappedLevel: r?.level || null, mappedVerbs: r?.verbs || [], matchedKeyword: r?.matchedKeyword };
  });
  for (const w of mapped) {
    const lvl = w.mappedLevel ? `${w.mappedLevel} (matched: ${w.matchedKeyword})` : 'NO MATCH';
    console.log(`  ${w.week}: ${lvl}`);
  }

  console.log('\n═══ GAP DETECTION ═══');
  const gaps = detectAlignmentGaps(cos, mapped);
  console.log(`Found ${gaps.length} gaps:`);
  for (const g of gaps) {
    console.log(`\n  ${g.co} — ${g.gap_type}`);
    console.log(`    ${g.gap_description.slice(0, 150)}`);
    console.log(`    Suggested: "${g.suggested_rewrite.slice(0, 100)}"`);
  }
})();
