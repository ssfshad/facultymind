const fs = require('fs');
const content = fs.readFileSync('assets/samples/blooms/level1-simple.pdf', 'ascii');

// Find actual xref table (not inside startxref)
const xrefMatch = content.match(/\nxref\n/);
const xrefPos   = xrefMatch ? content.indexOf('\nxref\n') + 1 : -1;

// Find startxref value
const sxMatch   = content.match(/startxref\n(\d+)/);
const sxVal     = sxMatch ? parseInt(sxMatch[1]) : -1;

console.log('File length:', content.length);
console.log('Actual xref position:', xrefPos);
console.log('startxref claims:    ', sxVal);
console.log('Match:', xrefPos === sxVal);

// Show xref section
console.log('\n--- xref section ---');
console.log(content.slice(xrefPos, xrefPos + 160));

// Check each object position
['1 0 obj','2 0 obj','3 0 obj','4 0 obj'].forEach(tag => {
  console.log(tag, 'at byte', content.indexOf(tag));
});

// Try pdf-parse with stream option
const pdfParse = require('pdf-parse');
pdfParse(Buffer.from(content, 'ascii'))
  .then(d => console.log('\nPARSE OK - words:', d.text.split(/\s+/).length))
  .catch(e => console.log('\nPARSE FAIL:', e.message));
