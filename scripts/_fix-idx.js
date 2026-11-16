const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Find the exact bad string using indexOf
const badPart = "Couldn";
const badIdx = c.indexOf(badPart);
if (badIdx === -1) { console.log('Not found'); process.exit(1); }

// Go back to find the backtick
let btIdx = badIdx;
while (btIdx > 0 && c.charCodeAt(btIdx) !== 96) btIdx--;
console.log('Backtick at:', btIdx, 'char:', c.charCodeAt(btIdx));

// Go forward from backtick to find ,);;
let endIdx = badIdx;
while (endIdx < c.length && !(c[endIdx] === ';' && c[endIdx+1] === ';' && c[endIdx-1] === ')')) endIdx++;
endIdx += 2; // include both semicolons
console.log('End at:', endIdx, 'chars:', c.substring(endIdx-3, endIdx+1));

// Replace from btIdx to endIdx
const oldStr = c.substring(btIdx, endIdx);
const newStr = 'window.chatSync.appendAiMsg(' + String.fromCharCode(96) + "Couldn" + "'t read that file: " + String.fromCharCode(96) + ');';
console.log('Old:', JSON.stringify(oldStr));
console.log('New:', newStr);

c = c.substring(0, btIdx) + newStr + c.substring(endIdx);

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);
const v = c.indexOf("Couldn");
if (v > -1) console.log('Verify:', c.substring(v - 40, v + 50));