# FacultyMind — Code Skills and Reusable Patterns
# Claude Code: use these exact patterns throughout the project.
# Do NOT reinvent these. Copy and adapt them.
# Consistency in code structure is as important as consistency in UI.

---

## SKILL-001: Making an AI Call (The Only Correct Way)

```javascript
// /src/modules/ai/model-router.js usage
// ALWAYS use this. NEVER call AI APIs directly from modules.

const { aiRouter } = require('../ai/model-router');

async function exampleAICall(userInput, courseCode) {
  // Step 1: Build context (never skip this)
  const memoryContext = await memoryManager.buildContext();

  // Step 2: Anonymise if student data involved
  const { anonymisedData, tokenMap } = await anonymise(studentData);

  // Step 3: Build prompt using template from PROMPTS.md
  const prompt = buildPrompt('PROMPT-005', {
    professor_query: userInput,
    active_course_code: courseCode,
    student_data: anonymisedData  // anonymised only
  });

  // Step 4: Send through router
  try {
    const response = await aiRouter.send(prompt, memoryContext);

    // Step 5: Re-associate if needed
    const result = reAssociate(response.text, tokenMap);

    return { success: true, data: result, model: response.model };
  } catch (error) {
    logger.error('AI call failed:', error.message);  // never log full error object
    return { success: false, error: 'AI service unavailable. Check your API key in Settings.' };
  }
}
```

---

## SKILL-002: SQLite Query (Safe Pattern)

```javascript
// /src/database/queries/example-queries.js
// Always use parameterised queries. NEVER string interpolation in SQL.

const db = require('../db-connection');

// READ
function getStudentsByCourse(courseCode) {
  const stmt = db.prepare(`
    SELECT s.*, m.q1, m.q2, m.midterm, m.final, m.assignment, m.lab
    FROM students s
    LEFT JOIN marks m ON m.student_id = s.id
    WHERE s.course_id = (SELECT id FROM courses WHERE code = ?)
    ORDER BY s.student_id_anon ASC
  `);
  return stmt.all(courseCode);  // better-sqlite3 is synchronous
}

// WRITE
function saveMarks(studentId, courseId, marks) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO marks
    (student_id, course_id, q1, q2, midterm, final, assignment, lab, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  return stmt.run(
    studentId, courseId,
    marks.q1, marks.q2, marks.midterm,
    marks.final, marks.assignment, marks.lab
  );
}

// TRANSACTION (for multiple related writes)
function saveStudentWithMarks(studentData, marksData) {
  const saveAll = db.transaction(() => {
    const studentStmt = db.prepare(`INSERT INTO students (...) VALUES (...)`);
    const marksStmt = db.prepare(`INSERT INTO marks (...) VALUES (...)`);
    const student = studentStmt.run(...Object.values(studentData));
    marksStmt.run(student.lastInsertRowid, ...Object.values(marksData));
  });
  saveAll();  // atomic — both succeed or both fail
}
```

---

## SKILL-003: IPC Communication Pattern

```javascript
// MAIN PROCESS (main.js or module handler)
const { ipcMain } = require('electron');

ipcMain.handle('shadsync:query', async (event, queryData) => {
  try {
    const result = await shadSyncEngine.query(queryData);
    return { success: true, data: result };
  } catch (error) {
    logger.error('ShadSync query failed:', error.message);
    return { success: false, error: 'Could not process query. Please try again.' };
  }
});

// RENDERER PROCESS (preload.js — exposed via contextBridge)
contextBridge.exposeInMainWorld('api', {
  shadSync: {
    query: (queryData) => ipcRenderer.invoke('shadsync:query', queryData)
  }
});

// RENDERER PROCESS (component)
async function queryShadSync(userInput) {
  const result = await window.api.shadSync.query({ input: userInput });
  if (result.success) {
    displayShadSyncResult(result.data);
  } else {
    showToast(result.error, 'error');
  }
}
```

---

## SKILL-004: Student Anonymisation

```javascript
// /src/modules/security/encryption.js

function anonymise(students) {
  const tokenMap = {};
  const anonymised = students.map((student, index) => {
    const token = `S${String(index + 1).padStart(3, '0')}`;
    tokenMap[token] = {
      real_name: student.name,
      real_id: student.enrollment_no,
      db_id: student.id
    };
    return {
      ...student,
      name: `Student_${token}`,
      enrollment_no: token,
      email: `${token}@placeholder.edu`
    };
  });
  return { anonymised, tokenMap };
}

function reAssociate(aiResponseText, tokenMap) {
  let result = aiResponseText;
  Object.entries(tokenMap).forEach(([token, realData]) => {
    // Replace token references with real names in the response
    result = result.replace(new RegExp(token, 'g'), realData.real_name);
    result = result.replace(`Student_${token}`, realData.real_name);
  });
  return result;
}

// USAGE — always anonymise BEFORE building prompt
const { anonymised, tokenMap } = anonymise(students);
const prompt = buildPrompt('PROMPT-005', { student_data: anonymised });
const aiResponse = await aiRouter.send(prompt, memoryContext);
const readableResponse = reAssociate(aiResponse.text, tokenMap);
```

---

## SKILL-005: API Key Storage with keytar

```javascript
// /src/modules/security/keychain.js
const keytar = require('keytar');
const SERVICE_NAME = 'FacultyMind';

async function saveApiKey(provider, key) {
  // provider: 'claude' | 'openai' | 'gemini' | 'whisper'
  await keytar.setPassword(SERVICE_NAME, provider, key);
}

async function getApiKey(provider) {
  const key = await keytar.findPassword(SERVICE_NAME + ':' + provider);
  if (!key) throw new Error(`API key for ${provider} not found. Please add it in Settings.`);
  return key;
}

async function deleteApiKey(provider) {
  await keytar.deletePassword(SERVICE_NAME, provider);
}

// In model-router.js — never hardcode keys
async function getClaudeClient() {
  const apiKey = await keychain.getApiKey('claude');
  return new Anthropic({ apiKey });
}
```

---

## SKILL-006: Toast Notification (UI Feedback)

```javascript
// /src/renderer/utils/toast.js
// Use this for ALL user feedback. Never use alert().

function showToast(message, type = 'info', duration = 4000) {
  // type: 'success' | 'error' | 'info' | 'warning'
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  const colours = {
    success: '#16A34A',
    error:   '#DC2626',
    info:    '#2563EB',
    warning: '#D97706'
  };

  Object.assign(toast.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    padding: '12px 20px',
    background: colours[type],
    color: '#FFFFFF',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '9999',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 0.3s ease',
    maxWidth: '360px'
  });

  document.body.appendChild(toast);

  if (type !== 'error') {
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  } else {
    // Error toasts have an X button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'margin-left:12px;background:none;border:none;color:white;font-size:18px;cursor:pointer;';
    closeBtn.onclick = () => toast.remove();
    toast.appendChild(closeBtn);
  }
}
```

---

## SKILL-007: Memory Context Builder

```javascript
// /src/modules/memory/memory-manager.js

async function buildContext() {
  const profile = await getProfile();
  const rules = await getActiveRules();
  const patterns = await getActivePatterns();
  const recentLog = await getRecentLog(3);

  const parts = ['=== FACULTYMIND MEMORY CONTEXT ===', ''];

  // Faculty profile
  if (profile.name) {
    parts.push(`FACULTY PROFILE:`);
    parts.push(`Name: ${profile.title || ''} ${profile.name} | Dept: ${profile.department}`);
    parts.push(`Tone: ${profile.email_tone} | Language: ${profile.preferred_language}`);
    parts.push(`Notification lead: ${profile.notification_lead_time} min`);
    parts.push(`Quiet hours: ${profile.quiet_hours_start}–${profile.quiet_hours_end}`);
    parts.push('');
  }

  // Active rules
  if (rules.length > 0) {
    parts.push(`ACTIVE RULES (${rules.length}):`);
    rules.forEach((rule, i) => parts.push(`${i + 1}. ${rule.rule_description}`));
    parts.push('');
  }

  // Behavioral patterns
  const activePatterns = patterns.filter(p => p.active && p.confidence >= 0.8);
  if (activePatterns.length > 0) {
    parts.push('OBSERVED PATTERNS:');
    activePatterns.forEach(p => parts.push(`- ${p.behavior_value}`));
    parts.push('');
  }

  parts.push('=== END MEMORY CONTEXT ===');

  const context = parts.join('\n');

  // Enforce 800 token limit (rough: 4 chars per token)
  if (context.length > 3200) {
    return context.substring(0, 3200) + '\n[Memory truncated for length]';
  }

  return context;
}
```

---

## SKILL-008: OS Notification (Electron)

```javascript
// /src/main/notifications.js
const { Notification } = require('electron');

function sendNotification(title, body, options = {}) {
  // Always check quiet hours before sending
  if (isQuietHours() && !options.overrideQuietHours) return;

  const notification = new Notification({
    title,
    body,
    icon: path.join(__dirname, '../../assets/icon.png'),
    urgency: options.urgency || 'normal',  // 'normal' | 'critical'
    timeoutType: options.persistent ? 'never' : 'default',
  });

  if (options.onClick) {
    notification.on('click', options.onClick);
  }

  notification.show();
}

// Pre-class notification example:
function sendPreClassNotification(course, minutesBefore) {
  sendNotification(
    `Class in ${minutesBefore} minutes: ${course.code}`,
    `${course.name} | Room ${course.room}\nLast: ${course.last_topic} | Next: ${course.next_topic}`,
    { onClick: () => openCourseInApp(course.code) }
  );
}

// HIGH priority email — always fires (overrides quiet hours)
function sendCriticalEmailNotification(email) {
  sendNotification(
    `⚠ Important Email: ${email.subject}`,
    `From: ${email.sender_name}\n${email.reason}`,
    { urgency: 'critical', overrideQuietHours: true }
  );
}
```

---

## SKILL-009: Error Logging (Never Use console.log in Production)

```javascript
// /src/utils/logger.js
const isDev = process.env.NODE_ENV === 'development';

const logger = {
  info:  (msg, data) => isDev && console.log(`[INFO] ${msg}`, data || ''),
  debug: (msg, data) => isDev && console.log(`[DEBUG] ${msg}`, data || ''),
  warn:  (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, err)  => {
    // Log error message but NEVER log full error objects that might contain keys/data
    const safeMessage = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] ${msg}: ${safeMessage}`);
    // In production: could write to log file in app.getPath('logs')
  }
};

module.exports = { logger };
// Usage: logger.error('AI call failed', error)  — NOT console.log(error)
```
