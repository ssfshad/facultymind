'use strict';
const path = require('path');
const { mapDeterministic, splitQuestions } = require(path.join('..', 'src', 'modules', 'blooms', 'clo-mapper-fast'));
const { extractSubQuestionsFromContext } = require(path.join('..', 'src', 'modules', 'blooms', 'document-dropper'));

const raw = `1. Finite automata are abstract machines used to recognize patterns in input sequences, forming the basis for understanding regular languages in computer science. Your task is to -
a. Design a deterministic finite automata (DFA) that strings over {a, b} where every a is immediately followed by b.
b. Design a DFA that strings over {0, 1} that is divisible by 5.
c. Design a DFA that strings over {a, b} where the sub strings are ab or ba but not both.
d. Design a non-deterministic finite automata (NFA) that strings over {0, 1} where number of 1 is odd and number of 0 is multiple of 5.
e. Design a NFA that strings over {a, b} where starts and ends are the same symbol.
f. Design a NFA that strings over {0, 1} that ends with 0.
N.B: It is required to mention available inputs for the developed DFA and NFA for evaluation.

2. An interrupt is a signal that temporarily stops a processor's current task to handle an urgent event, like a key press or I/O completion, improving efficiency by preventing the CPU from idle-waiting. When an interrupt occurs, the CPU saves its state, jumps to a special routine (Interrupt Service Routine or ISR) to deal with the event, and then resumes the original program, allowing responsive multitasking and efficient resource use.
a. Distinguish between interrupts and procedures
b. What happens when an interrupt occurs?
c. Criticize exceptions, faults, traps, dedicated interrupts and aborts.

3. Consider a user interface toolkit that supports multiple look-and-feel standards, such as Motif and Presentation Manager. Different look-and-feels define different appearances and behaviors for user interface widgets like scroll bars, windows, and buttons. To be portable across look-and-feel standards, an application should not hard-code its widgets for a particular look and feel. Design a solution using the Abstract Factory design pattern.`;

// Expected mappings
const expected = {
  'Q1(a)': 'C6', // Design → C6
  'Q1(b)': 'C6',
  'Q1(c)': 'C6',
  'Q1(d)': 'C6',
  'Q1(e)': 'C6',
  'Q1(f)': 'C6',
  'Q2(a)': 'C4', // Distinguish → C4
  'Q2(b)': 'C2', // What happens → describe/explain → C2
  'Q2(c)': 'C5', // Criticize → C5
  'Q3':    'C6', // Design → C6
};

function header(s) { console.log('\n' + '═'.repeat(72) + '\n  ' + s + '\n' + '═'.repeat(72)); }
function row(label, ok, detail) {
  const tag = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${tag}  ${label.padEnd(12)} ${detail}`);
}

header('Step 1: Raw splitQuestions output');
const rawSplit = splitQuestions(raw);
console.log(`  Raw split: ${rawSplit.length} questions`);
for (const q of rawSplit) console.log(`    ${q.id.padEnd(8)} ${q.text.slice(0, 80)}`);

header('Step 2: After extractSubQuestionsFromContext');
const processed = extractSubQuestionsFromContext(rawSplit);
console.log(`  After extraction: ${processed.length} questions`);
for (const q of processed) console.log(`    ${q.id.padEnd(8)} ${q.text.slice(0, 80)}`);

header('Step 3: Mapping accuracy');
const result = mapDeterministic(raw, 'CS-TEST');
// Also run on the processed questions directly
const processedText = processed.map(q => `${q.id}. ${q.text}`).join('\n');
const result2 = mapDeterministic(processedText, 'CS-TEST');

const byId = {};
for (const m of result2.clo_mappings) byId[m.clo_code.replace('CLO-', '')] = m;

let pass = 0, fail = 0;
for (const [id, exp] of Object.entries(expected)) {
  const got = byId[id];
  const ok  = got && got.bloom_level === exp;
  row(`${id}: exp ${exp}`, ok,
    got ? `got ${got.bloom_level} (${got.confidence}, verb=${(got.detected_verbs||[]).join(',')})` : 'NOT FOUND');
  ok ? pass++ : fail++;
}
console.log(`\n  ${pass}/${pass+fail} = ${(pass/(pass+fail)*100).toFixed(0)}%`);
