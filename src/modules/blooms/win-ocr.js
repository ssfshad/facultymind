'use strict';

/**
 * win-ocr.js — first-choice OCR for photos and scanned pages on Windows.
 *
 * Uses the OCR engine built into Windows 10/11 (Windows.Media.Ocr): offline, no download, ~0.3 s per
 * page. In the bake-off on 50 real phone photos it beat Tesseract on question splitting once rows were
 * rebuilt from word positions and rotated photos were straightened (eval/OCR-BAKEOFF.md).
 *
 *  - rows: the script rebuilds reading rows from word boxes, so "1)" stays with its question
 *  - rotation: a page whose text does not look like English is retried at 90/180/270 degrees
 *    and the most English-looking result wins
 *
 * Everything runs locally; page images go to a temp folder that is deleted afterwards.
 * Throws when Windows OCR is unavailable so the caller can fall back to Tesseract.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, 'win-ocr.ps1');
const STOP = new Set('the of and is to in for with are a an on by be as that this from or at which each following'.split(' '));
const GOOD_ENOUGH = 6; // stop words on the upright page: no rotation retry needed

let _available = null;

function stopScore(rows) {
  let n = 0;
  for (const r of rows) for (const w of String(r.text).toLowerCase().split(/[^a-z]+/)) if (STOP.has(w)) n++;
  return n;
}

function loadSharp() { try { return require('sharp'); } catch (_) { return null; } }

/** Run the PowerShell OCR over a list of image files. Resolves { engine, items }. */
function runScript(paths, tmpDir) {
  return new Promise((resolve, reject) => {
    const list = path.join(tmpDir, `list-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const out = list.replace('list-', 'out-');
    fs.writeFileSync(list, JSON.stringify(paths), 'utf8');
    // -EncodedCommand is not subject to the script execution policy and needs no script file on disk
    const encoded = Buffer.from(fs.readFileSync(SCRIPT, 'utf8'), 'utf16le').toString('base64');
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      env: { ...process.env, FM_OCR_LIST: list, FM_OCR_OUT: out }, windowsHide: true,
    });
    let stderr = '';
    ps.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => { try { ps.kill(); } catch (_) {} reject(new Error('Windows OCR timed out')); }, 120000 + paths.length * 8000);
    ps.on('error', e => { clearTimeout(timer); reject(e); });
    ps.on('close', code => {
      clearTimeout(timer);
      try {
        const json = JSON.parse(fs.readFileSync(out, 'utf8').replace(/^﻿/, ''));
        json.items = [].concat(json.items || []).map(it => ({ ...it, rows: [].concat(it.rows || []) }));
        resolve(json);
      } catch (e) { reject(new Error(`Windows OCR produced no result (exit ${code}): ${stderr.slice(0, 200) || e.message}`)); }
    });
  });
}

/** True when this machine can run Windows OCR with an English recogniser. */
async function isAvailable() {
  if (_available !== null) return _available;
  if (process.platform !== 'win32') return (_available = false);
  let dir;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-ocr-'));
    const r = await runScript([], dir);
    _available = r.engine === 'windows';
  } catch (_) { _available = false; }
  finally { if (dir) fs.rmSync(dir, { recursive: true, force: true }); }
  return _available;
}

/**
 * OCR a list of page images (Buffers: JPG, PNG, WEBP, BMP...).
 * @returns {Promise<string[]>} one text per page, rows separated by newlines
 */
async function recognizeImages(buffers) {
  if (!(await isAvailable())) throw new Error('Windows OCR is not available on this computer');
  const sharp = loadSharp();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-ocr-'));
  try {
    // upright copies (EXIF orientation applied once)
    const upright = [];
    for (let i = 0; i < buffers.length; i++) {
      const f = path.join(dir, `p${i}_0.jpg`);
      if (sharp) await sharp(buffers[i]).rotate().jpeg({ quality: 95 }).toFile(f);
      else fs.writeFileSync(f, buffers[i]);
      upright.push(f);
    }
    const first = await runScript(upright, dir);
    const best = first.items.map(it => ({ rows: it.rows, score: stopScore(it.rows), error: it.error }));

    // pages that do not read like English: try the other three rotations
    const retry = [];
    if (sharp) {
      for (let i = 0; i < best.length; i++) {
        if (best[i].score >= GOOD_ENOUGH) continue;
        for (const deg of [90, 180, 270]) {
          const f = path.join(dir, `p${i}_${deg}.jpg`);
          await sharp(upright[i]).rotate(deg).jpeg({ quality: 95 }).toFile(f);
          retry.push({ i, f });
        }
      }
    }
    if (retry.length) {
      const second = await runScript(retry.map(r => r.f), dir);
      second.items.forEach((it, k) => {
        const s = stopScore(it.rows);
        if (!it.error && s > best[retry[k].i].score) best[retry[k].i] = { rows: it.rows, score: s, error: null };
      });
    }
    return best.map(b => b.rows.map(r => r.text).join('\n').trim());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { isAvailable, recognizeImages, _stopScore: stopScore };
