'use strict';
// Compare local models on the tasks this assistant actually does. Run under Electron's Node:
//   MODEL=qwen3.5:4b ELECTRON_RUN_AS_NODE=1 electron eval/tools/model-compare.js [routing] [entities] [explain]
// Tasks (all use the app's own router, thinking off, temperature 0 for JSON):
//   routing  : intent classification by the MODEL ALONE on the held-out TEST commands (rules skipped)
//   entities : details the handlers need (reminder text/time, vault url/password/content, course code, model, portal),
//              with the intent given as a hint, exactly as in production
//   explain  : "why is this CLO weak and what to change" on 8 scenarios, auto fact-checked (explain-check.js)
// Writes eval/model-compare/<model>.json. Needs Ollama running with the model pulled.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const h = require(path.join(ROOT, 'tests/helpers/harness'));
const router = h.src('modules/ai/model-router');
const { checkExplanation, failingClos } = h.src('modules/shadsync/explain-check');
const { cloGapExplanationPrompt, cloGapExplanationSchema } = require(path.join(ROOT, 'src/prompts/templates/clo-gap-explanation'));
const { INTENT_SYSTEM_PROMPT } = require(path.join(ROOT, 'src/prompts/templates/intent-classifier'));

const MODEL = process.env.MODEL;
if (!MODEL) throw new Error('set MODEL, e.g. MODEL=qwen3.5:4b');
const tasks = process.argv.slice(2).filter(a => !a.startsWith('-'));
const want = (t) => !tasks.length || tasks.includes(t);

const commands = require(path.join(ROOT, 'eval/data/intent-commands.json'));
const split = require(path.join(ROOT, 'eval/data/split.json'))['intent-router'];
const entities = require(path.join(ROOT, 'eval/data/entity-commands.json'));
const scenarios = require(path.join(ROOT, 'eval/data/explain-scenarios.json'));

const CACHE_FILE = path.join(ROOT, 'eval', '.cache', 'intent-llm.json');   // shared with the intent-router eval
const keyOf = (text) => crypto.createHash('sha1').update(`${INTENT_SYSTEM_PROMPT}|${MODEL}|jsonobject|${text}`).digest('hex');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const ollama = { ollamaModel: MODEL, model: 'ollama' };

function ollamaPs() {
  return new Promise((resolve) => {
    http.get('http://127.0.0.1:11434/api/ps', (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } }); }).on('error', () => resolve(null));
  });
}

async function routing() {
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (_) {}
  const items = commands.filter(c => split.test.includes(c.id) && !c.ambiguous);
  let fresh = 0; const rows = [];
  for (const c of items) {
    const k = keyOf(c.text);
    if (!cache[k]) {
      const t0 = Date.now();
      let got; try { got = ((await router.classifyIntent(c.text, { ...ollama, skipRules: true })) || {}).intent || 'NONE'; } catch (e) { got = 'ERROR'; }
      cache[k] = { got, ms: Date.now() - t0 };
      if (++fresh % 25 === 0) { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); process.stderr.write(`  routing ${fresh}/${items.length}\n`); }
    }
    rows.push({ ...c, got: cache[k].got, ms: cache[k].ms });
  }
  if (fresh) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  const ok = (r) => r.got === r.intent;
  const tag = (t) => { const x = rows.filter(r => r.tag === t); return `${x.filter(ok).length}/${x.length}`; };
  return { n: rows.length, correct: rows.filter(ok).length, accuracy: rows.filter(ok).length / rows.length,
           byTag: { clean: tag('clean'), typo: tag('typo'), banglish: tag('banglish') }, medianMs: median(rows.map(r => r.ms)),
           freshCalls: fresh };
}

function checkEntity(item, parsed) {
  const e = (parsed && parsed.entities) || {};
  const c = item.checks;
  const fails = [];
  const eq = (a, b) => String(a ?? '').trim().toLowerCase() === String(b).trim().toLowerCase();
  if (c.url && !eq(e.url, c.url)) fails.push(`url=${JSON.stringify(e.url)}`);
  if (c.password && !eq(e.password, c.password)) fails.push(`password=${JSON.stringify(e.password)}`);
  if (c.course_code && !eq(e.course_code, c.course_code)) fails.push(`course_code=${JSON.stringify(e.course_code)}`);
  if (c.model && !eq(e.model, c.model)) fails.push(`model=${JSON.stringify(e.model)}`);
  if (c.portal && !eq(e.portal, c.portal)) fails.push(`portal=${JSON.stringify(e.portal)}`);
  if (c.has) {
    const field = String(e[c.has.field] ?? '').toLowerCase();
    const miss = c.has.words.filter(w => !field.includes(w.toLowerCase()));
    if (miss.length) fails.push(`${c.has.field}=${JSON.stringify(e[c.has.field])} lacks ${miss.join(',')}`);
  }
  if (c.datetime && !(e.datetime && !Number.isNaN(Date.parse(e.datetime)))) fails.push(`datetime=${JSON.stringify(e.datetime)}`);
  return fails;
}

async function entityTask() {
  const rows = [];
  for (const it of entities) {
    const t0 = Date.now();
    let parsed = null; try { parsed = await router.classifyIntent(it.text, { ...ollama, intentHint: it.intent, now: '2026-11-11T09:00:00' }); } catch (_) {}
    const fails = checkEntity(it, parsed);
    rows.push({ id: it.id, text: it.text, intent: it.intent, ok: fails.length === 0, fails, ms: Date.now() - t0 });
  }
  const by = {};
  for (const r of rows) { (by[r.intent] = by[r.intent] || { n: 0, ok: 0 }).n++; if (r.ok) by[r.intent].ok++; }
  return { n: rows.length, correct: rows.filter(r => r.ok).length, accuracy: rows.filter(r => r.ok).length / rows.length, byIntent: by,
           medianMs: median(rows.map(r => r.ms)), failures: rows.filter(r => !r.ok).map(r => `"${r.text}": ${r.fails.join('; ')}`) };
}

// Qwen3.x: pure greedy decoding can loop; its model card recommends light sampling for non-thinking use
const writing = /^qwen3/.test(MODEL) ? { ollamaOptions: { temperature: 0.7, top_p: 0.8, top_k: 20, presence_penalty: 1.5 } } : {};

async function explainTask() {
  const rows = [];
  for (const sc of scenarios) {
    const prompt = cloGapExplanationPrompt(sc);
    const t0 = Date.now();
    let text = ''; try { text = (await router.send(prompt.user, {}, { ...ollama, ...writing, systemPrompt: prompt.system, isJson: true, jsonSchema: cloGapExplanationSchema(sc), maxTokens: 900 })).text; } catch (e) { text = ''; }
    const ms = Date.now() - t0;
    const r = checkExplanation(sc, text);
    rows.push({ id: sc.id, ms, weak: failingClos(sc).map(c => c.code), ...r, sample: text.slice(0, 220) });
  }
  return {
    n: rows.length, passedAll: rows.filter(r => r.ok).length, jsonValid: rows.filter(r => r.jsonValid).length,
    allWeakCovered: rows.filter(r => r.jsonValid && r.missing.length === 0).length,
    explainedFineClos: rows.filter(r => r.extra && r.extra.length > 0).length,
    scenariosWithMadeUpNumbers: rows.filter(r => r.unsupported.length > 0).length,
    madeUpNumbers: rows.flatMap(r => r.unsupported).length,
    medianMs: median(rows.map(r => r.ms)),
    detail: rows.map(r => ({ id: r.id, ok: r.ok, json: r.jsonValid, weak: r.weak, missing: r.missing, extra: r.extra, unsupported: r.unsupported, unknownClo: r.mentionedUnknownClo, actionsOk: r.actionsOk, ms: r.ms })),
  };
}

(async () => {
  if (router.resetOllamaCheck) router.resetOllamaCheck();
  if (!(await router.isOllamaAvailable())) throw new Error('Ollama is not running');
  console.log(`MODEL ${MODEL}`);
  await router.classifyIntent('hello', { ...ollama, skipRules: true }).catch(() => {}); // warm-up: loads the model
  const file = path.join(ROOT, 'eval', 'model-compare', `${MODEL.replace(/[:/]/g, '_')}.json`);
  let out = { model: MODEL };
  try { out = { ...JSON.parse(fs.readFileSync(file, 'utf8')), model: MODEL }; } catch (_) {}   // re-running one task keeps the others
  out.at = new Date().toISOString();
  if (want('routing')) { out.routing = await routing(); console.log('routing', JSON.stringify(out.routing)); }
  if (want('entities')) { out.entities = await entityTask(); console.log('entities', JSON.stringify({ ...out.entities, failures: out.entities.failures.length })); }
  if (want('explain')) { out.explain = await explainTask(); console.log('explain', JSON.stringify({ ...out.explain, detail: undefined })); }
  const ps = await ollamaPs();
  const m = ps && ps.models && ps.models.find(x => x.name === MODEL || x.model === MODEL);
  if (m) out.memoryMB = Math.round(m.size / 1048576);
  fs.mkdirSync(path.join(ROOT, 'eval', 'model-compare'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'eval', 'model-compare', `${MODEL.replace(/[:/]/g, '_')}.json`), JSON.stringify(out, null, 1) + '\n');
  console.log('saved eval/model-compare/' + MODEL.replace(/[:/]/g, '_') + '.json');
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
