'use strict';
// Scores every engine's OCR output against the hand-made gold (private).
//   ELECTRON_RUN_AS_NODE=1 electron eval/tools/ocr-bakeoff/score.js
// Metrics per engine (micro-averaged over the scored photos):
//   labels  : question/sub-question labels in reading order (LCS recall / precision / F1)
//   tags    : CLO/CO/PO/PLO + Bloom (C1-C6) tags, multiset recall / precision
//   split   : ids from the app's splitQuestions() on the OCR text vs ids derived from gold
//             (only photos that start at a numbered question, i.e. not continuation pages)
//   sec     : mean seconds per photo
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIR = path.join(ROOT, 'eval/data/private/ocr-bakeoff');
const { splitQuestions } = require(path.join(ROOT, 'src/modules/blooms/clo-mapper-fast'));

const gold = fs.readFileSync(path.join(DIR, 'gold.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(g => !g.skip);
const onlyFile = process.env.ONLY;
const only = onlyFile ? new Set(JSON.parse(fs.readFileSync(onlyFile, 'utf8'))) : null;
if (only) for (let i = gold.length - 1; i >= 0; i--) if (!only.has(gold[i].file)) gold.splice(i, 1);
const engines = fs.readdirSync(path.join(DIR, 'out')).filter(e => fs.statSync(path.join(DIR, 'out', e)).isDirectory()).sort();

// ── label extraction ────────────────────────────────────────────────────────
function extractLabels(text) {
  const out = [];
  for (let line of text.split('\n')) {
    line = line.replace(/^[\s|]+/, '');
    let guard = 0;
    while (line && guard++ < 4) {
      let m;
      if ((m = line.match(/^(?:Q(?:uestion|ues)?|Problem)[\s.\-]*0?(\d{1,2})\s*[.):]?\s*(?:\(?([a-h])[.)]\s*)?/i)) && !/^Q[a-z]*\s*\.\s*[a-h]\)/i.test(line)) {
        out.push(m[1]); if (m[2]) out.push(m[2].toLowerCase()); line = line.slice(m[0].length);
      } else if ((m = line.match(/^Q\s*\.\s*([a-h])\s*[.)]\s*/i))) {
        out.push(m[1].toLowerCase()); line = line.slice(m[0].length);
      } else if ((m = line.match(/^0?(\d{1,2})\s*\.?\s*\(([a-h])\)\s*/))) {            // 3(b)  5.(b)
        out.push(m[1], m[2]); line = line.slice(m[0].length);
      } else if ((m = line.match(/^0?(\d{1,2})\s*[.):](?:\s+|$)/)) || (m = line.match(/^0?(\d{1,2})[.)](?=\S)/))) {
        out.push(m[1]); line = line.slice(m[0].length);
      } else if ((m = line.match(/^\(?([a-h])\s*[.)](?:\s+|$)/i)) && /^[a-h]/.test(line[0] === '(' ? line[1] : line[0])) {
        out.push(m[1].toLowerCase()); line = line.slice(m[0].length);
      } else break;
      line = line.replace(/^[\s|]+/, '');
    }
  }
  return out;
}

function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

// ── tag extraction ──────────────────────────────────────────────────────────
function extractTags(text) {
  const t = text.toUpperCase().replace(/\n/g, ' ');
  const tags = [];
  for (const m of t.matchAll(/CL[O0][\s\-]*0?(\d)/g)) tags.push('CLO' + m[1]);
  for (const m of t.matchAll(/(?<![A-Z])C[O0][\s\-]*0?(\d)/g)) tags.push('CO' + m[1]);
  for (const m of t.matchAll(/(?<![A-Z])PLO[\s\-]*0?(\d)/g)) tags.push('PLO' + m[1]);
  for (const m of t.matchAll(/(?<![A-Z])PO[\s\-]*0?(\d)/g)) tags.push('PO' + m[1]);
  for (const m of t.matchAll(/(?<![A-Z])C[\s\/\-]*([1-6])(?![0-9])/g)) tags.push('C' + m[1]);
  for (const m of t.matchAll(/LEVEL\s*([1-6])(?![0-9])/g)) tags.push('C' + m[1]);
  return tags;
}
function multisetOverlap(gold, pred) {
  const cnt = new Map(); for (const g of gold) cnt.set(g, (cnt.get(g) || 0) + 1);
  let hit = 0; for (const p of pred) { if ((cnt.get(p) || 0) > 0) { hit++; cnt.set(p, cnt.get(p) - 1); } }
  return hit;
}

// ── gold labels -> question ids (for the end-to-end splitter metric) ────────
function idsFromLabels(labels) {
  const ids = []; let main = null; let placeholder = null;
  for (const l of labels) {
    if (/^\d+$/.test(l)) {
      if (l !== main) { main = l; placeholder = `Q${l}`; ids.push(placeholder); }
    } else if (main !== null) {
      if (placeholder) { const i = ids.lastIndexOf(placeholder); if (i >= 0) ids.splice(i, 1); placeholder = null; }
      ids.push(`Q${main}(${l})`);
    }
  }
  return ids;
}

const rows = [];
for (const eng of engines) {
  const edir = path.join(DIR, 'out', eng);
  let gLab = 0, pLab = 0, hLab = 0, gTag = 0, pTag = 0, hTag = 0, n = 0;
  let sG = 0, sP = 0, sH = 0, sN = 0;
  const per = [];
  for (const g of gold) {
    const f = path.join(edir, g.file.replace(/\.jpg$/i, '.txt'));
    if (!fs.existsSync(f)) continue;
    n++;
    const text = fs.readFileSync(f, 'utf8');
    const lab = extractLabels(text);
    const l = lcs(g.labels, lab);
    gLab += g.labels.length; pLab += lab.length; hLab += l;
    const tg = extractTags(text);
    const h = multisetOverlap(g.tags, tg);
    gTag += g.tags.length; pTag += tg.length; hTag += h;
    // end-to-end: only photos that begin at a numbered question
    if (g.labels.length && /^\d+$/.test(g.labels[0])) {
      const goldIds = idsFromLabels(g.labels);
      let predIds = [];
      try { predIds = splitQuestions(text).map(q => q.id); } catch (_) {}
      const hit = multisetOverlap(goldIds, predIds);
      sG += goldIds.length; sP += predIds.length; sH += hit; sN++;
    }
    per.push({ file: g.file, labF1: g.labels.length + lab.length ? 2 * l / (g.labels.length + lab.length) : 1 });
  }
  let sec = null;
  try { const t = JSON.parse(fs.readFileSync(path.join(edir, 'timings.json'), 'utf8')); const v = Object.values(t); sec = v.reduce((a, b) => a + b, 0) / v.length / 1000; } catch (_) {}
  const f1 = (r, p) => (r + p ? 2 * r * p / (r + p) : 0);
  const labR = hLab / gLab, labP = pLab ? hLab / pLab : 0;
  const tagR = gTag ? hTag / gTag : 0, tagP = pTag ? hTag / pTag : 0;
  const spR = sG ? sH / sG : 0, spP = sP ? sH / sP : 0;
  rows.push({ eng, n, labels: f1(labR, labP), labR, labP, tagR, tagP, tagF1: f1(tagR, tagP), splitR: spR, splitP: spP, splitF1: f1(spR, spP), splitN: sN, sec });
}

const pct = (x) => (x * 100).toFixed(1);
rows.sort((a, b) => b.splitF1 - a.splitF1);
const lines = [
  '| Engine | Photos | Label F1 | Tag recall | Tag precision | Split F1 (end-to-end) | s/photo |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.eng} | ${r.n} | ${pct(r.labels)} | ${pct(r.tagR)} | ${pct(r.tagP)} | ${pct(r.splitF1)} (${r.splitN} photos) | ${r.sec == null ? '?' : r.sec.toFixed(2)} |`),
];
console.log(lines.join('\n'));
fs.writeFileSync(path.join(DIR, 'summary.md'), lines.join('\n') + '\n');
