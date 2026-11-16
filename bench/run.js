#!/usr/bin/env node
/**
 * Benchmark runner — `npm run bench`
 *
 *  1. bench/micro.js under Electron's Node (DB, ShadSync, CLO mapper,
 *     syllabus, PIN, extraction, embeddings, local LLM)
 *  2. App launch: starts the real app with a throwaway --user-data-dir,
 *     measures time-to-window-shown and total memory of the process tree
 *     10 s later. One fresh profile run, then warm runs on the same profile.
 *
 * Never touches the real userData / student database. Writes
 * bench/results/<timestamp>.json.
 */
'use strict';

const { spawn, spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const electron = require('electron');
const WARM_RUNS = Number(process.env.BENCH_WARM_RUNS || 3);
const SETTLE_MS = 10_000;

function micro() {
  const r = spawnSync(electron, [path.join(__dirname, 'micro.js')], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60_000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  const line = (r.stdout || '').split('\n').find(l => l.startsWith('@@RESULTS@@'));
  if (!line) throw new Error(`micro.js failed (exit ${r.status}):\n${r.stderr || r.stdout}`);
  return JSON.parse(line.slice('@@RESULTS@@'.length));
}

/** Sum working set of every process whose command line mentions the profile dir. */
function treeMemoryMb(marker) {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${marker}*' } | ` +
             `Measure-Object -Property WorkingSetSize -Sum | ForEach-Object { \"$($_.Count) $($_.Sum)\" }`;
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  const [count, sum] = out.split(/\s+/).map(Number);
  return { processes: count, working_set_mb: +((sum || 0) / 1048576).toFixed(0) };
}

function launch(profileDir) {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE; // any value (even '') makes Electron run as plain Node
    const child = spawn(electron, ['.', `--user-data-dir=${profileDir}`], { cwd: ROOT, env });
    let shownMs = null, out = '';
    const onData = (d) => {
      out += d.toString();
      if (shownMs === null && out.includes('[WINDOW] shown')) {
        shownMs = Number(process.hrtime.bigint() - t0) / 1e6;
        setTimeout(() => {
          let mem = null;
          try { mem = treeMemoryMb(path.basename(profileDir)); } catch (e) { mem = { error: e.message }; }
          // Kill only the app instance this script started
          try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {}
          resolve({ window_shown_ms: +shownMs.toFixed(0), ...mem });
        }, SETTLE_MS);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => { if (shownMs === null) reject(new Error(`app exited (${code}) before window shown:\n${out.slice(-1500)}`)); });
    setTimeout(() => { if (shownMs === null) { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (_) {} reject(new Error('timeout waiting for window')); } }, 120_000);
  });
}

(async () => {
  const results = { when: new Date().toISOString(), machine: {
    cpu: os.cpus()[0].model, cores: os.cpus().length, ram_gb: +(os.totalmem() / 2 ** 30).toFixed(1),
    os: `${os.type()} ${os.release()}`, electron: require(path.join(ROOT, 'node_modules/electron/package.json')).version,
  } };

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${results.when.replace(/[:.]/g, '-')}.json`);
  const save = () => fs.writeFileSync(file, JSON.stringify(results, null, 2));

  process.stderr.write('micro benchmarks…\n');
  results.micro = micro();
  save(); // keep micro numbers even if a launch run fails

  process.stderr.write('app launch: fresh profile…\n');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-bench-profile-'));
  // Pre-seed the public model caches so launch numbers are not network-bound
  for (const d of ['models', 'tesseract-cache']) {
    const from = path.join(process.env.APPDATA || '', 'facultymind', d);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(profile, d), { recursive: true });
  }
  results.launch = { fresh_profile: await launch(profile), warm: [] };
  for (let i = 0; i < WARM_RUNS; i++) {
    process.stderr.write(`app launch: warm ${i + 1}/${WARM_RUNS}…\n`);
    results.launch.warm.push(await launch(profile));
  }
  const ws = results.launch.warm.map(r => r.window_shown_ms).sort((a, b) => a - b);
  results.launch.warm_median_window_shown_ms = ws[Math.floor(ws.length / 2)];
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}

  save();
  console.log(JSON.stringify(results, null, 2));
  process.stderr.write(`\nSaved ${path.relative(ROOT, file)}\n`);
})().catch(e => { console.error(e); process.exit(1); });
