'use strict';
// Fixed-seed 70/30 dev/test split (QUALITY.md rule 2). The committed split.json
// is the source of truth: if the item ids change, the run fails loudly instead of
// silently re-shuffling (which would let test items leak into tuning).

const fs = require('fs');
const path = require('path');

const SEED = 20261029;
const SPLIT_FILE = path.join(__dirname, '..', 'data', 'split.json');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSplit(ids) {
  const rnd = mulberry32(SEED);
  const sorted = [...ids].sort();
  for (let i = sorted.length - 1; i > 0; i--) { // Fisher-Yates
    const j = Math.floor(rnd() * (i + 1));
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }
  const nDev = Math.round(sorted.length * 0.7);
  return { dev: sorted.slice(0, nDev).sort(), test: sorted.slice(nDev).sort() };
}

/** { component: { dev: [ids], test: [ids] } } — created once, then frozen. */
function loadSplit(component, ids) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(SPLIT_FILE, 'utf8')); } catch (_) {}
  if (!all[component]) {
    all[component] = { seed: SEED, ...makeSplit(ids) };
    fs.writeFileSync(SPLIT_FILE, JSON.stringify(all, null, 2) + '\n');
  }
  const s = all[component];
  const known = new Set([...s.dev, ...s.test]);
  const current = new Set(ids);
  const same = known.size === current.size && [...known].every(i => current.has(i));
  if (!same) {
    throw new Error(`eval split for "${component}" no longer matches its data. ` +
      `Items changed after the split was frozen; adding/removing items needs a deliberate new split ` +
      `(delete the "${component}" entry in eval/data/split.json and say so in the commit).`);
  }
  return s;
}

module.exports = { loadSplit, SEED };
