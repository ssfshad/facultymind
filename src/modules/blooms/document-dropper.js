'use strict';

/**
 * document-dropper.js — Async multi-page document ingestion pipeline
 *
 * Handles the full flow from raw file buffer → cleaned question array
 * without blocking the Electron renderer thread.
 *
 * Pipeline:
 *   1. Extract raw text from PDF / DOCX / image (reuses blooms-engine extractText)
 *   2. Strip document structure noise (title tables, headers, footers, page numbers)
 *   3. Chunk by section headers when present (handles multi-topic exam papers)
 *   4. Pipe each chunk through splitQuestions() to get individual question objects
 *   5. Emit progress events so the UI can show a live progress bar
 *
 * Usage (from IPC handler):
 *   const dropper = require('./document-dropper');
 *   const questions = await dropper.ingestDocument(buffer, mimeType, onProgress);
 *   // questions: [{ id, text, section?, marks? }]
 */

const { splitQuestions } = require('./clo-mapper-fast');

// ── Section header patterns ───────────────────────────────────────────────────
// Matches common exam section dividers like "Section A", "Part I", "Group B"
const SECTION_RE = /^(?:section|part|group|unit)\s+[a-z0-9]+[:\-\s]/i;

// ── Document noise patterns ───────────────────────────────────────────────────
// Strips title blocks, page numbers, watermarks, and metadata lines that
// appear in scanned DIU exam papers.
const NOISE_PATTERNS = [
  /daffodil\s+international\s+university/gi,
  /department\s+of\s+information/gi,
  /faculty\s+of\s+engineering/gi,
  /final\s+examination/gi,
  /mid.?term\s+examination/gi,
  /course\s+code\s*:/gi,
  /course\s+title\s*:/gi,
  /course\s+teacher\s*:/gi,
  /level\s*[&and]+\s*term/gi,
  /time\s*:\s*\d+\s*(?:hour|hr)/gi,
  /full\s+marks\s*:\s*\d+/gi,
  /marks\s*:\s*\d+/gi,
  /answer\s+any\s+(?:five|four|three|all)/gi,
  /n\.?b\.?\s*:/gi,
  /page\s+\d+\s+of\s+\d+/gi,
  /scanned\s+with\s+camscanner/gi,
  /batch\s*:\s*\d+/gi,
];

/**
 * Strip document-level noise from raw extracted text.
 * Removes title blocks, headers, footers, and metadata lines.
 *
 * @param {string} text
 * @returns {string}
 */
function stripDocumentNoise(text) {
  let cleaned = text;

  // Remove noise pattern lines
  for (const pattern of NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  // Remove lines that are purely numeric (page numbers, roll numbers in headers)
  cleaned = cleaned.replace(/^\s*\d{1,4}\s*$/gm, '');

  // Remove lines shorter than 10 chars that aren't question markers
  // (catches stray header fragments like "ICE 431" or "L4T2")
  cleaned = cleaned.replace(/^(?!.*\d+[\.\)]).{1,9}$/gm, '');

  // Collapse multiple blank lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Split text into sections when section headers are present.
 * Returns an array of { sectionName, text } objects.
 * If no section headers found, returns a single section with the full text.
 *
 * @param {string} text
 * @returns {{ sectionName: string, text: string }[]}
 */
function chunkBySections(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentSection = { sectionName: 'Main', text: '' };

  for (const line of lines) {
    if (SECTION_RE.test(line.trim())) {
      if (currentSection.text.trim().length > 0) {
        sections.push(currentSection);
      }
      currentSection = { sectionName: line.trim(), text: '' };
    } else {
      currentSection.text += line + '\n';
    }
  }

  if (currentSection.text.trim().length > 0) {
    sections.push(currentSection);
  }

  return sections.length > 0 ? sections : [{ sectionName: 'Main', text }];
}

/**
 * Post-process questions that failed verb detection.
 * When a question block starts with a context paragraph (noun, not a verb),
 * check if it contains sub-letter lines (a., b., c.) and extract those as
 * independent questions. The context paragraph is discarded — it's setup text,
 * not a measurable objective.
 *
 * Example input:
 *   "Finite automata are abstract machines used to recognize patterns.
 *    a. Design a DFA that accepts strings ending in 01.
 *    b. Distinguish between NFA and DFA."
 *
 * Output:
 *   [{ id: 'Q1(a)', text: 'Design a DFA that accepts strings ending in 01.' },
 *    { id: 'Q1(b)', text: 'Distinguish between NFA and DFA.' }]
 *
 * @param {{ id, text, section?, marks? }[]} questions
 * @returns {{ id, text, section?, marks? }[]}
 */
function extractSubQuestionsFromContext(questions) {
  const { VERB_INDEX } = require('./clo-mapper-fast');

  // Sub-letter pattern: "a. verb..." or "(a) verb..." at start of a line
  const SUB_LINE_RE = /^(?:\(?([a-h])\)?[.)]\s+)(.+)$/i;

  const result = [];

  for (const q of questions) {
    // Check if the lead token is a known verb
    const firstToken = q.text.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '');
    const isVerbLed  = firstToken && VERB_INDEX[firstToken];

    if (isVerbLed) {
      // Already verb-led — keep as-is
      result.push(q);
      continue;
    }

    // Not verb-led — scan lines for sub-letter items
    const lines = q.text.split(/\n/).map(l => l.trim()).filter(Boolean);
    const subItems = [];

    for (const line of lines) {
      const m = line.match(SUB_LINE_RE);
      if (m) {
        const letter = m[1].toLowerCase();
        const text   = m[2].trim();
        // Only keep if the sub-item itself starts with a verb
        const subFirst = text.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '');
        if (subFirst && (VERB_INDEX[subFirst] || text.length > 10)) {
          subItems.push({ letter, text });
        }
      }
    }

    if (subItems.length > 0) {
      // Replace the context block with its sub-items
      const mainNum = q.id.replace(/^Q/, '').replace(/\(.*\)/, '');
      for (const sub of subItems) {
        result.push({
          ...q,
          id:   `Q${mainNum}(${sub.letter})`,
          text: sub.text,
        });
      }
    } else {
      // No sub-items found — keep the original (will be low-confidence, handled by AI fallback)
      result.push(q);
    }
  }

  return result;
}

/**
 * Main entry point — ingest a document buffer and return a flat array of
 * question objects ready for the CLO mapper.
 *
 * Runs asynchronously and emits progress via onProgress callback so the
 * renderer can show a live progress bar without freezing.
 *
 * @param {Buffer}   buffer    — raw file buffer
 * @param {string}   mimeType  — MIME type string
 * @param {Function} [onProgress] — (step: string, detail: string) => void
 * @returns {Promise<{ id: string, text: string, section: string, marks: number|null }[]>}
 */
async function ingestDocument(buffer, mimeType, onProgress) {
  const step = (s, d = '') => { try { if (onProgress) onProgress(s, d); } catch (_) {} };

  // ── Step 1: Extract raw text ──────────────────────────────────────────
  // Try MarkItDown first (high-accuracy ML extraction), fall back to legacy
  // extractText (pdf-parse + tesseract) if the converter.exe is unavailable.
  step('extract', 'Extracting text from document…');
  let rawText;
  try {
    const { extractWithMarkItDown, isAvailable } = require('./markitdown-extractor');
    if (isAvailable()) {
      // MarkItDown takes a file path, so write the buffer to a temp file
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const ext = (mimeType && mimeType.includes('pdf')) ? '.pdf'
                : (mimeType && mimeType.includes('word')) ? '.docx'
                : (mimeType && mimeType.includes('image')) ? '.png'
                : '';
      const tmpFile = path.join(os.tmpdir(), `fm-doc-${Date.now()}${ext}`);
      fs.writeFileSync(tmpFile, buffer);
      try {
        step('extract', 'Initializing ML document engine…');
        rawText = await extractWithMarkItDown(tmpFile);
        step('extract_done', `MarkItDown extracted ${rawText.length} characters`);
      } finally {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }
    } else {
      const { extractText } = require('./blooms-engine');
      rawText = await extractText(buffer, mimeType, (page, total) => {
        step('ocr', `OCR: page ${page} of ${total}`);
      });
    }
  } catch (e) {
    // MarkItDown failed — fall back to legacy
    console.warn('[document-dropper] MarkItDown failed, falling back to legacy extractor:', e.message);
    const { extractText } = require('./blooms-engine');
    rawText = await extractText(buffer, mimeType, (page, total) => {
      step('ocr', `OCR: page ${page} of ${total}`);
    });
  }

  if (!rawText || rawText.trim().length < 20) {
    throw new Error('No readable text found in document. Check the file is not blank or corrupted.');
  }
  step('extract_done', `Extracted ${rawText.length} characters`);

  // ── Step 2: Strip document noise ─────────────────────────────────────
  step('clean', 'Removing document headers and metadata…');
  const cleanedText = stripDocumentNoise(rawText);

  // ── Step 3: Chunk by sections ─────────────────────────────────────────
  step('chunk', 'Splitting document into sections…');
  const sections = chunkBySections(cleanedText);
  step('chunk_done', `Found ${sections.length} section${sections.length === 1 ? '' : 's'}`);

  // ── Step 4: Parse questions from each section ─────────────────────────
  // Use setImmediate between sections to yield to the event loop and prevent
  // blocking the renderer thread on large documents.
  const allQuestions = [];
  let sectionIdx = 0;

  for (const section of sections) {
    sectionIdx++;
    step('parse', `Parsing section ${sectionIdx}/${sections.length}: ${section.sectionName}`);

    // Yield to event loop between sections
    await new Promise(resolve => setImmediate(resolve));

    const questions = splitQuestions(section.text);
    const processed = extractSubQuestionsFromContext(questions);
    for (const q of processed) {
      allQuestions.push({
        ...q,
        section: section.sectionName,
        // Re-number IDs to be globally unique across sections
        id: sections.length > 1 ? `S${sectionIdx}-${q.id}` : q.id,
      });
    }
  }

  step('done', `Parsed ${allQuestions.length} question${allQuestions.length === 1 ? '' : 's'}`);
  return allQuestions;
}

/**
 * Convenience wrapper: ingest and immediately map to Bloom's levels.
 * Returns the full mapDeterministic() result shape.
 *
 * @param {Buffer}   buffer
 * @param {string}   mimeType
 * @param {string}   courseCode
 * @param {object}   db          — SQLite handle (optional, for KB lookup)
 * @param {Function} [onProgress]
 * @returns {Promise<object>}    — same shape as mapDeterministic()
 */
async function ingestAndMap(buffer, mimeType, courseCode, db, onProgress) {
  const step = (s, d = '') => { try { if (onProgress) onProgress(s, d); } catch (_) {} };

  const questions = await ingestDocument(buffer, mimeType, onProgress);

  if (questions.length === 0) {
    throw new Error('No questions found in document. Check the formatting matches the expected pattern.');
  }

  step('map', `Mapping ${questions.length} questions to Bloom's levels…`);

  // Reconstruct a clean text block from the parsed questions and run the mapper
  // This ensures the mapper sees the cleaned, noise-free text.
  const { mapDeterministic } = require('./clo-mapper-fast');
  const cleanedForMapper = questions.map(q => `${q.id}. ${q.text}`).join('\n');
  const result = mapDeterministic(cleanedForMapper, courseCode, db);

  // Attach section info to each mapping result
  const sectionById = {};
  for (const q of questions) sectionById[q.id] = q.section;
  for (const m of (result.clo_mappings || [])) {
    const qId = m.clo_code.replace('CLO-', '');
    if (sectionById[qId]) m.section = sectionById[qId];
  }

  step('done', `Mapped ${result.clo_mappings?.length || 0} questions`);
  return result;
}

module.exports = { ingestDocument, ingestAndMap, stripDocumentNoise, chunkBySections, extractSubQuestionsFromContext };
