# FacultyMind — Memory System
# This file defines how FacultyMind remembers the faculty's preferences,
# decisions, patterns, and rules across every session.
# Claude Code: implement this system in /src/modules/memory/

---

## Why Memory Exists
Every AI session starts fresh. Without memory, the professor repeats themselves
every day. With memory, FacultyMind feels like a colleague who has worked
with the professor for months — knowing their preferences, habits, and rules
without being told again.

---

## Memory Architecture

### Storage Location
All memory stored in SQLite (encrypted with SQLCipher like all other data).
Tables: faculty_profile, behavioral_memory, faculty_rules, memory_log

### Memory Injection
Every time a message is sent to any AI model via model-router.js:
1. memoryManager.buildContext() is called
2. Returns a formatted memory block (plain text, max 800 tokens)
3. This block is prepended to the SYSTEM prompt of every AI call
4. The AI behaves with full awareness of the professor's preferences and rules

```javascript
// In model-router.js — before every AI call:
const memoryContext = await memoryManager.buildContext();
const fullSystemPrompt = memoryContext + '\n\n' + moduleSystemPrompt;
```

---

## Layer 1: Faculty Profile Memory
Table: faculty_profile
Updated: During onboarding + whenever professor explicitly states a fact.

### Fields:
```sql
CREATE TABLE faculty_profile (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Default Keys (populated during onboarding):
- name                    ("Dr. Rahman" / "Prof. Shad" etc.)
- department              ("Information and communication Engineering")
- university              ("Daffodil International University")
- email                   (professor's primary email)
- preferred_language      ("English" / "Bangla" / "Both")
- email_tone              ("Formal" / "Semi-formal" / "Friendly")
- notification_lead_time  ("30" — minutes before class)
- quiet_hours_start       ("21:00" — no notifications after this)
- quiet_hours_end         ("07:00" — resume notifications)
- preferred_ai_model      ("claude" / "gpt4o" / "gemini")
- title                   ("Dr." / "Prof." / "Mr." / "Ms.")

### How Profile Is Updated:
Explicit statement detection — when professor says things like:
"My name is Dr. Rahman" → profile.name = "Dr. Rahman"
"I prefer formal emails" → profile.email_tone = "Formal"
"Notify me 45 minutes before class" → profile.notification_lead_time = "45"

NL Interface detects these statements and calls:
memoryManager.updateProfile(key, value, source='explicit')

---

## Layer 2: Behavioral Memory
Table: behavioral_memory
Updated: Automatically, based on observed patterns.

### Fields:
```sql
CREATE TABLE behavioral_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  behavior_key TEXT NOT NULL,
  behavior_value TEXT NOT NULL,
  observed_count INTEGER DEFAULT 1,
  confidence REAL DEFAULT 0.0,
  last_observed DATETIME DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT 0
);
```

### Confidence Threshold:
A behavior becomes ACTIVE (injected into memory context) only when:
  observed_count >= 5 AND confidence >= 0.8

### Behaviors That Are Tracked:
- email_dismiss_pattern     ("always dismisses ADVERTISEMENT without reading")
- email_reply_speed         ("usually replies to STUDENT emails within 2 hours")
- shadsync_query_pattern    ("checks CLO4 data every Monday")
- schedule_check_time       ("checks tomorrow's schedule at 8pm")
- bloom_upload_frequency    ("uploads PDFs on Sundays for the week ahead")
- vault_save_preference     ("saves Zoom links immediately after receiving them")
- preferred_quiz_level      ("prefers C3 and C4 level quiz questions")

### How Behavioral Memory Appears in Prompt:
"Observed patterns: Professor typically checks CLO attainment on Mondays.
Advertisement emails are usually dismissed without reading."

---

## Layer 3: Faculty Rules Engine
Table: faculty_rules
Updated: When professor gives an explicit instruction that should be permanent.

### Fields:
```sql
CREATE TABLE faculty_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL,
  rule_description TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT 1,
  source TEXT DEFAULT 'explicit'
);
```

### Rule Types:
- NOTIFICATION_RULE    (when to notify, when to suppress)
- EMAIL_RULE           (permanent email handling preferences)
- AI_BEHAVIOR_RULE     (how AI should respond/communicate)
- SCHEDULE_RULE        (schedule-related permanent preferences)
- PRIVACY_RULE         (what never to say, store, or share)
- SHADSYNC_RULE        (OBE-related permanent settings)

### Example Rules (Created by Professor's Natural Language):

Professor says: "Never notify me after 9pm"
→ Stored as NOTIFICATION_RULE:
{
  "type": "suppress_after_time",
  "time": "21:00",
  "override_for": ["HIGH_PRIORITY"],
  "description": "No notifications after 9pm except HIGH priority emails"
}

Professor says: "Always write my emails in formal English"
→ Stored as AI_BEHAVIOR_RULE:
{
  "type": "email_tone",
  "tone": "formal",
  "language": "English",
  "description": "All drafted emails must be formal English"
}

Professor says: "Flag any email from the Dean as critical"
→ Stored as EMAIL_RULE:
{
  "type": "vip_sender_rule",
  "trigger": "sender_contains",
  "value": "dean",
  "action": "CRITICAL_OVERRIDE",
  "description": "Any email mentioning dean in sender is always critical"
}

Professor says: "Don't ever remind me about admin emails on Fridays"
→ Stored as NOTIFICATION_RULE:
{
  "type": "suppress_category_on_day",
  "category": "WORK",
  "day": "Friday",
  "description": "No WORK email notifications on Fridays"
}

Professor says: "Always show me CLO4 data first when I open ShadSync"
→ Stored as SHADSYNC_RULE:
{
  "type": "default_view",
  "view": "CLO4_ATTAINMENT",
  "description": "ShadSync opens on CLO4 attainment by default"
}

### Rule Detection in NL Interface:
Words/phrases that trigger rule creation detection:
"always", "never", "don't ever", "from now on", "every time",
"permanently", "make it a rule", "remember that", "I prefer",
"I want you to always", "stop doing", "make sure you"

When detected: NL Interface asks for confirmation:
"Got it — should I make this a permanent rule? You can change it anytime in Settings."
If confirmed: rule stored with active=1.

### How Rules Appear in Prompt:
"Active rules:
1. No notifications after 21:00 (except HIGH priority)
2. All email drafts must be formal English
3. Emails from dean's office are always CRITICAL
4. No WORK email notifications on Fridays
5. ShadSync opens on CLO4 attainment by default"

---

## Memory Context Block Format
Built by: memoryManager.buildContext()
Max length: 800 tokens (enforced — truncate oldest behavioral memory first)
Injected: At the start of every AI system prompt

```
=== FACULTYMIND MEMORY CONTEXT ===

FACULTY PROFILE:
Name: Dr. [name] | Department: [dept] | University: DIU
Preferred tone: [tone] | Language: [lang] | Notification lead: [n] minutes
Quiet hours: [start]–[end] | Active AI model: [model]

ACTIVE RULES ([count] rules):
1. [rule_description]
2. [rule_description]
...

OBSERVED PATTERNS (high confidence):
- [behavior_description]
- [behavior_description]

RECENT CONTEXT (last 3 interactions):
- [brief summary of last action]
- [brief summary of last action]
- [brief summary of last action]

=== END MEMORY CONTEXT ===
```

---

## Memory Log
Table: memory_log
Purpose: Audit trail of what was remembered and when.

```sql
CREATE TABLE memory_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,       -- 'profile_update', 'rule_added', 'behavior_observed'
  key TEXT,
  old_value TEXT,
  new_value TEXT,
  source TEXT,                -- 'explicit', 'inferred', 'system'
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Professor can view memory log in Settings → Memory → View History.
Professor can delete any memory entry from the same screen.
Professor can wipe all memory and start fresh (except faculty profile).

---

## Memory Manager API
File: /src/modules/memory/memory-manager.js

```javascript
// Build full memory context string for AI injection
memoryManager.buildContext()  → Promise<string>

// Update faculty profile
memoryManager.updateProfile(key, value, source)  → Promise<void>

// Add a new rule
memoryManager.addRule(ruleType, description, ruleJson)  → Promise<number>

// Toggle rule active/inactive
memoryManager.toggleRule(ruleId, active)  → Promise<void>

// Get all active rules
memoryManager.getActiveRules()  → Promise<Rule[]>

// Record a behavioral observation
memoryManager.observe(behaviorKey, value)  → Promise<void>

// Get memory log
memoryManager.getLog(limit)  → Promise<LogEntry[]>

// Wipe behavioral memory only
memoryManager.clearBehavioral()  → Promise<void>

// Full memory wipe (keeps profile)
memoryManager.resetAll()  → Promise<void>
```

---

## UI: Memory Settings Screen
Location: Settings → Memory

Sections:
1. Faculty Profile — editable fields for all profile keys
2. Active Rules — list of all rules with toggle on/off and delete
3. Observed Patterns — list of active behavioral memories with delete
4. Memory Log — chronological audit trail
5. Add Rule Manually — text input: "Type a new rule in plain language"
6. Reset Options — "Clear patterns only" / "Reset all memory"

---

## Important: What Memory Does NOT Do
- Does NOT store conversation history (too expensive, privacy risk)
- Does NOT learn from AI responses (only from professor's explicit statements)
- Does NOT share memory between different professor accounts
- Does NOT send memory data to any external service
- Does NOT auto-create rules without professor confirmation
