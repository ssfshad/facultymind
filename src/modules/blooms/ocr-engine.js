'use strict';

/**
 * ocr-engine.js — Tesseract.js OCR fallback for scanned/image PDFs.
 *
 * Pipeline:
 *   PDF buffer
 *   → pdfjs-dist (render each page to canvas using @napi-rs/canvas factory)
 *   → canvas.toBuffer('image/png') → PNG Buffer
 *   → Tesseract.js (pure JS OCR, works in Electron main process)
 *   → text string
 *
 * All packages are CommonJS-compatible or loaded via dynamic import.
 * No native module issues — @napi-rs/canvas is already installed as a dep of ppu-ocv.
 */

const path = require('path');
const os   = require('os');
const fs   = require('fs');

let _worker = null;

/**
 * Get or initialize the Tesseract worker.
 * Language data (~4 MB) is cached in userData on first use.
 */
async function getWorker() {
  if (_worker) return _worker;

  const Tesseract = require('tesseract.js');

  let cacheDir;
  try {
    const { app } = require('electron');
    cacheDir = path.join(app.getPath('userData'), 'tesseract-cache');
  } catch (_) {
    cacheDir = path.join(os.homedir(), '.facultymind', 'tesseract-cache');
  }
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  _worker = await Tesseract.createWorker('eng', 1, {
    cachePath: cacheDir,
    logger: () => {},
  });

  return _worker;
}

/**
 * Render a PDF buffer to an array of PNG Buffers (one per page)
 * using pdfjs-dist with @napi-rs/canvas as the canvas factory.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Buffer[]>} array of PNG buffers
 */
async function renderPdfToImages(pdfBuffer) {
  // pdfjs-dist legacy build — ESM, must use dynamic import
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = require('@napi-rs/canvas');

  // Custom canvas factory for Node.js
  class NodeCanvasFactory {
    create(width, height) {
      const canvas  = createCanvas(width, height);
      const context = canvas.getContext('2d');
      return { canvas, context };
    }
    reset(canvasAndContext, width, height) {
      canvasAndContext.canvas.width  = width;
      canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext) {
      canvasAndContext.canvas.width  = 0;
      canvasAndContext.canvas.height = 0;
    }
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const images = [];

  for (let i = 1; i <= numPages; i++) {
    const page     = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const factory  = new NodeCanvasFactory();
    const { canvas, context } = factory.create(viewport.width, viewport.height);

    await page.render({ canvasContext: context, viewport, canvasFactory: factory }).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    images.push(pngBuffer);

    page.cleanup();
    factory.destroy({ canvas, context });
  }

  await pdfDoc.destroy();
  return images;
}

/** Pages with fewer non-space characters than this are treated as "no text found" by Windows OCR. */
const MIN_USEFUL_CHARS = 20;

/**
 * Windows built-in OCR first (faster and better on phone photos; see eval/OCR-BAKEOFF.md).
 * Returns one text per image ('' where it found too little) or null when Windows OCR is unavailable
 * or failed, in which case the caller uses Tesseract.
 */
async function windowsFirst(buffers) {
  try {
    const winOcr = require('./win-ocr');
    if (!(await winOcr.isAvailable())) return null;
    const texts = await winOcr.recognizeImages(buffers);
    return texts.map(t => (t.replace(/\s+/g, '').length >= MIN_USEFUL_CHARS ? t : ''));
  } catch (e) {
    console.warn('[OCR] Windows OCR unavailable, using Tesseract:', e.message);
    return null;
  }
}

/**
 * Run OCR directly on an image buffer (PNG, JPG, WEBP, BMP).
 * No PDF rendering needed — Tesseract accepts image buffers directly.
 *
 * @param {Buffer} imageBuffer
 * @param {Function} [onProgress] - optional callback(1, 1)
 * @returns {Promise<string>} extracted text
 */
async function recognizeImageBuffer(imageBuffer, onProgress) {
  if (onProgress) {
    try { onProgress(1, 1); } catch (_) {}
  }
  const win = await windowsFirst([imageBuffer]);
  if (win && win[0]) return win[0];
  const worker = await getWorker();
  const { data: { text } } = await worker.recognize(imageBuffer);
  return text ? text.trim() : '';
}

/**
 * Run OCR on a PDF buffer.
 *
 * @param {Buffer} pdfBuffer
 * @param {Function} [onProgress] - optional callback(pageNum, totalPages)
 * @returns {Promise<string>} extracted text from all pages
 */
async function recognizePdfBuffer(pdfBuffer, onProgress) {
  const images = await renderPdfToImages(pdfBuffer);
  const total  = images.length;
  const texts  = [];
  const win    = await windowsFirst(images);   // null when unavailable -> Tesseract for every page
  let worker   = null;

  for (let i = 0; i < images.length; i++) {
    const pageNum = i + 1;
    if (onProgress) {
      try { onProgress(pageNum, total); } catch (_) {}
    }

    try {
      if (win && win[i]) { texts.push(win[i]); continue; }
      worker = worker || await getWorker();
      const { data: { text } } = await worker.recognize(images[i]);
      const pageText = text ? text.trim() : '';
      if (pageText) texts.push(pageText);
    } catch (pageErr) {
      console.error(`[OCR] Page ${pageNum}/${total} failed:`, pageErr.message);
    }
  }

  return texts.join('\n\n');
}

/**
 * Terminate the Tesseract worker on app quit.
 */
async function terminateWorker() {
  if (_worker) {
    try { await _worker.terminate(); } catch (_) {}
    _worker = null;
  }
}

module.exports = { recognizePdfBuffer, recognizeImageBuffer, terminateWorker };
