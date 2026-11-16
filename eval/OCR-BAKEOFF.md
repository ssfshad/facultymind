# OCR bake-off (2026-11-11)

50 phone photos of real DIU exam papers (stratified sample of 1,172; photos and the hand-made
answer key live in `eval/data/private/`, gitignored). Tools: `eval/tools/ocr-bakeoff/`.
All engines run offline on CPU. Seconds/photo are approximate (several engines ran at the same time).

Metrics (micro-averaged, 49 scored photos; 1 ambiguous screenshot excluded):
- **Label F1**: question/sub-question labels (`1`, `a`, `b`, `2`...) in reading order.
- **Tag recall / precision**: CLO/CO/PO/PLO and Bloom (C1-C6) tags printed next to questions.
- **Split F1**: `splitQuestions()` on the OCR text vs the ids derived from the answer key
  (44 photos that start at a numbered question).

| Engine | Label F1 | Tag recall | Tag precision | Split F1 | s/photo |
|---|---|---|---|---|---|
| ppu-small (PaddleOCR PP-OCRv6 small) | 72.7 | 77.8 | 99.6 | 47.3 | 2.2 |
| ppu-medium (PP-OCRv6 medium) | 70.0 | 78.9 | 99.6 | 44.0 | 7.3 |
| winocr-rows (Windows OCR + rebuilt rows) | 69.1 | 45.8 | 99.4 | 41.9 | 0.35 |
| ppu-small-unwarp | 67.4 | 56.9 | 98.6 | 33.5 | 1.7 |
| tess-raw (Tesseract, what the app uses) | 64.7 | 62.8 | 98.3 | 33.0 | 2.7 |
| tess-pre (Tesseract + grayscale/normalise/2x) | 63.9 | 63.9 | 97.5 | 31.3 | 4.1 |
| gutenye-v4 (PaddleOCR PP-OCRv4 ONNX) | 55.7 | **93.6** | 99.4 | 24.1 | 2.8 |
| winocr (raw, column order) | 39.7 | 45.8 | 99.4 | 14.1 | 0.28 |

Findings
- No engine is good enough on raw phone photos: the best reaches ≥ 90 label-F1 on only 18 of 49 photos.
- Two of 49 photos are rotated 90 degrees and every engine fails them: orientation fix needed.
- Windows OCR returns column-by-column text; rebuilding rows from word boxes took it from 14% to 42% split F1.
- Gutenye/PP-OCRv4 reads the small CLO/Bloom tags best (93.6%) but is weaker on labels.
- Tesseract preprocessing (grayscale/normalise/upscale) did not help.
- Targets (QUALITY.md: splitting ≥ 98%) are far away on photos; digital PDF/DOCX input is a separate, easier path.

## Hybrid experiment (20 photos: every 2nd of the 50)
Pipeline: auto-rotate (try 0/90/180/270 with Windows OCR, keep the most English-looking) -> Windows OCR
rows for text and labels -> PaddleOCR v4 only for CLO/CO/PO/Bloom tags, merged onto the nearest row by vertical position.

| Setup (20 photos) | Label F1 | Tag recall | Tag precision | Split F1 |
|---|---|---|---|---|
| Windows OCR rows + rotation fix | 72.5 | 44.9 | 100 | 49.6 |
| **Hybrid (above + PaddleOCR v4 tags)** | 72.5 | **91.3** | 94.0 | 49.3 |
| PaddleOCR v6 small alone | 71.1 | 74.6 | 100 | 48.6 |
| Tesseract (app today) | 65.2 | 58.0 | 98.8 | 36.4 |

- The hybrid fixes tags (45% -> 91%) and the one rotated photo, but labels and splitting do not improve.
- The remaining split errors are partly the splitter: zero-padded numbers (`01.` -> `Q01`) and a line-by-line
  fallback when no question marker is found (continuation pages, paragraph questions).

## After the splitter fixes (zero-padded numbers, "Q.I" OCR slip, no-marker fallback)
End-to-end split F1 (the app's `splitQuestions` on each engine's text), same photos and engines:

| Setup | Before | After |
|---|---|---|
| Hybrid, 20 photos | 49.3 | **64.5** |
| Windows OCR rows + rotation fix, 20 photos | 49.6 | 64.2 |
| PaddleOCR v6 small, 49 photos | 47.3 | **56.7** |
| Windows OCR rows, 49 photos | 41.9 | 52.6 |
| PaddleOCR v6 medium, 49 photos | 44.0 | 50.5 |
| Tesseract (app today), 49 photos | 33.0 | 40.7 |

Synthetic-paper eval unchanged (99.2% on test). Still far from target on photos; remaining errors are
OCR misreads of the labels themselves and the splitter's regex approach on messy tables.

## Shipped in the app (2026-11-11): Windows OCR first, Tesseract as fallback
`src/modules/blooms/win-ocr.js` (+ `win-ocr.ps1`) is now the first-choice engine for images and scanned PDF pages
(rows rebuilt from word boxes, 90/180/270 rotation retry when the page does not read like English).
Tesseract remains for macOS, for a failed Windows OCR call, and for pages where Windows OCR finds < 20 characters.
The app's own code path (`recognizeImageBuffer`) on the same photos:

| | Split F1 (49 photos) | Split F1 (20-photo subset) | s/photo |
|---|---|---|---|
| Tesseract (before) | 40.7 | 46.5 | 2.67 |
| **App OCR now** | **54.7** | **65.7** | **0.68** |
| Experimental hybrid (+ PaddleOCR v4 tags) | n/a | 64.5 | ~3 |

Both 90-degree-rotated photos, which Tesseract read as garbage, now read correctly. The hybrid's extra tag pass is not
shipped: it adds a second engine for about the same splitting score.
