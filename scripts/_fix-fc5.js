const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Fix: add back the window.chatSync.appendAiMsg( before the template literal
c = c.replace(
  "      " + "Couldn" + "'" + "t read that file: , []);",
  "      window.chatSync.appendAiMsg(" + "Couldn" + "'" + "t read that file: );"
);

fs.writeFileSync(p, c, 'utf8');

// Verify
const idx = c.indexOf('read that file');
console.log(c.substring(idx - 40, idx + 60));
console.log('Size: ' + fs.statSync(p).size);