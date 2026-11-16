/**
 * micro.js — in-process benchmarks. Runs under Electron's Node
 * (ELECTRON_RUN_AS_NODE=1, launched by bench/run.js).
 *
 * Uses the test harness, so the DB lives in a temp dir with the seeded demo
 * data only. Model caches (embedding, OCR language data) are copied from the
 * real userData into the temp dir so nothing is downloaded; no student data
 * is read. The only AI calls go to the local Ollama server with synthetic text.
 *
 * Prints one JSON object to stdout.
 */
'use strict';

const h = require('../tests/helpers/harness');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { performance } = require('perf_hooks');

const results = {};
const quiet = () => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; return () => { console.log = l; console.warn = w; }; };

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, median_ms: +q(0.5).toFixed(2), p95_ms: +q(0.95).toFixed(2), min_ms: +s[0].toFixed(2), max_ms: +s[s.length - 1].toFixed(2) };
}
async function bench(name, n, fn) {
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn(i);
    samples.push(performance.now() - t0);
  }
  results[name] = stats(samples);
}
function once(name, ms, extra = {}) { results[name] = { ms: +ms.toFixed(1), ...extra }; }

function copyCache(dirName) {
  const from = path.join(process.env.APPDATA || '', 'facultymind', dirName);
  const to = path.join(h.tmpRoot, 'userData', dirName);
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true });
  return fs.existsSync(to);
}

function ollama(pathname, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 11434, path: pathname, method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 600_000 },
      res => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve(raw)); });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

(async () => {
  const Database = require(path.join(h.ROOT, 'node_modules', 'better-sqlite3'));

  // ── Database ───────────────────────────────────────────────────────────────
  await bench('db.fresh_open_migrate_seed', 3, (i) => {
    const db = new Database(path.join(h.tmpRoot, `fresh-${i}.db`));
    h.migrateAndSeed(db); db.close();
  });
  const warmFile = path.join(h.tmpRoot, 'fresh-0.db');
  await bench('db.warm_reopen_migrate', 10, () => {
    const db = new Database(warmFile);
    h.migrateAndSeed(db); db.close();
  });

  // ── ShadSync ──────────────────────────────────────────────────────────────
  const { db } = h.freshDb();
  const engine = h.src('modules/shadsync/shadsync-engine');
  const cid = db.prepare("SELECT id FROM courses WHERE lower(code)='ice301'").get().id;
  await bench('shadsync.attainment_ice301_35_students', 200, () => engine.calculateCourseAttainment(db, cid));

  // ── Bloom's CLO mapper (deterministic) ────────────────────────────────────
  const fast = h.src('modules/blooms/clo-mapper-fast');
  const verbs = ['Define', 'Explain', 'Implement', 'Compare', 'Evaluate', 'Design'];
  const paper = (n) => Array.from({ length: n }, (_, i) => `Q${i + 1}. ${verbs[i % 6]} the concept of topic ${i} in object oriented programming. [5 Marks]`).join('\n');
  const p6 = paper(6), p50 = paper(50), p200 = paper(200);
  await bench('clo_mapper.6_questions_no_kb', 50, () => fast.mapDeterministic(p6, 'ICE301', null));
  await bench('clo_mapper.6_questions_with_kb_975_rows', 20, () => fast.mapDeterministic(p6, 'ICE301', db));
  await bench('clo_mapper.50_questions_with_kb', 5, () => fast.mapDeterministic(p50, 'ICE301', db));
  await bench('clo_mapper.200_questions_no_kb', 5, () => fast.mapDeterministic(p200, 'ICE301', null));

  // ── Syllabus mapper (manual path, no AI) ───────────────────────────────────
  const syl = h.src('modules/blooms/syllabus-mapper');
  const cos = 'CO1: Explain the fundamentals of circuit analysis.\nCO2: Apply mesh and nodal analysis to circuits.\nCO3: Design analog filters for given specifications.';
  const weeks = Array.from({ length: 15 }, (_, i) => `Week ${i + 1}: Analysis and design of circuit topic number ${i}`).join('\n');
  await bench('syllabus.manual_3_cos_15_weeks', 50, () => syl.analyzeManualInput(cos, weeks));

  // ── PIN verify (PBKDF2 310k iterations, synchronous on main thread) ────────
  const auth = h.src('modules/security/auth');
  auth.setupPin(db, '2468');
  await bench('auth.verify_pin_pbkdf2', 10, () => auth.verifyPin(db, '2468'));

  // ── Text extraction ───────────────────────────────────────────────────────
  copyCache('tesseract-cache');
  const blooms = h.src('modules/blooms/blooms-engine');
  const docs = [
    ['sample_pdf_1page', 'assets/samples/blooms/level1-simple.pdf', 'application/pdf'],
    ['sample_pdf_level5', 'assets/samples/blooms/level5-complex.pdf', 'application/pdf'],
    ['proposal_docx_33k_chars', 'docs/FacultyMind_Proposal_v3.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ];
  const md = h.src('modules/blooms/markitdown-extractor');
  results['extract.markitdown_available'] = md.isAvailable();
  for (const [name, rel, mime] of docs) {
    const buf = fs.readFileSync(path.join(h.ROOT, rel));
    const restore = quiet();
    try { await bench(`extract.dev_path(markitdown).${name}`, 2, () => blooms.extractText(buf, mime, () => {})); }
    finally { restore(); }
  }
  // Installed-app path: converter.exe is not bundled, so simulate it being absent.
  {
    const mdPath = require.resolve(path.join(h.ROOT, 'src/modules/blooms/markitdown-extractor'));
    const bePath = require.resolve(path.join(h.ROOT, 'src/modules/blooms/blooms-engine'));
    require.cache[mdPath] = { id: mdPath, filename: mdPath, loaded: true, exports: { isAvailable: () => false, extractWithMarkItDown: async () => { throw new Error('absent'); } } };
    delete require.cache[bePath];
    const bloomsNoMd = require(bePath);
    for (const [name, rel, mime] of docs) {
      const buf = fs.readFileSync(path.join(h.ROOT, rel));
      const logs = [];
      const l = console.log, w = console.warn;
      console.log = console.warn = (...a) => logs.push(a.join(' '));
      try {
        await bench(`extract.installed_path(no markitdown).${name}`, 1, () => bloomsNoMd.extractText(buf, mime, () => {}));
        results[`extract.installed_path(no markitdown).${name}`].used_ocr = logs.some(x => /falling back to OCR/i.test(x));
      } catch (e) {
        results[`extract.installed_path(no markitdown).${name}`] = { error: e.message };
      } finally { console.log = l; console.warn = w; }
    }
    require('../src/modules/blooms/ocr-engine').terminateWorker?.().catch?.(() => {});
  }

  // ── Embeddings (local all-MiniLM-L6-v2) ───────────────────────────────────
  if (copyCache('models')) {
    const emb = h.src('modules/blooms/embedding-engine');
    const restore = quiet();
    try {
      const t0 = performance.now();
      await emb.embed('warm up the model');
      once('embedding.first_call_incl_model_load', performance.now() - t0);
      await bench('embedding.per_question', 20, (i) => emb.embed(`Explain how inheritance supports code reuse in example ${i}.`));
    } finally { restore(); }
  } else {
    results['embedding'] = { skipped: 'no cached model in %APPDATA%/facultymind/models' };
  }

  // ── Local LLM via Ollama (synthetic prompt, no student data) ──────────────
  try {
    const router = h.src('modules/ai/model-router');
    router.setOllamaModel('qwen2.5:3b-instruct');
    if (await router.isOllamaAvailable()) {
      await ollama('/api/generate', { model: 'qwen2.5:3b-instruct', keep_alive: 0 }); // unload → measure a cold start
      const restore = quiet();
      try {
        let t0 = performance.now();
        await router.classifyIntent('What classes do I have tomorrow?', { model: 'ollama' });
        once('ollama.intent_classify_cold(model load)', performance.now() - t0);
        await bench('ollama.intent_classify_warm', 5, () => router.classifyIntent('Remind me to grade the ICE301 quizzes on Sunday', { model: 'ollama' }));
        t0 = performance.now();
        const r = await router.send('In two sentences, explain what a course learning outcome is.', {}, { model: 'ollama', maxTokens: 120 });
        once('ollama.chat_reply_120_tokens', performance.now() - t0, { chars: (r.text || '').length });
      } finally { restore(); }
    } else {
      results['ollama'] = { skipped: 'Ollama not reachable on localhost:11434' };
    }
  } catch (e) { results['ollama'] = { error: e.message }; }

  results._process = { rss_mb: +(process.memoryUsage().rss / 1048576).toFixed(1), node: process.version };
  process.stdout.write('\n@@RESULTS@@' + JSON.stringify(results) + '\n');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
