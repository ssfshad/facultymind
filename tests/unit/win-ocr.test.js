'use strict';
// Windows OCR: reads text, keeps rows together, straightens rotated photos, and falls back to Tesseract.
// Skipped on machines without Windows OCR (macOS/Linux): the fallback test still runs there.

const h = require('../helpers/harness');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { createCanvas } = require(path.join(h.ROOT, 'node_modules', '@napi-rs', 'canvas'));
const sharp = require(path.join(h.ROOT, 'node_modules', 'sharp'));
const winOcr = h.src('modules/blooms/win-ocr');

// A page like a table row paper: label column on the left, question text on the right, same baseline.
function page(lines) {
  const c = createCanvas(1400, 120 + lines.length * 70);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000'; g.font = '32px Arial';
  lines.forEach(([label, text], i) => { const y = 90 + i * 70; g.fillText(label, 60, y); g.fillText(text, 200, y); });
  return c.toBuffer('image/png');
}
const LINES = [
  ['1)', 'Define encapsulation and explain why it matters in the design of software.'],
  ['2)', 'Compare series and parallel resonant circuits in terms of the bandwidth.'],
  ['3)', 'Describe the role of the scheduler in a multitasking operating system.'],
];

describe('Windows OCR', async () => {
  const available = await winOcr.isAvailable();
  const t = available ? test : test.skip;

  t('reads printed text and keeps each label on the same row as its question', async () => {
    const [text] = await winOcr.recognizeImages([page(LINES)]);
    const rows = text.split('\n');
    const row = (word) => rows.find(r => r.toLowerCase().includes(word));
    assert.match(row('encapsulation') || '', /^1[).]?\s/, text);
    assert.match(row('resonant') || '', /^2[).]?\s/, text);
    assert.match(row('scheduler') || '', /^3[).]?\s/, text);
  });

  t('a photo rotated 90 degrees is straightened before reading', async () => {
    const rotated = await sharp(page(LINES)).rotate(90).png().toBuffer();
    const [text] = await winOcr.recognizeImages([rotated]);
    assert.ok(/encapsulation/i.test(text) && /scheduler/i.test(text), `rotated page not recognised:\n${text}`);
  });

  t('several pages in one call come back in order', async () => {
    const a = page([['1)', 'Define encapsulation and explain why it matters in software.']]);
    const b = page([['2)', 'Compare series and parallel resonant circuits for the bandwidth.']]);
    const out = await winOcr.recognizeImages([a, b]);
    assert.equal(out.length, 2);
    assert.ok(/encapsulation/i.test(out[0]) && /resonant/i.test(out[1]));
  });
});

describe('OCR engine fallback', () => {
  function engineWith(winOcrStub) {
    const fakeWorker = { recognize: async () => ({ data: { text: '  FALLBACK TEXT FROM TESSERACT  ' } }), terminate: async () => {} };
    const stub = (rel, exports) => { const p = require.resolve(path.join(h.ROOT, rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
    stub('src/modules/blooms/win-ocr', winOcrStub);
    stub('node_modules/tesseract.js', { createWorker: async () => fakeWorker });
    const ePath = require.resolve(path.join(h.ROOT, 'src/modules/blooms/ocr-engine'));
    delete require.cache[ePath];
    return require(ePath);
  }

  test('Windows OCR unavailable -> Tesseract is used', async () => {
    const e = engineWith({ isAvailable: async () => false, recognizeImages: async () => { throw new Error('should not run'); } });
    assert.equal(await e.recognizeImageBuffer(Buffer.from('x')), 'FALLBACK TEXT FROM TESSERACT');
  });

  test('Windows OCR throws -> Tesseract is used', async () => {
    const e = engineWith({ isAvailable: async () => true, recognizeImages: async () => { throw new Error('boom'); } });
    assert.equal(await e.recognizeImageBuffer(Buffer.from('x')), 'FALLBACK TEXT FROM TESSERACT');
  });

  test('Windows OCR finds too little text -> Tesseract is used for that page', async () => {
    const e = engineWith({ isAvailable: async () => true, recognizeImages: async () => ['ab'] });
    assert.equal(await e.recognizeImageBuffer(Buffer.from('x')), 'FALLBACK TEXT FROM TESSERACT');
  });

  test('Windows OCR text is returned as is when it finds enough', async () => {
    const good = 'Q1. Define encapsulation and explain why it matters.';
    const e = engineWith({ isAvailable: async () => true, recognizeImages: async () => [good] });
    assert.equal(await e.recognizeImageBuffer(Buffer.from('x')), good);
  });
});
