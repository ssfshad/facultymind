'use strict';
const {splitQuestions, classifyQuestion} = require('./src/modules/blooms/clo-mapper-fast');
const raw = `Question 1 [5 Marks]You are reviewing a Flutter application.Question 2 [5 Marks]GestureDetector plays a crucial role.Question 3 [5 Marks]Describe the ideal architecture.Question 4 [5 Marks]In a large-scale Flutter application handling sensitive user information, determine the essential components required to build a secure authentication flow. Your answer should focus on modern token-based authentication methods, secure storage practices, safe API communication, proper token refresh mechanisms, and the importance of avoiding hardcoded secrets.`;
const qs = splitQuestions(raw);
const q4 = qs.find(q => q.id === 'Q4');
console.log('Q4 text:', JSON.stringify(q4?.text));
console.log('classify:', JSON.stringify(classifyQuestion(q4)));
