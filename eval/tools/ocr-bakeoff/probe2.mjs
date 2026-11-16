import Ocr from '@gutenye/ocr-node';
const ocr = await Ocr.create();
const r = await ocr.detect('D:/Projects/facultymind/eval/data/private/papers/0091_4608227736167698.jpg');
console.log(Array.isArray(r), Object.keys(r), JSON.stringify(r).slice(0, 400));
