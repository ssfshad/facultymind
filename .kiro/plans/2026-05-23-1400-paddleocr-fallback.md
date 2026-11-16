# Plan: PaddleOCR Fallback for Scanned/Image PDFs
Date: 2026-05-23T14:00:00
Planner: facultymind-planner (Opus proxy)
Issue type: feature
Related: Sprint 2 task 2.17 (PDF text extraction), BUG-020 (pdf-parse limitations)

## Problem statement
The Bloom's Engine and CLO Mapper only work with text-layer PDFs (Word exports, Google Docs).
When a professor uploads a scanned PDF or image-based document, pdf-parse returns empty or
near-empty text (< 100 chars), causing the AI prompt to fail or produce garbage output.
Path 1 fix: add ppu-paddle-ocr (PP-OCRv5 via ONNX) as a transparent fallback inside
extractText() — no API changes, no new IPC channels, no UI changes needed.

## Root cause
pdf-parse reads the text layer embedded in a PDF. Scanned PDFs have no text layer —
they are images of pages. pdf-parse returns '' or whitespace for these.
The fix is: detect low-yield extraction → render PDF page(s) to image → run OCR.

## Affected files
- package.json — add ppu-paddle-ocr, canvas (for PDF→image rendering)
- src/modules/blooms/blooms-engine.js — update extractText() with OCR fallback
- src/modules/blooms/ocr-engine.js — NEW: isolated OCR module (PaddleOCR wrapper)

## Approach

### PDF → Image rendering
ppu-paddle-ocr takes image buffers. To get an image from a PDF page we need to render it.
Options evaluated:
1. pdfjs-dist + canvas npm — pdfjs-dist is pure JS but needs `canvas` for Node.js rendering.
   `canvas` has native deps (node-gyp, Cairo). Risky on Windows without build tools.
2. pdf-to-img npm — wraps pdfjs-dist, returns PNG buffers per page. Pure JS, no native deps.
   Published 2025, supports Node 20+. This is the right choice.
3. Electron BrowserWindow screenshot — too heavy, requires UI thread.

Decision: use `pdf-to-img` for PDF→PNG conversion + `ppu-paddle-ocr` for OCR.

### OCR fallback threshold
If pdf-parse returns text with < 100 meaningful characters (after stripping whitespace),
treat the PDF as image-based and run OCR fallback.

### Model caching
ppu-paddle-ocr downloads ONNX models (~15MB) on first use.
Cache location: app.getPath('userData') + '/ocr-models/'
Set via environment variable or ppu-paddle-ocr config before first call.

### Architecture
extractText(buffer, mimeType):
  if DOCX → mammoth (unchanged)
  if PDF:
    1. pdf-parse → text
    2. if text.trim().length >= 100 → return text (fast path, unchanged)
    3. else → OCR fallback:
       a. pdf-to-img renders each page to PNG buffer
       b. ppu-paddle-ocr.recognize(imageBuffer) per page
       c. concatenate all page texts
       d. return combined text

OCR is NOT an AI call — it runs locally via ONNX. Does NOT go through model-router.js.

## Implementation steps for executor

### Step 1: Install dependencies
```
npm install ppu-paddle-ocr --save
npm install pdf-to-img --save
```
Verify both appear in package.json dependencies.

### Step 2: Create src/modules/blooms/ocr-engine.js
New isolated module. Responsibilities:
- Lazy-load ppu-paddle-ocr (only when needed)
- Set model cache directory to app userData path
- Export: recognizePdfBuffer(pdfBuffer) → Promise<string>
  - Uses pdf-to-img to render each page to PNG
  - Runs ppu-paddle-ocr on each page image
  - Returns concatenated text from all pages

```javascript
'use strict';

const path = require('path');

// Lazy references — only loaded when OCR is actually needed
let _paddleOcr = null;
let _pdfToImg  = null;

/**
 * Get or initialize the PaddleOCR instance.
 * Models are cached in app userData to survive app restarts.
 */
async function getOcrInstance() {
  if (_paddleOcr) return _paddleOcr;

  // Set model cache dir before importing ppu-paddle-ocr
  let cacheDir;
  try {
    const { app } = require('electron');
    cacheDir = path.join(app.getPath('userData'), 'ocr-models');
  } catch (_) {
    // Fallback for non-Electron contexts (tests)
    cacheDir = path.join(require('os').homedir(), '.facultymind', 'ocr-models');
  }

  // Ensure cache dir exists
  const fs = require('fs');
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  // ppu-paddle-ocr reads PADDLE_OCR_MODEL_DIR env var for cache location
  process.env.PADDLE_OCR_MODEL_DIR = cacheDir;

  const { PaddleOcr } = require('ppu-paddle-ocr');
  _paddleOcr = new PaddleOcr();
  await _paddleOcr.initialize();
  return _paddleOcr;
}

/**
 * Get or initialize the pdf-to-img converter.
 */
async function getPdfToImg() {
  if (_pdfToImg) return _pdfToImg;
  _pdfToImg = require('pdf-to-img');
  return _pdfToImg;
}

/**
 * Run OCR on a PDF buffer. Renders each page to PNG then extracts text.
 * @param {Buffer} pdfBuffer
 * @param {Function} [onProgress] - optional callback(pageNum, totalPages)
 * @returns {Promise<string>} extracted text from all pages
 */
async function recognizePdfBuffer(pdfBuffer, onProgress) {
  const pdfToImg = await getPdfToImg();
  const ocr      = await getOcrInstance();

  const pages = await pdfToImg.pdf(pdfBuffer, { scale: 2.0 }); // 2x scale for better OCR accuracy
  const texts  = [];
  let pageNum  = 0;

  for await (const pageImageBuffer of pages) {
    pageNum++;
    if (onProgress) onProgress(pageNum, pages.length || '?');

    try {
      const result = await ocr.recognize(pageImageBuffer);
      // ppu-paddle-ocr returns array of { text, confidence, bbox }
      const pageText = (result || [])
        .filter(r => r.confidence > 0.5)
        .map(r => r.text)
        .join(' ');
      if (pageText.trim()) texts.push(pageText);
    } catch (pageErr) {
      console.error(`[OCR] Page ${pageNum} failed:`, pageErr.message);
      // Continue with other pages
    }
  }

  return texts.join('\n\n');
}

module.exports = { recognizePdfBuffer };
```

### Step 3: Update extractText() in blooms-engine.js
Add OCR fallback after pdf-parse:

```javascript
async function extractText(buffer, mimeType, onProgress) {
  if (mimeType === 'application/pdf') {
    // Fast path: try text layer first
    let text = '';
    try {
      const data = await pdfParse(buffer);
      text = data.text || '';
    } catch (_) {
      // pdf-parse failed — go straight to OCR
    }

    // If meaningful text extracted, return it
    if (text.replace(/\s+/g, '').length >= 100) {
      return text;
    }

    // Fallback: scanned/image PDF — run PaddleOCR
    console.log('[blooms-engine] Text layer thin/empty, falling back to OCR...');
    try {
      const { recognizePdfBuffer } = require('./ocr-engine');
      const ocrText = await recognizePdfBuffer(buffer, onProgress);
      if (ocrText && ocrText.trim().length > 0) return ocrText;
      throw new Error('OCR returned no text. The PDF may be blank or corrupted.');
    } catch (ocrErr) {
      throw new Error(`Could not extract text from PDF: ${ocrErr.message}`);
    }
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'docx'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${mimeType}. Please upload a PDF or DOCX file.`);
}
```

Note: onProgress is optional — existing callers that don't pass it still work.

### Step 4: Update IPC handlers in main.js to forward progress events
The blooms:generate and blooms:map-clos handlers call extractText() indirectly.
Add progress forwarding so the renderer can show "OCR: page 2 of 5...":

In blooms:generate handler, pass a progress callback that sends IPC to renderer:
```javascript
// Inside blooms:generate handler, pass to processPdfCourseMaterial:
const onProgress = (page, total) => {
  mainWindow?.webContents.send('blooms:ocr-progress', { page, total });
};
// Pass onProgress through processPdfCourseMaterial → extractText
```

Update processPdfCourseMaterial signature to accept and forward onProgress.

### Step 5: Update renderer blooms.js to show OCR progress
In the loading state, listen for blooms:ocr-progress events and update the loading text:
"OCR: extracting page 2 of 5..."

Add to preload.js:
```javascript
blooms: {
  ...existing,
  onOcrProgress: (cb) => ipcRenderer.on('blooms:ocr-progress', (_, data) => cb(data)),
}
```

## Verification
- [ ] npm run dev launches without errors after install
- [ ] Upload a text-layer PDF → pdf-parse fast path used (no OCR log message)
- [ ] Upload a scanned/image PDF → OCR fallback triggered (log message visible)
- [ ] OCR result feeds into Bloom's lesson plan generation correctly
- [ ] CLO Mapper also works with scanned PDFs (uses same extractText())
- [ ] DOCX upload still works (mammoth path unchanged)
- [ ] No API keys required for OCR (it's local ONNX inference)
- [ ] Model cache created in userData/ocr-models/ on first OCR use
- [ ] Progress events reach renderer during OCR processing

## Risks / things executor must NOT do
1. OCR is local ONNX inference — do NOT route it through model-router.js
2. Do NOT break the existing extractText() signature for callers without onProgress
3. Do NOT make ppu-paddle-ocr a hard startup dependency — lazy-load it only when needed
4. Do NOT bundle ONNX model files in the app — they download on first use to userData
5. pdf-to-img may use pdfjs-dist internally — verify no conflict with existing pdf-parse
6. If ppu-paddle-ocr API differs from plan (check actual npm package on install),
   adapt accordingly and note deviation in Execution Result

## Execution Result

**Date:** 2026-05-23
**Executor:** facultymind-executor

### Steps completed

**Step 1 — Packages installed**
- `ppu-paddle-ocr@5.4.4` ✅
- `pdf-to-img@6.1.0` ✅
- `onnxruntime-node@1.23.x` ✅ (required peer dep for Node.js, not in plan — added)

**Step 2 — Created `src/modules/blooms/ocr-engine.js`** ✅

**Step 3 — Updated `src/modules/blooms/blooms-engine.js`** ✅
- `extractText()` now accepts optional `onProgress` param — existing callers unaffected
- `processPdfCourseMaterial()` now accepts and forwards optional `onProgress` param

**Step 4 — Updated `src/main/main.js`** ✅
- `blooms:generate` handler creates `onProgress` callback → sends `blooms:ocr-progress` IPC event
- `blooms:map-clos` handler also forwards OCR progress when extracting from buffer

**Step 5 — Updated `src/main/preload.js`** ✅
- Added `onOcrProgress: (cb) => ipcRenderer.on('blooms:ocr-progress', ...)` to blooms section

**Step 6 — Updated `src/renderer/js/blooms.js` and `src/renderer/index.html`** ✅
- Added `id="blooms-loading-text"` to the `.model-badge` div in `index.html`
- Added `setupOcrProgressListener()` called from `init()`
- Loading text updates to "OCR: extracting page X of Y…" during OCR
- Loading text resets to "AI Thinking..." in `finally` block after generation completes

### API deviations from plan

| Item | Plan assumed | Actual API |
|------|-------------|------------|
| ppu-paddle-ocr export | `PaddleOcr` class | `PaddleOcrService` class |
| recognize() return | `Array<{ text, confidence, bbox }>` | `{ text: string, confidence: number, lines: [] }` — `result.text` is already the full page text |
| Per-item confidence filter | Filter items with `confidence > 0.5` | Not needed — `result.confidence` is aggregate; `result.text` is the complete output |
| Model cache env var | `PADDLE_OCR_MODEL_DIR` | No env var override documented; cache is at `~/.cache/ppu-paddle-ocr` by default. Cache dir creation still done for userData path. |
| pdf-to-img import | `require('./pdf-to-img').pdf(...)` | ESM-only — must use `await import('pdf-to-img')` |
| ppu-paddle-ocr import | `require('ppu-paddle-ocr')` | ESM-only — must use `await import('ppu-paddle-ocr')` |
| pdf-to-img pages | `pages.length` available before iteration | `doc.length` is available on the returned object |
| Processing engine | Not specified | Used `canvas-native` to avoid OpenCV native dep issues on Windows |

### Additional package installed
- `onnxruntime-node` — required peer dependency for ppu-paddle-ocr in Node.js environments (not mentioned in plan)

### Security check
`Select-String` scan for `sk-ant|AIzaSy` in `src/` — no hardcoded secrets found. Only placeholder strings and validation messages.

### Verification status
- [x] All 6 steps executed
- [x] No hardcoded secrets
- [x] Existing `extractText()` callers without `onProgress` still work (param is optional)
- [x] OCR is NOT routed through model-router.js (local ONNX inference only)
- [x] Both packages lazy-loaded via dynamic `import()` — not loaded at startup
- [ ] Runtime test with scanned PDF — requires app launch (not done in executor context)
- [ ] Runtime test with text-layer PDF — requires app launch
