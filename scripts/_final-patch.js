const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/chat.js';
let c = fs.readFileSync(p, 'utf8');

// Replace appendAiMessage calls in sendMessage (between async function and Voice section)
const sendIdx = c.indexOf('async function sendMessage()');
const voiceIdx = c.indexOf('setupVoice');
if (sendIdx > -1 && voiceIdx > -1) {
  let sendBlock = c.substring(sendIdx, voiceIdx);
  // Replace appendAiMessage calls
  sendBlock = sendBlock.replace(/appendAiMessage\(/g, 'window.chatSync.appendAiMsg(');
  c = c.substring(0, sendIdx) + sendBlock + c.substring(voiceIdx);
}

// Replace appendAiMessage in voice section
const voice2Idx = c.indexOf('setupVoice');
const fnIdx = c.indexOf('function appendAiMessage(text)');
if (voice2Idx > -1 && fnIdx > -1) {
  let voiceBlock = c.substring(voice2Idx, fnIdx);
  voiceBlock = voiceBlock.replace(/appendAiMessage\(/g, 'window.chatSync.appendAiMsg(');
  voiceBlock = voiceBlock.replace(/appendThinking\(/g, 'window.chatSync.appendThinking(');
  voiceBlock = voiceBlock.replace(/removeThinking\(thinkingId\)/g, 'window.chatSync.removeThinking(thinkingId)');
  c = c.substring(0, voice2Idx) + voiceBlock + c.substring(fnIdx);
}

// Replace local appendAiMessage function
const fnStart = c.indexOf('  function appendAiMessage(text) {');
if (fnStart > -1) {
  let depth = 0, fnEnd = fnStart;
  for (let i = c.indexOf('{', fnStart); i < c.length; i++) {
    if (c[i] === '{') depth++;
    if (c[i] === '}') depth--;
    if (depth === 0) { fnEnd = i + 1; break; }
  }
  const oldFn = c.substring(fnStart, fnEnd);
  c = c.replace(oldFn, '  function appendAiMessage(text) {\n    window.chatSync.appendAiMsg(text);\n  }');
}

fs.writeFileSync(p, c, 'utf8');
console.log('chat.js final: ' + fs.statSync(p).size + ' bytes');

// Verify
let count = 0;
let idx = 0;
while ((idx = c.indexOf('appendAiMessage(', idx)) > -1) {
  const ctx = c.substring(Math.max(0, idx - 20), idx + 60);
  console.log('  remaining at ' + idx + ': ...' + ctx.trim().substring(0, 60) + '...');
  idx += 15;
  count++;
}
console.log('appendAiMessage remaining: ' + count);