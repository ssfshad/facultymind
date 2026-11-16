'use strict';
// Generates eval/data/bloom-questions.json — Bloom's level gold set (QUALITY.md: ≥90% exact vs teacher labels).
//
// Provenance (kept per item, reported by the eval):
//   teacher  = level printed on a real DIU exam paper by the course teacher (ICE431 Fall-2025, Md. Azizul Hakim)
//   author   = labelled by the developer following Anderson & Krathwohl verb conventions + DIU practice
//              (Differentiate/Break down = C4, Assess/Critique = C5, Design/Construct = C6).
//              Author labels share an author with the mapper, so real teacher phrasing will score LOWER:
//              collect teacher-labelled questions in the pilot and add them as source "teacher".
// Special gold values:
//   "REJECT"        the question/objective is not measurable or not cognitive (the mapper must refuse it)
//   ambiguous: true gold is the *most defensible* level but teachers disagree; accept[] lists all defensible
//                   levels. Reported separately, never in the headline number.
// Run: node eval/data/gen-bloom-questions.js   (then the split is frozen on first eval run)

const fs = require('fs');
const path = require('path');

const T = 'teacher', A = 'author';
const items = [];
const add = (gold, source, text, extra = {}) => items.push({ text, gold, source, ...extra });

// ── Real teacher-labelled (ICE431 Fall-2025 final, labels printed on the paper) ──────────────────
add('C4', T, 'You are reviewing a Flutter application that users report as slow, laggy, and occasionally unresponsive, especially when navigating between screens or scrolling through long lists. After profiling the app, you discover frequent widget rebuilds, large images loading inefficiently, and computational tasks blocking the UI thread. Break down the overall performance strategy you would use to evaluate these issues and determine the most effective optimizations to enhance rendering speed, responsiveness, and smoothness across the app.');
add('C4', T, 'GestureDetector plays a crucial role in Flutter applications by affecting the smoothness and responsiveness of user interactions. Break down how GestureDetector processes gestures such as taps, drags, and swipes, and explain the ways in which it improves the overall user experience.');
add('C2', T, 'Describe the ideal architecture for a large-scale Flutter application that includes modules such as user authentication, product listing, order history, dashboard analytics, personalized user notifications and ensure scalability, maintainability, and clean separation of concerns.');
add('C2', T, 'In a large-scale Flutter application handling sensitive user information, determine the essential components required to build a secure authentication flow. Your answer should focus on modern token-based authentication methods, secure storage practices, safe API communication, proper token refresh mechanisms, and the importance of avoiding hardcoded secrets.');
add('C5', T, 'You are building an AI-powered grocery companion app in Flutter. Your client now wants users to operate the app hands-free by issuing spoken instructions such as searching for items, browsing categories, and adding products to the cart. Assess the most effective tools and techniques to integrate voice command functionality into your Flutter application, taking into account platform compatibility, performance, and overall user experience.');
add('C6', T, 'Design and develop a complete barcode scanning feature in Flutter that retrieves product data from an external API. Your solution should include camera integration, barcode recognition, API fetching, and display of results in a user-friendly interface.');
add('C4', T, 'Differentiate between stateful and stateless widget with proper examples.');

// ── C1 Remember ─────────────────────────────────────────────────────────────────────────────────
[
  'Define the term "propagation delay" in a digital circuit.',
  'List the four main types of memory used in a microcontroller.',
  'State Kirchhoff\'s current law.',
  'What is a primary key in a relational database?',
  'Name the layers of the OSI reference model in order.',
  'Write down the expression for the Nyquist sampling theorem.',
  'Recall the three conditions that must hold for a deadlock to occur.',
  'Identify the components labelled A, B and C in the given block diagram of a superheterodyne receiver.',
  'Define normalization and mention its main purpose in one sentence.',
  'What are the basic building blocks of a Flutter user interface?',
  'Label the parts of the given PN junction diode diagram.',
  'State the difference between a bit and a byte.',
  'List any five principles of object-oriented programming.',
  'Who proposed the relational model of data?',
  'Define a regular language.',
  'Mention the functions of the control unit of a CPU.',
  'Define Shannon channel capacity.',
  'What is the unit of capacitance?',
  'Name the three types of transistor configurations.',
  'Recall the steps of the software development life cycle.',
  'State the Boolean identity known as De Morgan\'s theorem.',
  'Write the syntax of a for loop in C.',
  'Define stack and queue.',
  'List the advantages of fibre optic cable over copper wire.',
].forEach(t => add('C1', A, t));

// ── C2 Understand ───────────────────────────────────────────────────────────────────────────────
[
  'Explain the working principle of a full-wave bridge rectifier with a neat circuit diagram.',
  'Describe how TCP establishes a connection using the three-way handshake.',
  'Discuss the role of the operating system in memory management.',
  'Summarize the main differences in purpose between a compiler and an interpreter.',
  'Explain why a pull-up resistor is needed on an open-drain output.',
  'Describe the function of each pin of the 8051 microcontroller.',
  'Interpret the given frequency response plot and describe what it says about the filter.',
  'Illustrate the concept of recursion with a suitable example.',
  'Explain how interrupts are handled by a microcontroller.',
  'Briefly discuss the advantages of using a prescaler in timer operations.',
  'Classify the given list of sensors into analog and digital types.',
  'Describe the steps involved in the waterfall model.',
  'Paraphrase the statement of the Pumping Lemma in your own words.',
  'Explain the effect of increasing the base current on the collector current of a BJT.',
  'Discuss the importance of version control in a team software project.',
  'Give an example of a many-to-many relationship and explain how it is modelled in a database.',
  'Explain how a DNS lookup resolves a domain name to an IP address.',
  'Describe the difference between synchronous and asynchronous communication, with one example each.',
  'What happens when a process requests more memory than is available?',
  'Why is a cache memory faster than main memory?',
  'Outline the process of packet routing across a network.',
  'Explain the meaning of CLO attainment in outcome-based education.',
  'Describe the architecture of a typical three-tier web application.',
  'Summarize how public-key encryption protects data in transit.',
].forEach(t => add('C2', A, t));

// ── C3 Apply ────────────────────────────────────────────────────────────────────────────────────
[
  'Calculate the cut-off frequency of an RC low-pass filter with R = 10 kΩ and C = 0.1 µF.',
  'Solve the given system of linear equations using Gaussian elimination.',
  'Apply Boolean algebra to simplify F(A,B,C) = AB + A\'B + BC.',
  'Write a C program to find the largest of three numbers.',
  'Implement a stack using an array and demonstrate push and pop operations.',
  'Use Kirchhoff\'s laws to find the current through each branch of the given circuit.',
  'Compute the Hamming distance between 1011101 and 1001001.',
  'Demonstrate how a binary search works on the sorted array 3, 8, 12, 19, 25, 31.',
  'Determine the output voltage of the given op-amp inverting amplifier circuit.',
  'Draw the timing diagram of a 3-bit synchronous up counter.',
  'Apply the Karnaugh map method to minimize the given expression.',
  'Convert the decimal number 156 to binary and hexadecimal.',
  'Write an SQL query to list the names of all students who scored above 80 in ICE301.',
  'Use Dijkstra\'s algorithm to compute the shortest path from node A to every other node.',
  'Calculate the bit rate and baud rate of a signal with 16 levels and a bandwidth of 4 kHz.',
  'Develop a C18 program to blink an LED every second using Timer0.',
  'Show how the given grammar generates the string "aabb".',
  'Compute the Fourier transform of the given rectangular pulse.',
  'Solve the recurrence T(n) = 2T(n/2) + n using the master theorem.',
  'Prepare a trial balance from the given list of ledger balances.',
  'Employ the given formula to predict the batch yield for a temperature of 80 °C.',
  'Construct the truth table for the given logic expression.',
  'Execute the given sequence of instructions and state the final value of register R2.',
  'Find the parity bits and prepare the transmitted data for the given data word 1010.',
].forEach(t => add('C3', A, t));
// "Construct the truth table" (index 21) and "Find the parity bits" are covered via ambiguity below; keep
// them as C3 here because they are routine procedures, and flag the debatable ones explicitly:
items.filter(i => /^Construct the truth table|^Find the parity bits|^Develop a C18/.test(i.text))
  .forEach(i => { i.ambiguous = true; i.accept = i.text.startsWith('Develop') ? ['C3', 'C6'] : ['C3', 'C5']; });

// ── C4 Analyze ──────────────────────────────────────────────────────────────────────────────────
[
  'Analyze the given combinational circuit and determine its output equation.',
  'Differentiate between a mealy machine and a moore machine.',
  'Contrast the memory management strategies of paging and segmentation.',
  'Break down the given software architecture into its main components and describe how they interact.',
  'Distinguish between symmetric and asymmetric encryption in terms of key management and speed.',
  'Examine the given network trace and identify the cause of the high latency.',
  'Compare the time complexity of quicksort and mergesort on nearly sorted input and explain the difference.',
  'Categorize the given set of requirements into functional and non-functional requirements and justify the grouping.',
  'Differentiate between voltage regulation and line regulation.',
  'Investigate why the given amplifier circuit oscillates at high frequency.',
  'Analyze the effect of feedback on the gain and bandwidth of an amplifier.',
  'Dissect the given SQL execution plan and locate the bottleneck.',
  'Differentiate between TCP and UDP with respect to reliability and overhead.',
  'Organize the given case study data into a table that exposes the relationship between sales and advertising spend.',
  'Deconstruct the given algorithm and identify which steps dominate its running time.',
  'Inspect the given waveform and attribute each distortion to its probable cause.',
  'Distinguish between hard real-time and soft real-time systems.',
  'Analyze why the given Flutter widget rebuilds on every frame.',
  'Examine the relationship between the CLO attainment results and the final exam question mix.',
  'Contrast the strengths and weaknesses of the star and bus network topologies.',
  'Break down the cost structure of the given project into fixed and variable components.',
  'Differentiate between a process and a thread.',
  'Diagnose the fault in the given circuit from the measured node voltages.',
  'Compare and contrast RISC and CISC architectures.',
].forEach(t => add('C4', A, t));
// "Compare" is C2 in Anderson & Krathwohl but C4 in DIU practice: ambiguous.
items.filter(i => /^Compare the time|^Compare and contrast|^Contrast the (memory|strengths)/.test(i.text))
  .forEach(i => { i.ambiguous = true; i.accept = ['C2', 'C4']; });

// ── C5 Evaluate ─────────────────────────────────────────────────────────────────────────────────
[
  'Evaluate the suitability of a NoSQL database for the given banking application.',
  'Justify the choice of a Butterworth filter over a Chebyshev filter for the given audio application.',
  'Assess the security risks of storing authentication tokens in shared preferences.',
  'Critique the given system design and recommend improvements.',
  'Judge which of the two proposed algorithms is more appropriate for the given memory-constrained device.',
  'Appraise the trade-offs between accuracy and speed in the given machine learning pipeline.',
  'Defend the decision to use a microservices architecture for the given e-commerce platform.',
  'Recommend the most appropriate sensor for the given application and justify your answer.',
  'Evaluate the effectiveness of the given test plan in detecting regression bugs.',
  'Assess the impact of clock skew on the reliability of the given synchronous design.',
  'Argue for or against the use of global variables in embedded firmware.',
  'Critique the following experiment design and point out threats to its validity.',
  'Prioritize the following project risks and justify the ranking.',
  'Judge the adequacy of the proposed cooling solution for the given power amplifier.',
  'Evaluate the given business plan against the criteria discussed in class.',
  'Justify why the star topology is preferred for the given office network.',
  'Determine whether the given encryption scheme is secure enough for patient records and defend your conclusion.',
  'Select the best cloud deployment model for the given university and justify the selection.',
  'Assess the strengths and limitations of the given data collection method.',
  'Review the given code for maintainability and recommend changes.',
  'Evaluate the performance of the given controller using the step response and decide whether the specification is met.',
  'Rank the given routing protocols for a large campus network and support your ranking with evidence.',
].forEach(t => add('C5', A, t));
// teacher-style note: "Find error" is C5 at DIU (KB convention); rule engine strict-Bloom says C3.
add('C5', A, 'Find error for the given problem: Received data 100110, Divisor x3+x+1.', { ambiguous: true, accept: ['C3', 'C5'] });

// ── C6 Create ───────────────────────────────────────────────────────────────────────────────────
[
  'Design a 4-to-1 multiplexer using only NAND gates.',
  'Construct a finite state machine that detects the binary sequence 1011.',
  'Develop a mobile application that tracks daily water intake and sends reminders.',
  'Propose a new algorithm for load balancing across a cluster of heterogeneous servers.',
  'Formulate a hypothesis and design an experiment to test the effect of temperature on battery life.',
  'Compose a test strategy for a safety-critical embedded system.',
  'Create a database schema for a university course registration system.',
  'Design a circuit between a 16x2 LCD and a PIC18 microcontroller to display a message.',
  'Devise a plan to migrate the given monolith to a cloud-native architecture.',
  'Develop an original solution to reduce the power consumption of the given IoT sensor node.',
  'Design a low-pass filter with a cut-off frequency of 1 kHz and a roll-off of 40 dB per decade.',
  'Synthesize the findings of the three case studies into a single maintenance framework.',
  'Build a complete REST API for a library management system.',
  'Generate a set of test cases that together cover all branches of the given function.',
  'Plan and design a campus-wide Wi-Fi network for 5,000 users.',
  'Invent a data structure that supports insert, delete and find-median in logarithmic time.',
  'Produce a prototype of a smart door lock using a microcontroller and a keypad.',
  'Design and implement a voting system that guarantees voter anonymity.',
  'Architect a fault-tolerant message queue for a banking application.',
  'Formulate an optimization strategy to reduce the frame time of a multi-layered canvas.',
  'Draft a project proposal for an automated attendance system using face recognition.',
  'Develop a comprehensive security policy for a hospital information system.',
].forEach(t => add('C6', A, t));
// "Design and implement" / "Build" / "Plan and design" are plain C6 for teachers; "Plan" is the only soft verb.
items.filter(i => /^Develop a mobile application/.test(i.text)).forEach(i => { i.ambiguous = true; i.accept = ['C3', 'C6']; });

// ── Scenario-first phrasing (real papers bury the command after a context paragraph) ───────────
add('C5', A, 'A start-up stores student records in a single unencrypted file on a shared drive. The founders say encryption would slow the system down. Assess whether this claim is acceptable for a system holding personal data.');
add('C4', A, 'A hospital network drops packets every afternoon between 2 pm and 4 pm. The logs show a spike in video-conferencing traffic. Analyze the likely cause and identify which traffic should be rate limited.');
add('C6', A, 'A bakery wants to track daily stock and predict tomorrow\'s demand. Design a small database and a prediction approach that fits its budget.');
add('C3', A, 'A sensor outputs 0 to 5 V for a temperature range of 0 to 100 °C. Calculate the temperature when the output reads 3.2 V.');
add('C2', A, 'Packets from two hosts on the same subnet are reaching each other, but traffic to the internet fails. Explain the most likely reason.');
add('C1', A, 'The IEEE 802.11 family defines several wireless standards. Name the standard that operates in the 5 GHz band only.');

// ── Not measurable / not cognitive: the mapper must refuse, not guess a level ─────────────────
[
  'Students will become thoroughly familiar with the history of the Internet.',
  'Develop a deep appreciation for clean and minimalist design.',
  'Students will understand the importance of teamwork.',
  'Demonstrate professional ethics by respecting the opinions of peers during group work.',
  'Students will memorize the entire OSI protocol stack in detail.',
  'Be aware of recent trends in artificial intelligence.',
  'Students will know the fundamentals of electronics.',
  'Appreciate the role of engineers in society.',
].forEach(t => add('REJECT', A, t));

items.forEach((it, i) => { it.id = 'b' + String(i + 1).padStart(3, '0'); });
const out = path.join(__dirname, 'bloom-questions.json');
fs.writeFileSync(out, JSON.stringify(items, null, 1) + '\n');
const by = {};
for (const it of items) by[it.gold] = (by[it.gold] || 0) + 1;
console.log(`wrote ${items.length} items → ${out}`, by, 'ambiguous:', items.filter(i => i.ambiguous).length);
