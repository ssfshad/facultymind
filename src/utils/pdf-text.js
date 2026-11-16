'use strict';
// Text-layer extraction with pdf-parse v2 (class API; v1's default function no longer exists).

async function extractPdfText(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    try { await parser.destroy(); } catch (_) {}
  }
}

module.exports = { extractPdfText };
