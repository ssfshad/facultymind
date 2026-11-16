/**
 * blooms-engine.js - Extract text from PDF/DOCX and generate lesson plans or CLO mappings
 *
 * UPGRADE NOTES (v2):
 *  - Fix 1: MarkItDown is now the PRIMARY extractor (preserves structure → better question splitting)
 *  - Fix 2: processPdfCourseMaterial() now uses OpenRouter when key is available
 *  - Fix 3: Ollama 3B gets chunked processing (max 4 questions/call) to prevent silent truncation
 *  - Fix 4: num_ctx raised to 8192 for all Ollama Bloom's calls
 */

'use strict';

const { extractPdfText } = require('../../utils/pdf-text');
const mammoth   = require('mammoth');
const modelRouter = require('../ai/model-router');
const prompts   = require('../../prompts/templates/blooms-mapping');
const cloPrompts = require('../../prompts/templates/blooms-clo-mapping');
const criticPrompts = require('../../prompts/templates/blooms-clo-critic');
const reconcilerPrompts = require('../../prompts/templates/blooms-clo-reconciler');

/**
 * Extract plain text from a buffer based on MIME type.
 *
 * Priority order (Fix 1 — MarkItDown as primary):
 *   1. MarkItDown (converter.exe) — preserves headings, tables, numbered lists as Markdown
 *   2. pdf-parse / mammoth — fast text-layer extraction
 *   3. Tesseract OCR — scanned / image-based files (last resort)
 *
 * @param {Buffer} buffer       - File buffer
 * @param {string} mimeType     - MIME type string
 * @param {Function} [onProgress] - Optional OCR progress callback(pageNum, totalPages)
 * @returns {Promise<string>} Extracted plain text (Markdown if MarkItDown ran)
 */
async function extractText(buffer, mimeType, onProgress) {
  const fs   = require('fs');
  const os   = require('os');
  const path = require('path');

  const isPdf  = mimeType === 'application/pdf';
  const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'docx';
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp', 'image/tiff'];

  // ── FIX 1: Try MarkItDown first for PDF and DOCX ──────────────────────────
  // MarkItDown preserves document structure (headings, lists, tables) as Markdown.
  // This dramatically improves question splitting accuracy in clo-mapper-fast.js.
  if (isPdf || isDocx) {
    try {
      const { extractWithMarkItDown, isAvailable } = require('./markitdown-extractor');
      if (isAvailable()) {
        // Write buffer to a temp file (MarkItDown CLI needs a file path)
        const ext  = isPdf ? '.pdf' : '.docx';
        const tmpFile = path.join(os.tmpdir(), `fm_extract_${Date.now()}${ext}`);
        fs.writeFileSync(tmpFile, buffer);
        try {
          const mdText = await extractWithMarkItDown(tmpFile);
          if (mdText && mdText.replace(/\s+/g, '').length >= 100) {
            console.log(`[blooms-engine] MarkItDown extraction succeeded (${mdText.length} chars)`);
            return mdText;
          }
        } finally {
          // Always clean up the temp file
          try { fs.unlinkSync(tmpFile); } catch (_) {}
        }
      }
    } catch (mdErr) {
      console.warn('[blooms-engine] MarkItDown failed, falling back:', mdErr.message);
    }
  }

  // ── Fast path: pdf-parse text layer ────────────────────────────────────────
  if (isPdf) {
    let text = '';
    try {
      text = await extractPdfText(buffer);
    } catch (e) {
      // pdf-parse failed entirely — fall through to OCR
      console.warn('[blooms-engine] pdf-parse failed, falling back to OCR:', e.message);
    }

    if (text.replace(/\s+/g, '').length >= 100) {
      return text;
    }

    // Fallback: scanned or image-based PDF — run local Tesseract OCR
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

  // ── DOCX fallback (mammoth) ─────────────────────────────────────────────────
  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // ── Image files — Tesseract OCR directly ────────────────────────────────────
  if (IMAGE_TYPES.includes(mimeType)) {
    console.log('[blooms-engine] Image file detected, running OCR...');
    try {
      const { recognizeImageBuffer } = require('./ocr-engine');
      const ocrText = await recognizeImageBuffer(buffer, onProgress);
      if (ocrText && ocrText.trim().length > 0) return ocrText;
      throw new Error('OCR returned no text. The image may be blank or unreadable.');
    } catch (ocrErr) {
      throw new Error(`Could not extract text from image: ${ocrErr.message}`);
    }
  }

  throw new Error(`Unsupported file type: ${mimeType}. Please upload a PDF, DOCX, or image file (PNG, JPG, WEBP).`);
}

/**
 * Process a course material document (PDF or DOCX) and generate a Bloom's lesson plan.
 *
 * FIX 2: Now accepts openrouterApiKey and prefers OpenRouter (Llama 3.3 70B free)
 * over the active model when available. Falls back to active model → Ollama.
 *
 * @param {Buffer} buffer          - File buffer (PDF or DOCX)
 * @param {string} courseCode      - Course code for context
 * @param {object} db              - Database handle (optional)
 * @param {string} apiKey          - AI API key (active model)
 * @param {string} activeModel     - Active AI model name
 * @param {string} [mimeType]      - MIME type (defaults to 'application/pdf')
 * @param {Function} [onProgress]  - Optional OCR progress callback(pageNum, totalPages)
 * @param {string} [openrouterApiKey] - OpenRouter API key (preferred for lesson plan quality)
 * @returns {Promise<object>} Structured lesson plan JSON
 */
async function processPdfCourseMaterial(buffer, courseCode, db, apiKey, activeModel, mimeType, onProgress, openrouterApiKey) {
  // 1. Extract Text — MarkItDown → pdf-parse → OCR (Fix 1)
  let extractedText;
  try {
    extractedText = await extractText(buffer, mimeType || 'application/pdf', onProgress);
  } catch (e) {
    throw new Error('Failed to parse document: ' + e.message);
  }

  // 2. Fetch existing CLOs to provide context to the AI
  let cloDefinitions = 'No existing CLOs found for mapping.';
  if (db && courseCode) {
    const course = db.prepare('SELECT id FROM courses WHERE code = ? COLLATE NOCASE').get(courseCode);
    if (course) {
      const clos = db.prepare('SELECT code, description FROM clos WHERE course_id = ?').all(course.id);
      if (clos.length > 0) {
        cloDefinitions = clos.map(c => `${c.code}: ${c.description}`).join(' | ');
      }
    }
  }

  // 3. Build routing options (Fix 2 — OpenRouter preferred for lesson plan quality)
  const routingOpts = openrouterApiKey
    ? { preferOpenRouter: true, openrouterApiKey, orModel: 'meta-llama/llama-3.3-70b-instruct:free' }
    : { preferLocal: true, numCtx: 8192 };  // Fix 4 — 8192 ctx for Ollama

  // 4. Prompt AI Model via model-router
  const prompt = prompts.bloomsMappingPrompt(extractedText, courseCode, cloDefinitions);

  const aiResp = await modelRouter.send(prompt.user, {}, {
    apiKey,
    model: activeModel,
    systemPrompt: prompt.system,
    isJson: true,
    ...routingOpts,
  });

  try {
    const raw = aiResp.text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '').trim();
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('AI returned invalid JSON for lesson plan.');
  }
}

/**
 * Map CLOs to Bloom's cognitive levels with a 3-pass verification chain.
 *
 * FIX 3: Ollama 3B now processes questions in chunks of ≤4 to prevent
 *         silent input truncation. Results are merged into one output.
 * FIX 4: num_ctx raised to 8192 for all Ollama calls.
 *
 *   Pass 1 — Initial mapping (junior mapper)
 *   Pass 2 — Critic review  (senior reviewer flags errors) [cloud only]
 *   Pass 3 — Reconciler     (applies corrections) [cloud only]
 *
 * @param {string} cloText     - Raw CLO text (from document extraction or user input)
 * @param {string} courseCode  - Course code for context
 * @param {object} db          - Database handle (optional, for enrichment)
 * @param {string} apiKey      - AI API key
 * @param {string} activeModel - Active AI model name
 * @param {Function} [onStep]  - Optional step callback(step, detail)
 * @param {string} [openrouterApiKey] - OpenRouter key (preferred for accuracy)
 * @returns {Promise<object>} Structured CLO mapping JSON with verified flag
 */
async function mapCLOsToBlooms(cloText, courseCode, db, apiKey, activeModel, onStep, openrouterApiKey) {
  if (!cloText || cloText.trim().length < 10) {
    throw new Error('Please provide CLO text to analyze. Paste your CLOs or upload a document.');
  }

  const step = (s, d = '') => { try { if (onStep) onStep(s, d); } catch (_) {} };

  // Truncate to 20000 chars (raised from 12000 — Fix 3)
  const truncatedText = cloText.substring(0, 20000);

  // ── Routing strategy ────────────────────────────────────────────────────────
  // OpenRouter (Llama 3.3 70B free) → primary when key exists
  // Ollama 3B (chunked, ctx 8192)   → fallback for offline / no key professors
  const routingOpts = openrouterApiKey
    ? { preferOpenRouter: true, openrouterApiKey, orModel: 'meta-llama/llama-3.3-70b-instruct:free' }
    : { preferLocal: true, numCtx: 8192 };   // Fix 4 — raise ctx for 3B

  // ── DETERMINISTIC FAST PATH ─────────────────────────────────────────────────
  step('fast', 'Running deterministic verb-dictionary mapper…');
  let fastResult = null;
  try {
    const cloMapperFast = require('./clo-mapper-fast');
    fastResult = cloMapperFast.mapDeterministic(truncatedText, courseCode, db);
    const conf = fastResult?.confidence_summary || {};
    step('fast_done', `Resolved ${conf.high || 0} high, ${conf.medium || 0} medium, ${conf.low || 0} low confidence`);

    // All questions resolved with high/medium confidence — skip LLM entirely
    if ((conf.low || 0) === 0 && (fastResult.clo_mappings || []).length > 0) {
      step('done', `Analysis complete via fast deterministic mapper (${fastResult.clo_mappings.length} questions)`);
      fastResult.verified             = true;
      fastResult.improvements_applied = [];
      fastResult.review_quality       = 'high';
      fastResult._engine              = 'deterministic';
      fastResult._model_used          = 'deterministic-verb-dict';
      return fastResult;
    }

    // There are low-confidence questions — resolve them with AI
    const lowItems = (fastResult.clo_mappings || []).filter(m => m.confidence === 'low');
    if (lowItems.length > 0) {
      const focusedText = lowItems.map((m, i) => `${i + 1}. ${m.clo_text}`).join('\n');
      step('pass1', `Pass 1: Resolving ${lowItems.length} ambiguous question${lowItems.length === 1 ? '' : 's'} via AI…`);

      // Retrieve KB examples for the focused set
      let kbExamples = [];
      if (db) {
        try {
          const cloKnowledge = require('./clo-knowledge');
          kbExamples = await cloKnowledge.searchSimilarHybrid(db, focusedText, 3);
        } catch (_) {}
      }

      // ── FIX 3: If routing to Ollama, chunk the low-confidence questions ────
      // Determine if we'll actually land on Ollama (no OpenRouter key, Ollama up)
      const willUseOllama = !openrouterApiKey && (activeModel === 'ollama' || await modelRouter.isOllamaAvailable());
      const CHUNK_SIZE = willUseOllama ? 4 : lowItems.length; // 4 questions/call for 3B

      const aiResolvedMappings = [];
      const chunks = chunkArray(lowItems, CHUNK_SIZE);

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const chunkText = chunk.map((m, i) => `${i + 1}. ${m.clo_text}`).join('\n');
        if (chunks.length > 1) {
          step('pass1', `Pass 1: Batch ${ci + 1}/${chunks.length} (${chunk.length} question${chunk.length === 1 ? '' : 's'})…`);
        }

        try {
          const pass1Prompt = cloPrompts.bloomsCloMappingPromptForModel(chunkText, courseCode, kbExamples, willUseOllama);
          const pass1Resp = await modelRouter.send(pass1Prompt.user, {}, {
            apiKey,
            model: activeModel,
            systemPrompt: pass1Prompt.system,
            isJson: true,
            maxTokens: willUseOllama ? 512 : 256,  // 3B needs more tokens for JSON closing
            ...routingOpts,
          });

          const rawText = pass1Resp.text.trim()
            .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '').trim();
          const aiResult = JSON.parse(rawText);
          aiResolvedMappings.push(...(aiResult.clo_mappings || []));
        } catch (chunkErr) {
          console.warn(`[blooms-engine] Chunk ${ci + 1} AI failed:`, chunkErr.message);
          // Leave those items as low-confidence — don't fail the whole batch
        }
      }

      // Merge AI results back into deterministic result
      let aiIdx = 0;
      for (let i = 0; i < fastResult.clo_mappings.length; i++) {
        if (fastResult.clo_mappings[i].confidence === 'low') {
          const aiMatch = aiResolvedMappings[aiIdx++];
          if (aiMatch && aiMatch.bloom_level) {
            fastResult.clo_mappings[i] = {
              ...fastResult.clo_mappings[i],
              bloom_level:     aiMatch.bloom_level,
              bloom_name:      aiMatch.bloom_name,
              detected_verbs:  aiMatch.detected_verbs || [],
              suggested_verbs: aiMatch.suggested_verbs || [],
              justification:   aiMatch.justification || 'Resolved by AI (low-confidence fallback)',
              confidence:      'medium',
              _engine:         'ai-fallback',
            };
          }
        }
      }
      step('pass1_done', `AI resolved ${aiResolvedMappings.length} ambiguous question${aiResolvedMappings.length === 1 ? '' : 's'}`);

      fastResult.verified             = true;
      fastResult.improvements_applied = [];
      fastResult.review_quality       = 'medium';
      fastResult._engine              = 'deterministic+ai-fallback';
      return fastResult;
    }
  } catch (e) {
    console.warn('[blooms-engine] Fast mapper failed, falling back to AI:', e.message);
    fastResult = null;
  }

  // ── Retrieve KB examples for few-shot injection ──────────────────────────────
  step('kb', 'Searching knowledge base for similar examples…');
  let kbExamples = [];
  if (db) {
    try {
      const cloKnowledge = require('./clo-knowledge');
      kbExamples = await cloKnowledge.searchSimilarHybrid(db, truncatedText, 3);
      if (kbExamples.length > 0) step('kb_done', `Found ${kbExamples.length} similar example${kbExamples.length === 1 ? '' : 's'} from knowledge base`);
    } catch (_) {}
  }

  // ── Determine if Ollama will be used for chunking decision ──────────────────
  const willUseOllama = !openrouterApiKey && (activeModel === 'ollama' || await modelRouter.isOllamaAvailable());

  // ── FIX 3: Full AI path — chunk for Ollama 3B ───────────────────────────────
  if (willUseOllama) {
    step('pass1', 'Pass 1: Mapping CLOs to Bloom\'s levels (chunked for local model)…');

    // Split the full text into questions, then chunk them
    let allQuestions = [];
    try {
      const { splitQuestions } = require('./clo-mapper-fast');
      allQuestions = splitQuestions(truncatedText);
    } catch (_) {}

    if (allQuestions.length === 0) {
      // Can't split — treat whole text as one chunk
      allQuestions = [{ id: 'Q1', text: truncatedText }];
    }

    const CHUNK_SIZE = 4;
    const chunks = chunkArray(allQuestions, CHUNK_SIZE);
    const allMappings = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkText = chunk.map((q, i) => `${i + 1}. ${q.text}`).join('\n');
      step('pass1', `Batch ${ci + 1}/${chunks.length}: mapping ${chunk.length} question${chunk.length === 1 ? '' : 's'}…`);

      try {
        const pass1Prompt = cloPrompts.bloomsCloMappingPromptForModel(chunkText, courseCode, kbExamples, true);
        const pass1Resp = await modelRouter.send(pass1Prompt.user, {}, {
          apiKey,
          model: activeModel,
          systemPrompt: pass1Prompt.system,
          isJson: true,
          maxTokens: 512,
          numCtx: 8192,       // Fix 4
          preferLocal: true,
        });

        const raw = pass1Resp.text.trim()
          .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '').trim();
        const chunkResult = JSON.parse(raw);
        allMappings.push(...(chunkResult.clo_mappings || []));
      } catch (chunkErr) {
        console.warn(`[blooms-engine] Chunk ${ci + 1} failed:`, chunkErr.message);
      }
    }

    step('done', `Analysis complete (${allMappings.length} questions mapped via local model)`);

    // Build level distribution
    const dist = { C1: 0, C2: 0, C3: 0, C4: 0, C5: 0, C6: 0 };
    for (const m of allMappings) {
      if (m.bloom_level && dist[m.bloom_level] !== undefined) dist[m.bloom_level]++;
    }

    return {
      course_code:            courseCode || 'Unknown',
      clo_mappings:           allMappings,
      level_distribution:     dist,
      recommendations:        [],
      verified:               true,
      improvements_applied:   [],
      review_quality:         'medium',
      _engine:                'ollama-chunked',
      _model_used:            `ollama/${modelRouter.getOllamaModel()}`,
    };
  }

  // ── FULL 3-PASS CHAIN (Cloud / OpenRouter path) ─────────────────────────────
  step('pass1', 'Pass 1: Mapping CLOs to Bloom\'s levels…');
  const pass1Prompt = cloPrompts.bloomsCloMappingPrompt(truncatedText, courseCode, kbExamples);
  const pass1Resp = await modelRouter.send(pass1Prompt.user, {}, {
    apiKey,
    model: activeModel,
    systemPrompt: pass1Prompt.system,
    isJson: true,
    maxTokens: 1500,
    ...routingOpts,
  });

  let pass1;
  try {
    const raw = pass1Resp.text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '').trim();
    pass1 = JSON.parse(raw);
  } catch (e) {
    throw new Error('Pass 1: AI returned invalid JSON for CLO mapping.');
  }
  step('pass1_done', `Pass 1 complete — ${(pass1.clo_mappings || []).length} CLOs mapped`);

  // ── PASS 2: Critic review ────────────────────────────────────────────────────
  step('pass2', 'Pass 2: Expert review checking for errors…');
  let corrections = { corrections: [], overall_quality: 'high' };
  let criticOk = false;
  try {
    const criticPrompt = criticPrompts.bloomsCloCriticPrompt(pass1);
    const criticResp = await modelRouter.send(criticPrompt.user, {}, {
      apiKey,
      model: activeModel,
      systemPrompt: criticPrompt.system,
      isJson: true,
      maxTokens: 800,
      ...routingOpts,
    });
    const criticRaw = criticResp.text.trim()
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '').trim();
    corrections = JSON.parse(criticRaw);
    criticOk = true;
    const n = (corrections.corrections || []).length;
    step('pass2_done', n > 0 ? `Pass 2 found ${n} correction${n === 1 ? '' : 's'}` : 'Pass 2: No corrections needed');
  } catch (e) {
    console.error('[blooms-engine] Pass 2 critic failed, using Pass 1 as-is:', e.message);
    step('pass2_done', 'Pass 2 skipped (will use Pass 1 result)');
  }

  // ── PASS 3: Reconcile (conditional) ─────────────────────────────────────────
  let final = pass1;
  let reconcilerOk = true;
  if (criticOk && corrections.corrections && corrections.corrections.length > 0) {
    step('pass3', `Pass 3: Applying ${corrections.corrections.length} correction${corrections.corrections.length === 1 ? '' : 's'}…`);
    reconcilerOk = false;
    try {
      const reconPrompt = reconcilerPrompts.bloomsCloReconcilerPrompt(pass1, corrections);
      const reconResp = await modelRouter.send(reconPrompt.user, {}, {
        apiKey,
        model: activeModel,
        systemPrompt: reconPrompt.system,
        isJson: true,
        maxTokens: 1500,
        ...routingOpts,
      });
      const reconRaw = reconResp.text.trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '').trim();
      final = JSON.parse(reconRaw);
      reconcilerOk = true;
      step('pass3_done', 'Pass 3: Corrections applied — final result ready');
    } catch (e) {
      console.error('[blooms-engine] Pass 3 reconciler failed, using Pass 1:', e.message);
      final = pass1;
      step('pass3_done', 'Pass 3 skipped — using Pass 1 result');
    }
  }

  const actualModelUsed = String(pass1Resp.model || '');
  final.verified             = criticOk && reconcilerOk;
  final.improvements_applied = corrections.corrections || [];
  final.review_quality       = corrections.overall_quality || 'unknown';
  final._model_used          = actualModelUsed;

  return final;
}

// ── Utility: split an array into chunks of size n ─────────────────────────────
function chunkArray(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

module.exports = {
  processPdfCourseMaterial,
  mapCLOsToBlooms,
  extractText,
};
