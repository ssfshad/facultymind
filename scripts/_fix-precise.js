const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Find the broken pattern
const marker = "Couldn";
const idx = c.indexOf(marker);
if (idx === -1) { console.log('Not found'); process.exit(1); }

// Find the opening backtick before marker
let openBT = idx - 1;
while (openBT > 0 && c.charCodeAt(openBT) !== 96) openBT--;

// Find the closing backtick after err.message}
let closeSearch = "err.message}";
let closeIdx = c.indexOf(closeSearch, idx);
if (closeIdx > -1) closeIdx += closeSearch.length; // position after }
// The closing backtick should be right after }
if (c.charCodeAt(closeIdx) === 96) closeIdx++; // skip closing backtick

// Find the end: );
let endIdx = c.indexOf(');', closeIdx);

// Build replacement
let newContent = c.substring(0, openBT);
newContent += 'window.chatSync.appendAiMsg(';
newContent += String.fromCharCode(96); // backtick
newContent += 'Couldn' + String.fromCharCode(39) + 't read that file: ';
newContent += String.fromCharCode(36) + '{err.message}';
newContent += String.fromCharCode(96); // backtick
newContent += ');';
newContent += c.substring(endIdx + 2);

fs.writeFileSync(p, newContent, 'utf8');
console.log('Size: ' + newContent.length);
const v = newContent.indexOf("Couldn");
if (v > -1) console.log('Verify:', newContent.substring(v - 40, v + 60));