const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');

// The current broken version:
// window.chatSync.appendAiMsg(Couldn't read that file: );
// Should be:
// window.chatSync.appendAiMsg(Couldn't read that file:  + err.message + );
const broken = "window.chatSync.appendAiMsg(" + "Couldn't read that file: );";
const fixed = "window.chatSync.appendAiMsg(" + "Couldn't read that file: " + String.fromCharCode(36) + "{err.message});";

c = c.replace(broken, fixed);

fs.writeFileSync(p, c, 'utf8');
console.log('Size: ' + fs.statSync(p).size);
const v = c.indexOf("Couldn");
if (v > -1) console.log('Verify:', c.substring(v - 40, v + 60));