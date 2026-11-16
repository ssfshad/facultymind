const fs = require('fs');
const c = fs.readFileSync('D:/facultymind/src/renderer/js/floating-chat.js', 'utf8');
const idx = c.indexOf('read that file');
console.log(JSON.stringify(c.substring(idx - 40, idx + 40)));