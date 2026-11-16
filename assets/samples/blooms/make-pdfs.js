/**
 * make-pdfs.js — Generate 5 sample PDFs (simple → complex) for Bloom's testing
 * Run: node assets/samples/blooms/make-pdfs.js
 */
const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

const OUT = __dirname;

function writePdf(filename, title, sections) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const out = fs.createWriteStream(path.join(OUT, filename));
    doc.pipe(out);

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Sections
    for (const { heading, lines } of sections) {
      doc.fontSize(12).font('Helvetica-Bold').text(heading);
      doc.moveDown(0.2);
      for (const line of lines) {
        doc.fontSize(10).font('Helvetica').text(line, { indent: 10 });
      }
      doc.moveDown(0.5);
    }

    doc.end();
    out.on('finish', () => { console.log('  Created', filename); resolve(); });
    out.on('error', reject);
  });
}

(async () => {
  // ── Level 1: SIMPLE — Single topic, pure recall (C1 Remember) ─────────────
  await writePdf('level1-simple.pdf',
    'ICE301 — Lecture 1: Binary Number System',
    [
      {
        heading: 'Topic 1: What is Binary?',
        lines: [
          'Binary is a base-2 number system using only digits 0 and 1.',
          'Each digit is called a bit. A group of 8 bits is called a byte.',
          'Binary 1010 equals Decimal 10.',
          'Computers use binary because transistors have two states: ON and OFF.',
        ]
      },
      {
        heading: 'Topic 2: Decimal to Binary Conversion',
        lines: [
          'To convert a decimal number to binary, divide repeatedly by 2.',
          'Write the remainders from bottom to top.',
          'Example: 13 divided by 2 gives remainders 1,0,1,1 → Binary is 1101.',
          'Verify: 1x8 + 1x4 + 0x2 + 1x1 = 13. Correct.',
        ]
      },
      {
        heading: 'Topic 3: Hexadecimal System',
        lines: [
          'Hexadecimal is base-16, using digits 0-9 and letters A-F.',
          'One hexadecimal digit represents exactly 4 binary bits.',
          'Hex A = 10, Hex F = 15, Hex FF = 255 in decimal.',
          'Used in memory addresses and colour codes (e.g. #FF5733).',
        ]
      }
    ]
  );

  // ── Level 2: BASIC — Two topics, facts + comprehension (C1-C2) ────────────
  await writePdf('level2-basic.pdf',
    'ICE301 — Lecture 2: Logic Gates and Boolean Algebra',
    [
      {
        heading: 'Topic 1: Basic Logic Gates',
        lines: [
          'AND gate: output is 1 only when ALL inputs are 1.',
          'OR gate: output is 1 when AT LEAST ONE input is 1.',
          'NOT gate: inverts the input. Input 1 produces output 0.',
          'NAND gate: AND followed by NOT. NOR gate: OR followed by NOT.',
          'XOR gate: output is 1 when exactly one input is 1 (odd parity).',
          'These gates are the building blocks of all digital circuits.',
        ]
      },
      {
        heading: 'Topic 2: Boolean Algebra Laws',
        lines: [
          'Identity law: A AND 1 = A. A OR 0 = A.',
          'Null law: A AND 0 = 0. A OR 1 = 1.',
          'Idempotent: A AND A = A. A OR A = A.',
          'Complement: A AND NOT(A) = 0. A OR NOT(A) = 1.',
          'De Morgan Theorem 1: NOT(A AND B) = NOT(A) OR NOT(B).',
          'De Morgan Theorem 2: NOT(A OR B) = NOT(A) AND NOT(B).',
          'These laws allow simplification of complex logic expressions.',
        ]
      },
      {
        heading: 'Topic 3: Truth Tables',
        lines: [
          'A truth table lists all possible input combinations and their outputs.',
          'A circuit with 2 inputs has 4 rows (2 squared).',
          'A circuit with 3 inputs has 8 rows (2 cubed).',
          'Truth tables are used to verify logic equivalence and circuit design.',
        ]
      }
    ]
  );

  // ── Level 3: INTERMEDIATE — Theory + apply (C1-C3) ────────────────────────
  await writePdf('level3-intermediate.pdf',
    'CSE303 — Data Structures: Linked Lists, Stacks and Queues',
    [
      {
        heading: 'Topic 1: Singly Linked List',
        lines: [
          'A linked list is a linear data structure of connected nodes.',
          'Each node contains data and a pointer to the next node.',
          'Head pointer references the first node. Last node points to NULL.',
          'Advantage: Dynamic size, O(1) insertion at head.',
          'Disadvantage: No random access, extra memory for pointers.',
          'Traversal requires starting from head — O(n) time complexity.',
        ]
      },
      {
        heading: 'Topic 2: Stack (LIFO)',
        lines: [
          'Stack follows Last In First Out ordering principle.',
          'push() adds an element to the top of the stack.',
          'pop() removes and returns the top element.',
          'peek() reads the top element without removing it.',
          'Applications: function call stack, undo/redo, expression parsing.',
          'Array or linked list can implement a stack efficiently.',
        ]
      },
      {
        heading: 'Topic 3: Queue (FIFO)',
        lines: [
          'Queue follows First In First Out ordering principle.',
          'enqueue() adds to rear. dequeue() removes from front.',
          'Applications: CPU scheduling, BFS traversal, print spooling.',
          'Circular queue avoids wasted space using modular arithmetic.',
        ]
      },
      {
        heading: 'Topic 4: Time Complexity Analysis',
        lines: [
          'Stack push and pop: O(1) — constant time operations.',
          'Queue enqueue and dequeue: O(1) — constant time.',
          'Linked list insertion at head: O(1). At tail: O(n) without tail pointer.',
          'Search in any of these structures: O(n) — linear scan required.',
          'Implementing a stack with array: maintain a top index variable.',
        ]
      }
    ]
  );

  // ── Level 4: ADVANCED — Compare, analyse, evaluate (C1-C5) ───────────────
  await writePdf('level4-advanced.pdf',
    'CSE401 — Sorting Algorithms: Design, Analysis and Evaluation',
    [
      {
        heading: 'Topic 1: Bubble Sort',
        lines: [
          'Bubble sort repeatedly compares adjacent pairs and swaps if out of order.',
          'Best case: O(n) — array already sorted (optimised version).',
          'Average and worst case: O(n squared) — nested comparisons.',
          'Space complexity: O(1) — in-place sort.',
          'Stable: equal elements maintain their relative order.',
          'Practical use: educational only — never used for production data.',
        ]
      },
      {
        heading: 'Topic 2: Merge Sort — Divide and Conquer',
        lines: [
          'Recursively splits array in half, sorts each half, then merges.',
          'Time complexity: O(n log n) in best, average and worst case.',
          'Space complexity: O(n) — requires auxiliary array for merging.',
          'Stable sort. Optimal for external sorting and linked lists.',
          'Parallelisable — subproblems are fully independent.',
        ]
      },
      {
        heading: 'Topic 3: Quick Sort',
        lines: [
          'Selects a pivot, partitions array into smaller/larger halves, recurses.',
          'Average case: O(n log n). Worst case: O(n squared) with bad pivot.',
          'In-place: O(log n) stack space for recursion.',
          'Not stable. Fastest in practice due to cache-friendly access.',
          'Random pivot selection or median-of-3 reduces worst-case risk.',
        ]
      },
      {
        heading: 'Topic 4: Heap Sort',
        lines: [
          'Builds a max-heap then repeatedly extracts the maximum element.',
          'O(n log n) in all cases — guaranteed performance.',
          'In-place: O(1) extra space. Not stable.',
          'Less cache-friendly than quicksort due to non-sequential access.',
        ]
      },
      {
        heading: 'Topic 5: Comparative Evaluation and Selection Guide',
        lines: [
          'Small datasets (n < 50): insertion sort is fastest in practice.',
          'Large random data: quicksort preferred for cache performance.',
          'Guaranteed O(n log n) required: merge sort or heap sort.',
          'Nearly sorted input: bubble or insertion sort (O(n) best case).',
          'External memory / disk sorting: merge sort (sequential access).',
          'Lower bound theorem: comparison-based sorts cannot beat O(n log n).',
          'Proof: decision tree has n! leaves → height >= log2(n!) = O(n log n).',
          'Counting sort and Radix sort break this bound — non-comparison sorts.',
        ]
      }
    ]
  );

  // ── Level 5: COMPLEX — Full depth, design project (C1-C6) ─────────────────
  await writePdf('level5-complex.pdf',
    'CSE501 — Advanced Networks: TCP/IP, QoS, Congestion Control and SDN',
    [
      {
        heading: 'Topic 1: TCP/IP Protocol Stack',
        lines: [
          'Application Layer: HTTP, FTP, SMTP, DNS — user-facing services.',
          'Transport Layer: TCP (reliable, ordered) and UDP (unreliable, fast).',
          'Network Layer: IP routing, ICMP error reporting, ARP resolution.',
          'Data Link Layer: Ethernet and WiFi — framing and MAC addressing.',
          'Physical Layer: Electrical and optical signals over copper, fibre, wireless.',
          'Each layer provides services to the layer above via well-defined interfaces.',
        ]
      },
      {
        heading: 'Topic 2: TCP Three-Way Handshake',
        lines: [
          'SYN: Client sends initial sequence number (ISN) to server.',
          'SYN-ACK: Server acknowledges client ISN and sends its own ISN.',
          'ACK: Client confirms server ISN. Connection is now established.',
          'Purpose: Synchronise sequence numbers before data transfer begins.',
          'Failure modes: SYN flood attack exploits incomplete half-open connections.',
        ]
      },
      {
        heading: 'Topic 3: TCP Congestion Control',
        lines: [
          'Slow Start: Congestion window (cwnd) starts at 1 MSS, doubles each RTT.',
          'Congestion Avoidance: Linear additive increase after ssthresh threshold.',
          'Fast Retransmit: Retransmit segment on receipt of 3 duplicate ACKs.',
          'Fast Recovery: Halve cwnd and enter CA phase without slow start.',
          'AIMD principle: Additive Increase Multiplicative Decrease ensures fairness.',
          'TCP Cubic and BBR are modern variants optimised for high-bandwidth links.',
        ]
      },
      {
        heading: 'Topic 4: Quality of Service (QoS)',
        lines: [
          'Differentiated Services (DiffServ): DSCP field marks packet priority.',
          'Integrated Services (IntServ): RSVP reserves bandwidth per flow.',
          'Token Bucket: Allows bursts up to bucket size at average token rate.',
          'Leaky Bucket: Enforces strict constant output rate regardless of bursts.',
          'Weighted Fair Queuing (WFQ): Each flow gets proportional bandwidth share.',
          'Priority Queuing: High-priority traffic preempts low-priority queues.',
        ]
      },
      {
        heading: 'Topic 5: Software Defined Networking (SDN)',
        lines: [
          'SDN decouples the control plane from the data plane.',
          'Centralised SDN controller maintains a global network topology view.',
          'OpenFlow protocol allows controller to install rules in switch flow tables.',
          'Benefits: Programmability, rapid policy deployment, global optimisation.',
          'Challenges: Controller is single point of failure, scalability limits.',
          'Network Function Virtualisation (NFV) complements SDN.',
        ]
      },
      {
        heading: 'Topic 6: Design Project — Campus Network Architecture',
        lines: [
          'Design a fault-tolerant campus network supporting 10,000 concurrent users.',
          'Requirements: VoIP QoS guarantee, video conferencing, bulk data transfer.',
          'Integrate SDN controller for centralised policy management.',
          'Analyse TCP congestion control behaviour under mixed traffic load.',
          'Evaluate trade-offs: redundancy cost vs availability vs performance.',
          'Justify all protocol selections with reference to standards and benchmarks.',
          'Deliverable: Full network design document, topology diagram, and test plan.',
        ]
      }
    ]
  );

  console.log('\nAll 5 PDFs ready. Now verifying with pdf-parse...\n');

  // Verify all parse correctly
  const pdfParse = require('pdf-parse');
  const files = [
    'level1-simple.pdf','level2-basic.pdf','level3-intermediate.pdf',
    'level4-advanced.pdf','level5-complex.pdf'
  ];
  const levels = ['SIMPLE','BASIC','INTERMEDIATE','ADVANCED','COMPLEX'];
  for (let i = 0; i < files.length; i++) {
    const buf = fs.readFileSync(path.join(OUT, files[i]));
    const data = await pdfParse(buf);
    const words = data.text.trim().split(/\s+/).length;
    console.log(`  Level ${i+1} [${levels[i]}] — ${files[i]}: ${words} words extracted ✅`);
  }
  console.log('\n✅ All 5 PDFs valid and parseable by pdf-parse');

})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
