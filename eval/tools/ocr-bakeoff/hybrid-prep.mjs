// Hybrid experiment step 1: pick 20 photos (every 2nd of the 50) and write 4 rotated copies of each.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..', '..');
const PRIV = path.join(ROOT, 'eval/data/private');
const all = JSON.parse(fs.readFileSync(path.join(PRIV, 'ocr-bakeoff/photos.json'), 'utf8'));
const pick = all.filter((_, i) => i % 2 === 0); // 25 photos; keep the first 20
const subset = pick.slice(0, 20);
const outDir = path.join(PRIV, 'ocr-bakeoff/hybrid/rot');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(PRIV, 'ocr-bakeoff/hybrid/subset.json'), JSON.stringify(subset, null, 1));
for (const f of subset) {
  const base = await sharp(path.join(PRIV, 'papers', f)).rotate().toBuffer(); // apply EXIF orientation once
  for (const deg of [0, 90, 180, 270]) {
    await sharp(base).rotate(deg).jpeg({ quality: 92 }).toFile(path.join(outDir, f.replace(/\.jpg$/i, `__${deg}.jpg`)));
  }
}
console.log('prepared', subset.length, 'photos x 4 rotations');
