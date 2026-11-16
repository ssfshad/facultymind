const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Replace the exact corrupted line
const bad = "\n      " + "Couldn't read that file: ,);;\n";
const good = "\n      window.chatSync.appendAiMsg(" + "Couldn't read that file: );\n";

if (c.includes(bad)) {
  c = c.replace(bad, good);
  console.log('Fixed!');
} else {
  console.log('Not found');
}

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);
const v = c.indexOf("Couldn");
if (v > -1) console.log('Verify:', JSON.stringify(c.substring(v - 40, v + 50)));