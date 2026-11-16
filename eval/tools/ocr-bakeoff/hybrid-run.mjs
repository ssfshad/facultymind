// Hybrid experiment step 2. Writes out/winrot (Windows OCR + rotation fix) and out/hybrid (+ PaddleOCR-v4 tags merged by row).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { default as Ocr } from '@gutenye/ocr-node';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..', '..');
const H = path.join(ROOT, 'eval/data/private/ocr-bakeoff/hybrid');
const OUT = path.join(ROOT, 'eval/data/private/ocr-bakeoff/out');
const subset = JSON.parse(fs.readFileSync(path.join(H, 'subset.json'), 'utf8'));
for (const d of ['winrot', 'hybrid']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const STOP = new Set('the of and is to in for with are a an on by be as that this from or at which each following'.split(' '));
const rotScore = (rows) => rows.reduce((n, r) => n + r.text.toLowerCase().split(/[^a-z]+/).filter(w => STOP.has(w)).length, 0);

const TAG = /(CL[O0]|C[O0]|PL[O0]|P[O0])[\s\-]*0?\d|(^|[^A-Za-z])C[\s\/\-]*[1-6]([^0-9]|$)|LEVEL\s*[1-6]/i;
const ocr = await Ocr.create();
const chosen = {};
let mergedTags = 0;

for (const f of subset) {
  const base = f.replace(/\.jpg$/i, '');
  let best = null;
  for (const deg of [0, 90, 180, 270]) {
    const j = JSON.parse(fs.readFileSync(path.join(H, 'win', `${base}__${deg}.json`), 'utf8').replace(/^﻿/, ''));
    const rows = Array.isArray(j.rows) ? j.rows : (j.rows ? [j.rows] : []);
    const s = rotScore(rows);
    if (!best || s > best.s) best = { deg, s, rows, w: j.w, h: j.h };
  }
  chosen[f] = best.deg;
  const winLines = best.rows.map(r => r.text);
  fs.writeFileSync(path.join(OUT, 'winrot', base + '.txt'), winLines.join('\n'));

  // PaddleOCR v4 on the chosen rotation; keep only tag-bearing text boxes
  const res = await ocr.detect(path.join(H, 'rot', `${base}__${best.deg}.jpg`));
  const sy = best.h / res.resizedImageHeight; // boxes may be in resized space; scale to the Windows OCR frame
  const items = res.texts.map(t => ({ text: t.text, y: ((t.box[0][1] + t.box[2][1]) / 2) * sy }))
    .filter(t => TAG.test(t.text));
  const rows = best.rows.map(r => ({ y: r.y, text: r.text, extra: [] }));
  for (const it of items) {
    if (!rows.length) break;
    let nearest = rows[0];
    for (const r of rows) if (Math.abs(r.y - it.y) < Math.abs(nearest.y - it.y)) nearest = r;
    if (!nearest.text.includes(it.text)) { nearest.extra.push(it.text); mergedTags++; }
  }
  // where PaddleOCR supplies tags for a row, drop the tags Windows OCR already read there (avoid double counting)
  const stripTags = (t) => t.replace(/(CL[O0]|C[O0]|PL[O0]|P[O0])[\s\-]*0?\d/gi, ' ')
    .replace(/(?<![A-Za-z])C[\s\/\-]*[1-6](?![0-9])/g, ' ').replace(/LEVEL\s*[1-6]/gi, ' ');
  fs.writeFileSync(path.join(OUT, 'hybrid', base + '.txt'),
    rows.map(r => (r.extra.length ? [stripTags(r.text), ...r.extra] : [r.text]).join(' ')).join('\n'));
}
fs.writeFileSync(path.join(H, 'chosen-rotation.json'), JSON.stringify(chosen, null, 1));
console.log('done; rotations chosen:', JSON.stringify(Object.values(chosen).reduce((a, d) => (a[d] = (a[d] || 0) + 1, a), {})), 'tag boxes merged:', mergedTags);
