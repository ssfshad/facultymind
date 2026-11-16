'use strict';

/**
 * syllabus-mapper.js — Macro Syllabus Alignment Engine
 *
 * Ingests a Course Profile document (DOCX/PDF), extracts:
 *   - Course Outcomes (COs) — what the professor says students will achieve
 *   - Weekly syllabus topics — what is actually taught week by week
 *
 * Then runs a reverse-mapping pass:
 *   For each week's content, look up the expected Bloom's level using the
 *   DOMAIN_TOPIC_MATRIX (deterministic, no AI, no vectors).
 *   Compare the expected level against the CO statement's actual verb.
 *   Flag misalignments and generate rewrite suggestions.
 *
 * This is the "Syllabus Doctor" — it catches CO statements that were copied
 * from a different course or written without checking the actual content.
 */

const { BLOOMS_VERBS, BLOOMS_NAMES } = require('../../prompts/templates/blooms-verbs');

// ── Domain-Topic-to-Cognitive-Level Matrix ────────────────────────────────────
// Maps topic keywords found in weekly syllabus content to the expected
// Bloom's level and suggested action verbs.
//
// Rules:
// - Keys are lowercase substrings to match against weekly topic text
// - More specific keys take priority over general ones
// - Covers Electrical Engineering, ICT, CS, and Mobile App Dev domains
const DOMAIN_TOPIC_MATRIX = {
  // ── Electrical Engineering ────────────────────────────────────────────────
  'nodal analysis':        { level: 'C4', verbs: ['analyze', 'calculate', 'formulate', 'differentiate'] },
  'mesh analysis':         { level: 'C4', verbs: ['analyze', 'calculate', 'formulate'] },
  'supermesh':             { level: 'C4', verbs: ['analyze', 'calculate', 'formulate'] },
  'supernode':             { level: 'C4', verbs: ['analyze', 'calculate', 'formulate'] },
  'thevenin':              { level: 'C4', verbs: ['analyze', 'simplify', 'calculate'] },
  'norton':                { level: 'C4', verbs: ['analyze', 'simplify', 'calculate'] },
  'superposition':         { level: 'C4', verbs: ['analyze', 'evaluate', 'calculate'] },
  'maximum power transfer':{ level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'delta-wye':             { level: 'C3', verbs: ['apply', 'convert', 'calculate'] },
  'delta wye':             { level: 'C3', verbs: ['apply', 'convert', 'calculate'] },
  'wye-delta':             { level: 'C3', verbs: ['apply', 'convert', 'calculate'] },
  'three-phase':           { level: 'C4', verbs: ['analyze', 'calculate', 'formulate'] },
  'three phase':           { level: 'C4', verbs: ['analyze', 'calculate', 'formulate'] },
  'kirchhoff':             { level: 'C3', verbs: ['apply', 'solve', 'calculate'] },
  'ohm\'s law':            { level: 'C2', verbs: ['explain', 'describe', 'interpret'] },
  'circuit element':       { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'passive element':       { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'ac circuit':            { level: 'C4', verbs: ['analyze', 'calculate', 'formulate'] },
  'phasor':                { level: 'C4', verbs: ['analyze', 'calculate', 'apply'] },
  'impedance':             { level: 'C4', verbs: ['calculate', 'analyze', 'apply'] },
  'resonance':             { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'transformer':           { level: 'C3', verbs: ['apply', 'calculate', 'demonstrate'] },
  'op-amp':                { level: 'C3', verbs: ['apply', 'implement', 'design'] },
  'diode':                 { level: 'C3', verbs: ['apply', 'analyze', 'calculate'] },
  'transistor':            { level: 'C4', verbs: ['analyze', 'design', 'calculate'] },

  // ── Digital Logic / Computer Architecture ─────────────────────────────────
  'finite automata':       { level: 'C6', verbs: ['design', 'construct', 'formulate'] },
  'dfa':                   { level: 'C6', verbs: ['design', 'construct', 'formulate'] },
  'nfa':                   { level: 'C6', verbs: ['design', 'construct', 'formulate'] },
  'regular expression':    { level: 'C3', verbs: ['apply', 'construct', 'implement'] },
  'context-free grammar':  { level: 'C4', verbs: ['analyze', 'construct', 'differentiate'] },
  'turing machine':        { level: 'C6', verbs: ['design', 'construct', 'formulate'] },
  'boolean algebra':       { level: 'C3', verbs: ['apply', 'simplify', 'solve'] },
  'logic gate':            { level: 'C3', verbs: ['implement', 'apply', 'construct'] },
  'flip-flop':             { level: 'C3', verbs: ['implement', 'apply', 'design'] },
  'flip flop':             { level: 'C3', verbs: ['implement', 'apply', 'design'] },
  'interrupt':             { level: 'C2', verbs: ['explain', 'describe', 'distinguish'] },
  'memory management':     { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'cache memory':          { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'cache':                 { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'pipeline':              { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'virtual memory':        { level: 'C4', verbs: ['analyze', 'explain', 'evaluate'] },
  // ── Digital Electronics (expanded) ────────────────────────────────────────
  'numbering system':      { level: 'C1', verbs: ['identify', 'list', 'describe'] },
  'number system':         { level: 'C1', verbs: ['identify', 'list', 'describe'] },
  'conversion method':     { level: 'C2', verbs: ['explain', 'convert', 'demonstrate'] },
  'universal gate':        { level: 'C3', verbs: ['implement', 'apply', 'construct'] },
  'compound logic':        { level: 'C3', verbs: ['implement', 'apply', 'construct'] },
  'truth table':           { level: 'C3', verbs: ['construct', 'apply', 'implement'] },
  'sop':                   { level: 'C3', verbs: ['apply', 'implement', 'design'] },
  'sum of products':       { level: 'C3', verbs: ['apply', 'implement', 'design'] },
  'pos':                   { level: 'C3', verbs: ['apply', 'implement', 'design'] },
  'product of sums':       { level: 'C3', verbs: ['apply', 'implement', 'design'] },
  'adder':                 { level: 'C3', verbs: ['implement', 'design', 'construct'] },
  'programmable logic':    { level: 'C3', verbs: ['implement', 'apply', 'design'] },
  'register':              { level: 'C3', verbs: ['implement', 'design', 'apply'] },
  'cmos':                  { level: 'C4', verbs: ['analyze', 'design', 'implement'] },
  'nmos':                  { level: 'C4', verbs: ['analyze', 'design', 'calculate'] },
  'pmos':                  { level: 'C4', verbs: ['analyze', 'design', 'calculate'] },
  'inverter':              { level: 'C3', verbs: ['implement', 'design', 'calculate'] },
  'rom':                   { level: 'C2', verbs: ['describe', 'classify', 'compare'] },
  'ram':                   { level: 'C3', verbs: ['implement', 'design', 'compare'] },
  'eprom':                 { level: 'C2', verbs: ['describe', 'classify', 'compare'] },
  'eeprom':                { level: 'C2', verbs: ['describe', 'classify', 'compare'] },
  'memory organization':   { level: 'C2', verbs: ['describe', 'classify', 'explain'] },
  'memory system':         { level: 'C2', verbs: ['describe', 'classify', 'explain'] },
  'secondary memory':      { level: 'C2', verbs: ['describe', 'classify', 'compare'] },
  'rise time':             { level: 'C4', verbs: ['calculate', 'analyze', 'evaluate'] },
  'fall time':             { level: 'C4', verbs: ['calculate', 'analyze', 'evaluate'] },
  'power calculation':     { level: 'C4', verbs: ['calculate', 'analyze', 'evaluate'] },
  'dynamic power':         { level: 'C4', verbs: ['calculate', 'analyze', 'evaluate'] },
  'static power':          { level: 'C4', verbs: ['calculate', 'analyze', 'evaluate'] },
  'converter':             { level: 'C3', verbs: ['design', 'implement', 'apply'] },
  'falstad':               { level: 'C3', verbs: ['design', 'implement', 'simulate'] },

  // ── Networking / Communication ────────────────────────────────────────────
  'tcp/ip':                { level: 'C2', verbs: ['explain', 'describe', 'classify'] },
  'osi model':             { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'iso/osi':               { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'ip addressing':         { level: 'C3', verbs: ['apply', 'calculate', 'configure'] },
  'ipv4':                  { level: 'C3', verbs: ['apply', 'calculate', 'configure'] },
  'ipv6':                  { level: 'C3', verbs: ['apply', 'configure', 'implement'] },
  'subnet':                { level: 'C3', verbs: ['calculate', 'apply', 'configure'] },
  'network topology':      { level: 'C2', verbs: ['describe', 'classify', 'compare'] },
  'topology':              { level: 'C2', verbs: ['describe', 'classify', 'identify'] },
  'lan':                   { level: 'C2', verbs: ['describe', 'classify', 'explain'] },
  'wan':                   { level: 'C2', verbs: ['describe', 'classify', 'explain'] },
  'network hardware':      { level: 'C2', verbs: ['describe', 'identify', 'classify'] },
  'http':                  { level: 'C2', verbs: ['explain', 'describe', 'classify'] },
  'ftp':                   { level: 'C2', verbs: ['explain', 'describe', 'classify'] },
  'routing':               { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'multiplexing':          { level: 'C3', verbs: ['apply', 'calculate', 'implement'] },
  'modulation':            { level: 'C3', verbs: ['apply', 'calculate', 'implement'] },
  'error detection':       { level: 'C3', verbs: ['apply', 'calculate', 'implement'] },
  'error correction':      { level: 'C3', verbs: ['apply', 'calculate', 'implement'] },
  'hamming code':          { level: 'C3', verbs: ['apply', 'calculate', 'implement'] },
  'crc':                   { level: 'C3', verbs: ['apply', 'calculate', 'compute'] },
  'cryptography':          { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  // Extended networking (Computer Networks / ETE courses)
  'ethernet':              { level: 'C2', verbs: ['describe', 'explain', 'identify'] },
  'vlan':                  { level: 'C3', verbs: ['configure', 'implement', 'apply'] },
  'vlsm':                  { level: 'C3', verbs: ['calculate', 'apply', 'design'] },
  'configuration':         { level: 'C3', verbs: ['configure', 'implement', 'apply'] },
  'configuring':           { level: 'C3', verbs: ['configure', 'implement', 'apply'] },
  'switch':                { level: 'C3', verbs: ['configure', 'implement', 'manage'] },
  'router':                { level: 'C3', verbs: ['configure', 'implement', 'manage'] },
  'dhcp':                  { level: 'C2', verbs: ['explain', 'configure', 'describe'] },
  'dns':                   { level: 'C2', verbs: ['explain', 'describe', 'configure'] },
  'nat':                   { level: 'C3', verbs: ['configure', 'apply', 'implement'] },
  'firewall':              { level: 'C4', verbs: ['analyze', 'configure', 'evaluate'] },
  'wireless':              { level: 'C3', verbs: ['configure', 'implement', 'apply'] },
  'switching':             { level: 'C3', verbs: ['configure', 'implement', 'apply'] },
  'frame relay':           { level: 'C3', verbs: ['configure', 'apply', 'implement'] },
  'network layer':         { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'transport layer':       { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'application layer':     { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'data link':             { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'physical layer':        { level: 'C2', verbs: ['describe', 'explain', 'identify'] },
  'network security':      { level: 'C4', verbs: ['analyze', 'evaluate', 'implement'] },
  'access control':        { level: 'C3', verbs: ['implement', 'configure', 'apply'] },
  'bandwidth':             { level: 'C2', verbs: ['calculate', 'describe', 'explain'] },
  'protocol':              { level: 'C2', verbs: ['describe', 'explain', 'classify'] },
  'socket':                { level: 'C3', verbs: ['implement', 'apply', 'develop'] },
  'network programming':   { level: 'C3', verbs: ['implement', 'develop', 'apply'] },

  // ── Software Engineering / Programming ───────────────────────────────────
  'design pattern':        { level: 'C6', verbs: ['design', 'construct', 'formulate'] },
  'object-oriented':       { level: 'C3', verbs: ['implement', 'apply', 'demonstrate'] },
  'data structure':        { level: 'C3', verbs: ['implement', 'apply', 'construct'] },
  'algorithm':             { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'sorting':               { level: 'C3', verbs: ['implement', 'apply', 'analyze'] },
  'searching':             { level: 'C3', verbs: ['implement', 'apply', 'analyze'] },
  'complexity':            { level: 'C4', verbs: ['analyze', 'evaluate', 'calculate'] },
  'database':              { level: 'C3', verbs: ['implement', 'design', 'apply'] },
  'sql':                   { level: 'C3', verbs: ['implement', 'apply', 'construct'] },
  'normalization':         { level: 'C4', verbs: ['analyze', 'evaluate', 'apply'] },
  'software testing':      { level: 'C5', verbs: ['evaluate', 'critique', 'appraise'] },
  'agile':                 { level: 'C3', verbs: ['apply', 'implement', 'demonstrate'] },

  // ── Mobile / Flutter ─────────────────────────────────────────────────────
  'flutter':               { level: 'C3', verbs: ['implement', 'apply', 'develop'] },
  'state management':      { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'api integration':       { level: 'C3', verbs: ['implement', 'apply', 'develop'] },
  'authentication':        { level: 'C3', verbs: ['implement', 'apply', 'design'] },
  'ui design':             { level: 'C6', verbs: ['design', 'create', 'construct'] },

  // ── AI / Machine Learning / Expert Systems ────────────────────────────────
  'neural network':        { level: 'C3', verbs: ['implement', 'design', 'compare'] },
  'perceptron':            { level: 'C3', verbs: ['implement', 'design', 'compare'] },
  'back propagation':      { level: 'C3', verbs: ['implement', 'design', 'compare'] },
  'backpropagation':       { level: 'C3', verbs: ['implement', 'design', 'compare'] },
  'activation function':   { level: 'C3', verbs: ['implement', 'apply', 'compare'] },
  'deep learning':         { level: 'C4', verbs: ['analyze', 'evaluate', 'design'] },
  'convolutional':         { level: 'C4', verbs: ['analyze', 'design', 'implement'] },
  'recurrent neural':      { level: 'C4', verbs: ['analyze', 'design', 'implement'] },
  'reinforcement learning':{ level: 'C4', verbs: ['analyze', 'evaluate', 'design'] },
  'supervised learning':   { level: 'C3', verbs: ['implement', 'apply', 'compare'] },
  'unsupervised learning': { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'classification':        { level: 'C3', verbs: ['implement', 'apply', 'compare'] },
  'regression':            { level: 'C3', verbs: ['implement', 'apply', 'calculate'] },
  'clustering':            { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'fuzzy logic':           { level: 'C3', verbs: ['apply', 'implement', 'design'] },
  'expert system':         { level: 'C3', verbs: ['design', 'implement', 'apply'] },
  'knowledge base':        { level: 'C3', verbs: ['design', 'implement', 'construct'] },
  'inference':             { level: 'C4', verbs: ['analyze', 'evaluate', 'derive'] },
  'intelligent agent':     { level: 'C3', verbs: ['design', 'implement', 'apply'] },
  'search strateg':        { level: 'C3', verbs: ['implement', 'apply', 'analyze'] },
  'heuristic':             { level: 'C4', verbs: ['analyze', 'evaluate', 'apply'] },
  'alpha-beta':            { level: 'C4', verbs: ['analyze', 'evaluate', 'implement'] },
  'alpha beta':            { level: 'C4', verbs: ['analyze', 'evaluate', 'implement'] },
  'game tree':             { level: 'C4', verbs: ['analyze', 'evaluate', 'construct'] },
  'constraint satisfaction':{ level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'first order logic':     { level: 'C4', verbs: ['analyze', 'formulate', 'evaluate'] },
  'propositional logic':   { level: 'C3', verbs: ['apply', 'construct', 'evaluate'] },
  'bayes':                 { level: 'C4', verbs: ['analyze', 'calculate', 'apply'] },
  'probabilistic reasoning':{ level: 'C4', verbs: ['analyze', 'evaluate', 'calculate'] },
  'decision tree':         { level: 'C3', verbs: ['implement', 'apply', 'construct'] },
  'genetic algorithm':     { level: 'C4', verbs: ['analyze', 'design', 'implement'] },
  'natural language':      { level: 'C4', verbs: ['analyze', 'design', 'implement'] },
  'computer vision':       { level: 'C4', verbs: ['analyze', 'design', 'implement'] },
  'matlab':                { level: 'C3', verbs: ['implement', 'design', 'simulate'] },
  'mcculloch':             { level: 'C3', verbs: ['implement', 'design', 'compare'] },
  'wumpus':                { level: 'C3', verbs: ['implement', 'apply', 'analyze'] },
  'art neural':            { level: 'C3', verbs: ['implement', 'design', 'simulate'] },

  // ── Basic Sciences (Math, Physics, Chemistry) ───────────────────────────
  'calculus':              { level: 'C3', verbs: ['calculate', 'derive', 'solve'] },
  'differential equation': { level: 'C3', verbs: ['calculate', 'solve', 'apply'] },
  'linear algebra':        { level: 'C3', verbs: ['compute', 'solve', 'apply'] },
  'probability':           { level: 'C4', verbs: ['analyze', 'calculate', 'predict'] },
  'statistics':            { level: 'C4', verbs: ['analyze', 'interpret', 'calculate'] },
  'quantum mechanics':     { level: 'C4', verbs: ['analyze', 'calculate', 'derive'] },
  'thermodynamics':        { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'kinematics':            { level: 'C3', verbs: ['calculate', 'apply', 'solve'] },
  'organic chemistry':     { level: 'C4', verbs: ['analyze', 'synthesize', 'differentiate'] },
  'chemical kinetics':     { level: 'C4', verbs: ['analyze', 'calculate', 'determine'] },

  // ── Humanities, Literature & Social Sciences ────────────────────────────
  'literature':            { level: 'C4', verbs: ['analyze', 'interpret', 'critique'] },
  'poetry':                { level: 'C5', verbs: ['critique', 'interpret', 'evaluate'] },
  'historical analysis':   { level: 'C4', verbs: ['analyze', 'compare', 'evaluate'] },
  'philosophy':            { level: 'C5', verbs: ['evaluate', 'argue', 'critique'] },
  'ethics':                { level: 'C5', verbs: ['evaluate', 'judge', 'defend'] },
  'sociology':             { level: 'C4', verbs: ['analyze', 'examine', 'compare'] },
  'psychology':            { level: 'C4', verbs: ['analyze', 'evaluate', 'explain'] },
  'cognitive behavior':    { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'anthropology':          { level: 'C4', verbs: ['analyze', 'compare', 'examine'] },
  'political science':     { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },

  // ── Education & Teaching (B.Ed / M.Ed) ──────────────────────────────────
  'pedagogy':              { level: 'C4', verbs: ['analyze', 'apply', 'evaluate'] },
  'curriculum design':     { level: 'C6', verbs: ['design', 'develop', 'construct'] },
  'lesson planning':       { level: 'C6', verbs: ['design', 'formulate', 'prepare'] },
  'student assessment':    { level: 'C5', verbs: ['evaluate', 'assess', 'measure'] },
  'inclusive education':   { level: 'C4', verbs: ['analyze', 'evaluate', 'implement'] },
  'classroom management':  { level: 'C3', verbs: ['implement', 'apply', 'manage'] },

  // ── Architecture & Civil Engineering ────────────────────────────────────
  'urban planning':        { level: 'C6', verbs: ['design', 'develop', 'plan'] },
  'structural analysis':   { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'auto cad':              { level: 'C3', verbs: ['draft', 'design', 'implement'] },
  'autocad':               { level: 'C3', verbs: ['draft', 'design', 'implement'] },
  'building materials':    { level: 'C2', verbs: ['describe', 'classify', 'select'] },
  'fluid mechanics':       { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'surveying':             { level: 'C3', verbs: ['conduct', 'measure', 'apply'] },

  // ── Media, Journalism & Fine Arts ───────────────────────────────────────
  'journalism':            { level: 'C4', verbs: ['investigate', 'analyze', 'report'] },
  'mass communication':    { level: 'C4', verbs: ['analyze', 'evaluate', 'examine'] },
  'creative writing':      { level: 'C6', verbs: ['compose', 'create', 'draft'] },
  'graphic design':        { level: 'C6', verbs: ['design', 'create', 'construct'] },
  'film production':       { level: 'C6', verbs: ['produce', 'direct', 'design'] },

  // ── Agriculture & Environmental Science ─────────────────────────────────
  'agronomy':              { level: 'C3', verbs: ['apply', 'manage', 'implement'] },
  'soil science':          { level: 'C4', verbs: ['analyze', 'evaluate', 'test'] },
  'plant breeding':        { level: 'C5', verbs: ['evaluate', 'select', 'develop'] },
  'pest management':       { level: 'C4', verbs: ['analyze', 'formulate', 'control'] },
  'horticulture':          { level: 'C3', verbs: ['cultivate', 'apply', 'manage'] },
  'climate change':        { level: 'C4', verbs: ['analyze', 'evaluate', 'predict'] },
  'sustainability':        { level: 'C5', verbs: ['evaluate', 'assess', 'propose'] },
  'ecology':               { level: 'C4', verbs: ['analyze', 'examine', 'compare'] },
  'hydrology':             { level: 'C4', verbs: ['analyze', 'measure', 'calculate'] },
  'animal husbandry':      { level: 'C3', verbs: ['manage', 'apply', 'implement'] },

  // ── Commerce, Business & Economics ──────────────────────────────────────
  'corporate finance':     { level: 'C4', verbs: ['analyze', 'evaluate', 'calculate'] },
  'macroeconomics':        { level: 'C4', verbs: ['analyze', 'evaluate', 'predict'] },
  'microeconomics':        { level: 'C4', verbs: ['analyze', 'differentiate', 'evaluate'] },
  'accounting':            { level: 'C3', verbs: ['prepare', 'calculate', 'apply'] },
  'auditing':              { level: 'C5', verbs: ['evaluate', 'assess', 'verify'] },
  'marketing strategy':    { level: 'C6', verbs: ['design', 'formulate', 'develop'] },
  'consumer behavior':     { level: 'C4', verbs: ['analyze', 'examine', 'evaluate'] },
  'supply chain':          { level: 'C4', verbs: ['analyze', 'optimize', 'evaluate'] },
  'human resources':       { level: 'C4', verbs: ['analyze', 'manage', 'evaluate'] },
  'entrepreneurship':      { level: 'C6', verbs: ['create', 'design', 'formulate'] },
  'business law':          { level: 'C4', verbs: ['analyze', 'interpret', 'apply'] },

  // ── Pure Sciences ───────────────────────────────────────────────────────
  'genetics':              { level: 'C4', verbs: ['analyze', 'predict', 'evaluate'] },
  'molecular biology':     { level: 'C4', verbs: ['analyze', 'differentiate', 'examine'] },
  'microbiology':          { level: 'C4', verbs: ['analyze', 'identify', 'classify'] },
  'biochemistry':          { level: 'C4', verbs: ['analyze', 'explain', 'evaluate'] },
  'spectroscopy':          { level: 'C4', verbs: ['analyze', 'interpret', 'determine'] },
  'electromagnetism':      { level: 'C4', verbs: ['analyze', 'calculate', 'apply'] },

  // ── Social Sciences ─────────────────────────────────────────────────────
  'cognitive psychology':  { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'abnormal psychology':   { level: 'C4', verbs: ['analyze', 'diagnose', 'evaluate'] },
  'sociological theory':   { level: 'C4', verbs: ['analyze', 'compare', 'critique'] },
  'political theory':      { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'international relations':{ level: 'C4', verbs: ['analyze', 'evaluate', 'assess'] },
  'public policy':         { level: 'C5', verbs: ['evaluate', 'formulate', 'critique'] },
  'qualitative research':  { level: 'C4', verbs: ['analyze', 'conduct', 'evaluate'] },
  'quantitative research': { level: 'C4', verbs: ['analyze', 'calculate', 'interpret'] },

  // ── Arts, Humanities & Literature ───────────────────────────────────────
  'literary criticism':    { level: 'C5', verbs: ['critique', 'evaluate', 'analyze'] },
  'art history':           { level: 'C4', verbs: ['analyze', 'compare', 'critique'] },
  'linguistics':           { level: 'C4', verbs: ['analyze', 'differentiate', 'classify'] },
  'phonetics':             { level: 'C3', verbs: ['transcribe', 'apply', 'analyze'] },

  // ── Public Health & Medicine ────────────────────────────────────────────
  'epidemiology':          { level: 'C4', verbs: ['analyze', 'investigate', 'evaluate'] },
  'biostatistics':         { level: 'C4', verbs: ['analyze', 'calculate', 'interpret'] },
  'anatomy':               { level: 'C1', verbs: ['identify', 'describe', 'list'] },
  'physiology':            { level: 'C2', verbs: ['explain', 'describe', 'summarize'] },
  'pharmacology':          { level: 'C4', verbs: ['analyze', 'evaluate', 'apply'] },
  'pathology':             { level: 'C4', verbs: ['analyze', 'diagnose', 'identify'] },
  'global health':         { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'health promotion':      { level: 'C6', verbs: ['design', 'develop', 'implement'] },

  // ── Law & Legal Studies ─────────────────────────────────────────────────
  'constitutional law':    { level: 'C4', verbs: ['analyze', 'interpret', 'evaluate'] },
  'criminal law':          { level: 'C4', verbs: ['analyze', 'differentiate', 'interpret'] },
  'contract law':          { level: 'C4', verbs: ['analyze', 'draft', 'interpret'] },
  'jurisprudence':         { level: 'C5', verbs: ['evaluate', 'critique', 'argue'] },
  'torts':                 { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'human rights':          { level: 'C4', verbs: ['analyze', 'advocate', 'evaluate'] },
  'penal code':            { level: 'C4', verbs: ['analyze', 'interpret', 'apply'] },
  'contract act':          { level: 'C4', verbs: ['analyze', 'interpret', 'draft'] },
  'company law':           { level: 'C4', verbs: ['analyze', 'interpret', 'apply'] },
  'family law':            { level: 'C4', verbs: ['analyze', 'interpret', 'evaluate'] },
  'labor law':             { level: 'C4', verbs: ['analyze', 'interpret', 'apply'] },
  'law of torts':          { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'code of civil procedure': { level: 'C3', verbs: ['apply', 'demonstrate', 'draft'] },
  'code of criminal':      { level: 'C3', verbs: ['apply', 'demonstrate', 'draft'] },

  // ── Modern Tech, DevOps & Emerging ──────────────────────────────────────
  'cloud computing':       { level: 'C4', verbs: ['analyze', 'deploy', 'evaluate'] },
  'devops':                { level: 'C4', verbs: ['analyze', 'implement', 'automate'] },
  'cybersecurity':         { level: 'C4', verbs: ['analyze', 'evaluate', 'secure'] },
  'blockchain':            { level: 'C4', verbs: ['analyze', 'implement', 'evaluate'] },
  'internet of things':    { level: 'C4', verbs: ['analyze', 'design', 'implement'] },
  'data science':          { level: 'C4', verbs: ['analyze', 'model', 'evaluate'] },

  // ── Advanced Engineering ────────────────────────────────────────────────
  'fluid dynamics':        { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'solid mechanics':       { level: 'C4', verbs: ['analyze', 'calculate', 'determine'] },
  'aerodynamics':          { level: 'C4', verbs: ['analyze', 'calculate', 'predict'] },
  'robotics':              { level: 'C6', verbs: ['design', 'build', 'program'] },
  'mechatronics':          { level: 'C6', verbs: ['design', 'integrate', 'implement'] },
  'finite element':        { level: 'C4', verbs: ['analyze', 'simulate', 'calculate'] },
  'control systems':       { level: 'C4', verbs: ['analyze', 'design', 'evaluate'] },
  'mass transfer':         { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'geotechnical':          { level: 'C4', verbs: ['analyze', 'assess', 'calculate'] },

  // ── Advanced Computer Science ───────────────────────────────────────────
  'human computer interaction': { level: 'C6', verbs: ['design', 'evaluate', 'prototype'] },
  'natural language processing':{ level: 'C4', verbs: ['analyze', 'implement', 'train'] },
  'computer graphics':     { level: 'C6', verbs: ['design', 'render', 'implement'] },
  'compiler design':       { level: 'C6', verbs: ['design', 'construct', 'implement'] },
  'operating system':      { level: 'C4', verbs: ['analyze', 'implement', 'manage'] },
  'distributed system':    { level: 'C4', verbs: ['analyze', 'design', 'evaluate'] },
  'data mining':           { level: 'C4', verbs: ['analyze', 'extract', 'evaluate'] },

  // ── Nursing & Allied Health ─────────────────────────────────────────────
  'nursing care':          { level: 'C3', verbs: ['administer', 'implement', 'manage'] },
  'midwifery':             { level: 'C3', verbs: ['assist', 'manage', 'monitor'] },
  'kinesiology':           { level: 'C4', verbs: ['analyze', 'assess', 'evaluate'] },
  'nutrition':             { level: 'C4', verbs: ['analyze', 'formulate', 'evaluate'] },
  'dietetics':             { level: 'C6', verbs: ['design', 'formulate', 'prescribe'] },
  'pharmacokinetics':      { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'pediatrics':            { level: 'C4', verbs: ['analyze', 'diagnose', 'assess'] },
  'physiotherapy':         { level: 'C3', verbs: ['apply', 'treat', 'rehabilitate'] },

  // ── Advanced Mathematics ────────────────────────────────────────────────
  'real analysis':         { level: 'C5', verbs: ['prove', 'evaluate', 'formulate'] },
  'complex analysis':      { level: 'C5', verbs: ['prove', 'evaluate', 'calculate'] },
  'number theory':         { level: 'C5', verbs: ['prove', 'formulate', 'evaluate'] },
  'differential geometry': { level: 'C4', verbs: ['analyze', 'calculate', 'derive'] },
  'numerical methods':     { level: 'C3', verbs: ['compute', 'solve', 'apply'] },

  // ── Specialized Education ───────────────────────────────────────────────
  'special education':     { level: 'C4', verbs: ['analyze', 'adapt', 'implement'] },
  'early childhood':       { level: 'C3', verbs: ['implement', 'facilitate', 'manage'] },
  'instructional design':  { level: 'C6', verbs: ['design', 'develop', 'create'] },
  'tesol':                 { level: 'C4', verbs: ['analyze', 'instruct', 'evaluate'] },
  'bilingual education':   { level: 'C4', verbs: ['analyze', 'implement', 'assess'] },

  // ── Applied Arts & Architecture ─────────────────────────────────────────
  'music theory':          { level: 'C4', verbs: ['analyze', 'interpret', 'differentiate'] },
  'music composition':     { level: 'C6', verbs: ['compose', 'create', 'arrange'] },
  'industrial design':     { level: 'C6', verbs: ['design', 'prototype', 'develop'] },
  'fashion design':        { level: 'C6', verbs: ['design', 'create', 'construct'] },
  'typography':            { level: 'C6', verbs: ['design', 'format', 'apply'] },
  'cinematography':        { level: 'C6', verbs: ['direct', 'produce', 'compose'] },
  'landscape architecture':{ level: 'C6', verbs: ['design', 'plan', 'develop'] },
  'interior design':       { level: 'C6', verbs: ['design', 'plan', 'construct'] },

  // ── Vocational & Applied Management ─────────────────────────────────────
  'hospitality management':{ level: 'C3', verbs: ['manage', 'coordinate', 'implement'] },
  'tourism':               { level: 'C4', verbs: ['analyze', 'plan', 'evaluate'] },
  'culinary arts':         { level: 'C6', verbs: ['prepare', 'create', 'design'] },
  'event management':      { level: 'C6', verbs: ['plan', 'organize', 'coordinate'] },
  'aviation':              { level: 'C3', verbs: ['operate', 'navigate', 'apply'] },
  'logistics':             { level: 'C4', verbs: ['analyze', 'coordinate', 'optimize'] },

  // ── CSE, SWE & CIS ─────────────────────────────────────────────────────
  'software architecture': { level: 'C6', verbs: ['design', 'formulate', 'architect'] },
  'agile methodology':     { level: 'C3', verbs: ['apply', 'implement', 'manage'] },
  'quality assurance':     { level: 'C5', verbs: ['evaluate', 'verify', 'validate'] },
  'system analysis':       { level: 'C4', verbs: ['analyze', 'evaluate', 'model'] },
  'management information':{ level: 'C4', verbs: ['analyze', 'evaluate', 'integrate'] },
  'enterprise resource':   { level: 'C4', verbs: ['analyze', 'implement', 'integrate'] },
  'e-commerce':            { level: 'C6', verbs: ['design', 'develop', 'implement'] },
  'web engineering':       { level: 'C6', verbs: ['design', 'develop', 'deploy'] },
  'mobile application':    { level: 'C6', verbs: ['develop', 'design', 'implement'] },
  'data warehousing':      { level: 'C4', verbs: ['analyze', 'design', 'implement'] },

  // ── EEE & ETE ───────────────────────────────────────────────────────────
  'power system':          { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'electrical machine':    { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'control system':        { level: 'C4', verbs: ['analyze', 'design', 'evaluate'] },
  'vlsi':                  { level: 'C6', verbs: ['design', 'implement', 'layout'] },
  'signal processing':     { level: 'C4', verbs: ['analyze', 'compute', 'filter'] },
  'telecommunication':     { level: 'C4', verbs: ['analyze', 'evaluate', 'modulate'] },
  'cellular network':      { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'microwave engineering': { level: 'C4', verbs: ['analyze', 'calculate', 'design'] },
  'switchgear':            { level: 'C4', verbs: ['analyze', 'evaluate', 'protect'] },
  'power electronics':     { level: 'C4', verbs: ['analyze', 'design', 'convert'] },

  // ── BBA & Commerce ──────────────────────────────────────────────────────
  'financial accounting':  { level: 'C3', verbs: ['prepare', 'calculate', 'apply'] },
  'managerial accounting': { level: 'C4', verbs: ['analyze', 'evaluate', 'calculate'] },
  'strategic management':  { level: 'C6', verbs: ['formulate', 'design', 'evaluate'] },
  'organizational behavior':{ level: 'C4', verbs: ['analyze', 'evaluate', 'examine'] },
  'human resource':        { level: 'C3', verbs: ['apply', 'manage', 'implement'] },
  'marketing management':  { level: 'C4', verbs: ['analyze', 'evaluate', 'formulate'] },
  'business ethics':       { level: 'C5', verbs: ['evaluate', 'judge', 'defend'] },
  'bank management':       { level: 'C4', verbs: ['analyze', 'evaluate', 'manage'] },

  // ── Textile Engineering ─────────────────────────────────────────────────
  'yarn manufacturing':    { level: 'C3', verbs: ['apply', 'process', 'manage'] },
  'fabric manufacturing':  { level: 'C3', verbs: ['apply', 'process', 'manage'] },
  'wet processing':        { level: 'C4', verbs: ['analyze', 'formulate', 'apply'] },
  'apparel manufacturing': { level: 'C3', verbs: ['apply', 'manage', 'implement'] },
  'textile testing':       { level: 'C5', verbs: ['evaluate', 'test', 'analyze'] },
  'quality control':       { level: 'C5', verbs: ['evaluate', 'inspect', 'control'] },

  // ── Pharmacy & Allied Health ────────────────────────────────────────────
  'pharmaceutics':         { level: 'C6', verbs: ['formulate', 'design', 'prepare'] },
  'medicinal chemistry':   { level: 'C4', verbs: ['analyze', 'synthesize', 'differentiate'] },
  'biopharmaceutics':      { level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },
  'clinical pharmacy':     { level: 'C5', verbs: ['evaluate', 'assess', 'monitor'] },

  // ── Civil Engineering ───────────────────────────────────────────────────
  'reinforced concrete':   { level: 'C6', verbs: ['design', 'calculate', 'analyze'] },
  'transportation engineering':{ level: 'C6', verbs: ['design', 'plan', 'evaluate'] },
  'environmental engineering':{ level: 'C4', verbs: ['analyze', 'evaluate', 'design'] },
  'geotechnical engineering':{ level: 'C4', verbs: ['analyze', 'calculate', 'evaluate'] },

  // ── Economics & Development Studies ──────────────────────────────────────
  'development economics': { level: 'C4', verbs: ['analyze', 'evaluate', 'compare'] },
  'bangladesh economy':    { level: 'C4', verbs: ['analyze', 'examine', 'evaluate'] },
  'econometrics':          { level: 'C4', verbs: ['analyze', 'calculate', 'model'] },

  // ── Generic academic patterns ─────────────────────────────────────────────
  'introduction to':       { level: 'C1', verbs: ['define', 'list', 'state', 'identify'] },
  'definition of':         { level: 'C1', verbs: ['define', 'list', 'state'] },
  'basic concept':         { level: 'C1', verbs: ['define', 'list', 'state', 'recall'] },
  'overview':              { level: 'C1', verbs: ['list', 'state', 'identify'] },
  'hands on project':      { level: 'C3', verbs: ['apply', 'implement', 'demonstrate'] },
  'project presentation':  { level: 'C3', verbs: ['apply', 'demonstrate', 'present'] },
  'lab':                   { level: 'C3', verbs: ['apply', 'implement', 'demonstrate'] },
  'case study':            { level: 'C4', verbs: ['analyze', 'evaluate', 'differentiate'] },
  'review':                { level: 'C2', verbs: ['summarize', 'review', 'describe'] },
};

// ── Pre-compiled word-boundary patterns for O(1) safe matching ────────────────
// Prevents substring false positives (e.g. "ram" matching inside "program")
function _escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const _MATRIX_PATTERNS = Object.keys(DOMAIN_TOPIC_MATRIX)
  .sort((a, b) => b.length - a.length)
  .map(key => ({
    key,
    regex: new RegExp(`\\b${_escapeRegex(key)}`, 'i'),  // \b at start prevents mid-word matches
    entry: DOMAIN_TOPIC_MATRIX[key],
  }));

// ── CO extraction ─────────────────────────────────────────────────────────────

/**
 * Extract Course Outcomes from raw document text.
 *
 * Handles real DIU course profile formats — confirmed against the document
 * extracted via mammoth where:
 *   - "CO1" appears alone on a line, followed by the CO text on the next line
 *   - "CO1: text" inline format
 *   - "Course Outcome 1: text" format
 *   - Numbered list under a "Course Outcome" section header
 *
 * Strips preamble phrases. Rejects table cells (PO mappings, weights).
 */
function extractCourseOutcomes(text) {
  const cos = [];

  const PREAMBLE_RE = /^(be\s+able\s+to|students?\s+will\s+be\s+able\s+to|students?\s+will|at\s+the\s+end\s+of\s+the\s+course[^,]*,\s*students?\s+will\s+be\s+able\s+to|upon\s+completion[^,]*,\s*students?\s+will|after\s+completing[^,]*,\s*students?\s+will)\s*/i;

  function isValidCoText(t) {
    if (!t || t.length < 25) return false;
    // Reject lines that are clearly not CO statements
    if (/^(quiz|midterm|final|assignment|q\/a|presentation|brainstorm|demonstration|lecture|discussion|group\s+work|problem.solving|tutorial|seminar|workshop|po\s*\d|c\.?o\.?\s*\d\s*$)/i.test(t.trim())) return false;
    if (/^\d+\s*$/.test(t.trim())) return false; // pure number (PO weight)
    if (/^correlation\s*[:\-]/i.test(t.trim())) return false;
    return true;
  }

  function cleanCoText(raw) {
    return raw.replace(/\s+/g, ' ').trim().replace(PREAMBLE_RE, '').trim();
  }

  // ── Pattern A: CO code on its own line, text on the next non-empty line ──
  // This matches the actual mammoth output structure for DIU course profiles.
  // Example:
  //   "CO1\n\nDemonstrate systematically to obtain the equations..."
  const lines = text.split('\n').map(l => l.trim());

  // Find the "Course Outcomes:" header to scope the search
  let coSectionStart = -1;
  let coSectionEnd   = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/course\s+outcomes?\s*[:.]/i.test(lines[i]) && coSectionStart === -1) {
      coSectionStart = i;
    }
    // End the CO section at the next major heading
    if (coSectionStart !== -1 && i > coSectionStart &&
        /^(\d+\.|part\s+[a-z]|mapping\s+of|po\s*\d|program\s+outcome|teaching|content\s+of)/i.test(lines[i])) {
      coSectionEnd = i;
      break;
    }
  }
  if (coSectionEnd === -1) coSectionEnd = Math.min(lines.length, coSectionStart + 80);

  // Within the CO section, find lines matching just "CO1", "CO 1", "CLO1", etc.
  // and grab the next non-empty line(s) as the text.
  if (coSectionStart !== -1) {
    const CO_LABEL_RE = /^\s*C\.?L?\.?O\.?\s*[-]?\s*(\d+)\s*[:.]?\s*$/i;
    for (let i = coSectionStart; i < coSectionEnd; i++) {
      const m = lines[i].match(CO_LABEL_RE);
      if (!m) continue;
      // Collect the text from the next non-empty lines until we hit another CO label or section break
      let coText = '';
      for (let j = i + 1; j < coSectionEnd; j++) {
        const next = lines[j];
        if (!next) {
          if (coText) break; // empty line ends the CO text
          continue;
        }
        if (CO_LABEL_RE.test(next)) break; // next CO starts
        if (/^(\d+\.|part\s+[a-z]|mapping)/i.test(next)) break;
        coText = coText ? coText + ' ' + next : next;
        if (coText.length > 400) break; // safety cap
      }
      const cleaned = cleanCoText(coText);
      if (isValidCoText(cleaned)) {
        cos.push({ code: `CO${m[1]}`, text: cleaned });
      }
    }
  }
  if (cos.length > 0) return cos;

  // ── Pattern B: Inline "CO1: text" format ──────────────────────────────────
  const co1 = /\b(?:C\.?L?\.?O\.?)\s*[-.]?\s*(\d+)\s*[:.]\s*(.+?)(?=\b(?:C\.?L?\.?O\.?)\s*[-.]?\s*\d+\s*[:.:]|\n\n|$)/gis;
  let m;
  while ((m = co1.exec(text)) !== null) {
    const cleaned = cleanCoText(m[2]);
    if (isValidCoText(cleaned)) {
      cos.push({ code: `CO${m[1]}`, text: cleaned });
    }
  }
  if (cos.length > 0) return cos;

  // ── Pattern C: "Course Outcome N: text" ──────────────────────────────────
  const co2 = /(?:Course\s+)?Outcome\s+(\d+)\s*[:.]\s*(.+?)(?=(?:Course\s+)?Outcome\s+\d+\s*[:.:]|\n\n|$)/gis;
  while ((m = co2.exec(text)) !== null) {
    const cleaned = cleanCoText(m[2]);
    if (isValidCoText(cleaned)) {
      cos.push({ code: `CO${m[1]}`, text: cleaned });
    }
  }

  return cos;
}

/**
 * Extract weekly topics from the course content table.
 *
 * Real DIU format (confirmed via mammoth output):
 *   - Topic content with bullet points
 *   - "Week N" label appears AFTER the content
 *   - Then "Teaching Method" cell
 *   - Then "CO" cell
 *   - Then "Assessment" cell
 *
 * Strategy: find each "Week N" line and walk BACKWARDS to collect the
 * preceding content lines until we hit the previous "Week N-1" or the
 * "PART B" / "Course Content" section header.
 */
function extractWeeklyTopics(text) {
  const lines = text.split('\n').map(l => l.trim());
  
  // 1. The Omni-Catcher Regex
  // Matches: "Week 1", "Wk 1", "W-1", "Chapter 5", "Lec 12", "Module IV", "Unit A", or just "1"
  const OMNI_UNIT_RE = /^(?:Week|Wk|W|Chapter|Ch|Module|Mod|Unit|Lesson|Lec|Class|Sl\.?\s*No\.?)?\s*[\-\.:]?\s*([0-9]{1,2}|[IVX]{1,4}|[A-Z])\s*$/i;
  
  // 2. The Filtration Net
  const SKIP_LINE_RE = /^(brainstorm|demonstration|lecture|discussion|group\s+work|problem.solving|tutorial|seminar|workshop|lab|practical|co\s*\d|co\s*\d\s*,\s*co\s*\d|techniques?|teaching|alignment|time\s+frame|course\s+content|part\s+[a-z]|\d+\s*$|correlation)/i;

  const syllabusMap = new Map();
  const weekIndexes = [];

  // Pass A: Find all timeline anchors
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OMNI_UNIT_RE);
    if (m) {
      const val = m[1];
      const isNum = /^\d+$/.test(val);
      if (isNum && (parseInt(val, 10) < 1 || parseInt(val, 10) > 40)) continue;
      
      let labelType = lines[i].match(/^[a-z]+/i);
      labelType = labelType ? labelType[0] : 'Unit';
      
      // Normalize to a consistent key (e.g. "Week 1")
      const unitKey = `${labelType.charAt(0).toUpperCase() + labelType.slice(1).toLowerCase()} ${val}`;
      weekIndexes.push({ index: i, unitKey });
    }
  }

  // Fallback if no clean timeline column was found (e.g., inline format)
  if (weekIndexes.length === 0) {
    const fallbackWeeks = [];
    const weekRe = /\b(Week|Chapter|Module|Unit|Lesson)\s+(\d{1,2})\s*[:\-]\s*(.+?)(?=\b(?:Week|Chapter|Module|Unit|Lesson)\s+\d{1,2}\s*[:\-]|\n\n|$)/gis;
    let m;
    while ((m = weekRe.exec(text)) !== null) {
      const topics = m[3].replace(/\s+/g, ' ').trim();
      if (topics.length > 5) fallbackWeeks.push({ week: `${m[1]} ${m[2]}`, topics });
    }
    return fallbackWeeks;
  }

  // Pass B: Map & Merge
  for (let w = 0; w < weekIndexes.length; w++) {
    const { index, unitKey } = weekIndexes[w];
    const prevWeekIdx = w > 0 ? weekIndexes[w - 1].index : -1;

    // Collect content lines leading up to this timeline anchor
    const contentLines = [];
    for (let i = Math.max(prevWeekIdx + 1, index - 30); i < index; i++) {
      const ln = lines[i];
      if (!ln || SKIP_LINE_RE.test(ln)) continue;
      
      let cleanedLn = ln;
      if (/^[∩\u2022\u00b7]/.test(cleanedLn)) {
        cleanedLn = cleanedLn.replace(/^[∩\u2022\u00b7][^a-z0-9]*/i, '').trim();
      }
      contentLines.push(cleanedLn);
    }

    let topics = contentLines.join(' ').replace(/\s+/g, ' ').trim();
    topics = topics.replace(/^(?:Sl\.?\s*)?No\.?\s*/i, '').trim();
    topics = topics.replace(/^\d{1,2}\s+/, '').trim();
    topics = topics.replace(/\bQuiz\s*#?\s*\d+.*$/i, '').trim();
    topics = topics.replace(/[\u2018\u2019\u201A\u201B]/g, "'").replace(/[\u201C\u201D\u201E\u201F]/g, '"');

    if (topics.length > 5) {
      // The Engine Core: LIVE MERGING 
      if (syllabusMap.has(unitKey)) {
        syllabusMap.set(unitKey, `${syllabusMap.get(unitKey)} \n ${topics}`);
      } else {
        syllabusMap.set(unitKey, topics);
      }
    }
  }

  // Convert map back to expected array structure
  const finalWeeks = [];
  for (const [unit, content] of syllabusMap.entries()) {
    // Assessment Noise Filtration: Block AI from hallucinating over exams
    if (/class test|midterm|final exam|presentation|assignment/i.test(content) && content.length < 50) {
      // Pass as noise or mapped appropriately (currently passes as a regular week without triggering LLM)
      finalWeeks.push({ week: unit, topics: content });
    } else {
      finalWeeks.push({ week: unit, topics: content });
    }
  }

  return finalWeeks;
}

// ── Reverse mapper ────────────────────────────────────────────────────────────

/**
 * Given a topic string, find the best matching domain entry.
 * Returns { level, verbs, matchedKeyword } or null.
 *
 * @param {string} topicText
 * @returns {{ level: string, verbs: string[], matchedKeyword: string } | null}
 */
function reverseMapTopic(topicText) {
  // Normalize curly apostrophes/quotes to straight so dictionary keys match
  const t = (topicText || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');

  // Assessment Detection: Only block PURE assessment weeks (short text that is entirely exam/test)
  // Don't block weeks that have real lesson content mixed with an exam mention
  const isOnlyAssessment = /^\s*(class test|midterm examination|final exam|lab assessment test|review class\s*mid\s*term|revision)/i.test(t)
    || (/\b(midterm|final)\s+(exam|test)/i.test(t) && t.length < 60);
  if (isOnlyAssessment) {
    return null;
  }

  // Use pre-compiled word-boundary patterns to prevent substring false positives
  for (const { key, regex, entry } of _MATRIX_PATTERNS) {
    if (regex.test(t)) {
      return { ...entry, matchedKeyword: key };
    }
  }
  return null;
}

// ── CO verb extractor ─────────────────────────────────────────────────────────

/**
 * Extract the primary action verb from a CO statement.
 * Returns { verb, level } or null.
 */
function extractCoVerb(coText) {
  const { VERB_INDEX } = require('./clo-mapper-fast');
  const words = coText.toLowerCase().split(/\s+/);

  // Skip common preamble phrases
  const SKIP_PHRASES = ['be able to', 'students will', 'student will', 'students should',
    'the student', 'upon completion', 'after completing', 'be able', 'will be'];
  let cleaned = coText.toLowerCase();
  for (const phrase of SKIP_PHRASES) {
    cleaned = cleaned.replace(phrase, '').trim();
  }

  const toks = cleaned.split(/[\s,;:.()]+/).filter(Boolean);
  for (const tok of toks) {
    const base = tok.replace(/[^a-z]/g, '');
    if (!base || base.length < 3) continue;
    if (VERB_INDEX[base]) {
      const levels = VERB_INDEX[base];
      return { verb: base, level: levels[0], allLevels: levels };
    }
    // Try suffix stripping
    const stripped = base.endsWith('ing') ? base.slice(0, -3)
      : base.endsWith('ed') ? base.slice(0, -2)
      : base.endsWith('s') ? base.slice(0, -1)
      : null;
    if (stripped && VERB_INDEX[stripped]) {
      return { verb: stripped, level: VERB_INDEX[stripped][0], allLevels: VERB_INDEX[stripped] };
    }
  }
  return null;
}

// ── Gap detector ──────────────────────────────────────────────────────────────

/**
 * Compare CO statements against weekly topic mappings.
 * Returns alignment gaps where the CO verb level doesn't match the topic level.
 *
 * @param {{ code, text }[]} cos
 * @param {{ week, topics, mappedLevel, mappedVerbs }[]} mappedWeeks
 * @returns {{ co, gap, suggestion }[]}
 */
function detectAlignmentGaps(cos, mappedWeeks) {
  const gaps = [];

  // Group weeks by their dominant level
  const levelGroups = {};
  for (const w of mappedWeeks) {
    if (!w.mappedLevel) continue;
    if (!levelGroups[w.mappedLevel]) levelGroups[w.mappedLevel] = [];
    levelGroups[w.mappedLevel].push(w);
  }

  // Find the dominant level across all weeks
  const dominantLevel = Object.entries(levelGroups)
    .sort((a, b) => b[1].length - a[1].length)[0]?.[0];

  for (const co of cos) {
    const coVerb = extractCoVerb(co.text);
    const coLevel = coVerb?.level;

    // ── Non-measurable verb check (deterministic, domain-agnostic) ────
    // These verbs cannot be assessed regardless of domain. Flag them always.
    const NON_MEASURABLE = [
      'understand', 'know', 'appreciate', 'be aware', 'be familiar',
      'comprehend', 'realize', 'gain experience', 'gain understanding',
      'gain a foundational', 'gain familiarity', 'learn', 'learn to',
      'explore', 'get familiar', 'develop an understanding',
      'develop a familiarity', 'develop proficiency in',
    ];
    const coLower = co.text.toLowerCase().trim();
    const avoidHit = NON_MEASURABLE.find(v => coLower.startsWith(v));

    if (avoidHit) {
      // Suggest the dominant level from the weekly content
      const levelCounts = {};
      for (const w of mappedWeeks) {
        if (w.mappedLevel) levelCounts[w.mappedLevel] = (levelCounts[w.mappedLevel] || 0) + 1;
      }
      const sortedLevels = Object.keys(levelCounts).sort((a, b) => b.localeCompare(a));
      let suggestedLvl = null;
      for (const lvl of sortedLevels) {
        if (levelCounts[lvl] >= 2) { suggestedLvl = lvl; break; }
      }
      suggestedLvl = suggestedLvl || Object.entries(levelCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'C2';

      const LEVEL_VERBS = {
        C1: ['define', 'list', 'state', 'identify'],
        C2: ['describe', 'explain', 'classify', 'summarize'],
        C3: ['apply', 'implement', 'demonstrate', 'use'],
        C4: ['analyze', 'differentiate', 'contrast', 'examine'],
        C5: ['evaluate', 'critique', 'appraise', 'justify'],
        C6: ['design', 'construct', 'formulate', 'create'],
      };
      const suggestedVerbs = LEVEL_VERBS[suggestedLvl] || ['describe', 'explain', 'apply'];

      gaps.push({
        co:                  co.code,
        co_text:             co.text,
        co_level:            null,
        co_verb:             avoidHit,
        week_range:          'All weeks',
        week_topics:         '',
        expected_level:      suggestedLvl,
        expected_level_name: BLOOMS_NAMES[suggestedLvl] || '',
        gap_type:            'NON_MEASURABLE_VERB',
        gap_description:     `CO uses the non-measurable verb "${avoidHit}". This cannot be assessed or measured. Replace with a specific Bloom's action verb.`,
        suggested_verbs:     suggestedVerbs,
        suggested_rewrite:   `${suggestedVerbs[0].charAt(0).toUpperCase() + suggestedVerbs[0].slice(1)} the core concepts and skills described in this outcome.`,
      });
      continue;
    }

    // Check if CO text contains domain-irrelevant keywords
    const coText = co.text.toLowerCase();
    const irrelevantDomains = [
      { keywords: ['mathematical induction', 'discrete math', 'set theory', 'boolean function', 'propositional logic'],
        label: 'Discrete Mathematics' },
      { keywords: ['sets, functions', 'functions, and relations', 'mathematical objects'],
        label: 'Abstract Mathematics' },
      { keywords: ['literature review', 'research methodology', 'bibliography'],
        label: 'Research Methods' },
    ];

    let domainMismatch = null;
    for (const domain of irrelevantDomains) {
      if (domain.keywords.some(kw => coText.includes(kw))) {
        domainMismatch = domain.label;
        break;
      }
    }

    // Find which weeks are most relevant to this CO (by position heuristic)
    // CO1 → Weeks 1-4, CO2 → Weeks 5-9, CO3 → Weeks 10-14, etc.
    const coNum = parseInt(co.code.replace('CO', ''), 10) || 1;
    const weekStart = (coNum - 1) * Math.floor(mappedWeeks.length / Math.max(cos.length, 1));
    const weekEnd   = coNum * Math.floor(mappedWeeks.length / Math.max(cos.length, 1));
    const relevantWeeks = mappedWeeks.slice(weekStart, weekEnd + 2).filter(w => w.mappedLevel);

    if (relevantWeeks.length === 0) continue;

    // Find dominant level for relevant weeks.
    // Strategy: pick the HIGHEST level that has ≥2 occurrences. This prevents
    // a single "Introduction to..." (C1) week from setting the CO target when
    // the bulk of the content is C4 Analyze.
    const weekLevelCounts = {};
    for (const w of relevantWeeks) {
      weekLevelCounts[w.mappedLevel] = (weekLevelCounts[w.mappedLevel] || 0) + 1;
    }
    // Sort by level descending (C6 → C1), then pick the first with ≥2 occurrences
    const sortedLevels = Object.keys(weekLevelCounts).sort((a, b) => b.localeCompare(a));
    let weekDominantLevel = null;
    for (const lvl of sortedLevels) {
      if (weekLevelCounts[lvl] >= 2) { weekDominantLevel = lvl; break; }
    }
    // Fallback: most frequent level (original logic)
    if (!weekDominantLevel) {
      weekDominantLevel = Object.entries(weekLevelCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
    }

    const weekDominantVerbs = relevantWeeks
      .filter(w => w.mappedLevel === weekDominantLevel)
      .flatMap(w => w.mappedVerbs || [])
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 4);

    // If no verbs collected, use the level's standard verb set as fallback
    if (weekDominantVerbs.length === 0 && weekDominantLevel) {
      const FALLBACK_VERBS = {
        C1: ['define', 'list', 'state', 'identify'],
        C2: ['describe', 'explain', 'classify', 'summarize'],
        C3: ['apply', 'implement', 'demonstrate', 'use'],
        C4: ['analyze', 'differentiate', 'contrast', 'examine'],
        C5: ['evaluate', 'critique', 'appraise', 'justify'],
        C6: ['design', 'construct', 'formulate', 'create'],
      };
      weekDominantVerbs.push(...(FALLBACK_VERBS[weekDominantLevel] || []));
    }

    const weekTopicSummary = relevantWeeks
      .map(w => `${w.week}: ${w.topics.slice(0, 60)}`)
      .join('; ');

    // Flag gap if:
    // 1. CO level is LOWER than week dominant level (under-specification), OR
    // 2. CO text contains domain-irrelevant keywords
    // Note: CO level HIGHER than or EQUAL TO week level is acceptable.
    // Only flag when CO is clearly under-specified or wrong domain.
    const coLevelNum   = coLevel   ? parseInt(coLevel.replace('C', ''), 10)   : 0;
    const weekLevelNum = weekDominantLevel ? parseInt(weekDominantLevel.replace('C', ''), 10) : 0;
    const hasLevelMismatch = coLevel && weekDominantLevel
      && coLevelNum < weekLevelNum
      && (weekLevelNum - coLevelNum) >= 2; // only flag if gap is ≥2 levels (e.g. C3 vs C5, not C3 vs C4)
    const hasDomainMismatch = !!domainMismatch;

    if (hasLevelMismatch || hasDomainMismatch) {
      const suggestedVerb = weekDominantVerbs[0] || 'analyze';
      const suggestedLevel = weekDominantLevel || 'C4';

      let gapDescription = '';
      if (hasDomainMismatch) {
        gapDescription = `CO statement references ${domainMismatch} content, but the weekly syllabus covers engineering topics (${weekTopicSummary.slice(0, 120)}).`;
      } else {
        gapDescription = `CO uses "${coVerb?.verb || 'unknown'}" (${coLevel} ${BLOOMS_NAMES[coLevel] || ''}), but Weeks ${weekStart + 1}–${weekEnd + 1} content maps to ${weekDominantLevel} ${BLOOMS_NAMES[weekDominantLevel] || ''} (${weekTopicSummary.slice(0, 100)}).`;
      }

      gaps.push({
        co:          co.code,
        co_text:     co.text,
        co_level:    coLevel,
        co_verb:     coVerb?.verb,
        week_range:  `Weeks ${weekStart + 1}–${Math.min(weekEnd + 2, mappedWeeks.length)}`,
        week_topics: weekTopicSummary,
        expected_level: weekDominantLevel,
        expected_level_name: BLOOMS_NAMES[weekDominantLevel] || '',
        gap_type:    hasDomainMismatch ? 'DOMAIN_MISMATCH' : 'LEVEL_MISMATCH',
        gap_description: gapDescription,
        suggested_verbs: weekDominantVerbs,
        suggested_rewrite: `${suggestedVerb.charAt(0).toUpperCase() + suggestedVerb.slice(1)} ${_buildRewriteHint(co.text, weekDominantLevel, weekDominantVerbs, relevantWeeks)}`,
      });
    }
  }

  return gaps;
}

/**
 * Build a draft rewrite hint for a CO statement.
 * Filters out generic structural keywords (intro/case study/etc.) from the
 * topic list so the suggestion sounds like a real CO, not a table of contents.
 */
function _buildRewriteHint(coText, targetLevel, verbs, relevantWeeks) {
  // Generic structural keywords that aren't real domain topics
  const STRUCTURAL_FILLERS = new Set([
    'introduction to', 'definition of', 'basic concept', 'overview', 'review',
    'case study', 'project presentation', 'hands on project', 'lab',
  ]);

  const topicKeywords = relevantWeeks
    .flatMap(w => {
      const t = w.topics.toLowerCase();
      return Object.keys(DOMAIN_TOPIC_MATRIX).filter(k =>
        t.includes(k) && !STRUCTURAL_FILLERS.has(k)
      );
    })
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 4)
    .join(' and ');

  if (topicKeywords) {
    return `the design and operational principles of ${topicKeywords}, including their practical applications.`;
  }
  return `the core technical components detailed in the syllabus, focusing on specific engineering applications.`;
}

/**
 * Mode 2 Generator: Create Course Outcomes from a weekly schedule using the LLM.
 */
async function _generateCOsWithLLM(weeks, routing = {}) {
  try {
    const modelRouter = require('../ai/model-router');
    const { generateCourseOutcomesPrompt } = require('../../prompts/templates/syllabus-extractor');
    const genPrompt = generateCourseOutcomesPrompt(weeks);

    const sharedOpts = {
      isJson:       true,
      maxTokens:    3000,
      numCtx:       4096,
      think:        false,
      systemPrompt: genPrompt.system
    };

    let opts = { ...sharedOpts, model: 'ollama' };
    console.log(`[syllabus-mapper] Calling LLM (ollama) for CO Generation`);
    let resp = await modelRouter.send(genPrompt.user, {}, opts).catch(()=>null);
    if (resp && resp.text && resp.text.trim().length > 5) {
       const parsed = _parseExtractionResponse(resp.text, '');
       if (parsed && parsed.cos && parsed.cos.length > 0) return parsed.cos;
    }

    if (routing.openrouterApiKey) {
      opts = { ...sharedOpts, model: 'openrouter', apiKey: routing.openrouterApiKey };
      console.log(`[syllabus-mapper] Calling LLM (openrouter) for CO Generation`);
      resp = await modelRouter.send(genPrompt.user, {}, opts).catch(()=>null);
      if (resp && resp.text) {
        const parsed = _parseExtractionResponse(resp.text, '');
        if (parsed && parsed.cos && parsed.cos.length > 0) return parsed.cos;
      }
    }
  } catch (e) {
    console.warn('[syllabus-mapper] CO Generation failed:', e.message);
  }
  return [];
}

/**
 * LLM-based extraction — hybrid strategy.
 * Units are pre-extracted deterministically (regex, zero tokens).
 * LLM is only asked to parse the CO section. If deterministic units fail,
 * it runs a Two-Pass pipeline (Pass 1: COs, Pass 2: Weeks).
 */
async function _extractWithLLM(rawText, routing = {}) {
  if (!rawText || rawText.length < 50) return null;

  try {
    const modelRouter = require('../ai/model-router');
    const { coExtractorPrompt, weekExtractorPrompt, extractUnitsFromText, generateCourseOutcomesPrompt } = require('../../prompts/templates/syllabus-extractor');
    
    // Pass 1: Deterministic units
    const preUnits = extractUnitsFromText(rawText);
    console.log(`[syllabus-mapper] Pre-extracted ${preUnits.length} units deterministically`);

    const sharedOpts = {
      isJson:       true,
      maxTokens:    3000,
      numCtx:       4096,   // Two-pass keeps chunks small, so 4096 is completely safe
      think:        false,
    };

    async function runPass(promptObj, label) {
      const opts = { ...sharedOpts, systemPrompt: promptObj.system };
      opts.model = 'ollama';
      console.log(`[syllabus-mapper] Calling LLM (ollama) for ${label}`);
      try {
        const resp = await modelRouter.send(promptObj.user, {}, opts);
        if (resp && resp.text && resp.text.trim().length > 5) {
          return _parseExtractionResponse(resp.text, rawText);
        }
      } catch (ollamaErr) {
        console.warn(`[syllabus-mapper] Ollama failed for ${label}:`, ollamaErr.message);
      }

      if (routing.openrouterApiKey) {
        opts.model  = 'openrouter';
        opts.apiKey = routing.openrouterApiKey;
        console.log(`[syllabus-mapper] Calling LLM (openrouter) for ${label}`);
        try {
          const resp = await modelRouter.send(promptObj.user, {}, opts);
          if (resp && resp.text) return _parseExtractionResponse(resp.text, rawText);
        } catch (e) {
          console.warn(`[syllabus-mapper] OpenRouter failed for ${label}:`, e.message);
        }
      }
      return null;
    }

    // THE FORK: Decide whether to Audit or Generate
    let cos = [];
    let isGeneratorMode = false;

    // 1. The Regex Safety Net: Grab ONLY the CO section, stopping before the timeline
    const coSectionRegex = /Course Outcomes[\s\S]*?(?=Mapping of Course Outcomes|PART B|Course Content|$)/i;
    const coMatch = rawText.match(coSectionRegex);

    if (coMatch && coMatch[0].length > 100) {
      // AUDITOR MODE
      console.log("🚀 Auditor Mode Engaged! Document has existing COs.");
      
      // 2. THE FIX: Pass ONLY the sliced table to the LLM, not the massive rawText!
      const pass1Payload = coMatch[0]; 
      const coPrompt = coExtractorPrompt(pass1Payload);
      
      const pass1Result = await runPass(coPrompt, 'CO extraction');
      if (pass1Result?.cos) {
        cos.push(...pass1Result.cos);
      }
    } else {
      // GENERATOR MODE
      console.log("🛠️ Generator Mode Engaged! No COs found.");
      isGeneratorMode = true;
    }

    let weeks = preUnits;
    if (preUnits.length === 0) {
      const weekPrompt = weekExtractorPrompt(rawText);
      const pass2Result = await runPass(weekPrompt, 'Week extraction');
      weeks = pass2Result?.weeks || [];
    }

    console.log(`[syllabus-mapper] Final: ${cos.length} COs, ${weeks.length} units`);
    if (cos.length === 0 && weeks.length === 0) return null;
    return { cos, weeks };

  } catch (e) {
    console.warn('[syllabus-mapper] LLM extraction failed:', e.message);
    return null;
  }
}

/**
 * Parse and validate the raw text response from any extraction LLM call.
 * Shared by both the Ollama and OpenRouter paths.
 * Includes partial-JSON recovery: if the model was cut off mid-output,
 * salvage whatever complete entries exist rather than returning null.
 */
function _parseExtractionResponse(rawResponse, originalText) {
  let cleaned = rawResponse.trim()
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '').trim();

  const firstBracket = cleaned.match(/[{[]/);
  if (firstBracket) {
    cleaned = cleaned.slice(firstBracket.index);
  }

  // ── Attempt 1: clean parse ────────────────────────────────────────────
  let parsed = null;
  try {
    const lastChar = cleaned[0] === '[' ? ']' : '}';
    const jsonEnd = cleaned.lastIndexOf(lastChar);
    if (jsonEnd > 0) {
      parsed = JSON.parse(cleaned.slice(0, jsonEnd + 1));
    }
  } catch (_) {}

  // ── Attempt 2: partial recovery — truncated JSON ──────────────────────
  if (!parsed) {
    try {
      const lastComplete = cleaned.lastIndexOf('"}');
      if (lastComplete > 0) {
        const salvaged = cleaned.slice(0, lastComplete + 2) + (cleaned[0] === '[' ? ']' : ']}');
        const fixed = salvaged.replace(/,\s*\]/, ']');
        parsed = JSON.parse(fixed);
        console.warn('[syllabus-mapper] Partial JSON recovery succeeded');
      }
    } catch (_) {}
  }

  if (!parsed) {
    console.warn('[syllabus-mapper] LLM JSON parse failed — could not recover');
    console.warn('[syllabus-mapper] Response preview:', cleaned.slice(0, 300));
    return null;
  }

  // If the model output a raw array instead of an object, map it to the expected keys
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && parsed[0].code) {
      parsed = { course_outcomes: parsed };
    } else if (parsed.length > 0 && parsed[0].week) {
      parsed = { weekly_topics: parsed };
    } else {
      parsed = { course_outcomes: parsed };
    }
  }

  const cos   = Array.isArray(parsed.course_outcomes) ? parsed.course_outcomes : [];
  let weeks = Array.isArray(parsed.weekly_topics)   ? parsed.weekly_topics   : [];
  
  // Normalize keys in case the model used uppercase 'Week' or 'Topic'
  weeks = weeks.map(w => {
    if (!w) return null;
    const weekKey = Object.keys(w).find(k => k.toLowerCase() === 'week') || 'week';
    const topicKey = Object.keys(w).find(k => k.toLowerCase().includes('topic')) || 'topics';
    
    let topicsVal = w[topicKey] || Object.values(w)[0];
    if (Array.isArray(topicsVal)) {
      topicsVal = topicsVal.filter(t => typeof t === 'string').join(', ');
    }
    
    return {
      week: w[weekKey] || Object.keys(w)[0],
      topics: topicsVal
    };
  }).filter(Boolean);

  console.log(`[syllabus-mapper] Parsed: ${cos.length} COs, ${weeks.length} weeks`);

  const validCos = cos.filter(c =>
    c && c.code && c.text && typeof c.text === 'string' && c.text.length > 15);
  const validWeeks = weeks.filter(w =>
    w && w.week && w.topics && typeof w.topics === 'string' && w.topics.length > 5);

  return { cos: validCos, weeks: validWeeks };
}


/**
 * DOCX Table-aware extraction using mammoth's HTML output.
 * This is the most reliable strategy for DIU course profiles because it
 * preserves table structure — we can read columns directly instead of
 * guessing where each cell starts and ends in flattened text.
 *
 * Returns null if the document isn't a DOCX or table extraction fails —
 * caller should fall back to text-based extraction.
 *
 * @param {Buffer} buffer
 * @returns {Promise<{ cos: object[], weeks: object[] } | null>}
 */
async function _extractFromDocxTables(buffer) {
  try {
    const mammoth = require('mammoth');
    const { value: html } = await mammoth.convertToHtml({ buffer });

    if (!html || !html.includes('<table')) return null;

    // ── Parse tables out of the HTML ──────────────────────────────────
    // Each table cell is <td>...</td>. Extract rows and cells.
    const tables = [];
    const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let m;
    while ((m = tableRe.exec(html)) !== null) {
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows = [];
      let r;
      while ((r = rowRe.exec(m[1])) !== null) {
        const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells = [];
        let c;
        while ((c = cellRe.exec(r[1])) !== null) {
          // Strip HTML tags, decode entities, normalize whitespace
          const cellText = c[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
          cells.push(cellText);
        }
        if (cells.length > 0) rows.push(cells);
      }
      if (rows.length > 0) tables.push(rows);
    }

    if (tables.length === 0) return null;

    // ── Find the CO table ─────────────────────────────────────────────
    // Look for a table where the first column has CO codes (CO1, CO2, etc.)
    const cos = [];
    for (const table of tables) {
      let hits = 0;
      for (const row of table) {
        if (row.length < 2) continue;
        const first = row[0].trim();
        if (/^C\.?L?\.?O\.?\s*\d+$/i.test(first)) {
          hits++;
        }
      }
      if (hits >= 2) {
        // This is the CO table
        for (const row of table) {
          if (row.length < 2) continue;
          const first = row[0].trim();
          const m = first.match(/^C\.?L?\.?O\.?\s*(\d+)$/i);
          if (!m) continue;
          // Find the longest non-empty cell after the CO code — that's the text
          let coText = '';
          for (let i = 1; i < row.length; i++) {
            if (row[i].length > coText.length) coText = row[i];
          }
          coText = coText
            .replace(/^(be\s+able\s+to|students?\s+will\s+be\s+able\s+to|students?\s+will)\s*/i, '')
            .trim();
          if (coText.length > 15) {
            cos.push({ code: `CO${m[1]}`, text: coText });
          }
        }
        break; // only process the first CO table
      }
    }

    // ── Find the Weekly Content table ─────────────────────────────────
    // Look for a table where some column has "Week N" values
    const weeks = [];
    for (const table of tables) {
      // Find which column index contains "Week N" entries
      const colWeekHits = [0, 0, 0, 0, 0, 0, 0]; // first 7 columns
      let weekColIdx = -1;
      for (const row of table) {
        for (let i = 0; i < Math.min(row.length, 7); i++) {
          if (/^Week\s+\d{1,2}$/i.test(row[i].trim())) colWeekHits[i]++;
        }
      }
      const maxHits = Math.max(...colWeekHits);
      if (maxHits >= 3) {
        weekColIdx = colWeekHits.indexOf(maxHits);

        // The content column is typically just before the week column,
        // or the longest text cell in the row.
        for (const row of table) {
          if (row.length < 2) continue;
          const weekCell = row[weekColIdx]?.trim() || '';
          const weekMatch = weekCell.match(/^Week\s+(\d{1,2})$/i);
          if (!weekMatch) continue;
          const weekNum = parseInt(weekMatch[1], 10);

          // Find the content cell — longest cell that is NOT a teaching
          // method, NOT just numbers, NOT a CO reference
          let bestCell = '';
          for (let i = 0; i < row.length; i++) {
            if (i === weekColIdx) continue;
            const cell = row[i].trim();
            if (cell.length < 10) continue;
            if (/^(brainstorm|demonstration|lecture|presentation|discussion|group\s+work|problem.solving|tutorial|seminar|workshop|lab|practical|quiz|assignment|q\/a)/i.test(cell)) continue;
            if (/^c\.?l?\.?o?\.?\s*\d+/i.test(cell)) continue;
            if (/^\d+\s*$/.test(cell)) continue;
            if (cell.length > bestCell.length) bestCell = cell;
          }

          if (bestCell.length > 10) {
            weeks.push({ week: `Week ${weekNum}`, topics: bestCell });
          }
        }
        break;
      }
    }

    return { cos, weeks };
  } catch (e) {
    console.warn('[syllabus-mapper] DOCX table extraction failed:', e.message);
    return null;
  }
}



/**
 * Analyze a course profile document and generate syllabus alignment suggestions.
 *
 * @param {Buffer}   buffer    — raw file buffer (DOCX or PDF)
 * @param {string}   mimeType  — MIME type
 * @param {Function} [onProgress]
 * @returns {Promise<{
 *   courseOutcomes: { code, text }[],
 *   weeklyTopics:   { week, topics, mappedLevel, mappedVerbs, matchedKeyword }[],
 *   alignmentGaps:  { co, gap_type, gap_description, suggested_verbs, suggested_rewrite }[],
 *   summary:        { totalCOs, totalWeeks, gapsFound, overallHealth }
 * }>}
 */
async function analyzeSyllabus(buffer, mimeType, onProgress, openrouterApiKey) {
  const step = (s, d = '') => { try { if (onProgress) onProgress(s, d); } catch (_) {} };

  const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              || mimeType === 'docx';
  const isPdf  = mimeType === 'application/pdf' || mimeType === 'pdf';

  let courseOutcomes   = [];
  let rawWeeks         = [];
  let extractionStrategy = 'unknown';

  // ── Always extract raw text first (needed for LLM extraction) ────────
  // Prefer MarkItDown (preserves Markdown table structure) over legacy extractText.
  step('extract', 'Extracting document text…');
  let rawText = '';
  try {
    const { extractWithMarkItDown, isAvailable } = require('./markitdown-extractor');
    const mdAvailable = isAvailable();
    console.log('[syllabus-mapper] MarkItDown available:', mdAvailable);
    if (mdAvailable) {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const ext = isPdf ? '.pdf' : isDocx ? '.docx' : '';
      const tmpFile = path.join(os.tmpdir(), `fm-syl-${Date.now()}${ext}`);
      fs.writeFileSync(tmpFile, Buffer.from(buffer));
      console.log('[syllabus-mapper] Wrote temp file:', tmpFile, 'size:', fs.statSync(tmpFile).size);
      try {
        step('extract', 'Initializing ML document engine…');
        console.log('[syllabus-mapper] Calling MarkItDown...');
        rawText = await extractWithMarkItDown(tmpFile);
        console.log('[syllabus-mapper] MarkItDown returned', rawText.length, 'chars');
      } finally {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }
    } else {
      console.log('[syllabus-mapper] MarkItDown unavailable, using legacy extractor');
      const { extractText } = require('./blooms-engine');
      rawText = await extractText(Buffer.from(buffer), mimeType);
    }
  } catch (e) {
    console.warn('[syllabus-mapper] Primary extraction failed, falling back:', e.message);
    console.warn('[syllabus-mapper] Stack:', e.stack);
    try {
      const { extractText } = require('./blooms-engine');
      rawText = await extractText(Buffer.from(buffer), mimeType);
    } catch (e2) {
      console.warn('[syllabus-mapper] Legacy extraction also failed:', e2.message);
    }
  }
  step('extract_done', `Extracted ${rawText.length} characters`);

  // ── Strategy 1: LLM extraction (PRIMARY — works on any format) ───────
  step('llm', 'AI is reading the document…');
  const llmResult = await _extractWithLLM(rawText, { openrouterApiKey });
  if (llmResult && (llmResult.cos.length > 0 || llmResult.weeks.length > 0)) {
    courseOutcomes = llmResult.cos;
    rawWeeks       = llmResult.weeks;
    extractionStrategy = 'llm';
    step('llm_done', `AI extracted ${courseOutcomes.length} COs, ${rawWeeks.length} weeks`);
  } else {
    step('llm_done', 'AI extraction returned no usable data, trying structural parsers…');
  }

  // ── Hallucination guard: reject fabricated course-level COs ──────────
  // If the model returned COs but the raw text has no course-level CO header
  // near those codes, the model likely invented them from per-chapter objectives.
  // In that case, clear the COs and surface a diagnostic instead of silently
  // presenting hallucinated data.
  if (courseOutcomes.length > 0) {
    const hasCOHeader = /course\s+outcomes?|learning\s+outcomes?|CLOs?\s*:/i.test(rawText);
    const allLong = courseOutcomes.every(co => co.text && co.text.length > 350);
    if (!hasCOHeader && allLong) {
      console.warn('[syllabus-mapper] Hallucination guard: no CO header found + all COs suspiciously long — clearing fabricated COs');
      courseOutcomes = [];
    }
  }

  // ── Strategy 2: DOCX table-aware (fallback) ──────────────────────────
  if (isDocx && (courseOutcomes.length === 0 || rawWeeks.length === 0)) {
    step('extract', 'Reading DOCX table structure…');
    const tableResult = await _extractFromDocxTables(Buffer.from(buffer));
    if (tableResult) {
      if (courseOutcomes.length === 0 && tableResult.cos.length > 0) {
        courseOutcomes = tableResult.cos;
      }
      if (rawWeeks.length === 0 && tableResult.weeks.length > 0) {
        rawWeeks = tableResult.weeks;
      }
      if (extractionStrategy === 'unknown') extractionStrategy = 'docx-table';
      else if (extractionStrategy !== 'llm') extractionStrategy = 'mixed';
    }
  }

  // ── Strategy 3: Text-based regex (last-resort fallback) ──────────────
  if (courseOutcomes.length === 0 || rawWeeks.length === 0) {
    if (courseOutcomes.length === 0) {
      const textCos = extractCourseOutcomes(rawText);
      if (textCos.length > 0) {
        courseOutcomes = textCos;
        if (extractionStrategy === 'unknown') extractionStrategy = 'text-regex';
        else extractionStrategy = 'mixed';
      }
    }
    if (rawWeeks.length === 0) {
      const textWeeks = extractWeeklyTopics(rawText);
      if (textWeeks.length > 0) {
        rawWeeks = textWeeks;
        if (extractionStrategy === 'unknown') extractionStrategy = 'text-regex';
        else extractionStrategy = 'mixed';
      }
    }
  }

  // ── Mode 2: The Generator ──
  // If ALL extraction strategies failed to find COs, but successfully found weeks,
  // we trigger the Generator mode to synthesize COs based on the weeks.
  if (courseOutcomes.length === 0 && rawWeeks.length > 0) {
    step('llm', 'Generator Mode Engaged! Synthesizing COs from schedule…');
    const generatedCos = await _generateCOsWithLLM(rawWeeks, { openrouterApiKey });
    if (generatedCos.length > 0) {
      courseOutcomes = generatedCos;
      if (extractionStrategy === 'unknown') extractionStrategy = 'generator';
      else extractionStrategy += '+generator';
      step('llm_done', `Synthesized ${courseOutcomes.length} Course Outcomes`);
    } else {
      step('llm_done', 'Failed to generate Course Outcomes');
    }
  }

  step('extract_done', `Final: ${courseOutcomes.length} COs, ${rawWeeks.length} weeks (strategy: ${extractionStrategy})`);

  // ── Diagnostics for failed extraction ────────────────────────────────
  const diagnostics = {
    strategy:           extractionStrategy,
    extractedTextChars: rawText.length,
    rawTextPreview:     rawText ? rawText.slice(0, 500) : '',
    cosFound:           courseOutcomes.length,
    weeksFound:         rawWeeks.length,
    suggestion:         null,
  };

  if (courseOutcomes.length === 0 && rawWeeks.length === 0) {
    diagnostics.suggestion = 'The engine could not find Course Outcomes or weekly topics in this document. Try the manual paste option below — copy the CO and weekly content from your document and paste them directly.';
  } else if (courseOutcomes.length === 0) {
    // Check if this looks like a per-chapter objectives document
    const hasChapterObjectives = /chapter\s+\d+|learning\s+objectives?/i.test(rawText);
    diagnostics.suggestion = hasChapterObjectives
      ? 'This document appears to use per-chapter learning objectives rather than unified course-level outcomes. No fabricated COs were generated. Unit-level Bloom\'s mapping is still available below.'
      : 'No Course Outcomes found. Weekly topics extracted successfully. Paste the CO text manually below to complete the analysis.';
  } else if (rawWeeks.length === 0) {
    diagnostics.suggestion = 'No weekly topics found. Course Outcomes extracted successfully. Paste the weekly content manually below to complete the analysis.';
  }

  // ── Reverse-map each week ─────────────────────────────────────────────
  step('map', 'Mapping weekly topics to Bloom\'s levels…');
  const weeklyTopics = rawWeeks.map(w => {
    const match = reverseMapTopic(w.topics);
    return {
      ...w,
      mappedLevel:      match?.level || null,
      mappedLevelName:  match ? BLOOMS_NAMES[match.level] : null,
      mappedVerbs:      match?.verbs || [],
      matchedKeyword:   match?.matchedKeyword || null,
    };
  });
  const mappedCount = weeklyTopics.filter(w => w.mappedLevel).length;
  step('map_done', `Mapped ${mappedCount}/${weeklyTopics.length} weeks`);

  // ── Gap analysis — deterministic (instant, zero inference cost) ──────
  // Uses the DOMAIN_TOPIC_MATRIX + extractCoVerb() to detect non-measurable
  // verbs and level mismatches. No LLM call — runs in <1ms regardless of
  // document size. This is what makes the 5-minute budget achievable on 8GB.
  // For units not in the matrix, mappedLevel stays null (shown as unmapped).
  step('gaps', 'Analyzing CO alignment…');
  let alignmentGaps = [];

  if (courseOutcomes.length > 0 && weeklyTopics.length > 0) {
    alignmentGaps = detectAlignmentGaps(courseOutcomes, weeklyTopics);
    step('gaps_done', `Found ${alignmentGaps.length} gap${alignmentGaps.length === 1 ? '' : 's'}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const overallHealth =
    courseOutcomes.length === 0 || weeklyTopics.length === 0 ? 'EXTRACTION_FAILED'
    : alignmentGaps.length === 0 ? 'ALIGNED'
    : alignmentGaps.length <= 1 ? 'MINOR_GAPS'
    : 'NEEDS_REVIEW';

  step('done', `Analysis complete — ${alignmentGaps.length} gap${alignmentGaps.length === 1 ? '' : 's'} found`);

  return {
    courseOutcomes,
    weeklyTopics,
    alignmentGaps,
    diagnostics,
    summary: {
      totalCOs:      courseOutcomes.length,
      totalWeeks:    weeklyTopics.length,
      mappedWeeks:   mappedCount,
      gapsFound:     alignmentGaps.length,
      overallHealth,
      strategy:      extractionStrategy,
    },
  };
}

/**
 * Manual analysis path — the professor pastes raw CO text and weekly topics
 * directly. Used as a fallback when document extraction fails.
 *
 * @param {string} cosText  — raw text containing CO statements
 * @param {string} weeksText — raw text containing weekly topics (one per line)
 * @returns same shape as analyzeSyllabus()
 */
async function analyzeManualInput(cosText, weeksText) {
  const courseOutcomes = extractCourseOutcomes(cosText);

  // Manual weeks — one per line, format: "Week N: topic" or just "topic"
  const rawWeeks = [];
  const lines = (weeksText || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^Week\s+(\d{1,2})\s*[:\-]?\s*(.+)$/i);
    if (m && m[2].trim().length > 5) {
      rawWeeks.push({ week: `Week ${m[1]}`, topics: m[2].trim() });
    } else if (line.length > 10) {
      rawWeeks.push({ week: `Week ${i + 1}`, topics: line });
    }
  }

  const weeklyTopics = rawWeeks.map(w => {
    const match = reverseMapTopic(w.topics);
    return {
      ...w,
      mappedLevel:    match?.level || null,
      mappedLevelName: match ? BLOOMS_NAMES[match.level] : null,
      mappedVerbs:    match?.verbs || [],
      matchedKeyword: match?.matchedKeyword || null,
    };
  });

  const alignmentGaps = courseOutcomes.length > 0 && weeklyTopics.length > 0
    ? detectAlignmentGaps(courseOutcomes, weeklyTopics)
    : [];

  const overallHealth =
    courseOutcomes.length === 0 || weeklyTopics.length === 0 ? 'EXTRACTION_FAILED'
    : alignmentGaps.length === 0 ? 'ALIGNED'
    : alignmentGaps.length <= 1 ? 'MINOR_GAPS' : 'NEEDS_REVIEW';

  return {
    courseOutcomes,
    weeklyTopics,
    alignmentGaps,
    diagnostics: { strategy: 'manual', cosFound: courseOutcomes.length, weeksFound: weeklyTopics.length },
    summary: {
      totalCOs:    courseOutcomes.length,
      totalWeeks:  weeklyTopics.length,
      mappedWeeks: weeklyTopics.filter(w => w.mappedLevel).length,
      gapsFound:   alignmentGaps.length,
      overallHealth,
      strategy:    'manual',
    },
  };
}

module.exports = {
  analyzeSyllabus,
  analyzeManualInput,
  extractCourseOutcomes,
  extractWeeklyTopics,
  reverseMapTopic,
  detectAlignmentGaps,
  DOMAIN_TOPIC_MATRIX,
};
