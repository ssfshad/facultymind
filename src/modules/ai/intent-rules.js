'use strict';

/**
 * intent-rules.js — deterministic fast path for the intent router.
 *
 * Clear, unambiguous commands are answered instantly (no model call, nothing leaves the machine);
 * everything else returns null and goes to the language model. Precision matters more than coverage:
 * a rule fires only on a pattern that means one thing, and every rule has guards that make it abstain
 * when the message could belong to another intent.
 *
 * Two kinds of answer:
 *  - instant: the handler needs nothing the model would extract -> returned as the final classification
 *  - needsModel: the intent is certain but the handler needs entities only the model extracts (reminder text
 *    and time, vault content, CLO text). The router still calls the model for those, with the intent as a hint
 *    so it cannot mislabel the message.
 * The result carries `raw_query` (module handlers read it) and the entities a handler needs.
 *
 * Typos: a word one edit away from a known key word (launch, portal, emails ...) is corrected before matching,
 * but only when exactly one key word fits. The original text is never changed.
 */

const COURSE_CODE = /\b([A-Za-z]{2,4})\s?(\d{3,4}[A-Za-z]?)\b/;

function courseCode(text) {
  const m = COURSE_CODE.exec(text);
  return m ? (m[1] + m[2]).toUpperCase() : null;
}

// ── typo tolerance ──────────────────────────────────────────────────────────
const KEY_WORDS = [
  'portal', 'website', 'university', 'launch', 'bring', 'start', 'navigate', 'email', 'emails', 'inbox', 'messages', 'unread', 'refresh',
  'class', 'classes', 'lecture', 'lectures', 'timetable', 'schedule', 'routine', 'learned', 'learning', 'memory', 'memorised', 'memorized', 'remember',
  'picked', 'activity', 'getting', 'better', 'remind', 'reminder', 'notify', 'switch', 'change', 'delete', 'remove', 'rename', 'create', 'enrol',
  'student', 'students', 'course', 'section', 'quiz', 'lesson', 'generate', 'worksheet', 'attainment', 'threshold', 'hello', 'thanks', 'morning',
  'evening', 'draft', 'compose', 'reply', 'respond', 'ignore', 'prioritise', 'notes', 'syllabus', 'chapter', 'practice', 'questions', 'attendance',
  'marks', 'scores', 'result', 'results', 'dashboard', 'registration', 'search', 'figure', 'vault', 'password', 'saved', 'stored', 'record', 'absent',
  'dekhao', 'kholo', 'enrol', 'bujhiye', 'rajdhani', 'machine', 'modify', 'update', 'cancel', 'assignment', 'entry',
];

// true when a and b differ by exactly one insertion, deletion, substitution or adjacent swap
function oneEdit(a, b) {
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;                                   // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);   // swap
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);          // deletion / insertion
}

function fixTypos(text) {
  return text.replace(/[a-z]{5,}/g, (w) => {
    if (KEY_WORDS.includes(w)) return w;
    const near = KEY_WORDS.filter(k => oneEdit(w, k));
    return near.length === 1 ? near[0] : w;
  });
}

// ── shared guards ───────────────────────────────────────────────────────────
// words that signal the message is about something other than the stored records / schedule
const OTHER_THINGS = /\b(vault|password|passwords|note|notes|link|links|file|document|pdf|reminder|remind|rule|rules|e-?mails?|mails?|inbox|quiz|lesson|worksheet|test paper|questions?)\b/i;
const HOW_QUESTION = /^(how (do|can|to|should)|why|what happens|is it possible|should i|explain)\b/i;
const POLITE = '(?:please\\s+|can you\\s+|could you\\s+|would you\\s+|i want to\\s+|i need to\\s+|i\'d like to\\s+|let\'s\\s+|kindly\\s+)*';

const MODEL_NAME = /\b(gemini|claude|gpt-?4o?|gpt|chat\s?gpt|openrouter|open router|ollama|local model|local ai)\b/i;
function normaliseModel(text) {
  const t = text.toLowerCase();
  if (/gemini/.test(t)) return 'gemini';
  if (/claude/.test(t)) return 'claude';
  if (/gpt/.test(t)) return 'gpt4o';
  if (/open\s?router/.test(t)) return 'openrouter';
  return 'ollama';
}

const SECTION = /\b(marks entry|mark entry|attendance|result sheet|results?|dashboard|course registration|registration|grade sheet|gradesheet|ct marks|ct page)\b/i;

// each rule: (original message, corrected lower-case message) -> { intent, entities?, needsModel? } | null
const RULES = [
  // ── MODEL_SWITCH ─────────────────────────────────────────────────────────
  (m, t) => {
    if (!MODEL_NAME.test(t) || /\b(e-?mail|mail|vault)\b/.test(t)) return null;
    if (/\b(what|which|how|why|explain|compare|difference|better|best|vs|versus|cost|price|is it)\b/.test(t)) return null;
    if (/\b(switch|change|swap|set|use|using|run|go back|talk|start using|koro|use koro|diye)\b/.test(t)) {
      return { intent: 'MODEL_SWITCH', entities: { model: normaliseModel(t) } };
    }
    return null;
  },

  // ── DIU_PORTAL_NAV: a named screen inside the portal ─────────────────────
  (m, t) => {
    if (!SECTION.test(t)) return null;
    if (!/\b(go to|open|take me to|navigate|jump|show|bring up|dekhao|kholo|jao|khule dao)\b/.test(t)) return null;
    const words = t.split(/\s+/).length;
    const portal = /\bportal\b/.test(t);
    if (!portal && words > 5) return null;                    // "show attendance of Rahim in ICE301" is a query
    if (!portal && (courseCode(m) || /\b(of|for|in)\b/.test(t))) return null;
    if (/\b(who|how many|which|what|average|total of|list)\b/.test(t)) return null;
    return { intent: 'DIU_PORTAL_NAV' };
  },

  // ── PORTAL_OPEN: the portal website itself ───────────────────────────────
  (m, t) => {
    if (!/\b(diu|blc|portal|university site|live site)\b/.test(t)) return null;
    if (!/\b(open|launch|start|bring up|take me to|go to|navigate to|use|khule dao|khulo|kholo|niye jao|nao)\b/.test(t)) return null;
    if (SECTION.test(t) || OTHER_THINGS.test(t) || HOW_QUESTION.test(t)) return null;
    if (/\b(who|how many|which|what|why|result|grade|pass|fail|page|section|sheet|entry|screen|tab|inside|in the portal|on the portal)\b/.test(t)) return null;
    return { intent: 'PORTAL_OPEN', entities: { portal: /blc/.test(t) ? 'blc' : 'diu' } };
  },

  // ── EMAIL_RULE: which emails to show / hide ──────────────────────────────
  (m, t) => {
    if (!/\b(e-?mails?|mails?)\b/.test(t)) return null;
    if (/\b(draft|write|compose|reply|respond)\b/.test(t)) return null;
    if (/\b(ignore|hide|mute|block|filter out|stop showing|don'?t show|never show|only show|prioriti[sz]e|low priority|don'?t notify|dekhabe na|ignore koro|priority dao|shudhu .* dekhao)\b/.test(t)) {
      return { intent: 'EMAIL_RULE' };
    }
    return null;
  },

  // ── EMAIL_DRAFT ──────────────────────────────────────────────────────────
  (m, t) => {
    if (/\b(ignore|hide|mute|block|filter)\b/.test(t)) return null;
    if (/\b(draft|compose)\b.*\b(e-?mail|mail|reply|message|response|note)\b/.test(t)) return { intent: 'EMAIL_DRAFT' };
    if (/\b(write|prepare|help me write)\b.*\b(e-?mail|mail|message)\b/.test(t)) return { intent: 'EMAIL_DRAFT' };
    if (/\b(reply|respond)\b.*\b(e-?mail|mail|saying|to (the |my )?(dean|department|registrar|supervisor|chairman|dr\.?|hr|exam controller|head))/.test(t)) return { intent: 'EMAIL_DRAFT' };
    if (/\b(e-?mail|mail)\b.*\b(likho|likhe dao|draft koro|reply likh)/.test(t)) return { intent: 'EMAIL_DRAFT' };
    if (/\b(write|message)\b.*\bto (the |my )?(dean|department head|registrar|supervisor|chairman|dr\.? \w+|hr|exam controller)\b.*\b(about|asking|requesting)\b/.test(t)) return { intent: 'EMAIL_DRAFT' };
    return null;
  },

  // ── EMAIL_FETCH ──────────────────────────────────────────────────────────
  (m, t) => {
    if (!/\b(e-?mail(s|ed)?|mails?|inbox|messages)\b/.test(t)) return null;
    if (/\b(draft|write|compose|reply|respond|ignore|hide|mute|block|filter|only show|from now on|prioriti[sz]e|save|vault)\b/.test(t)) return null;
    if (/\b(check|refresh|sync|fetch|pull|update)\b.*\b(e-?mails?|mails?|inbox)\b/.test(t)
      || /\b(any|is there|do i have|have i got)\b.*\b(new|unread)\b/.test(t)
      || /\b(new|unread)\b.*\b(e-?mails?|mails?|messages)\b/.test(t)
      || /\bhas anyone e-?mailed me\b/.test(t)
      || /\bwhat arrived in my inbox\b/.test(t)
      || /\b(e-?mail|mail|inbox)\b.*\b(check koro|refresh koro|ache ki|ashche ki|dekhao)\b/.test(t)
      || /\bnotun (e-?mail|mail)\b/.test(t)) return { intent: 'EMAIL_FETCH' };
    return null;
  },

  // ── DATA_DELETE ──────────────────────────────────────────────────────────
  (m, t) => {
    if (HOW_QUESTION.test(t) || OTHER_THINGS.test(t)) return null;
    const object = /\b(student|course|class|classes|section|schedule|entry|lecture|session|list)\b|\b[a-z]{2,4}\s?\d{3,4}\b/i;
    const en = new RegExp(`^${POLITE}(delete|remove|drop|erase|get rid of)\\b`).test(t);
    const bn = /\b(delete koro|delete kore dao|muche felo|muchhe felo|remove kore dao|remove koro|bad dao)\b/.test(t);
    if ((en || bn) && object.test(t)) return { intent: 'DATA_DELETE' };
    return null;
  },

  // ── DATA_EDIT ────────────────────────────────────────────────────────────
  (m, t) => {
    if (HOW_QUESTION.test(t) || OTHER_THINGS.test(t)) return null;
    if (/\b(marks?|attendance|scores?|grades?|model)\b/.test(t)) return null;      // marks/attendance edits are SHADSYNC_UPDATE territory
    const object = /\b(name|naam|section|room|class|classes|course|time|id|spelling|schedule|student)\b|\b[a-z]{2,4}\s?\d{3,4}\b/i;
    const en = new RegExp(`^${POLITE}(change|edit|modify|rename|correct|fix|update|move|switch)\\b`).test(t);
    const bn = /\b(change koro|change kore dao|thik koro|soriye dao|e koro)\b/.test(t) || /\bnaam ta\b.*\bkoro\b/.test(t);
    if ((en || bn) && object.test(t)) return { intent: 'DATA_EDIT' };
    return null;
  },

  // ── DATA_ADD ─────────────────────────────────────────────────────────────
  (m, t) => {
    if (HOW_QUESTION.test(t) || OTHER_THINGS.test(t)) return null;
    if (/\b(marks?|scores?|attendance)\b/.test(t)) return null;                      // entering marks/attendance is SHADSYNC_UPDATE
    const object = /\b(student|course|class|classes|section|schedule|entry|list)\b|\b[a-z]{2,4}\s?\d{3,4}\b/i;
    const en = new RegExp(`^${POLITE}(add|create|register|enrol|enroll|set up)\\b`).test(t);
    const bn = (/\b(add koro|banao|jog koro)\b/.test(t) && /\b(notun|student|course|class)\b/.test(t)) || /\benrol koro\b/.test(t);
    if ((en || bn) && object.test(t)) return { intent: 'DATA_ADD' };
    return null;
  },

  // ── MEMORY_STATUS (before SCHEDULE: "how well do you know my schedule") ──
  (m, t) => {
    if (/\b(vault|save|store)\b/.test(t)) return null;
    if (/\byou(r)?\b.*\b(learn(ed|t|ing)?|memor(y|ised|ized)|remember|know (about )?me|know my|picked up|getting better)\b/.test(t)
      || /\bmemory (stats|status)\b|\bself[- ]?learning\b/.test(t)
      || /\b(tumi|tomar)\b.*\b(shikhecho|shikhe|learning|jano|mone ache)\b/.test(t) || /\btomake\b.*\bmone ache\b/.test(t)) return { intent: 'MEMORY_STATUS' };
    return null;
  },

  // ── SHADSYNC_UPDATE: entering marks / attendance (handler parses the raw message) ──
  (m, t) => {
    if (HOW_QUESTION.test(t) || /\b(vault|e-?mail|mail|note|link|password|reminder|remind|portal)\b/.test(t)) return null;
    if (/\b(show|what|what's|how many|who|list|which|average|total|display|compare|change|update|correct|fix|modify|open|go to)\b/.test(t)) return null;
    const subject = /\b(marks?|scores?|attendance|absent|absentees|numbers?)\b/.test(t);
    const verb = /\b(enter|input|record|log|type in|key in|take|save|start|let me type)\b/.test(t);
    const bn = /\b(marks? entry (korbo|koro)|attendance nite chai|input dibo|number gula input)\b/.test(t) || (/\babsent\b/.test(t) && /\brecord koro\b/.test(t));
    const markPresent = /\bmark\b.*\b(present|absent)\b|\b(present|absent)\s+mark koro\b/.test(t);   // "mark all students present"
    if ((verb && subject) || bn || markPresent) return { intent: 'SHADSYNC_UPDATE' };
    return null;
  },

  // ── SCHEDULE_QUERY: reading the timetable ────────────────────────────────
  (m, t) => {
    if (!/\b(class|classes|lectures?|timetable|schedule|routine)\b/.test(t)) return null;
    if (/\b(add|delete|remove|change|edit|move|rename|set up|create|cancel|remind|reminder|notify|alert|ping|enter|record|take attendance|marks|attendance|muche|soriye|banao|jog koro)\b/.test(t)) return null;
    if (/\b(clo|co\d|po\d|student|result|grade|portal)\b/.test(t)) return null;
    if (/\b(tips|advice|ideas|suggestions|strategies|teaching|teach|how to)\b/.test(t)) return null;
    if (/^(what|which|when|do i have|am i free|is there|how many|list|show|tell me|give me|what's|amar|my)\b/.test(t)
      || /\b(koyta|kokhon|ache ki|ache\?|dekhao)\b/.test(t)) return { intent: 'SCHEDULE_QUERY' };
    return null;
  },

  // ── SHADSYNC_QUERY: the teacher's own course data ────────────────────────
  (m, t) => {
    if (/\b(portal|enter|input|record|log|take|save|start|type|update|irregular)\b/.test(t)) return null;
    const strong = /\b(clo|co|po)\s?\d?\s*attain/.test(t) || /\battainment\b/.test(t) || /\bbelow \d+\s*%/.test(t) || /\bat-?risk\b/.test(t)
      || /\b(weak|failed|failing)\s+(clos?|cos?)\b|\bfailed clo|\bclo\s?\d\b.*\battained\b|\battained\b.*\bclo/.test(t)
      || /\bniche\b.*\bstudent|\bstudent\b.*\bniche\b|\battendance koto\b|\bweak clo\b|\bclo\b.*\bweak\b|\bperforming against (the )?threshold\b/.test(t);
    const attendanceOf = /\battendance\b/.test(t) && /\b(what is|what's|show me|koto)\b/.test(t) && courseCode(m) && /'s attendance|\bs attendance\b|\ber attendance\b/.test(t);
    if (strong || attendanceOf) return { intent: 'SHADSYNC_QUERY', entities: { course_code: courseCode(m) } };
    return null;
  },

  // ── DIU_PORTAL_QUERY: results / grades in the DIU portal (handler reads raw_query only) ──
  (m, t) => {
    if (/\b(clo|co\d|po\d|attainment|threshold|below|at-?risk|enter|input|record|log|update|change|open|go to)\b/.test(t)) return null;
    const asks = /\b(who|which students?|how many|list|show|what'?s|what is|give me)\b/.test(t);
    const topic = /\b(fail(ed)?|pass(ed)?|grade [a-f]|lowest|highest|pass rate|grade distribution|grand total|irregular attendance|ct scores?|gpa|cgpa|ranking|scored)\b|(?<![a-z])a\+/.test(t);
    const bn = /\bke ke fail\b|\bkoyjon (pass|fail)\b|\bgrade distribution\b|\bsob theke beshi number\b/.test(t);
    if ((asks && topic) || bn) return { intent: 'DIU_PORTAL_QUERY' };
    return null;
  },

  // ── BLOOM_GENERATE: build a quiz / lesson plan FROM a source document ─────
  (m, t) => {
    const made = /\b(generate|make|create|build|prepare|produce|write|turn|toiri koro|banao|banai dao)\b/.test(t);
    const thing = /\b(quiz|lesson plan|lesson outline|test paper|exam|worksheet|practice questions|multiple choice|mcq|questions?|question paper|test)\b/.test(t);
    const source = /\b(pdf|file|notes|slides|chapter|syllabus|document|outline|textbook|uploaded|attached|bank|theke|diye)\b/.test(t);
    if (made && thing && source) return { intent: 'BLOOM_GENERATE' };
    return null;
  },

  // ── needsModel: the intent is certain, the entities come from the model ───
  (m, t) => {   // REMINDER_SET (reminder text and time)
    if (/\b(e-?mail|mail|vault|don'?t notify)\b/.test(t)) return null;
    if (/\b(remind me|set (a |an )?(reminder|alarm)|reminder (set|dao|koro)|notify me|alert me|ping me|don'?t let me forget|mone koriye dio|mone koriye|amake janio|reminder dao|bhule jeno na)\b/.test(t)) return { intent: 'REMINDER_SET', needsModel: true };
    return null;
  },
  (m, t) => {   // VAULT_SEARCH (query)
    if (/\b(e-?mail|mail)\b/.test(t)) return null;
    const find = /\b(find|search|where is|where's|where did|look up|locate|what did i save|khuje dao|ber koro|kothay rakhsilam|do i have .* saved)\b/.test(t);
    const place = /\b(vault|saved|stored|save kora|rakhsilam|link|password|note)\b/.test(t);
    if (find && place) return { intent: 'VAULT_SEARCH', needsModel: true };
    return null;
  },
  (m, t) => {   // VAULT_SAVE (content, url, password)
    if (/\b(e-?mail|mail|find|search|where|look up|locate|khuje|ber koro)\b/.test(t)) return null;
    const save = /\b(save|store|keep|remember|put|add|write down|rakho|jog koro|save koro|save kore rakho)\b/.test(t);
    const target = /\b(vault|link|password|login|note|document)\b/.test(t) || /\b(file|ta)\b.*\bvault\b/.test(t);
    if (save && target && (/\bvault\b/.test(t) || /\b(link|password|login|note)\b/.test(t))) return { intent: 'VAULT_SAVE', needsModel: true };
    return null;
  },
  (m, t) => {   // BLOOM_CLO_MAP (clo_text)
    const outcomes = /\b(clos?|course outcomes?|learning outcomes?|outcomes?)\b/.test(t);
    const bloom = /\b(bloom|bloom's|blooms|cognitive level|action verbs?|measurable|verbs)\b/.test(t);
    if (outcomes && bloom) return { intent: 'BLOOM_CLO_MAP', needsModel: true };
    return null;
  },

  // ── GENERAL_CHAT: greetings, thanks, plain knowledge questions ───────────
  (m, t) => {
    const words = t.split(/\s+/).length;
    if (words <= 6 && /^(hi|hello|hey|good (morning|afternoon|evening)|thanks?|thank you|thanks a lot|you'?re (awesome|great|amazing)|dhonnobad|ki khobor|kemon acho|tumi ke)\b/.test(t)) return { intent: 'GENERAL_CHAT' };
    if (/^(give me tips|any tips|tips for|advice on|how do i stay)\b/.test(t) && !/\b(clo|email|mail|vault|marks|attendance|portal|attainment)\b/.test(t)) return { intent: 'GENERAL_CHAT' };
    if (/(er rajdhani ki|ta ki bujhiye dao)\??$/.test(t)) return { intent: 'GENERAL_CHAT' };
    const appTerms = /\b(clo|co\d|po\d|class|classes|course|student|students|email|mail|vault|password|portal|marks|attendance|schedule|attainment|quiz|result|grade|pass|rate|bloom level|outcome|remind|model)\b/;
    if (/^(explain what|what is|what's|who invented|who was|can you help me understand|tell me about|write a short poem|what's the difference)\b/.test(t) && !appTerms.test(t)) {
      return { intent: 'GENERAL_CHAT' };
    }
    return null;
  },
];

/**
 * @param {string} message
 * @returns {{intent:string, confidence:number, entities:object, raw_query:string, source:'rule', needsModel?:boolean} | null}
 */
function classifyByRules(message) {
  const m = String(message || '').trim();
  if (!m || m.length > 300) return null;
  const t = fixTypos(m.toLowerCase().replace(/\s+/g, ' '));
  for (const rule of RULES) {
    const r = rule(m, t);
    if (r) {
      return {
        intent: r.intent, confidence: 1,
        entities: { course_code: null, student_name: null, datetime: null, reminder_text: null, model: null, email_category: null, portal: null, clo_text: null, ...(r.entities || {}) },
        raw_query: m, source: 'rule', ...(r.needsModel ? { needsModel: true } : {}),
      };
    }
  }
  return null;
}

module.exports = { classifyByRules, courseCode, fixTypos };
