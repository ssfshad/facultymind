const fs = require('fs');
const c = fs.readFileSync('D:/facultymind/src/renderer/js/floating-chat.js', 'utf8');
// Find ALL catch blocks
let idx = 0;
while ((idx = c.indexOf('catch (err)', idx)) > -1) {
  console.log('catch at ' + idx + ': ' + c.substring(idx, idx + 100).replace(/\n/g, '|'));
  idx += 11;
}
// Also find the actual corrupted line
const canIdx = c.indexOf('Couldn');
if (canIdx > -1) {
  const lineStart = c.lastIndexOf('\n', canIdx);
  console.log('\\nCorrupted line at ' + lineStart + ':');
  console.log(JSON.stringify(c.substring(lineStart, canIdx + 60)));
}