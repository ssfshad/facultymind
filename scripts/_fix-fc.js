const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

const sendStart = c.indexOf('async function sendMessage()');
const renderStart = c.indexOf('// Rendering', sendStart);

if (sendStart > -1 && renderStart > -1) {
  let sendBlock = c.substring(sendStart, renderStart);
  sendBlock = sendBlock.replace(/appendAiMsg\(/g, 'window.chatSync.appendAiMsg(');
  sendBlock = sendBlock.replace(/removeMsg\(thinkId\)/g, 'window.chatSync.removeThinking(thinkId)');
  c = c.substring(0, sendStart) + sendBlock + c.substring(renderStart);
}

fs.writeFileSync(p, c, 'utf8');
console.log('floating-chat.js: ' + fs.statSync(p).size + ' bytes');

let count = 0, idx = 0;
while ((idx = c.indexOf('appendAiMsg(', idx)) > -1) {
  const line = c.substring(Math.max(0, idx - 30), idx + 50).replace(/\n/g, ' ').trim();
  console.log('  ' + idx + ': ' + line.substring(0, 70));
  idx += 12; count++;
}
console.log('Total appendAiMsg remaining: ' + count);