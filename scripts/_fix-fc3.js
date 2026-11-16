const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Fix the corrupted catch block
c = c.replace('} catwindow.chatSync.appendAiMsg(ch (err) {', '} catch (err) {');

// Now check handleFileSelect error  
const fileErrSearch = 'window.chatSync.appendAiMsg';
let idx = 0;
while ((idx = c.indexOf(fileErrSearch, idx)) > -1) {
  const ctx = c.substring(Math.max(0, idx - 40), idx + 80).replace(/\n/g, '|');
  console.log(idx + ': ' + ctx);
  idx += 30;
}

fs.writeFileSync(p, c, 'utf8');
console.log('Fixed: ' + fs.statSync(p).size + ' bytes');