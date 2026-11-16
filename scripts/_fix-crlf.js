const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Check line endings
const idx = c.indexOf("Couldn");
const lineStart = c.lastIndexOf('\n', idx);
const lineEnd = c.indexOf('\n', idx);
const line = c.substring(lineStart, lineEnd);
console.log('Line hex:', Buffer.from(line).toString('hex').substring(0, 100));
console.log('Has CR:', line.includes('\r'));

// Try with \r\n
const bad = "\r\n      " + "Couldn't read that file: \,);;\r\n";
if (c.includes(bad)) {
  console.log('Found with CRLF');
  c = c.replace(bad, "\r\n      window.chatSync.appendAiMsg(" + "Couldn't read that file: \);\r\n");
} else {
  // Try without any newline
  const bad2 = "" + "Couldn't read that file: \,);;";
  const idx2 = c.indexOf(bad2);
  if (idx2 > -1) {
    console.log('Found bad pattern at:', idx2);
    c = c.substring(0, idx2) + "window.chatSync.appendAiMsg(" + "Couldn't read that file: \);" + c.substring(idx2 + bad2.length);
    console.log('Fixed inline');
  }
}

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);
const v = c.indexOf("Couldn");
if (v > -1) console.log('After:', c.substring(v - 40, v + 50));