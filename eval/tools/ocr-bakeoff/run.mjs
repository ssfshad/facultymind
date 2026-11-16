// OCR bake-off runner. Usage: node run.mjs <engine> [limit]
// engines: tess-raw | tess-pre | gutenye-v4 | ppu-small | ppu-medium | ppu-small-unwarp
// Reads eval/data/private/ocr-bakeoff/photos.json (private, gitignored), writes
// eval/data/private/ocr-bakeoff/out/<engine>/<photo>.txt and timings.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..', '..');
const PHOTOS = path.join(ROOT, 'eval/data/private/papers');
const OUT = path.join(ROOT, 'eval/data/private/ocr-bakeoff/out');
const engine = process.argv[2];
const limit = Number(process.argv[3] || 1e9);
const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/data/private/ocr-bakeoff/photos.json'), 'utf8')).slice(0, limit);
fs.mkdirSync(path.join(OUT, engine), { recursive: true });

const ab = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
let recognize, cleanup = async () => {};

if (engine.startsWith('tess')) {
  const { default: sharp } = await import('sharp');
  const T = (await import('tesseract.js')).default;
  const worker = await T.createWorker('eng', 1, { langPath: ROOT, gzip: false, cachePath: path.join(here, '.tess-cache'), logger: () => {} });
  cleanup = () => worker.terminate();
  recognize = async (file) => {
    let input = fs.readFileSync(file);
    if (engine === 'tess-pre') {
      input = await sharp(input).rotate().grayscale().normalise().resize({ width: 2400, withoutEnlargement: false }).sharpen().png().toBuffer();
    }
    const { data } = await worker.recognize(input);
    return data.text.split('\n').map(s => s.trim()).filter(Boolean);
  };
} else if (engine === 'gutenye-v4') {
  const { default: Ocr } = await import('@gutenye/ocr-node');
  const ocr = await Ocr.create();
  recognize = async (file) => {
    const res = await ocr.detect(file);
    // rebuild rows from boxes (the engine returns text boxes in detection order)
    const items = res.texts.map(t => ({ t: t.text, x: t.box[0][0], y: (t.box[0][1] + t.box[2][1]) / 2, h: t.box[2][1] - t.box[0][1] }));
    items.sort((p, q) => p.y - q.y);
    const med = items.length ? [...items].sort((p, q) => p.h - q.h)[Math.floor(items.length / 2)].h : 20;
    const rows = []; let cur = [], curY = null;
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) <= 0.6 * med) { cur.push(it); curY = cur.reduce((a, b) => a + b.y, 0) / cur.length; }
      else { rows.push(cur); cur = [it]; curY = it.y; }
    }
    if (cur.length) rows.push(cur);
    return rows.map(r => r.sort((p, q) => p.x - q.x).map(i => i.t).join(' '));
  };
} else if (engine.startsWith('ppu')) {
  const { PaddleOcrService, V6_SMALL_MODEL, V6_MEDIUM_MODEL } = await import('ppu-paddle-ocr');
  const opts = { model: engine.startsWith('ppu-medium') ? V6_MEDIUM_MODEL : V6_SMALL_MODEL };
  if (engine.endsWith('unwarp')) opts.unwarping = { enabled: true };
  const svc = new PaddleOcrService(opts);
  await svc.initialize();
  cleanup = () => svc.destroy();
  recognize = async (file) => {
    const r = await svc.recognize(ab(fs.readFileSync(file)));
    return r.lines.map(g => g.map(i => i.text).join(' '));
  };
} else {
  throw new Error('unknown engine ' + engine);
}

const timings = {};
for (const f of list) {
  const t0 = Date.now();
  let lines;
  try { lines = await recognize(path.join(PHOTOS, f)); } catch (e) { lines = [`__ERROR__ ${e.message}`]; }
  timings[f] = Date.now() - t0;
  fs.writeFileSync(path.join(OUT, engine, f.replace(/\.jpg$/i, '.txt')), lines.join('\n'));
}
fs.writeFileSync(path.join(OUT, engine, 'timings.json'), JSON.stringify(timings, null, 1));
await cleanup();
const v = Object.values(timings);
console.log(`${engine}: ${v.length} photos, mean ${(v.reduce((a, b) => a + b, 0) / v.length / 1000).toFixed(2)} s/photo`);
