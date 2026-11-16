'use strict';
// Generates eval/data/question-split.json: synthetic exam papers in the layouts seen on
// real DIU ICE papers (table rows, bare numbers, "Question-N:" headers, trailing
// CLO/Bloom tags, scenario + "Requirement:" blocks). Each has the exact list of question
// ids that SHOULD be extracted. Fixed seed => same file every time.
// Synthetic on purpose: no real paper text, no student data, safe to commit.
//   node eval/data/gen-question-papers.js

const fs = require('fs');
const path = require('path');

function rng(seed) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r = rng(515151);
const pick = (arr) => arr[Math.floor(r() * arr.length)];
const chance = (p) => r() < p;
const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

const STEMS = [
  'Define encapsulation and explain why it matters in object oriented design.',
  'Explain the difference between an abstract class and an interface with examples.',
  'Write a program to reverse a string without using built-in functions.',
  'Design a class hierarchy for a library management system and justify your choices.',
  'Compare series and parallel resonant circuits in terms of bandwidth.',
  'Calculate the cutoff frequency of an RC low-pass filter with R = 1 kOhm and C = 100 nF.',
  'Describe the role of the operating system scheduler in a multitasking environment.',
  'Evaluate the suitability of a hash table versus a balanced tree for a dictionary application.',
  'List the four pillars of object oriented programming.',
  'Draw the state diagram of a finite automaton that accepts binary strings ending in 01.',
  'Analyze the time complexity of merge sort and state the recurrence relation.',
  'Implement a stack using an array and show push and pop operations.',
  'Discuss the advantages of normalization in relational database design.',
  'Construct an ER diagram for a university registration system.',
  'Summarize the main differences between TCP and UDP.',
  'Apply Kirchhoff voltage law to find the loop current in the given circuit.',
  'Differentiate between compile time and run time polymorphism.',
  'Represent the number (1101.101) in normalized floating-point form.',
  'Justify the use of design patterns in large software systems.',
  'Identify the critical path in the given project network diagram.',
  'Trace the output of the following program and explain each step.',
  'Find the unknown node voltages from the figure given below using nodal analysis.',
  'Recommend the ways of verification of different simulation models.',
  'Categorize the susceptibility of a system to failure in detail.',
];
const SCENARIOS = [
  ['The Adventure Traders was started on May 1 by a local investor. The following events occurred during the month:',
   ['May 1  Invested Tk. 80,000 cash and Tk. 25,000 furniture in the business.', 'May 4  Purchased equipment for Tk. 20,000 on account.', 'May 8  Incurred advertising expenses of Tk. 1,800 on account.', 'May 12  Hired a manager at a salary of Tk. 24,000 per month.', 'May 31  Paid Tk. 700 for advertising incurred at May 8.'],
   ['Journalize the transactions.', 'Post the journal entries to the ledger for cash and accounts payable.']],
  ['A river resort opened for business on June 1 with eight air conditioned units. Its trial balance is as follows:',
   ['Cash  19,600', 'Supplies  3,300', 'Equipment  12,500'],
   ['Prepare the adjusting entries.', 'Prepare an adjusted trial balance.']],
];
const HEADERS = [
  ['Daffodil International University', 'Department of Information and Communication Engineering (ICE)', 'Faculty of Engineering', 'Final Examination, Spring-2026', 'Course Code: ICE 1243    Course Title: Numerical Analysis', 'Level & Term: L1T2   Section: A', 'Time: 2 hours   Full Marks: 40', 'N.B: Answer all the questions (Only any one from Question 3)'],
  ['Daffodil International University', 'Mid-Term Examination, Fall 2026', 'Course Code: EEE 1345   Course Title: Electrical Circuits', 'Course Teacher: Test Teacher (TT)', 'Time: 1:30 Hrs        Marks: 25', 'Answer ALL Questions [ANY TWO FROM QUESTION No. 02]', 'The figures in the right margin indicate the full marks and corresponding Course Learning Outcomes.'],
  ['DAFFODIL INTERNATIONAL UNIVERSITY', 'Department of Information & Communication Engineering', 'Final Examination, Spring-2023', 'Course Code: HUM 101 (Day),  Course Title: ICT Economics & Accounting', 'Instructor: SS,  Slot: A', 'Date: Saturday, 17 June, 2023   Time: 09:00 AM-11:00 AM', 'Marks: 40'],
  ['Department of ICE', 'Class Test 2', 'Time: 30 minutes   Marks: 20'],
];

const tagBloom = () => `C${int(1, 6)}`;
const sub = (i) => 'abcd'[i];

// Each layout renders one paper and returns { lines, gold }. gold ids: Q<n> or Q<n>(<a>).
// Sub-parts like (i)/(ii) inside a sub-question are NOT separate questions.

function layoutTable() { // number | a) | text | marks | CLO C/x  (number only on first row of a question)
  const gold = [], lines = [];
  const n = int(2, 4);
  const sep = chance(0.5) ? ' | ' : '  ';
  for (let q = 1; q <= n; q++) {
    const k = chance(0.3) ? 1 : int(2, 4);
    for (let s = 0; s < k; s++) {
      const stem = pick(STEMS);
      const numCell = s === 0 ? `${q}${pick(['.', ')', ''])}` : '';
      const subCell = k === 1 ? '' : `${sub(s)})`;
      const m = pick([`5×1 =5`, `[4]`, `${int(2, 10)}`, `[${int(2, 5)}+${int(2, 5)}]`]);
      lines.push([numCell, subCell, stem, m, `CLO${int(1, 4)} C/${int(1, 6)}`].filter(x => x !== '').join(sep));
      gold.push({ id: k === 1 ? `Q${q}` : `Q${q}(${sub(s)})`, stem: stem.slice(0, 30) });
    }
  }
  return { lines, gold };
}

function layoutInlineSubs() { // "1)" then "a) ..." lines, tag on first line of the block
  const gold = [], lines = [];
  const n = int(2, 5);
  for (let q = 1; q <= n; q++) {
    const k = chance(0.35) ? 1 : int(2, 3);
    const style = pick([(s) => `${sub(s)})`, (s) => `${sub(s)}.`, (s) => `(${sub(s)})`]);
    const mainFmt = pick([(x) => `${x})`, (x) => `${x}.`, (x) => `${x}`]);
    if (k === 1) {
      const stem = pick(STEMS);
      lines.push(`${mainFmt(q)} ${stem}   [${int(3, 10)}]`);
      lines.push(`[CLO-${int(1, 5)}, C/${int(1, 6)}]`);
      gold.push({ id: `Q${q}`, stem: stem.slice(0, 30) });
    } else {
      for (let s = 0; s < k; s++) {
        const stem = pick(STEMS);
        const head = s === 0 ? `${mainFmt(q)} ` : '';
        lines.push(`${head}${style(s)} ${stem}   [${int(2, 6)}]`);
        if (chance(0.6)) lines.push(`[CLO-${int(1, 5)}, C/${int(1, 6)}]`);
        gold.push({ id: `Q${q}(${sub(s)})`, stem: stem.slice(0, 30) });
      }
    }
  }
  return { lines, gold };
}

function layoutQuestionHeader() { // "Question-N:" / "Questrion-N:" on its own line, subs underneath, Part-A/B headings
  const gold = [], lines = [];
  const n = int(2, 4);
  const word = pick(['Question', 'Question', 'Questrion', 'Ques']);
  for (let q = 1; q <= n; q++) {
    if (chance(0.5) && q <= 2) lines.push(`Part-${q === 1 ? 'A' : 'B'}`, chance(0.5) ? '(Answer all the questions)' : '');
    lines.push(`${word}-${q}:`);
    const k = int(2, 3);
    for (let s = 0; s < k; s++) {
      const stem = pick(STEMS);
      lines.push(`${sub(s)}) ${stem}${' '.repeat(int(1, 4))}(${int(2, 9)})`);
      gold.push({ id: `Q${q}(${sub(s)})`, stem: stem.slice(0, 30) });
    }
    lines.push('');
  }
  return { lines: lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')), gold };
}

function layoutBareNumber() { // "4" alone, subs "a." with trailing "2(CO3, C4)"
  const gold = [], lines = [];
  const n = int(2, 4);
  for (let q = 1; q <= n; q++) {
    const k = int(2, 4);
    lines.push(`${q}`);
    for (let s = 0; s < k; s++) {
      const stem = pick(STEMS);
      lines.push(`${sub(s)}. ${stem}   ${int(1, 6)}(CO${int(1, 5)}, C${int(1, 6)})`);
      if (chance(0.2)) lines.push(`(i) first case   (ii) second case`);
      gold.push({ id: `Q${q}(${sub(s)})`, stem: stem.slice(0, 30) });
    }
  }
  return { lines, gold };
}

function layoutScenario() { // "Question-N:" + story + dated lines + "Requirement:" a./b.
  const gold = [], lines = [];
  const n = int(2, 3);
  for (let q = 1; q <= n; q++) {
    if (chance(0.5) || q === 1) {
      const [intro, items, reqs] = pick(SCENARIOS);
      lines.push(`Question-${q}:`, intro, ...items, '', 'Requirement:');
      reqs.forEach((t, s) => { lines.push(`${sub(s)}. ${t}   (${int(3, 8)})`); gold.push({ id: `Q${q}(${sub(s)})`, stem: t.slice(0, 30) }); });
    } else {
      const stem = pick(STEMS);
      lines.push(`Question-${q}:`, `${stem}   (${int(3, 9)})`);
      gold.push({ id: `Q${q}`, stem: stem.slice(0, 30) });
    }
    lines.push('');
  }
  return { lines, gold };
}

const LAYOUTS = [layoutTable, layoutInlineSubs, layoutQuestionHeader, layoutBareNumber, layoutScenario];

function makePaper(i) {
  const L = LAYOUTS[i % LAYOUTS.length];
  const { lines, gold } = L();
  const text = [...pick(HEADERS), '', ...lines].join('\n');
  return { id: `paper-${String(i + 1).padStart(2, '0')}`, layout: L.name.replace('layout', ''), text, gold };
}

const items = Array.from({ length: 60 }, (_, i) => makePaper(i));
fs.writeFileSync(path.join(__dirname, 'question-split.json'), JSON.stringify(items, null, 1) + '\n');
console.log(`wrote ${items.length} papers, ${items.reduce((a, p) => a + p.gold.length, 0)} questions`);
