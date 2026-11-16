const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// Direct approach: find the line starting with backtick after catch
// Replace the entire catch block content
const catchBlock = "catch (err) {\n      " + "Couldn't read that file: , []);";
const replacement = "catch (err) {\n      window.chatSync.appendAiMsg(" + "Couldn't read that file: );";

if (c.includes(catchBlock)) {
  c = c.replace(catchBlock, replacement);
  console.log('Fixed catch block');
} else {
  console.log('Catch block not found exactly');
  // Show what we have
  const idx = c.indexOf('catch (err)');
  let lastCatch = idx;
  while (c.indexOf('catch (err)', lastCatch + 1) > -1) {
    lastCatch = c.indexOf('catch (err)', lastCatch + 1);
  }
  console.log('Last catch at:', lastCatch);
  console.log(c.substring(lastCatch, lastCatch + 120));
}

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);