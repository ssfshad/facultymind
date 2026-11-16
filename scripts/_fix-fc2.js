const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Replace all remaining appendAiMsg( inside sendMessage
// sendMessage starts at 6667, ends before the rendering section
const sendStart = c.indexOf('async function sendMessage()');
const sendEnd = c.indexOf('function appendUserMsg', sendStart);
console.log('sendMessage block: ' + sendStart + ' to ' + sendEnd);

let sendBlock = c.substring(sendStart, sendEnd);
sendBlock = sendBlock.replace(/appendAiMsg\(/g, 'window.chatSync.appendAiMsg(');
sendBlock = sendBlock.replace(/removeMsg\(thinkId\)/g, 'window.chatSync.removeThinking(thinkId)');
c = c.substring(0, sendStart) + sendBlock + c.substring(sendEnd);

// Also fix file handling error
const fileErrIdx = c.indexOf("Couldn" + "'" + "t read that file");
if (fileErrIdx > -1) {
  // Replace the appendAiMsg in handleFileSelect
  const before = c.substring(0, fileErrIdx - 30);
  const after = c.substring(fileErrIdx + 50);
  c = before + 'window.chatSync.appendAiMsg(' + c.substring(fileErrIdx - 30, fileErrIdx + 50).replace('appendAiMsg(', '').replace("Couldn" + "'" + "t read that file: )", "Couldn't read that file: )") + after;
}

fs.writeFileSync(p, c, 'utf8');
console.log('floating-chat.js: ' + fs.statSync(p).size + ' bytes');

let count = 0, idx = 0;
while ((idx = c.indexOf('appendAiMsg(', idx)) > -1) {
  const line = c.substring(Math.max(0, idx - 40), idx + 50).replace(/\n/g, ' ').trim();
  console.log('  ' + idx + ': ...' + line.substring(0, 80) + '...');
  idx += 12; count++;
}
console.log('Remaining: ' + count);