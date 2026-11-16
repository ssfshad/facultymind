/**
 * model-router.js — THE central AI abstraction layer
 *
 * ALL AI calls in the entire application go through this file.
 * Never call Claude, OpenAI, or Gemini APIs directly from any module.
 *
 * Usage:
 *   const aiRouter = require('../ai/model-router');
 *   const response = await aiRouter.send(promptTemplate, contextObject, options);
 *   // Returns: { text: string, tokens: number, model: string }
 *
 * options: { model: 'claude'|'gpt4o'|'gemini'|null, apiKey: string }
 * If model is null, uses the currently active model.
 */

const { intentClassifierPrompt } = require('../../prompts/templates/intent-classifier');

let _activeModel = 'claude';
let _openrouterModel = 'openai/gpt-4o-mini'; // default OpenRouter sub-model
let _ollamaModel = 'gemma4:e2b';    // default local model (Shad, 2026-11-11) — best eval scores; ~4.6 GB RAM loaded (qwen2.5:3b-instruct ~2.1 GB is the lighter fallback)
let _ollamaAvailable = null;                  // null=unchecked, true/false after check

// ─── Model Selection ──────────────────────────────────────────────────────────

function setActiveModel(model) {
  const valid = ['claude', 'gpt4o', 'gemini', 'openrouter', 'ollama'];
  if (!valid.includes(model)) throw new Error(`Invalid model: ${model}`);
  _activeModel = model;
  console.log(`[ai-router] Active model: ${_activeModel}`);
}

function setOpenRouterModel(modelId) {
  _openrouterModel = modelId;
  console.log(`[ai-router] OpenRouter sub-model: ${_openrouterModel}`);
}

function getOpenRouterModel() {
  return _openrouterModel;
}

function setOllamaModel(modelId) {
  _ollamaModel = modelId;
  console.log(`[ai-router] Ollama model: ${_ollamaModel}`);
}

function getOllamaModel() {
  return _ollamaModel;
}

function getActiveModel() {
  return _activeModel;
}

/**
 * Check if Ollama is running at localhost:11434.
 * Result is cached for 60 seconds to avoid hammering the port.
 */
let _ollamaLastCheck = 0;
/** Forget the cached Ollama status so the next call re-checks (tests, Settings "retry"). */
function resetOllamaCheck() { _ollamaAvailable = null; _ollamaLastCheck = 0; }
async function isOllamaAvailable() {
  const now = Date.now();
  if (_ollamaAvailable !== null && now - _ollamaLastCheck < 60_000) {
    return _ollamaAvailable;
  }
  try {
    const http = require('http');
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:11434/api/tags', { timeout: 2000 }, res => {
        _ollamaAvailable = res.statusCode === 200;
        _ollamaLastCheck = Date.now();
        resolve();
      });
      req.on('error', () => {
        _ollamaAvailable = false;
        _ollamaLastCheck = Date.now();
        resolve();
      });
      req.on('timeout', () => {
        req.destroy();
        _ollamaAvailable = false;
        _ollamaLastCheck = Date.now();
        resolve();
      });
    });
  } catch (_) {
    _ollamaAvailable = false;
    _ollamaLastCheck = Date.now();
  }
  if (_ollamaAvailable) console.log('[ai-router] Ollama detected at localhost:11434');
  return _ollamaAvailable;
}

// ─── Main Send ────────────────────────────────────────────────────────────────

/**
 * Send a prompt to the active (or specified) AI model.
 *
 * @param {string} userMessage    - User's message or pre-built prompt
 * @param {object} context        - Context object (merged into system prompt template vars)
 * @param {object} options        - { model, apiKey, systemPrompt, isJson, localOnly }
 *   localOnly: the request carries student records (data-add, marks,
 *   attendance, rosters, email) — it runs on Ollama whatever the active
 *   model is, and is refused (LOCAL_ONLY_UNAVAILABLE) when Ollama is down.
 * @returns {{ text, tokens, model }}
 */
async function send(userMessage, context = {}, options = {}) {
  const model = options.model || _activeModel;
  const apiKey = options.apiKey;

  // ── Local-only policy: student-data tasks never go to a cloud model ───────
  if (options.localOnly) {
    if (model === 'ollama' || await isOllamaAvailable()) {
      return sendOllama(userMessage, context, { ...options, model: 'ollama' });
    }
    throw localOnlyError();
  }

  // ── OpenRouter auto-routing (preferred for structured JSON tasks) ─────────
  // For tasks where we want fast, accurate inference (CLO mapping, Bloom's, etc.)
  // route to OpenRouter when an OpenRouter key is available — regardless of active
  // model. OpenRouter free-tier 70B models are 50-100x faster than Ollama qwen2.5:14b
  // on CPU and far more accurate. Falls back to Ollama if OpenRouter fails or no key.
  if (options.preferOpenRouter && model !== 'openrouter' && options.openrouterApiKey) {
    console.log('[ai-router] Auto-routing to OpenRouter (preferred for structured task)');
    try {
      return await sendCloud(sendOpenRouter, userMessage, context, {
        ...options,
        apiKey: options.openrouterApiKey,
        model: 'openrouter',
      });
    } catch (e) {
      console.warn('[ai-router] OpenRouter failed, falling back to local:', e.message);
      // Fall through to Ollama check below
    }
  }

  // ── Ollama auto-routing ───────────────────────────────────────────────────
  // If the task is marked as local-eligible (structured JSON tasks like Bloom's,
  // CLO mapping) AND Ollama is available, route to Ollama regardless of active model.
  // This gives offline, zero-cost inference. Also serves as fallback when
  // preferOpenRouter is set but OpenRouter is unavailable / no key.
  if ((options.preferLocal || options.preferOpenRouter) && model !== 'ollama') {
    const ollamaUp = await isOllamaAvailable();
    if (ollamaUp) {
      console.log('[ai-router] Auto-routing to Ollama (local model available)');
      return sendOllama(userMessage, context, { ...options, model: 'ollama' });
    }
  }

  // Ollama doesn't need an API key
  if (model === 'ollama') {
    return sendOllama(userMessage, context, options);
  }

  if (!apiKey) throw new Error(`No API key provided for model: ${model}`);

  switch (model) {
    case 'claude': return sendCloud(sendClaude, userMessage, context, options);
    case 'gpt4o': return sendCloud(sendGPT4o, userMessage, context, options);
    case 'gemini': return sendCloud(sendGemini, userMessage, context, options);
    case 'openrouter': return sendCloud(sendOpenRouter, userMessage, context, options);
    default: throw new Error(`Unknown model: ${model}`);
  }
}

/**
 * BUG-S2: every cloud-bound call goes through here. Student names, IDs and
 * enrollment numbers are replaced with placeholders in everything the request
 * carries (system prompt, history, message), and put back in the reply
 * locally. Ollama calls never come here — the choice is per call, made above
 * from the provider actually used.
 */
async function sendCloud(sender, userMessage, context, options) {
  const systemPrompt = options.systemPrompt || await buildSystemPrompt(context);
  // Fail closed: if the redactor can't be built or throws, nothing is sent
  let guard, message, history, system;
  try {
    guard   = piiGuard.createRedactor();
    history = (options.history || []).map(e => ({ ...e, content: guard.redact(e.content) }));
    message = guard.redact(userMessage);
    system  = guard.redact(systemPrompt);
  } catch (e) {
    throw e.code === 'PII_GUARD_BLOCKED' ? e : new piiGuard.PiiGuardError(e.message);
  }
  const resp = await sender(message, context, { ...options, systemPrompt: system, history });
  return { ...resp, text: guard.restore(resp.text), redacted: guard.size };
}

function localOnlyError() {
  const e = new Error('This request involves student records, so it only runs on the local AI (Ollama), and Ollama is not running. Start Ollama and try again — student data is never sent to a cloud model.');
  e.code = 'LOCAL_ONLY_UNAVAILABLE';
  return e;
}

/** Errors that must reach the user instead of being swallowed by a fallback. */
function isPolicyError(e) {
  return e && (e.code === 'LOCAL_ONLY_UNAVAILABLE' || e.code === 'PII_GUARD_BLOCKED');
}

// ─── History → model message format helpers ────────────────────────────────────

/**
 * Convert a history entry's imageBase64 into Claude content blocks.
 */
function claudeContentFromEntry(entry) {
  if (entry.imageBase64) {
    const [header, b64data] = entry.imageBase64.split(',');
    const mediaType = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    return [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64data } },
      { type: 'text', text: entry.content },
    ];
  }
  return entry.content;
}

/**
 * Convert history array to Claude messages format.
 * history: [{ role, content, imageBase64? }]
 * currentMessage + currentImage = the new user turn.
 */
function buildClaudeMessages(history, currentMessage, currentImageBase64) {
  const messages = [];

  for (const entry of (history || [])) {
    messages.push({ role: entry.role, content: claudeContentFromEntry(entry) });
  }

  // Current turn
  if (currentImageBase64) {
    const [header, b64data] = currentImageBase64.split(',');
    const mediaType = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    messages.push({
      role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64data } },
        { type: 'text', text: currentMessage },
      ]
    });
  } else {
    messages.push({ role: 'user', content: currentMessage });
  }

  return messages;
}

/**
 * Convert history array to OpenAI-compatible messages format.
 * Used by GPT-4o and OpenRouter.
 */
function buildOpenAIMessages(systemPrompt, history, currentMessage, currentImageBase64) {
  const messages = [{ role: 'system', content: systemPrompt }];

  for (const entry of (history || [])) {
    if (entry.imageBase64) {
      messages.push({
        role: entry.role, content: [
          { type: 'image_url', image_url: { url: entry.imageBase64 } },
          { type: 'text', text: entry.content },
        ]
      });
    } else {
      messages.push({ role: entry.role, content: entry.content });
    }
  }

  // Current turn
  if (currentImageBase64) {
    messages.push({
      role: 'user', content: [
        { type: 'image_url', image_url: { url: currentImageBase64 } },
        { type: 'text', text: currentMessage },
      ]
    });
  } else {
    messages.push({ role: 'user', content: currentMessage });
  }

  return messages;
}

// ─── Claude (Anthropic) ───────────────────────────────────────────────────────

async function sendClaude(userMessage, context, options) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: options.apiKey });

  const systemPrompt = options.systemPrompt || await buildSystemPrompt(context);
  const messages = buildClaudeMessages(options.history, userMessage, options.imageBase64);

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: options.maxTokens || 2048,
    system: systemPrompt,
    messages,
  });

  const text = msg.content[0]?.text || '';
  const tokens = (msg.usage?.input_tokens || 0) + (msg.usage?.output_tokens || 0);

  return { text, tokens, model: 'claude' };
}

// ─── GPT-4o (OpenAI) ──────────────────────────────────────────────────────────

async function sendGPT4o(userMessage, context, options) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: options.apiKey });

  const systemPrompt = options.systemPrompt || await buildSystemPrompt(context);
  const messages = buildOpenAIMessages(systemPrompt, options.history, userMessage, options.imageBase64);

  const resp = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: options.maxTokens || 2048,
    messages,
  });

  const text = resp.choices[0]?.message?.content || '';
  const tokens = resp.usage?.total_tokens || 0;

  return { text, tokens, model: 'gpt4o' };
}

// ─── Gemini (Google) ──────────────────────────────────────────────────────────

async function sendGemini(userMessage, context, options) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(options.apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const systemPrompt = options.systemPrompt || await buildSystemPrompt(context);

  // Build Gemini history array from prior turns
  const geminiHistory = [];
  for (const entry of (options.history || [])) {
    let parts;
    if (entry.imageBase64) {
      const [header, b64data] = entry.imageBase64.split(',');
      const mimeType = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      parts = [{ inlineData: { mimeType, data: b64data } }, { text: entry.content }];
    } else {
      parts = [{ text: entry.content }];
    }
    // Gemini uses 'model' not 'assistant'
    geminiHistory.push({ role: entry.role === 'assistant' ? 'model' : 'user', parts });
  }

  // Build current message parts
  let currentParts;
  if (options.imageBase64) {
    const [header, b64data] = options.imageBase64.split(',');
    const mimeType = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    currentParts = [{ inlineData: { mimeType, data: b64data } }, { text: userMessage }];
  } else {
    currentParts = [{ text: userMessage }];
  }

  // Use chat session for multi-turn context
  const chat = model.startChat({
    history: geminiHistory,
    systemInstruction: systemPrompt,
  });

  const result = await chat.sendMessage(currentParts);
  const text = result.response.text();
  const tokens = result.response.usageMetadata?.totalTokenCount || 0;

  return { text, tokens, model: 'gemini' };
}

// ─── Ollama (local model — no API key needed) ─────────────────────────────────

/**
 * Send a prompt to a locally running Ollama instance.
 * Uses the native Ollama chat endpoint at localhost:11434/api/chat.
 * No API key required. Falls back to cloud if Ollama is unreachable.
 */
async function sendOllama(userMessage, context, options) {
  // For local inference, we now pass the full FacultyMind context since
  // modern local models (Qwen 2.5, Llama 3) can easily handle 4k-32k context windows.
  // This allows Local AI to answer data queries (schedule, etc.) correctly.
  const systemPrompt = options.systemPrompt || await buildSystemPrompt(context);
  const messages = buildOpenAIMessages(systemPrompt, options.history, userMessage, null);
  const model = options.ollamaModel || _ollamaModel;

  // think: false — root-level Ollama API parameter for reasoning models (deepseek-r1, qwen3).
  // For non-reasoning models (qwen2.5:3b-instruct, llama3.2) this is silently ignored.
  // Kept here so the router works correctly if the user manually switches to a reasoning model.
  const enableThinking = options.think === true; // default: thinking OFF

  const body = JSON.stringify({
    model,
    messages,
    stream: false,
    think: enableThinking,   // root-level — NOT inside options{}
    // jsonObject: the caller expects ONE JSON object -> Ollama constrains decoding so the reply is always valid JSON
    // (small models otherwise slip a stray bracket). Opt-in: some callers expect a JSON array, which this mode rejects.
    // jsonSchema: a JSON schema the reply must follow exactly (fixed fields, allowed values, array sizes): stronger than 'json'
    ...(options.jsonSchema ? { format: options.jsonSchema } : options.jsonObject ? { format: 'json' } : {}),
    options: {
      temperature: options.isJson ? 0.0 : 0.2,  // 0.0 for JSON tasks = zero drift
      num_predict: options.maxTokens || 1024,
      num_ctx: options.numCtx || 4096,           // default 4096; callers raise only when needed
      ...(options.ollamaOptions || {}),          // per-model sampling (e.g. Qwen3.x needs a little randomness to avoid repeat loops)
    },
  });

  const http = require('http');
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(body);
    const req = http.request({
      hostname: 'localhost',
      port:     11434,
      path:     '/api/chat',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': payload.length,
      },
      timeout: 600_000, // 10 min — model needs time to load into RAM on first call
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);

          // Ollama /api/chat response shape:
          //   think: false → { message: { role, content }, ... }
          //   think: true  → { message: { role, content, thinking }, ... }
          // We always use message.content as the primary text.
          // If thinking was enabled, expose it separately for the UI debug panel.
          let text = parsed.message?.content || parsed.response || '';
          const thinking = parsed.message?.thinking || '';

          // Strip markdown code fences that some models wrap around JSON
          if (options.isJson) {
            text = text.trim()
              .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
              .replace(/\s*```$/i, '').trim();
          }

          const tokens = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
          resolve({ text, tokens, model: `ollama/${model}`, thinking });
        } catch (e) {
          reject(new Error(`Ollama response parse error: ${e.message}. Raw: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on('error', e => reject(new Error(`Ollama not reachable: ${e.message}. Is Ollama running?`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama request timed out. The model may still be loading.'));
    });
    req.write(payload);
    req.end();
  });
}

// ─── OpenRouter (any open-source model via openrouter.ai) ────────────────────

// Fallback chain — tried in order when preferred model is overloaded/404
// Kept short intentionally — long chains add latency when multiple models are down
const FREE_FALLBACK_CHAIN = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
  'google/gemma-3-27b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-3-12b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

function orHttpsCall(model, body, apiKey) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(body);
    const req = https.request({
      hostname: 'openrouter.ai',
      path:     '/api/v1/chat/completions',
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  `Bearer ${String(apiKey).trim()}`,
        'HTTP-Referer':   'https://facultymind.app',
        'X-Title':        'FacultyMind',
        'Content-Length': payload.length,
      },
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw });
        }
      });
    });
    req.on('error', e => reject(new Error(`OpenRouter network error: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

async function sendOpenRouter(userMessage, context, options) {
  const systemPrompt = options.systemPrompt || await buildSystemPrompt(context);
  const messages = buildOpenAIMessages(systemPrompt, options.history, userMessage, options.imageBase64);

  // Build model priority list: preferred first, then fallbacks (skip duplicates)
  const preferred = options.orModel || _openrouterModel;
  const tryList   = [preferred, ...FREE_FALLBACK_CHAIN.filter(m => m !== preferred)];

  let lastError = null;

  for (const model of tryList) {
    const isFree = model.endsWith(':free');
    const body   = JSON.stringify({
      model,
      messages,
      ...(isFree ? {} : { max_tokens: options.maxTokens || 2048 }),
    });

    try {
      const { status, data, raw } = await orHttpsCall(model, body, options.apiKey);

      if (status === 200) {
        // If we fell back to a different model, update the active sub-model
        if (model !== preferred) {
          console.log(`[OpenRouter] Fell back to ${model} (${preferred} unavailable)`);
          setOpenRouterModel(model);
        }
        const text   = data.choices?.[0]?.message?.content || '';
        const tokens = data.usage?.total_tokens || 0;
        return { text, tokens, model: `openrouter/${model}` };
      }

      const errMsg = data?.error?.message || data?.message || raw || `HTTP ${status}`;

      if (status === 401) throw new Error(`OpenRouter API key invalid. Re-save it in Settings → OpenRouter.`);
      if (status === 402) throw new Error(`Insufficient OpenRouter credits for "${model}".`);

      // 429 or 404 — try next model in chain
      if (status === 429 || status === 404) {
        lastError = new Error(`${model}: ${status === 429 ? 'overloaded' : 'not found'}`);
        console.log(`[OpenRouter] ${model} ${status === 429 ? 'overloaded' : 'not found'}, trying next...`);
        continue;
      }

      throw new Error(`OpenRouter ${status}: ${errMsg}`);
    } catch (err) {
      if (err.message.includes('API key invalid') || err.message.includes('credits')) throw err;
      lastError = err;
    }
  }

  throw new Error(`All OpenRouter models are currently unavailable. Last error: ${lastError?.message}`);
}

// ─── Intent Classification ────────────────────────────────────────────────────

/**
 * Classify user message into intent + entities.
 * Returns parsed JSON or null on failure.
 */
async function classifyIntent(userMessage, options = {}) {
  // Deterministic fast path for clear commands: instant, and nothing is sent to any model.
  // A rule with needsModel is certain of the intent but the handler needs entities only the model extracts
  // (reminder text/time, vault content, CLO text): the model still runs, with the intent as a hint.
  let hint = null;
  if (options.intentHint) {
    hint = { intent: options.intentHint, entities: {} };      // explicit hint (used by the model comparison eval)
  } else if (!options.skipRules) {
    const byRule = require('./intent-rules').classifyByRules(userMessage);
    if (byRule && !byRule.needsModel) return byRule;
    hint = byRule;
  }
  const prompt = intentClassifierPrompt(userMessage, hint ? hint.intent : null, options.now ? new Date(options.now) : new Date());
  try {
    const resp = await send(prompt.user, {}, {
      ...options,
      systemPrompt: prompt.system,
      isJson: true,
      jsonObject: true,
      // Messages about student records are classified locally (local-only policy)
      localOnly: options.localOnly || piiGuard.isStudentDataText(userMessage),
    });
    const parsed = JSON.parse(resp.text);
    if (hint) { parsed.intent = hint.intent; parsed.source = 'rule+model'; }   // the model fills entities, it cannot change the intent
    parsed.entities = fixEntities(parsed.intent, userMessage, parsed.entities, options.now ? new Date(options.now) : new Date());   // reminder time, vault password
    return parsed;
  } catch (e) {
    if (isPolicyError(e)) throw e;
    console.error('[ai-router] Intent classify failed:', e.message);
    if (hint) return { intent: hint.intent, confidence: 0.8, entities: fixEntities(hint.intent, userMessage, hint.entities, new Date()), raw_query: userMessage, source: 'rule' };
    return { intent: 'GENERAL_CHAT', confidence: 0.5, entities: {}, raw_query: userMessage };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { buildContext } = require('../memory/memory-manager');
const piiGuard = require('../security/pii-guard');
const { fixEntities } = require('./entity-fixups');
const db = require('../../database/db');

async function buildSystemPrompt(context) {
  const now = new Date();
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = DAYS[now.getDay()];
  const timeStr = now.toTimeString().slice(0, 5);
  const dateStr = now.toLocaleDateString('en-BD', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── Live DB snapshot ───────────────────────────────────────────────────────
  let scheduleBlock = '';
  let coursesBlock = '';
  let statsBlock = '';

  try {
    const liveDb = db.getDb();
    if (liveDb) {
      // Today's classes
      const todayClasses = liveDb.prepare(
        `SELECT s.start_time, s.end_time, s.room, c.code, c.name
         FROM schedule s JOIN courses c ON s.course_id = c.id
         WHERE s.day_of_week = ? ORDER BY s.start_time`
      ).all(now.getDay());

      if (todayClasses.length) {
        scheduleBlock = '\n### TODAY\'S SCHEDULE\n' + todayClasses.map(
          c => `  ${c.start_time}–${c.end_time}  ${c.code} — ${c.name}${c.room ? '  (' + c.room + ')' : ''}`
        ).join('\n');
      } else {
        scheduleBlock = '\n### TODAY\'S SCHEDULE\n  No classes today.';
      }

      // All courses
      const courses = liveDb.prepare(`SELECT code, name, credit_hours FROM courses`).all();
      if (courses.length) {
        coursesBlock = '\n### COURSES YOU TEACH\n' + courses.map(
          c => `  ${c.code} — ${c.name} (${c.credit_hours} cr)`
        ).join('\n');
      }

      // Quick stats
      const studentCount = liveDb.prepare(`SELECT COUNT(*) as n FROM students`).get()?.n || 0;
      const scheduleCount = liveDb.prepare(`SELECT COUNT(*) as n FROM schedule`).get()?.n || 0;

      // DIU Portal live stats
      try {
        const diuRows = liveDb.prepare(`
          SELECT dm.*, s.name_enc, s.name_anon
          FROM diu_marks dm
          JOIN students s ON s.id = dm.student_id
        `).all();

        if (diuRows.length) {
          const totals = diuRows.map(m => {
            const ct = (m.ct1 + m.ct2 + m.ct3) / 3;
            return Math.round((m.attendance + ct + m.presentation + m.assignment + m.midterm + m.final_exam) * 10) / 10;
          });
          const avg = Math.round(totals.reduce((a,b)=>a+b,0)/totals.length * 10)/10;
          const passing = totals.filter(t => t >= 40).length;
          const failing = totals.filter(t => t < 40).length;
          const gradeMap = (t) => t>=80?'A+':t>=75?'A':t>=70?'A-':t>=65?'B+':t>=60?'B':t>=55?'B-':t>=50?'C+':t>=45?'C':t>=40?'D':'F';
          const gradeCounts = {};
          totals.forEach(t => { const g = gradeMap(t); gradeCounts[g] = (gradeCounts[g]||0)+1; });
          const gradeStr = Object.entries(gradeCounts).sort((a,b)=>b[1]-a[1]).map(([g,n])=>`${g}:${n}`).join(', ');

          statsBlock = `\n### QUICK FACTS\n  Students in DB: ${studentCount}\n  Scheduled classes per week: ${scheduleCount}` +
            `\n\n### DIU TEACHERS PORTAL — LIVE GRADE DATA\n` +
            `  Students with marks: ${diuRows.length}\n` +
            `  Class average: ${avg}/100\n` +
            `  Passing (≥40): ${passing}  |  Failing (<40): ${failing}\n` +
            `  Grade distribution: ${gradeStr}`;
        } else {
          statsBlock = `\n### QUICK FACTS\n  Students in DB: ${studentCount}\n  Scheduled classes per week: ${scheduleCount}`;
        }
      } catch (_) {
        statsBlock = `\n### QUICK FACTS\n  Students in DB: ${studentCount}\n  Scheduled classes per week: ${scheduleCount}`;
      }
    }
  } catch (_) { }

  const memoryBlock = buildContext();

  return `You are FacultyMind — a fully intelligent AI academic assistant built for Professor Shad at Daffodil International University (DIU), Bangladesh.

You are NOT a generic chatbot. You are deeply integrated into this desktop application and know everything about the professor's work.

═══════════════════════════════════════════
CONVERSATION MEMORY & SELF-LEARNING
═══════════════════════════════════════════
- You ALWAYS maintain context across the entire conversation thread.
- When an image was shared earlier in the conversation, you remember EXACTLY what was in it. Never lose that context.
- If a follow-up question refers to "the info", "list it", "what did it say" etc., answer from the image/content already described.
- If a question is vague or you are genuinely uncertain, ASK a clarifying question — do NOT guess or hallucinate. Example: "I want to make sure I get this right — are you referring to the ID card you shared, or something else?"
- After each clarification, update your understanding and give a precise answer.
- You NEVER fabricate data. If you didn't see it, say so and ask.

═══════════════════════════════════════════
WHAT YOU ARE AND WHAT YOU OWN
═══════════════════════════════════════════
You are the brain of FacultyMind. You have full knowledge of every module:

1. SMART SCHEDULE MANAGER
   - You know the professor's full weekly timetable.
   - You track which classes happened, which are coming, and which were missed.
   - You answer questions like "what do I have today?", "when is my next class?", "am I free on Thursday?"

2. SHADSYNC OBE ENGINE (your signature engine)
   - ShadSync is the OBE (Outcome-Based Education) engine built by Shad.
   - It handles: student marks, CLO attainment, CO attainment, PO attainment, BAETE reports.
   - CLO = Course Learning Outcome. CO = Course Outcome. PO = Program Outcome.
   - You know how attainment is calculated: weighted average of marks across assessments.
   - When asked about student performance, CLOs, or attainment — you query and explain it.
   - You NEVER send raw student names or IDs to any external system.

3. BLOOM'S TAXONOMY ENGINE
   - Generates lesson plans, quiz questions, CLO mappings from uploaded PDF lectures.
   - Maps content to Bloom's levels: Remember, Understand, Apply, Analyse, Evaluate, Create.

4. EMAIL INTELLIGENCE
   - Connected to Gmail via OAuth.
   - Classifies emails: urgent, student query, admin, spam.
   - Can draft professional replies on behalf of the professor.
   - Enforces faculty-defined rules (e.g. "always reply to student queries within 24h").

5. LOCAL VAULT
   - Encrypted local storage for files, links, notes, passwords.
   - Searchable with Fuse.js. Never leaves the device.

6. WHISPERFLOW (Voice)
   - Press-to-record voice input. Transcribed via OpenAI Whisper.
   - Professor can speak commands instead of typing.

7. DIU TEACHERS PORTAL (your embedded portal — fully synced)
   - This is a full replica of the DIU Teachers Portal built inside FacultyMind.
   - It has its own dark navy DIU-styled sidebar with: Dashboard, Student Attendance, Result, Marks Entry, Course Registration.
   - MARKS FORMAT (DIU standard, out of 100):
       • Class Attendance   (out of 7)
       • CT-1, CT-2, CT-3  (each out of 15) → Class Test average = avg(CT-1,CT-2,CT-3)
       • Presentation/Viva  (out of 8)
       • Assignment         (out of 5)
       • Mid Term Exam      (out of 25)
       • Final Exam         (out of 40)
       • Grand Total        (out of 100) = Attendance + ClassTest + Presentation + Assignment + Midterm + Final
   - GRADING SCALE (DIU standard):
       A+ = 80–100 (GPA 4.00), A = 75–79 (3.75), A- = 70–74 (3.50)
       B+ = 65–69 (3.25), B = 60–64 (3.00), B- = 55–59 (2.75)
       C+ = 50–54 (2.50), C = 45–49 (2.25), D = 40–44 (2.00), F = 0–39 (0.00)
   - SYNC: Portal marks automatically sync to ShadSync OBE engine (both directions).
     When the professor edits marks in the portal → ShadSync recalculates CLO/CO/PO attainment.
     When ShadSync data is updated → portal reflects updated grades.
   - ATTENDANCE: Professor can mark present/absent per student per date. Summary shows % and Regular/Irregular status.
   - RESULT: Shows printable Final Grade Sheet matching official DIU format (used for BAETE reporting).
   - COURSE REGISTRATION: Professor can register new courses directly in the portal — they appear in ShadSync automatically.
   - You can navigate the professor to any section: "open marks entry", "show result", "go to attendance".
   - You can answer questions about portal data: grade distribution, class averages, who passed/failed, attendance irregulars.

8. QUICK PORTAL ACCESS (WebView)
   - Embedded DIU Portal and BLC (Blackboard Learning) live website views inside the app.

8. CORTEX INTELLIGENCE (that's you — your own memory layer)
   - You log every interaction and learn from it daily.
   - You maintain a thought journal — your own observations and patterns.
   - You evaluate faculty-defined rules before every response.
   - You proactively surface insights without being asked.

═══════════════════════════════════════════
YOUR PERSONALITY AND BEHAVIOUR
═══════════════════════════════════════════
- You address the professor as "Sir" or "Professor" — never "user".
- You are warm, sharp, and concise. Max 3–4 sentences unless listing data.
- You NEVER say "I don't have access to that" — you have access to everything in this system.
- You NEVER say "As an AI..." — you are FacultyMind, not a generic assistant.
- When you don't know something, say "I don't see that in your data yet" — not "I can't help".
- You proactively notice things: upcoming classes, overdue tasks, at-risk students.
- You speak like a trusted colleague, not a customer support bot.
- You also answer ordinary questions directly, including quick arithmetic (marks, averages, percentages, unit conversions) and general knowledge. Never refuse a harmless question because it is not about a module. For arithmetic, work it out step by step and state the result plainly.

═══════════════════════════════════════════
LIVE CONTEXT — RIGHT NOW
═══════════════════════════════════════════
Date & Time: ${dateStr}, ${timeStr}
Day: ${dayName}
${scheduleBlock}
${coursesBlock}
${statsBlock}

${memoryBlock ? '### MEMORY & LEARNED PATTERNS\n' + memoryBlock : ''}

═══════════════════════════════════════════
WHAT YOU CAN DO WHEN ASKED
═══════════════════════════════════════════
- Check schedule for any day of the week
- Report CLO/CO/PO attainment for any course
- Show top/bottom performing students (anonymised externally, real names shown in-app)
- Draft professional emails
- Set reminders and tasks
- Explain Bloom's levels for a given topic
- Search the vault
- Switch AI models
- Answer any academic or management question using context above

  When answering data questions (marks, attainment, schedule), always use the live data from the database shown in LIVE CONTEXT above. Never fabricate numbers.`;
}

async function smartClassifyDocument(buffer, mimeType, fileName, db, keychainConfig) {
  let text = '';
  try {
    if (mimeType === 'application/pdf') {
      text = await require('../../utils/pdf-text').extractPdfText(buffer);
    } else if (mimeType.includes('wordprocessingml') || fileName.endsWith('.docx')) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: buffer });
      text = result.value;
    } else {
      // Try treating as raw text
      text = Buffer.from(buffer).toString('utf8');
    }
  } catch (e) {
    console.error('[ai-router] smartClassifyDocument parse error:', e);
    return { category: 'GENERAL', error: 'Parse failed: ' + e.message };
  }

  const snippet = text.substring(0, 1500); // Send first 1500 chars to AI
  const prompt = `You are an academic routing AI. Analyze the following document snippet.
Classify it STRICTLY as one of the following categories based on its primary content:
- 'SYLLABUS' if it contains course outlines, objectives, grading policies, textbooks, or course description.
- 'EXAM_QUESTIONS' if it contains a list of questions, quizzes, midterm/final exam papers, or assignments.
- 'SCHEDULE_PLAN' if it contains a chronological lesson plan, academic calendar, or weekly lecture schedule.
- 'GENERAL' if it does not clearly fit the above categories.

Output ONLY valid JSON in this exact format:
{ "category": "SYLLABUS|EXAM_QUESTIONS|SCHEDULE_PLAN|GENERAL", "reason": "brief reason" }

Document snippet:
---
${snippet}
---`;

  try {
    const apiKey = await require('./api-key').getApiKey(keychainConfig, _activeModel);
    const resp = await send(prompt, {}, {
      model: _activeModel,
      apiKey,
      systemPrompt: 'You are an intelligent document router. Output only valid JSON.',
      isJson: true,
      // Dropped spreadsheets, rosters and marks sheets never go to a cloud model
      localOnly: piiGuard.isSpreadsheet(mimeType, fileName) || piiGuard.looksLikeStudentTable(text),
    });
    const parsed = JSON.parse(resp.text);
    return { category: parsed.category || 'GENERAL', reason: parsed.reason, textSnippet: snippet };
  } catch (e) {
    console.error('[ai-router] smartClassifyDocument AI error:', e);
    if (isPolicyError(e)) return { category: 'GENERAL', error: e.message, code: e.code, textSnippet: snippet };
    return { category: 'GENERAL', error: 'AI classify failed: ' + e.message, textSnippet: snippet };
  }
}

module.exports = { send, classifyIntent, isPolicyError, setActiveModel, getActiveModel, setOpenRouterModel, getOpenRouterModel, setOllamaModel, getOllamaModel, isOllamaAvailable, resetOllamaCheck, smartClassifyDocument };
