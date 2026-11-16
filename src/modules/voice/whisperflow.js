/**
 * whisperflow.js — Audio transcription via OpenAI Whisper API
 * Press-to-record model (ADR-005). No real-time streaming.
 *
 * Main process receives raw audio buffer from renderer via IPC,
 * sends to Whisper API, returns transcript string.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

/**
 * Transcribe audio buffer using OpenAI Whisper API.
 *
 * @param {Buffer} audioBuffer  - Raw audio data (webm/opus from MediaRecorder)
 * @param {string} apiKey       - OpenAI API key
 * @returns {string}            - Transcribed text
 */
async function transcribe(audioBuffer, apiKey) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey });

  // Write buffer to a temp file — Whisper API requires a file, not a stream
  const tmpPath = path.join(os.tmpdir(), `whisperflow-${Date.now()}.webm`);
  fs.writeFileSync(tmpPath, Buffer.from(audioBuffer));

  let transcript = '';
  try {
    const resp = await client.audio.transcriptions.create({
      file:     fs.createReadStream(tmpPath),
      model:    'whisper-1',
      language: 'en',
      response_format: 'text',
    });
    transcript = typeof resp === 'string' ? resp.trim() : resp.text?.trim() || '';
  } finally {
    // Always delete the temp file
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }

  return transcript;
}

module.exports = { transcribe };
