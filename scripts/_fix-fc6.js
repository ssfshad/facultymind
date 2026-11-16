const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Find the exact location and fix it
const marker = "Couldn";
const idx = c.indexOf(marker);
if (idx > -1) {
  // Go back to find the start of the line
  let lineStart = c.lastIndexOf('\n', idx);
  let line = c.substring(lineStart, idx + 50);
  console.log('Found line:', JSON.stringify(line));
  
  // The line should be: \n      Couldn't read that file: , []);
  // We need to insert window.chatSync.appendAiMsg( before the backtick
  const backtickIdx = c.indexOf('', idx - 10);
  if (backtickIdx > -1 && backtickIdx < idx) {
    c = c.substring(0, backtickIdx) + 'window.chatSync.appendAiMsg(' + c.substring(backtickIdx);
    // Also need to remove the trailing , []) and replace with );
    // Find the , [])  after err.message}
    const errCloseIdx = c.indexOf("err.message}", backtickIdx);
    if (errCloseIdx > -1) {
      const replaceEnd = c.indexOf(')', errCloseIdx + 15);
      c = c.substring(0, errCloseIdx + 14) + ');' + c.substring(replaceEnd + 1);
    }
  }
}

fs.writeFileSync(p, c, 'utf8');
console.log('Fixed: ' + fs.statSync(p).size);
const idx2 = c.indexOf('read that file');
console.log(c.substring(idx2 - 40, idx2 + 50));