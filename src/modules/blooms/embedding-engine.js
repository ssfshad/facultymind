'use strict';

/**
 * embedding-engine.js — Local sentence embedding wrapper
 *
 * Uses @xenova/transformers (ONNX runtime, no Python, no GPU) to run
 * all-MiniLM-L6-v2 locally. Produces 384-dimensional Float32 vectors.
 *
 * Design decisions:
 *   - Lazy-loaded: the 80MB model is only downloaded + loaded on first call.
 *   - Singleton pipeline: loaded once, reused for all subsequent calls.
 *   - Graceful degradation: if the model fails to load (no internet on first
 *     run, disk full, etc.) all callers receive null and fall back to Fuse.js.
 *   - Mean pooling + L2 normalisation matches the training objective of
 *     all-MiniLM-L6-v2 and produces vectors suitable for cosine similarity.
 *
 * Usage:
 *   const { embed, isReady } = require('./embedding-engine');
 *   const vec = await embed('design a scalable authentication flow');
 *   // vec: Float32Array(384) or null on failure
 */

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let _pipeline = null;       // cached pipeline instance
let _loading  = false;      // guard against concurrent init calls
let _failed   = false;      // permanent failure flag — don't retry after crash

/**
 * Initialise the embedding pipeline (idempotent, safe to call multiple times).
 * Returns the pipeline or null on failure.
 */
async function _initPipeline() {
  if (_pipeline) return _pipeline;
  if (_failed)   return null;
  if (_loading) {
    // Another call is already loading — wait for it
    await new Promise(resolve => {
      const poll = setInterval(() => {
        if (!_loading) { clearInterval(poll); resolve(); }
      }, 100);
    });
    return _pipeline;
  }

  _loading = true;
  try {
    // Dynamic import — @xenova/transformers is ESM-only in newer versions.
    // We use a dynamic import() so this CommonJS module can consume it.
    const { pipeline, env } = await import('@xenova/transformers');

    // Store models in the app's userData folder so they survive updates
    // and don't bloat the install directory.
    try {
      const { app } = require('electron');
      env.cacheDir = require('path').join(app.getPath('userData'), 'models');
    } catch (_) {
      // Not in Electron context (e.g. unit tests) — use default cache
    }

    // 'feature-extraction' produces raw token embeddings; we mean-pool below.
    _pipeline = await pipeline('feature-extraction', MODEL_ID, {
      quantized: true,   // use int8 quantised model (~23MB vs 80MB fp32)
    });

    console.log('[embedding-engine] all-MiniLM-L6-v2 loaded');
  } catch (e) {
    console.warn('[embedding-engine] Failed to load embedding model:', e.message);
    _failed = true;
    _pipeline = null;
  } finally {
    _loading = false;
  }
  return _pipeline;
}

/**
 * Compute a 384-dim embedding vector for the given text.
 *
 * @param {string} text
 * @returns {Promise<Float32Array|null>}  null if model unavailable
 */
async function embed(text) {
  if (!text || text.trim().length === 0) return null;

  const pipe = await _initPipeline();
  if (!pipe) return null;

  try {
    // Truncate to 256 tokens — MiniLM max is 512 but 256 covers all exam questions
    const output = await pipe(text.slice(0, 1024), {
      pooling:   'mean',
      normalize: true,   // L2-normalise → cosine similarity = dot product
    });

    // output.data is a Float32Array of length 384
    return new Float32Array(output.data);
  } catch (e) {
    console.warn('[embedding-engine] embed() failed:', e.message);
    return null;
  }
}

/**
 * Serialise a Float32Array to a Node.js Buffer for SQLite BLOB storage.
 * @param {Float32Array} vec
 * @returns {Buffer}
 */
function vecToBuffer(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Deserialise a SQLite BLOB back to a Float32Array.
 * @param {Buffer} blob
 * @returns {Float32Array}
 */
function bufferToVec(blob) {
  // better-sqlite3 returns BLOB columns as Buffer
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

/**
 * Cosine similarity between two Float32Arrays.
 * Both vectors must be L2-normalised (which embed() guarantees).
 * For normalised vectors, cosine similarity = dot product.
 *
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number}  0.0 – 1.0
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Clamp to [0, 1] — floating point can produce tiny negatives
  return Math.max(0, Math.min(1, dot));
}

/**
 * Returns true if the embedding model has been loaded successfully.
 */
function isReady() {
  return _pipeline !== null;
}

/**
 * Pre-warm the model in the background (fire-and-forget).
 * Call this on app startup so the first real embed() call is instant.
 */
function preWarm() {
  _initPipeline().catch(() => {});
}

module.exports = { embed, vecToBuffer, bufferToVec, cosineSimilarity, isReady, preWarm };
