const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Search for the EXACT corrupted pattern
// Should be: (err) {\n      Couldn
// And we want: (err) {\n      window.chatSync.appendAiMsg(Couldn
const search = "err) {\n      " + "Couldn";
const idx = c.indexOf(search);
if (idx > -1) {
  console.log('Found exact match at:', idx);
  // Replace with corrected version
  const replacement = "err) {\n      window.chatSync.appendAiMsg(" + "Couldn";
  c = c.substring(0, idx) + replacement + c.substring(idx + search.length);
  
  // Now fix the closing: change , []); to );
  // After err.message}
  const endSearch = "err.message}" + ", [])";
  const endIdx = c.indexOf(endSearch, idx);
  if (endIdx > -1) {
    c = c.substring(0, endIdx) + "err.message});" + c.substring(endIdx + endSearch.length);
  }
} else {
  console.log('Pattern not found');
  // Show what is around the area
  const canIdx = c.indexOf("Couldn");
  if (canIdx > -1) {
    console.log('Context:', JSON.stringify(c.substring(canIdx - 40, canIdx + 30)));
  }
}

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);
const v = c.indexOf("Couldn");
if (v > -1) console.log('Verify:', c.substring(v - 40, v + 50));