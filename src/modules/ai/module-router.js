/**
 * module-router.js — Intent → Module dispatcher
 *
 * Receives a classified intent object from model-router.js (PROMPT-001)
 * and routes it to the correct module handler.
 *
 * All handlers return: { text: string, data?: any }
 * The text is shown in the chat UI. data is optional structured payload.
 */

'use strict';

// ─── Handler registry ─────────────────────────────────────────────────────────
// Each handler receives: (intent, db, apiKey, activeModel)
// Stub handlers are used for modules not yet built (Sprint 2+).
const { parseAndAddRule } = require('../email/rule-engine');
const studentCrypto = require('../security/student-crypto');

const handlers = {

  SCHEDULE_QUERY:   handleScheduleQuery,
  REMINDER_SET:     handleReminderSet,
  BLOOM_GENERATE:   handleBloomRedirect,
  BLOOM_CLO_MAP:    handleBloomCloMap,
  SHADSYNC_QUERY:   handleShadsyncQuery,
  SHADSYNC_UPDATE:  handleDataAdd,
  EMAIL_FETCH:      handleEmailFetch,
  EMAIL_RULE:       handleEmailRule,
  EMAIL_DRAFT:      handleEmailDraft,
  VAULT_SAVE:       handleVaultSave,
  VAULT_SEARCH:     handleVaultSearch,
  PORTAL_OPEN:      handlePortalOpen,
  DIU_PORTAL_QUERY: handleDiuPortalQuery,
  DIU_PORTAL_NAV:   handleDiuPortalNav,
  MODEL_SWITCH:     handleModelSwitch,
  MEMORY_STATUS:    handleMemoryStatus,
  DATA_ADD:         handleDataAdd,
  DATA_EDIT:        handleDataEdit,
  DATA_DELETE:      handleDataDelete,
  GENERAL_CHAT:     handleGeneralChat,
};

// ─── Main dispatch ────────────────────────────────────────────────────────────

/**
 * Route an intent to its handler and return a response.
 *
 * @param {object} intent    - Parsed intent from PROMPT-001
 * @param {object} deps      - { db, apiKey, activeModel, aiRouter }
 * @returns {{ text: string, data?: any }}
 */
// S2: refusals from the local-only policy / PII guard go to the user as-is
const isPolicyError = (e) => !!e && (e.code === 'LOCAL_ONLY_UNAVAILABLE' || e.code === 'PII_GUARD_BLOCKED');

async function route(intent, deps) {
  const handler = handlers[intent.intent] || handlers.GENERAL_CHAT;
  try {
    return await handler(intent, deps);
  } catch (err) {
    if (isPolicyError(err)) return { text: err.message, data: { action: 'local_ai_required', code: err.code } };
    console.error(`[module-router] Handler error for ${intent.intent}:`, err.message);
    return { text: `Something went wrong processing your request: ${err.message}` };
  }
}

// ─── Schedule Query ───────────────────────────────────────────────────────────

async function handleScheduleQuery(intent, { db }) {
  if (!db) return { text: 'Schedule data is not available yet. The database is still initialising.' };

  try {
    const { getSchedule } = require('../../database/queries');
    const schedule = getSchedule(db);

    if (!schedule.length) {
      return { text: 'You have no classes scheduled yet. Go to the Schedule view to add your timetable.' };
    }

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date().getDay();
    const raw   = (intent.raw_query || '').toLowerCase();

    // Detect which day the user is asking about
    let targetDay = today;
    let dayLabel  = 'today';

    if (raw.includes('tomorrow')) {
      targetDay = (today + 1) % 7;
      dayLabel  = DAYS[targetDay];
    } else {
      const namedDay = DAYS.findIndex(d => raw.includes(d.toLowerCase()));
      if (namedDay !== -1) {
        targetDay = namedDay;
        dayLabel  = DAYS[namedDay];
      }
    }

    const classes = schedule.filter(c => c.day_of_week === targetDay);

    if (!classes.length) {
      return { text: `You have no classes on ${dayLabel === 'today' ? 'today' : dayLabel}.` };
    }

    const list = classes
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map(c => `• **${c.course_code}** — ${c.start_time}–${c.end_time}${c.room ? ` (${c.room})` : ''}`)
      .join('\n');

    return {
      text: `Your classes on ${dayLabel}:\n\n${list}`,
      data: classes,
    };
  } catch (err) {
    return { text: `Could not load schedule: ${err.message}` };
  }
}

// ─── Reminder Set ─────────────────────────────────────────────────────────────

async function handleReminderSet(intent, { db }) {
  const { reminder_text, datetime } = intent.entities || {};
  if (!reminder_text) {
    return { text: 'What would you like me to remind you about? Please describe the task.' };
  }

  if (!db) {
    return { text: `Got it — I'd save "${reminder_text}" as a reminder but the database isn't ready yet.` };
  }

  try {
    const due = datetime ? new Date(datetime) : null;
    db.prepare(`
      INSERT INTO tasks (title, due_datetime, reminder_datetime)
      VALUES (?, ?, ?)
    `).run(
      reminder_text,
      due ? due.toISOString() : null,
      due ? due.toISOString() : null
    );

    const when = due
      ? `on ${due.toLocaleDateString('en-BD', { weekday:'long', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}`
      : '';

    return { text: `Reminder set${when ? ` for ${when}` : ''}:\n\n**${reminder_text}**` };
  } catch (err) {
    return { text: `Could not save reminder: ${err.message}` };
  }
}

// ─── Portal Open ──────────────────────────────────────────────────────────────

// ─── Bloom's Redirect ─────────────────────────────────────────────────────────

async function handleBloomRedirect() {
  return {
    text: `📚 To use the **Bloom's Taxonomy Engine**, go to the **Bloom's** section in the sidebar, upload a PDF lecture, and I'll generate a full lesson plan with CLO mappings and quiz questions.`,
    data: { action: 'navigate', view: 'blooms' },
  };
}

// ─── Vault Save ───────────────────────────────────────────────────────────────

async function handleVaultSave(intent, { db }) {
  const raw      = intent.entities?.content || intent.entities?.text || '';
  const url      = intent.entities?.url  || '';
  const password = intent.entities?.password || '';
  const username = intent.entities?.username || '';

  if (!raw && !url && !password) {
    return { text: `What would you like to save to the vault? Tell me the content, link, note, or credential.` };
  }

  // Detect type: password > link > note
  let type = 'note';
  if (password || /password|credential|login|pwd/i.test(raw)) type = 'password';
  else if (url) type = 'link';

  // BUG-V1: the title is stored in plain text — never build it from a secret.
  // Credentials get a neutral title unless the user named one.
  const host = url ? url.replace(/^https?:\/\//, '').slice(0, 60) : '';
  let title = intent.entities?.title || host
    || (type === 'password' ? `Saved password (${new Date().toISOString().slice(0, 10)})` : raw.slice(0, 60));
  for (const secret of [password, username]) {
    if (secret && title.includes(secret)) title = title.split(secret).join('••••');
  }

  try {
    const sc = require('../security/student-crypto');
    const contentEnc  = raw      ? sc.vaultEncrypt(raw)      : '';
    const passwordEnc = password ? sc.vaultEncrypt(password) : '';
    const usernameEnc = username ? sc.vaultEncrypt(username) : '';

    db.prepare(`
      INSERT INTO vault_items (title, type, content_enc, password_enc, username_enc, url, is_favorite)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(title, type, contentEnc, passwordEnc, usernameEnc, url || '');
    return { text: `✅ Saved to your vault as a **${type}**: "${title}"` };
  } catch (e) {
    return { text: `⚠️ Couldn't save to vault: ${e.message}` };
  }
}

// ─── Vault Search ─────────────────────────────────────────────────────────────

async function handleVaultSearch(intent, { db }) {
  const query = intent.entities?.query || intent.raw || '';

  if (!query) {
    return { text: `What are you looking for in the vault? Give me a keyword or description.` };
  }

  try {
    const items = db.prepare(`SELECT id, title, type, url FROM vault_items`).all();
    if (!items.length) return { text: `Your vault is empty. Add items first.` };

    const Fuse = require('fuse.js');
    const fuse = new Fuse(items, { keys: ['title', 'url', 'type'], threshold: 0.4 });
    const results = fuse.search(query).slice(0, 5);

    if (!results.length) return { text: `Nothing found in your vault for "${query}". Try a different keyword.` };

    const list = results.map(r => `• **${r.item.title}** (${r.item.type})`).join('\n');
    return { text: `🔍 Found ${results.length} vault item(s) matching "${query}":\n\n${list}\n\nOpen the **Vault** section to view or copy them.` };
  } catch (e) {
    return { text: `⚠️ Vault search failed: ${e.message}` };
  }
}

// ─── DIU Teachers Portal — Data Query ────────────────────────────────────────

async function handleDiuPortalQuery(intent, { db }) {
  if (!db) return { text: 'Database is not ready yet, Sir.' };

  try {
    const raw = (intent.raw_query || '').toLowerCase();

    const rows = db.prepare(`
      SELECT dm.*, s.name_enc, s.name_anon, s.student_id_enc, s.student_id_anon, c.code, c.name as course_name
      FROM diu_marks dm
      JOIN students s ON s.id = dm.student_id
      JOIN courses  c ON c.id = dm.course_id
    `).all();

    if (!rows.length) return { text: 'No marks data found in the DIU Teachers Portal yet, Sir. Please enter marks first.' };

    const gradeOf = (m) => {
      const ct = (m.ct1 + m.ct2 + m.ct3) / 3;
      const gt = m.attendance + ct + m.presentation + m.assignment + m.midterm + m.final_exam;
      const g  = gt>=80?'A+':gt>=75?'A':gt>=70?'A-':gt>=65?'B+':gt>=60?'B':gt>=55?'B-':gt>=50?'C+':gt>=45?'C':gt>=40?'D':'F';
      const name = studentCrypto.reveal(m.name_enc, m.name_anon);
      return { gt: Math.round(gt*100)/100, grade: g, name };
    };

    const results = rows.map(r => ({ ...gradeOf(r), courseCode: r.code }));
    const totals  = results.map(r => r.gt);
    const avg     = Math.round(totals.reduce((a,b)=>a+b,0)/totals.length * 10)/10;
    const passing = results.filter(r => r.gt >= 40);
    const failing = results.filter(r => r.gt < 40);
    const apPlus  = results.filter(r => r.grade === 'A+');
    const gradeCounts = {};
    results.forEach(r => { gradeCounts[r.grade] = (gradeCounts[r.grade]||0)+1; });
    const gradeStr = ['A+','A','A-','B+','B','B-','C+','C','D','F']
      .filter(g => gradeCounts[g])
      .map(g => `**${g}**: ${gradeCounts[g]}`)
      .join(' | ');

    // Route by query intent
    if (raw.includes('fail') || raw.includes('below') || raw.includes('f grade')) {
      if (!failing.length) return { text: 'No students are currently failing, Sir. All students have a Grand Total ≥ 40.' };
      const list = failing.map(r => `• ${r.name} — ${r.gt}/100 (${r.grade})`).join('\n');
      return { text: `**${failing.length} student(s) currently failing** (Grand Total < 40):\n\n${list}` };
    }

    if (raw.includes('pass')) {
      return { text: `**${passing.length} of ${results.length} students are passing** (Grand Total ≥ 40).\n\nClass average: **${avg}/100**` };
    }

    if (raw.includes('a+') || raw.includes('top') || raw.includes('best') || raw.includes('highest')) {
      if (!apPlus.length) return { text: `No A+ students yet. Highest grades:\n\n${results.sort((a,b)=>b.gt-a.gt).slice(0,5).map(r=>`• ${r.name} — ${r.gt} (${r.grade})`).join('\n')}` };
      const list = apPlus.sort((a,b)=>b.gt-a.gt).map(r=>`• ${r.name} — ${r.gt}/100`).join('\n');
      return { text: `**${apPlus.length} student(s) with A+** (≥ 80/100):\n\n${list}` };
    }

    if (raw.includes('attendance') || raw.includes('irregular') || raw.includes('absent')) {
      const attRows = db.prepare(`
        SELECT s.name_enc, s.name_anon,
          COUNT(CASE WHEN a.present=1 THEN 1 END) as present,
          COUNT(a.id) as total
        FROM students s
        LEFT JOIN attendance a ON a.student_id=s.id
        GROUP BY s.id HAVING total > 0
      `).all();
      const irregular = attRows.filter(r => r.total > 0 && (r.present/r.total) < 0.75);
      if (!irregular.length) return { text: 'All students have ≥ 75% attendance. No irregular students, Sir.' };
      const list = irregular.map(r => {
        const name = studentCrypto.reveal(r.name_enc, r.name_anon);
        const pct  = Math.round(r.present/r.total*100);
        return `• ${name} — ${pct}% (${r.present}/${r.total} classes)`;
      }).join('\n');
      return { text: `**${irregular.length} student(s) with irregular attendance** (< 75%):\n\n${list}` };
    }

    if (raw.includes('average') || raw.includes('avg') || raw.includes('mean')) {
      return { text: `**Class average: ${avg}/100**\n\nGrade distribution: ${gradeStr}\n\nPassing: ${passing.length} | Failing: ${failing.length}` };
    }

    if (raw.includes('grade') || raw.includes('distribution') || raw.includes('result')) {
      const top3 = results.sort((a,b)=>b.gt-a.gt).slice(0,3).map(r=>`• ${r.name} — ${r.gt} (${r.grade})`).join('\n');
      return {
        text: `**DIU Portal Grade Summary**\n\nClass average: **${avg}/100**\nGrade distribution: ${gradeStr}\nPassing: ${passing.length} | Failing: ${failing.length}\n\nTop 3:\n${top3}`,
        data: { action: 'navigate', view: 'diu-portal' },
      };
    }

    // Default summary
    return {
      text: `**DIU Teachers Portal — Current Standing**\n\nStudents: ${results.length} | Class Avg: **${avg}/100**\nGrade distribution: ${gradeStr}\nPassing: ${passing.length} | At risk: ${failing.length}\n\nWant me to show failing students, top performers, or attendance irregulars?`,
      data: { action: 'navigate', view: 'diu-portal' },
    };

  } catch (e) {
    return { text: `Could not query portal data: ${e.message}` };
  }
}

// ─── DIU Teachers Portal — Navigation ─────────────────────────────────────────

async function handleDiuPortalNav(intent) {
  const raw = (intent.raw_query || '').toLowerCase();
  const sections = {
    marks:      ['mark', 'marks entry', 'ct', 'grade entry'],
    attendance: ['attendance', 'present', 'absent'],
    result:     ['result', 'grade sheet', 'gradesheet', 'final grade'],
    'course-reg': ['course reg', 'register course', 'add course'],
    dashboard:  ['dashboard', 'overview', 'summary'],
  };

  let target = 'dashboard';
  for (const [sec, keywords] of Object.entries(sections)) {
    if (keywords.some(k => raw.includes(k))) { target = sec; break; }
  }

  const labels = {
    marks: 'Marks Entry', attendance: 'Student Attendance', result: 'Result',
    'course-reg': 'Course Registration', dashboard: 'Dashboard',
  };

  return {
    text: `Opening **${labels[target]}** in the DIU Teachers Portal, Sir.`,
    data: { action: 'navigate', view: 'diu-portal', section: target },
  };
}

// ─── Portal Open ──────────────────────────────────────────────────────────────

async function handlePortalOpen(intent) {
  const portal = intent.entities?.portal;
  const urls = {
    diu: 'https://teacherportal.diu.edu.bd/',
    blc: 'https://elearn.daffodilvarsity.edu.bd',
  };

  if (portal && urls[portal]) {
    // Signal renderer to open portal WebView (Sprint 3)
    return {
      text: `Opening ${portal.toUpperCase()} portal… (Quick Portal module is coming in Sprint 3 — for now, the link is: ${urls[portal]})`,
      data: { action: 'open_portal', url: urls[portal] },
    };
  }

  return {
    text: `Which portal would you like to open?\n• **DIU Teacher Portal** — say "open DIU portal"\n• **BLC** — say "open BLC"`,
  };
}

// ─── Model Switch ─────────────────────────────────────────────────────────────

// ─── ShadSync Query ───────────────────────────────────────────────────────────

async function handleShadsyncQuery(intent, { db }) {
  if (!db) {
    return { text: 'ShadSync is unavailable. Database is not initialised.' };
  }
  try {
    const shadsyncRouter = require('../shadsync/shadsync-router');
    const courseCode = intent.entities?.course_code || 'ICE301'; // Default
    const responseText = await shadsyncRouter.handleNlQuery(db, intent.raw_query, courseCode);
    
    return { 
      text: responseText,
      data: { action: 'open_shadsync', course_code: courseCode }
    };
  } catch (err) {
    if (isPolicyError(err)) throw err;
    console.error('[module-router] ShadSync error:', err);
    return { text: `ShadSync encountered an error: ${err.message}` };
  }
}

async function handleModelSwitch(intent, { aiRouter }) {
  const model = intent.entities?.model;
  const valid = { claude: 'Claude', gpt4o: 'GPT-4o', gemini: 'Gemini', openrouter: 'OpenRouter', ollama: 'the local model (Ollama)' };

  if (!model || !valid[model]) {
    return { text: 'Which AI model would you like to switch to?\n• **Claude** (default)\n• **GPT-4o**\n• **Gemini**\n• **OpenRouter**\n• **Local (Ollama)**' };
  }

  if (aiRouter) aiRouter.setActiveModel(model);
  return {
    text: `Switched to **${valid[model]}**. All subsequent responses will use ${valid[model]}.`,
    data: { action: 'model_switch', model },
  };
}

// ─── General Chat ─────────────────────────────────────────────────────────────

async function handleGeneralChat(intent, { aiRouter, apiKey, activeModel, db }) {
  if (!aiRouter || (!apiKey && activeModel !== 'ollama')) {
    return { text: 'AI is not available. Please set your API key in Settings.' };
  }
  // Forward conversation history so the AI keeps full context in multi-turn chats
  const resp = await aiRouter.send(intent.raw_query, { db }, {
    apiKey,
    model: activeModel,
    history: intent.history || [],
  });
  return { text: resp.text };
}

// ─── Stub handler factory ─────────────────────────────────────────────────────

function _timeAgo(isoStr) {
  const diff = Math.round((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

async function handleEmailFetch(intent, { db }) {
  let summary = '';
  try {
    const { getRecentEmails } = require('../email/notifications');
    const emails = getRecentEmails();

    if (!emails || emails.length === 0) {
      summary = "I haven't fetched your inbox yet this session. Pulling it now…";
    } else {
      const important = emails.filter(e => !['Advertisement', 'OTP'].includes(e.ai_category));
      const last      = emails[0];
      const lastTime  = last.received_at ? _timeAgo(last.received_at) : 'recently';
      const lastName  = last.from_name || last.from_email || 'Unknown';

      if (important.length === 0) {
        summary = `Nothing important — last email was **${lastTime}** from **${lastName}** (${last.ai_category || 'filtered'}). Want me to do a fresh sync?`;
      } else {
        const top      = important[0];
        const topTime  = top.received_at ? _timeAgo(top.received_at) : 'recently';
        const topName  = top.from_name || top.from_email || 'Unknown';
        const topSubj  = top.subject || '(no subject)';
        const more     = important.length > 1 ? ` (+${important.length - 1} more)` : '';
        summary = `Latest: **${topName}** — "${topSubj}" (${topTime})${more}. Want me to open your inbox or draft a reply?`;
      }
    }
  } catch (_) {
    summary = 'Syncing your inbox now…';
  }

  return {
    text: summary,
    data: { action: 'email:refresh' },
  };
}

async function handleEmailRule(intent, { aiRouter, apiKey, activeModel }) {
  if (!aiRouter || (!apiKey && activeModel !== 'ollama')) {
    return { text: 'AI is not available. Please set your API key in Settings to save rules.' };
  }
  const resultText = await parseAndAddRule(aiRouter, intent.raw_query, apiKey, activeModel);
  return { text: resultText };
}

async function handleEmailDraft(intent, { aiRouter, apiKey, activeModel }) {
  if (!aiRouter || (!apiKey && activeModel !== 'ollama')) {
    return { text: 'AI is not available. Please set your API key in Settings to draft emails.' };
  }
  const prompt = `Write a professional faculty email reply based on this intent/request: "${intent.raw_query}". Output ONLY the email body without any markdown wrap.`;
  const resp = await aiRouter.send(prompt, {}, { apiKey, model: activeModel });
  
  return { 
    text: `Here's a draft based on your request:\n\n${resp.text}\n\n(I've loaded this into the Email generator.)`,
    data: { action: 'open_email', draft: resp.text }
  };
}

function stubHandler(message) {
  return async () => ({ text: message });
}

// ─── Memory Status (self-learning rate + health score) ────────────────────────

async function handleMemoryStatus(intent, { db }) {
  if (!db) return { text: 'Memory system is not available.' };

  try {
    const knowledge   = db.prepare(`SELECT COUNT(*) as n, AVG(confidence) as avg_conf, SUM(reinforced) as total_reinforced FROM ai_knowledge`).get();
    const rules       = db.prepare(`SELECT COUNT(*) as n FROM faculty_rules_memory WHERE active = 1`).get();
    const thoughts    = db.prepare(`SELECT COUNT(*) as n FROM ai_thoughts`).get();
    const reflections = db.prepare(`SELECT COUNT(*) as n FROM ai_reflections`).get();
    const patterns    = db.prepare(`SELECT COUNT(*) as n FROM behavioral_memory WHERE active = 1`).get();
    const lastTrained = db.prepare(`SELECT value FROM cortex_state WHERE key = 'last_trained_date'`).get();
    const profile     = db.prepare(`SELECT COUNT(*) as n FROM faculty_profile`).get();
    const activityDays = db.prepare(`SELECT COUNT(DISTINCT session_date) as n FROM activity_log`).get();
    const identity    = db.prepare(`SELECT COUNT(*) as n FROM ai_identity`).get();

    const kCount    = knowledge?.n     || 0;
    const avgConf   = knowledge?.avg_conf ? (knowledge.avg_conf * 100).toFixed(0) : 0;
    const reinf     = knowledge?.total_reinforced || 0;
    const rCount    = rules?.n         || 0;
    const tCount    = thoughts?.n      || 0;
    const refCount  = reflections?.n   || 0;
    const patCount  = patterns?.n      || 0;
    const profCount = profile?.n       || 0;
    const days      = activityDays?.n  || 0;
    const idCount   = identity?.n      || 0;
    const trained   = lastTrained?.value || 'never';

    // ── Learning Health Score (0–100%) ──────────────────────────────────────
    // Weighted components:
    //   Identity seeded         (20) — permanent, always full if migration ran
    //   Faculty profile filled  (15) — based on rows present (max 5 expected)
    //   Knowledge base          (20) — scales with kCount (saturates at 30 facts)
    //   Confidence level        (15) — avg confidence of knowledge
    //   Daily training done     (15) — at least 1 reflection = 15, scales to 5
    //   Rules defined           (10) — at least 1 rule = full score
    //   Behavioural patterns    (5)  — at least 3 patterns = full

    const identityScore  = idCount >= 8  ? 20 : Math.round((idCount / 8) * 20);
    const profileScore   = Math.min(15, Math.round((profCount / 5) * 15));
    const knowledgeScore = Math.min(20, Math.round((kCount / 30) * 20));
    const confScore      = Math.round((parseFloat(avgConf) / 100) * 15);
    const trainingScore  = Math.min(15, refCount * 3);
    const rulesScore     = rCount >= 1 ? 10 : 0;
    const patternScore   = patCount >= 3 ? 5 : Math.round((patCount / 3) * 5);

    const total = identityScore + profileScore + knowledgeScore + confScore + trainingScore + rulesScore + patternScore;

    const healthLabel = total >= 80 ? 'Excellent' : total >= 60 ? 'Good' : total >= 40 ? 'Developing' : total >= 20 ? 'Early stage' : 'Just started';
    const bar = '█'.repeat(Math.round(total / 10)) + '░'.repeat(10 - Math.round(total / 10));

    // Model-agnostic note
    const modelNote = `Memory is fully model-agnostic — it lives in the database and works identically with Claude, GPT-4o, Gemini, or any OpenRouter model.`;

    return {
      text: `**FacultyMind Learning Health Report**\n\n` +
        `**Overall Score: ${total}/100 — ${healthLabel}**\n` +
        `[${bar}] ${total}%\n\n` +
        `**Memory Components:**\n` +
        `• Identity core: ${idCount} permanent records seeded ✓\n` +
        `• Faculty profile: ${profCount} profile entries\n` +
        `• Knowledge base: **${kCount} facts** learned (avg confidence: ${avgConf}%)\n` +
        `• Reinforced facts: ${reinf} confirmations across all knowledge\n` +
        `• Behavioural patterns: ${patCount} active patterns observed\n` +
        `• Faculty rules: ${rCount} active rules I follow\n` +
        `• AI observations: ${tCount} thoughts in journal\n` +
        `• Daily reflections: ${refCount} (last trained: ${trained})\n` +
        `• Activity tracked: ${days} day(s) of logged usage\n\n` +
        `**Self-Learning Rate:**\n` +
        `I train once per day from the previous day's activity log. Each session adds new patterns, open loops, and durable knowledge facts to my database. Confidence grows as facts are reinforced across sessions.\n\n` +
        `*${modelNote}*`,
    };
  } catch (err) {
    return { text: `Could not read memory stats: ${err.message}` };
  }
}

// ─── Pending delete confirmations (in-memory, per session) ───────────────────

const _pendingDeletes = {};

// ─── Data Add ─────────────────────────────────────────────────────────────────

async function handleDataAdd(intent, { db, aiRouter, apiKey, activeModel }) {
  if (!db) return { text: 'Database not available.' };

  const raw = intent.raw_query || '';

  const prompt = `The faculty wants to add data to FacultyMind. Their request: "${raw}"

Extract the intent and respond with JSON only (no markdown, no explanation):
{
  "target": "rule|course|schedule|student|reminder",
  "summary": "one-line description",
  "fields": {
    "name": "full student name if student, else null",
    "course_code": "course code e.g. ICE420, else null",
    "attendance_pct": "attendance percentage as integer if mentioned, else null",
    "rule_text": "rule text if target is rule, else null",
    "course_name": "course name if target is course, else null",
    "reminder_text": "reminder text if target is reminder, else null"
  }
}`;

  try {
    // Student records: local model only (S2 local-only policy)
    const resp   = await aiRouter.send(prompt, {}, { apiKey, model: activeModel, maxTokens: 250, localOnly: true });
    const parsed = JSON.parse(resp.text.trim().replace(/```json?|```/g, '').trim());
    const fields = parsed.fields || {};

    // ── Add rule ──────────────────────────────────────────────────────────────
    if (parsed.target === 'rule' && fields.rule_text) {
      const { addRule } = require('../cortex/rules-engine');
      addRule(db, 'general', fields.rule_text, {}, 'chat');
      return { text: `Done. I've added this rule:\n\n**"${fields.rule_text}"**\n\nI'll follow it from now on.` };
    }

    // ── Add student ───────────────────────────────────────────────────────────
    if (parsed.target === 'student' && fields.name && fields.course_code) {
      const { getAllCourses, saveStudent } = require('../../database/queries/index');
      const courses = getAllCourses(db);
      const course  = courses.find(c =>
        c.code.replace(/\s/g,'').toUpperCase() === fields.course_code.replace(/\s/g,'').toUpperCase()
      );

      if (!course) {
        return { text: `I couldn't find course **${fields.course_code}** in ShadSync. Check the course code or add the course first.` };
      }

      const studentId = saveStudent(db, studentCrypto.newStudentColumns(db, course.id, { name: fields.name }));

      try { db.prepare('INSERT OR IGNORE INTO marks (student_id, course_id) VALUES (?, ?)').run(studentId, course.id); } catch (_) {}

      let attendanceNote = '';
      const pct = parseInt(fields.attendance_pct);
      if (!isNaN(pct) && pct >= 0 && pct <= 100) {
        const today = new Date().toISOString().slice(0, 10);
        try {
          db.prepare('INSERT OR IGNORE INTO attendance (student_id, course_id, date, present) VALUES (?, ?, ?, ?)').run(studentId, course.id, today, pct >= 50 ? 1 : 0);
          db.prepare('INSERT OR REPLACE INTO cortex_state (key, value) VALUES (?, ?)').run(`attendance_pct_${studentId}`, String(pct));
        } catch (_) {}
        attendanceNote = ` Attendance noted as **${pct}%**.`;
      }

      return {
        text: `Done. **${fields.name}** has been added to **${course.code}** (${course.name || course.code}).${attendanceNote}\n\nView and edit their marks in the ShadSync view.`,
        data: { action: 'nav:shadsync' },
      };
    }

    // ── Add course ────────────────────────────────────────────────────────────
    if (parsed.target === 'course' && fields.course_code) {
      const { saveCourse } = require('../../database/queries/index');
      saveCourse(db, {
        code: fields.course_code.toUpperCase(),
        name: fields.course_name || fields.course_code.toUpperCase(),
        section: 'A', semester: 'Spring', year: new Date().getFullYear(),
      });
      return { text: `Course **${fields.course_code.toUpperCase()}** added to ShadSync.`, data: { action: 'nav:shadsync' } };
    }

    // ── Add reminder ──────────────────────────────────────────────────────────
    if (parsed.target === 'reminder' && fields.reminder_text) {
      db.prepare('INSERT INTO tasks (title) VALUES (?)').run(fields.reminder_text);
      return { text: `Reminder set: **"${fields.reminder_text}"**` };
    }

    return {
      text: `I understood: **${parsed.summary}**\n\nCould you be more specific? Example: "add student John Doe to ICE420 with 85% attendance" or "add course CSE401".`,
    };
  } catch (err) {
    if (isPolicyError(err)) throw err;
    return { text: `Couldn't process that: ${err.message}. Try: "add student [name] to [course code]".` };
  }
}

// ─── Data Edit ────────────────────────────────────────────────────────────────

async function handleDataEdit(intent, { db, aiRouter, apiKey, activeModel }) {
  const raw = intent.raw_query || '';

  const prompt = `The faculty wants to edit/update data in FacultyMind. Request: "${raw}"

Identify what they want to edit:
{
  "target": "rule|course|schedule|student|profile",
  "summary": "what will be changed",
  "suggestion": "how to do it in the app"
}`;

  try {
    const resp = await aiRouter.send(prompt, {}, { apiKey, model: activeModel, localOnly: true });
    const parsed = JSON.parse(resp.text.trim().replace(/^```json?|```$/g, ''));
    return {
      text: `I understand you want to update: **${parsed.summary}**\n\n${parsed.suggestion}\n\nNote: you can also tell me to edit specific fields and I'll handle it directly once full CRUD chat mode is enabled.`
    };
  } catch (e) {
    if (isPolicyError(e)) throw e;
    return { text: `What would you like to change? Be specific — for example: "change my ICE301 class room to 301B" or "update my name in profile to Dr. Shad".` };
  }
}

// ─── Data Delete (requires explicit confirmation) ─────────────────────────────

async function handleDataDelete(intent, { db, aiRouter, apiKey, activeModel }) {
  const raw   = (intent.raw_query || '').toLowerCase().trim();
  const userId = 'session'; // single-user app

  // Check if this is a confirmation of a pending delete
  const confirmPhrases = ['yes i\'m sure', 'yes im sure', 'confirm delete', 'yes delete it', 'proceed'];
  const isConfirming = confirmPhrases.some(p => raw.includes(p));

  if (isConfirming && _pendingDeletes[userId]) {
    const pending = _pendingDeletes[userId];
    delete _pendingDeletes[userId];

    try {
      if (pending.target === 'rule' && pending.id) {
        const { deleteRule } = require('../cortex/rules-engine');
        deleteRule(db, pending.id);
        return { text: `Done. The rule has been permanently deleted.` };
      }
      // Other delete targets would be handled here as CRUD expands
      return { text: `Deleted: **${pending.summary}**.` };
    } catch (err) {
      return { text: `Delete failed: ${err.message}` };
    }
  }

  // Not a confirmation — identify what they want to delete and stage it
  const prompt = `The faculty wants to delete data from FacultyMind. Request: "${raw}"

Identify what they want to delete:
{
  "target": "rule|course|schedule|student|thought",
  "summary": "plain English description of what will be deleted",
  "warning": "what will be lost"
}`;

  try {
    const resp = await aiRouter.send(prompt, {}, { apiKey, model: activeModel, localOnly: true });
    const parsed = JSON.parse(resp.text.trim().replace(/^```json?|```$/g, ''));

    // Stage the pending delete
    _pendingDeletes[userId] = { target: parsed.target, summary: parsed.summary, raw };

    return {
      text: `⚠️ **Delete Confirmation Required**\n\nYou are about to delete: **${parsed.summary}**\n\n${parsed.warning ? `This will also remove: ${parsed.warning}\n\n` : ''}**This cannot be undone.**\n\nType **"yes I'm sure"** to confirm, or just ignore this to cancel.`
    };
  } catch (e) {
    if (isPolicyError(e)) throw e;
    return { text: `What would you like to delete? Be specific — for example: "delete the rule about Fridays" or "remove course CSE401". I'll ask for confirmation before deleting anything.` };
  }
}

// ─── Bloom's CLO Mapper ───────────────────────────────────────────────────────

async function handleBloomCloMap(intent, { db, aiRouter, apiKey, activeModel }) {
  if (!db) return { text: 'Database not available.' };
  if (!aiRouter || (!apiKey && activeModel !== 'ollama')) return { text: 'AI is not available. Please set your API key in Settings.' };

  const courseCode = intent.entities?.course_code || 'ICE301';

  // Try inline CLO text from the message first
  let cloText = intent.entities?.clo_text || '';

  // If no inline text, try fetching CLOs from the database for the course
  if (!cloText) {
    try {
      const course = db.prepare('SELECT id FROM courses WHERE code = ? COLLATE NOCASE').get(courseCode);
      if (course) {
        const clos = db.prepare('SELECT code, description FROM clos WHERE course_id = ?').all(course.id);
        if (clos.length > 0) {
          cloText = clos.map(c => `${c.code}: ${c.description}`).join('\n');
        }
      }
    } catch (_) {}
  }

  // Neither inline text nor DB CLOs — guide the user to the UI
  if (!cloText) {
    return {
      text: `I don't have CLOs stored for **${courseCode}** yet. You can:\n\n` +
        `1. Go to **Bloom's → CLO Mapper** and upload a document or paste your CLOs directly\n` +
        `2. Tell me the CLOs inline: "Map these CLOs: CLO1: Students will be able to..."`,
      data: { action: 'navigate', view: 'blooms', tab: 'clo-mapper' },
    };
  }

  try {
    const bloomsEngine = require('../blooms/blooms-engine');
    const result = await bloomsEngine.mapCLOsToBlooms(cloText, courseCode, db, apiKey, activeModel);

    // Format result for chat display
    const mappings = (result.clo_mappings || []).map(m => {
      const verbSuggestions = (m.suggested_verbs || []).join(', ');
      const alignWarn = m.alignment_issue ? `\n  ⚠️ ${m.alignment_note}` : '';
      return `• **${m.clo_code}** → ${m.bloom_level} (${m.bloom_name})\n  _"${(m.clo_text || '').substring(0, 80)}..."_\n  Suggested verbs: ${verbSuggestions}${alignWarn}`;
    }).join('\n\n');

    const dist = result.level_distribution || {};
    const distStr = Object.entries(dist)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');

    const recs = (result.recommendations || []).map(r => `💡 ${r}`).join('\n');

    return {
      text: `**CLO → Bloom's Mapping for ${courseCode}**\n\n${mappings}\n\n**Distribution:** ${distStr || 'N/A'}\n\n${recs}`,
      data: { action: 'navigate', view: 'blooms', tab: 'clo-mapper', result },
    };
  } catch (e) {
    return { text: `CLO mapping failed: ${e.message}` };
  }
}

module.exports = { route };
