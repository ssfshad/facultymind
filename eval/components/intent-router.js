'use strict';
// Intent router, end to end: rule fast path first, local model (Ollama qwen2.5:3b-instruct) for the rest.
// 1,100 commands (100 hand-written + 1,000 generated; English, typos, Banglish). QUALITY.md target >= 90%.
// Headline = held-out TEST split of the COMBINED router. Failures are printed for DEV only (no peeking).
// Ambiguous commands (two reasonable intents) are listed but not scored (QUALITY.md rule 6).
// Skipped (not failed) when Ollama is not running. LLM answers are cached by (prompt, model, text) in
// eval/.cache so tuning the rules does not re-run the model; the cache is gitignored.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const h = require('../../tests/helpers/harness');
const router = h.src('modules/ai/model-router');
const rules = h.src('modules/ai/intent-rules');
const commands = require('../data/intent-commands.json');
const { loadSplit } = require('../lib/split');
const { INTENT_SYSTEM_PROMPT } = require('../../src/prompts/templates/intent-classifier');

const CACHE_DIR = path.join(__dirname, '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'intent-llm.json');
const MODEL = 'qwen2.5:3b-instruct';

function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (_) { return {}; } }
function saveCache(c) { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(c)); }
const keyOf = (text) => crypto.createHash('sha1').update(`${INTENT_SYSTEM_PROMPT}|${MODEL}|jsonobject|${text}`).digest('hex');

async function askModel(text) {
  const t0 = Date.now();
  try {
    const r = await router.classifyIntent(text, { model: 'ollama', skipRules: true });
    return { got: (r && r.intent) || 'NONE', ms: Date.now() - t0 };
  } catch (e) { return { got: `ERROR: ${e.message}`.slice(0, 60), ms: Date.now() - t0 }; }
}

module.exports = async function run() {
  if (router.resetOllamaCheck) router.resetOllamaCheck();
  if (!(await router.isOllamaAvailable())) {
    return { skipped: true, name: 'Intent router (rules + local model)', metric: 'agreement with intended intent', target: 0.9, value: 0, n: 0, unit: '',
             note: 'SKIPPED: Ollama is not running (start it with `ollama serve`; model qwen2.5:3b-instruct).', failures: [] };
  }
  router.setActiveModel('ollama');
  const split = loadSplit('intent-router', commands.map(c => c.id));
  const cache = loadCache();
  let fresh = 0;
  const results = [];
  for (const c of commands) {
    const k = keyOf(c.text);
    const rule0 = rules.classifyByRules(c.text);
    // The model is only needed where a rule does not settle the intent, and for the model-alone baseline on the TEST split
    // (dev baselines are not reported), which keeps a cold run to ~15 minutes instead of ~1 hour.
    if (!cache[k] && rule0 && !rule0.needsModel && !split.test.includes(c.id)) {
      results.push({ id: c.id, text: c.text, tag: c.tag, ambiguous: !!c.ambiguous, expected: c.intent, llm: null, ms: 0,
                     rule: rule0.intent, hinted: false, combined: rule0.intent, combinedMs: 0 });
      continue;
    }
    if (!cache[k]) {
      if (!fresh) await askModel('hello'); // warm-up: the first call loads the model into memory
      cache[k] = await askModel(c.text);
      if (++fresh % 25 === 0) saveCache(cache);
    }
    const rule = rule0;
    results.push({ id: c.id, text: c.text, tag: c.tag, ambiguous: !!c.ambiguous, expected: c.intent,
                   llm: cache[k].got, ms: cache[k].ms, rule: rule ? rule.intent : null, hinted: !!(rule && rule.needsModel),
                   combined: rule ? rule.intent : cache[k].got,
                   // instant rule answers need no model call; a hinted rule still calls the model for entities
                   combinedMs: rule && !rule.needsModel ? 0 : cache[k].ms });
  }
  if (fresh) saveCache(cache);

  const part = (ids) => results.filter(r => ids.includes(r.id) && !r.ambiguous);
  const acc = (rs, f) => (rs.length ? rs.filter(r => f(r) === r.expected).length / rs.length : 0);
  const test = part(split.test), dev = part(split.dev);
  const ruled = (rs) => rs.filter(r => r.rule);
  const frac = (a, b) => (b ? `${a}/${b} = ${(100 * a / b).toFixed(1)}%` : 'n/a');
  const stat = (rs) => {
    const rr = ruled(rs), instant = rr.filter(r => !r.hinted);
    return `${rs.every(r => r.llm !== null) ? `model only ${(100 * acc(rs, r => r.llm)).toFixed(1)}%` : 'model-only baseline: test split only'}; rules decide ${frac(rr.length, rs.length)} (${frac(instant.length, rs.length)} instant, the rest with the model filling details) ` +
           `with precision ${frac(rr.filter(r => r.rule === r.expected).length, rr.length)}; combined ${frac(rs.filter(r => r.combined === r.expected).length, rs.length)}`;
  };
  const natural = results.filter(r => r.id.startsWith('cmd-') && !r.ambiguous && r.llm !== null);
  const byTag = (rs) => ['clean', 'typo', 'banglish'].map(t => {
    const x = rs.filter(r => r.tag === t); return `${t} ${x.filter(r => r.combined === r.expected).length}/${x.length}`;
  }).join(', ');
  const msSorted = results.map(r => r.combinedMs).sort((a, b) => a - b);
  const llmMs = results.filter(r => r.llm !== null).map(r => r.ms).sort((a, b) => a - b);

  const failures = [
    ...dev.filter(r => r.rule && r.rule !== r.expected).map(r => `[dev][RULE WRONG] "${r.text}" (${r.tag}): expected ${r.expected}, rule said ${r.rule}`),
    ...dev.filter(r => !r.rule && r.llm !== r.expected).map(r => `[dev][LLM] "${r.text}" (${r.tag}): expected ${r.expected}, got ${r.llm}`),
  ];
  return {
    name: 'Intent router (rules + local model)', metric: 'agreement with intended intent (ambiguous excluded)',
    target: 0.9, value: acc(test, r => r.combined), n: test.length, unit: 'commands (test)',
    note: `TEST: ${stat(test)}; by tag: ${byTag(test)}. DEV: ${stat(dev)}; by tag: ${byTag(dev)}. ` +
          `The 100 hand-written natural commands (all splits): combined ${frac(natural.filter(r => r.combined === r.expected).length, natural.length)}, model only ${frac(natural.filter(r => r.llm === r.expected).length, natural.length)}. ` +
          `${results.filter(r => r.ambiguous).length} ambiguous not scored. Median latency ${msSorted[Math.floor(msSorted.length / 2)]} ms combined vs ${llmMs[Math.floor(llmMs.length / 2)]} ms model-only.`,
    failures,
  };
};
