const fs = require('fs');
const p = 'D:/facultymind/src/renderer/js/floating-chat.js';
let c = fs.readFileSync(p, 'utf8');
console.log('File length:', c.length);
console.log('sendMessage at:', c.indexOf('async function sendMessage()'));
console.log('// Rendering at:', c.indexOf('// Rendering'));
console.log('// Draggable at:', c.indexOf('// Draggable'));
console.log('return { init at:', c.indexOf('return { init'));