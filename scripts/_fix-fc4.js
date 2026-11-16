const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Fix the corrupted handleFileSelect error
c = c.replace(
  "Couldn" + "'" + "t read that file: , []);",
  "window.chatSync.appendAiMsg(Couldn" + "'" + "t read that file: );"
);

fs.writeFileSync(p, c, 'utf8');
console.log('Fixed: ' + fs.statSync(p).size + ' bytes');

// Verify
const idx = c.indexOf('read that file');
if (idx > -1) {
  console.log('handleFileSelect:');
  console.log(c.substring(idx - 60, idx + 60));
}