const fs = require('fs');
const c = fs.readFileSync('D:/facultymind/src/renderer/js/floating-chat.js', 'utf8');
// Find section markers
const markers = ['Rendering', 'Draggable', 'File handling', 'Send', 'Badge', 'Proactive'];
markers.forEach(m => {
  const idx = c.indexOf(m);
  console.log(m + ': ' + idx);
});
// Check what's around sendMessage end
const sendIdx = c.indexOf('async function sendMessage()');
console.log('sendMessage+600:', c.substring(sendIdx + 580, sendIdx + 640).replace(/\n/g, '|'));