'use strict';
/**
 * Debug helper — extracts raw text from a course profile and dumps it.
 * Use this when the syllabus mapper produces wrong output.
 *
 * Usage:
 *   node scripts\debug-syllabus.js "C:\path\to\Course_Profile.docx"
 *
 * Pipe the output to a file:
 *   node scripts\debug-syllabus.js "...docx" > debug-output.txt
 */
const fs = require('fs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts\\debug-syllabus.js "path\\to\\Course_Profile.docx"');
  process.exit(1);
}
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

async function main() {
  const buffer = fs.readFileSync(filePath);
  let text = '';

  if (filePath.toLowerCase().endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (filePath.toLowerCase().endsWith('.pdf')) {
    const result = await pdfParse(buffer);
    text = result.text;
  } else {
    console.error('Unsupported file type. Use .docx or .pdf');
    process.exit(1);
  }

  console.log('═════════════════════════════════════════════════════════════');
  console.log('  RAW EXTRACTED TEXT (first 5000 chars)');
  console.log('═════════════════════════════════════════════════════════════');
  console.log(text.slice(0, 5000));

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  ALL LINES CONTAINING "CO" or "outcome" (max 30)');
  console.log('═════════════════════════════════════════════════════════════');
  text.split('\n')
    .filter(l => /\b(CO\s*\d|outcome|CLO\s*\d)/i.test(l))
    .slice(0, 30)
    .forEach((l, i) => console.log(`  [${i}] |${l.trim()}|`));

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log('  ALL LINES CONTAINING "Week" or starting with a digit (max 40)');
  console.log('═════════════════════════════════════════════════════════════');
  text.split('\n')
    .filter(l => /\bWeek\s*\d/i.test(l) || /^\s*\d{1,2}\s/.test(l))
    .slice(0, 40)
    .forEach((l, i) => console.log(`  [${i}] |${l.trim()}|`));

  console.log('\n═════════════════════════════════════════════════════════════');
  console.log(`  TOTAL CHARS: ${text.length}`);
  console.log(`  TOTAL LINES: ${text.split('\n').length}`);
  console.log(`  NON-EMPTY LINES: ${text.split('\n').filter(l => l.trim()).length}`);
  console.log('═════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
