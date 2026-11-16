const fs = require('fs');
const c = fs.readFileSync('D:/facultymind/src/renderer/js/floating-chat.js', 'utf8');
const idx = c.indexOf('read that file');
if (idx > -1) {
  console.log('handleFileSelect error:');
  console.log(c.substring(idx - 60, idx + 80));
}
// Check all appendAiMsg calls
let count = 0, i = 0;
while ((i = c.indexOf('appendAiMsg(', i)) > -1) {
  const line = c.substring(Math.max(0, i - 30), i + 60).replace(/\n/g, '|').trim();
  console.log(count + ' at ' + i + ': ' + line.substring(0, 80));
  i += 12; count++;
}
console.log('Total: ' + count);