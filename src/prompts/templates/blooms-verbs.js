/**
 * blooms-verbs.js — Authoritative Bloom's Taxonomy verb dictionary
 *
 * SINGLE SOURCE OF TRUTH for Bloom's cognitive level verb mappings.
 * Compiled and validated against authoritative reference documentation:
 *   1. Jerrold Kemp's "Shopping List of Verbs" (Action Verbs by Domain)
 *   2. Benjamin Bloom's Taxonomy of Measurable Verbs
 *   3. UCF Academic Program Assessment Guidelines
 *
 * All verbs are in BASE FORM (infinitive without "to").
 */

'use strict';

const BLOOMS_VERBS = {
  // C1 — REMEMBER: Knowledge of terms, facts, conventions, classifications
  // Student recalls, records, or recognizes information, ideas, and principles
  C1: [
    'arrange', 'count', 'define', 'describe', 'draw', 'duplicate', 'enumerate',
    'find', 'identify', 'label', 'list', 'locate', 'match', 'memorize', 'name',
    'order', 'outline', 'quote', 'recall', 'recite', 'recognize', 'record',
    'relate', 'repeat', 'reproduce', 'select', 'sequence', 'state', 'tell',
    'underline', 'view',
  ],

  // C2 — UNDERSTAND: Comprehension of ideas, translations, interpretations
  // Student demonstrates understanding of facts and ideas by organizing,
  // comparing, translating, interpreting, giving descriptions, and stating main ideas
  C2: [
    'characterize', 'cite', 'classify', 'conclude', 'convert', 'defend',
    'describe', 'discuss', 'distinguish', 'establish', 'estimate', 'explain',
    'express', 'extend', 'generalize', 'illustrate', 'indicate', 'infer',
    'interpret', 'locate', 'paraphrase', 'predict', 'recognize', 'relate',
    'report', 'restate', 'review', 'rewrite', 'select', 'summarize', 'trace',
    'translate',
  ],

  // C3 — APPLY: Use of knowledge, problem solving
  // Student selects, transfers, and uses data and principles to complete a
  // problem or task with a minimum of direction
  C3: [
    'act', 'administer', 'apply', 'articulate', 'assess', 'change', 'chart',
    'choose', 'collect', 'complete', 'compute', 'construct', 'contribute', 'demonstrate',
    'determine', 'develop', 'discover', 'dramatize', 'employ', 'establish',
    'examine', 'extend', 'imitate', 'implement', 'include', 'interpret',
    'interview', 'manipulate', 'model', 'modify', 'operate', 'practice',
    'predict', 'prepare', 'produce', 'provide', 'relate', 'schedule', 'show',
    'sketch', 'solve', 'transfer', 'use', 'utilize', 'write',
  ],

  // C4 — ANALYZE: Examination of parts of information
  // Student distinguishes, classifies, and relates the assumptions, hypotheses,
  // evidence, or structure of a statement or question
  C4: [
    'analyze', 'appraise', 'breakdown', 'calculate', 'categorize', 'characterize',
    'classify', 'compare', 'contrast', 'correlate', 'criticize', 'debate',
    'deduce', 'diagram', 'differentiate', 'discriminate', 'distinguish', 'examine',
    'experiment', 'focus', 'identify', 'illustrate', 'infer', 'inspect',
    'inventory', 'investigate', 'limit', 'model', 'outline', 'prioritize',
    'question', 'relate', 'research', 'select', 'separate', 'subdivide', 'test',
  ],

  // C5 — EVALUATE: Forming judgments based on criteria and evidence
  // Historically includes segments of early synthesis evaluation pipelines
  C5: [
    'appraise', 'argue', 'assess', 'attach', 'choose', 'compare', 'conclude',
    'contrast', 'criticize', 'critique', 'debate', 'decide', 'defend', 'describe',
    'determine', 'discriminate', 'discuss', 'estimate', 'evaluate', 'explain',
    'interpret', 'judge', 'justify', 'measure', 'predict', 'prioritize', 'prove',
    'rank', 'rate', 'recommend', 'reframe', 'relate', 'score', 'select',
    'summarize', 'support', 'value', 'verify', 'weigh',
  ],

  // C6 — CREATE: Compile component ideas into a new whole
  // Student creates a new product, architectural plan, or point of view
  C6: [
    'adapt', 'anticipate', 'arrange', 'assemble', 'build', 'categorize',
    'collaborate', 'collect', 'combine', 'communicate', 'comply', 'compose',
    'construct', 'create', 'design', 'develop', 'devise', 'explain', 'express',
    'formulate', 'generate', 'hypothesize', 'incorporate', 'individualize',
    'initiate', 'integrate', 'intervene', 'invent', 'manage', 'modify',
    'negotiate', 'organize', 'originate', 'perform', 'plan', 'prepare', 'produce',
    'progress', 'propose', 'rearrange', 'reconstruct', 'reinforce', 'relate',
    'reorganize', 'revise', 'rewrite', 'structure', 'substitute', 'synthesize',
    'tell', 'validate', 'write',
  ],
};

const BLOOMS_NAMES = {
  C1: 'Remember',
  C2: 'Understand',
  C3: 'Apply',
  C4: 'Analyze',
  C5: 'Evaluate',
  C6: 'Create',
};

// Verbs and ambiguous conceptual phrases that are NOT measurable and must be flagged
const VERBS_TO_AVOID = [
  'believe', 'hear', 'realize', 'comprehend', 'know', 'see', 'understand',
  'think', 'feel', 'perceive', 'memorize', 'experience', 'conceptualize',
  'listen', 'self-actualize', 'appreciate', 'be aware', 'be familiar',
  'be interested', 'be knowledgeable', 'capacity', 'intelligence', 'recognize',
  'appreciation for', 'acquainted with', 'adjusted to', 'awareness of',
  'capable of', 'comprehension of', 'cognizant of', 'enjoyment of',
  'conscious of', 'familiar with', 'interest in', 'interested in',
  'knowledge of', 'knowledgeable about', 'understanding of',
];

// Pre-formatted text version for direct injection into system prompts.
const BLOOMS_VERBS_TEXT = [
  `C1 Remember (Knowledge of terms, facts, classifications):`,
  `  ${BLOOMS_VERBS.C1.join(', ')}`,
  ``,
  `C2 Understand (Comprehension, interpretation, translation):`,
  `  ${BLOOMS_VERBS.C2.join(', ')}`,
  ``,
  `C3 Apply (Use knowledge, problem solving, practical tasks):`,
  `  ${BLOOMS_VERBS.C3.join(', ')}`,
  ``,
  `C4 Analyze (Examine parts, find evidence, break down):`,
  `  ${BLOOMS_VERBS.C4.join(', ')}`,
  ``,
  `C5 Evaluate (Form judgments, defend positions, assess criteria):`,
  `  ${BLOOMS_VERBS.C5.join(', ')}`,
  ``,
  `C6 Create (Synthesize, produce new work, design solutions):`,
  `  ${BLOOMS_VERBS.C6.join(', ')}`,
  ``,
  `VERBS TO AVOID / AMBIGUOUS PHRASES (Not measurable — flag immediately if found):`,
  `  ${VERBS_TO_AVOID.join(', ')}`,
].join('\n');

/**
 * Format the dictionary as a plaintext block ready to be embedded in an LLM prompt context window.
 */
function formatDictionaryForPrompt() {
  return BLOOMS_VERBS_TEXT;
}

module.exports = {
  BLOOMS_VERBS,
  BLOOMS_VERBS_TEXT,
  BLOOMS_NAMES,
  VERBS_TO_AVOID,
  formatDictionaryForPrompt,
};
