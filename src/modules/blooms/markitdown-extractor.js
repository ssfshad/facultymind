'use strict';

/**
 * markitdown-extractor.js — High-accuracy document → Markdown extractor
 *
 * Spawns the bundled converter.exe (Microsoft MarkItDown) to convert
 * documents into clean Markdown text. Supports PDF, DOCX, PPTX, XLSX,
 * images (PNG/JPG with OCR), HTML, CSV, JSON, XML, and more.
 *
 * Usage:
 *   const md = await extractWithMarkItDown('C:/path/to/file.pdf');
 *
 * Returns: Markdown string with tables, headings, lists preserved.
 * Throws:  Error with stderr details if conversion fails.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Resolve the converter.exe path — works in dev and packaged builds.
// In dev: <repo>/bin/converter.exe
// In production (Electron asar): unpacked under resources/bin/converter.exe
function resolveExePath() {
  // 1. Packaged Electron app (resourcesPath available via process.resourcesPath)
  if (process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, 'bin', 'converter.exe');
    if (fs.existsSync(packaged)) return packaged;
  }
  // 2. Dev mode: relative to project root
  const dev = path.join(__dirname, '..', '..', '..', 'bin', 'converter.exe');
  if (fs.existsSync(dev)) return dev;

  return null;
}

/**
 * Convert a file to Markdown using the MarkItDown converter.
 * @param {string} filePath - Absolute path to the input file
 * @returns {Promise<string>} Markdown text
 */
async function extractWithMarkItDown(filePath) {
  const exePath = resolveExePath();
  if (!exePath) {
    throw new Error('converter.exe not found. Expected at <repo>/bin/converter.exe');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Input file does not exist: ${filePath}`);
  }

  return new Promise((resolve, reject) => {
    const options = {
      // 50 MB buffer for very large documents (lecture decks, full thesis PDFs, etc.)
      maxBuffer: 1024 * 1024 * 50,
      windowsHide: true,
      // 5 minute timeout — heavy OCR can take a while
      timeout: 5 * 60 * 1000,
    };

    execFile(exePath, [filePath], options, (error, stdout, stderr) => {
      if (error) {
        const message = (stderr && stderr.trim()) || error.message;
        reject(new Error(`MarkItDown extraction failed: ${message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Check if the MarkItDown converter is available on this system.
 * @returns {boolean}
 */
function isAvailable() {
  return resolveExePath() !== null;
}

module.exports = {
  extractWithMarkItDown,
  isAvailable,
  resolveExePath,
};
