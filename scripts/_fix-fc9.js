const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Fix: catch (err)window.chatSync.appendAiMsg( { should be catch (err) {
c = c.replace('catch (err)window.chatSync.appendAiMsg( {', 'catch (err) {');

// Now add window.chatSync.appendAiMsg( before the backtick in the catch block
const search = "err) {\n      " + "Couldn";
const idx = c.indexOf(search);
if (idx > -1) {
  c = c.substring(0, idx + 12) + 'window.chatSync.appendAiMsg(' + c.substring(idx + 12);
  console.log('Added appendAiMsg prefix');
}

// Fix the closing: , []); should be );
const endSearch = "err.message}" + ", [])";
const endIdx = c.indexOf(endSearch);
if (endIdx > -1) {
  c = c.substring(0, endIdx) + "err.message});" + c.substring(endIdx + endSearch.length);
  console.log('Fixed closing');
}

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);
const v = c.indexOf("Couldn");
if (v > -1) console.log('Verify:', c.substring(v - 40, v + 50));