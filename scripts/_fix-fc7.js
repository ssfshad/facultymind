const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// The corrupted line has: \n      Couldn't...
// We need to insert window.chatSync.appendAiMsg( before the backtick
// Find the catch block in handleFileSelect
const catchIdx = c.indexOf("catch (err) {");
const fileErrIdx = c.indexOf("Couldn", catchIdx);
if (fileErrIdx > -1) {
  // Go back to find the start of the expression (should be a backtick)
  let backtickPos = fileErrIdx - 7; // Should be right before "Couldn"
  // Verify it's a backtick
  if (c.charCodeAt(backtickPos) === 96) { // 96 = backtick
    // Insert the function call
    c = c.substring(0, backtickPos) + 'window.chatSync.appendAiMsg(' + c.substring(backtickPos);
    // Now fix the end: change , []); to );
    const endSearch = "err.message}";
    const endIdx = c.indexOf(endSearch, backtickPos);
    if (endIdx > -1) {
      // Find the , []) after the closing backtick
      const closeIdx = c.indexOf(', [])', endIdx + endSearch.length);
      if (closeIdx > -1) {
        c = c.substring(0, closeIdx) + ')' + c.substring(closeIdx + 5);
      }
    }
  }
}

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);

// Verify
const idx = c.indexOf("Couldn");
if (idx > -1) {
  console.log(c.substring(idx - 50, idx + 60));
}