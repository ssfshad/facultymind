# FacultyMind — QA Test Cases
# Run these tests after completing each module.
# Mark [PASS] or [FAIL] + note the failure.
# All tests must PASS before competition day.

---

## MODULE 1: Onboarding & Auth

[ ] QA-001 | First launch shows onboarding screen (not main app)
[ ] QA-002 | PIN setup: accepts 4-6 digit PIN, rejects less than 4
[ ] QA-003 | PIN confirmation: must match first entry to proceed
[ ] QA-004 | API key fields: Claude, OpenAI, Gemini all save to keychain
[ ] QA-005 | API key validation: shows error if key format is wrong
[ ] QA-006 | After setup: main app opens with all modules accessible
[ ] QA-007 | Second launch: PIN screen appears (no bypass)
[ ] QA-008 | Wrong PIN x3: 30-second lockout message shown
[ ] QA-009 | Correct PIN: app unlocks in under 1 second
[ ] QA-010 | 15-min inactivity: app locks automatically
[ ] QA-011 | PIN change: requires current PIN before allowing new PIN
[ ] QA-012 | Database is actually encrypted: open .db in DB Browser → shows encrypted blob

---

## MODULE 2: Natural Language Interface

[ ] QA-020 | Text input sends message to active AI model
[ ] QA-021 | Response appears in under 3 seconds (or streaming starts)
[ ] QA-022 | "What classes do I have tomorrow?" → schedule query response
[ ] QA-023 | "Show CSE301 attainment" → ShadSync opens correct view
[ ] QA-024 | "Remind me at 3pm to submit marks" → reminder created
[ ] QA-025 | "Save this link: https://zoom.us/j/123" → vault item saved
[ ] QA-026 | "Open DIU portal" → portal WebView opens
[ ] QA-027 | "Switch to GPT-4o" → model switches, confirmation shown
[ ] QA-028 | Long conversation (20+ messages): no crash, no context error
[ ] QA-029 | Empty message: send button disabled or graceful error
[ ] QA-030 | Memory context injected: AI addresses professor by name

---

## MODULE 3: WhisperFlow

[ ] QA-040 | Mic button visible and clickable
[ ] QA-041 | Press button: recording indicator appears (waveform or animation)
[ ] QA-042 | Release button: "Transcribing..." shown while Whisper API processes
[ ] QA-043 | Transcription appears in chat input field (editable before submit)
[ ] QA-044 | Transcription accuracy: test 10 sentences, at least 9 correct
[ ] QA-045 | Short audio (under 1 second): graceful handling, no crash
[ ] QA-046 | Long audio (over 30 seconds): processes correctly
[ ] QA-047 | No microphone permission: clear error message shown
[ ] QA-048 | WhisperFlow works with all 3 AI models (Claude/GPT-4o/Gemini)
[ ] QA-049 | Voice: "Show CSE301 CLO attainment" → ShadSync opens correctly

---

## MODULE 4: Multi-Model AI

[ ] QA-060 | Settings panel shows 3 model options: Claude, GPT-4o, Gemini
[ ] QA-061 | Claude selected (default): chat works, model name shown in UI
[ ] QA-062 | Switch to GPT-4o: chat works within 5 seconds of switch
[ ] QA-063 | Switch to Gemini: chat works within 5 seconds of switch
[ ] QA-064 | Switch back to Claude: works correctly
[ ] QA-065 | Invalid API key for selected model: clear error, suggestion to check key
[ ] QA-066 | Model switch does NOT require app restart
[ ] QA-067 | Bloom's engine works with all 3 models
[ ] QA-068 | ShadSync NL queries work with all 3 models
[ ] QA-069 | Memory context correctly injected regardless of active model

---

## MODULE 5: Smart Schedule Manager

[ ] QA-080 | Add course: code, name, day, time, room, Zoom link all save correctly
[ ] QA-081 | Schedule view: shows weekly timetable correctly
[ ] QA-082 | Pre-class notification fires at correct lead time (default 30 min)
[ ] QA-083 | Notification content: shows course name, room, last topic, next topic
[ ] QA-084 | Zoom link in notification: clicking opens the link
[ ] QA-085 | "What do I have tomorrow?" → correct classes listed
[ ] QA-086 | "When is my next CSE301 class?" → correct day and time returned
[ ] QA-087 | Lesson log update: "Today I covered recursion in CSE301" → saved
[ ] QA-088 | Lesson log read: next class notification shows correct last/next topic
[ ] QA-089 | Schedule edit: changing time updates notification correctly
[ ] QA-090 | Quiet hours respected: no notification fired after 9pm (default)

---

## MODULE 6: ShadSync OBE Engine

[ ] QA-100 | Dummy dataset loads on first launch (35 students, ice301)
[ ] QA-101 | Student list view: all 35 students visible with correct names
[ ] QA-102 | Marks entry: Q1, Q2, midterm, final, assignment, lab all save
[ ] QA-103 | CLO attainment calculation: ice301 results match DUMMYDATA.md exactly
            CLO1: 66.3% | CLO2: 67.9% | CLO3: 64.4% | CLO4: 65.7%
            (Numbers verified against engine formula 2026-04-04 — see BUG-012)
[ ] QA-104 | CO attainment: CO1: 67.1% | CO2: 64.9%
[ ] QA-105 | PO attainment: PO1: 66.2% | PO2: 65.8% | PO3: 64.9% | PO5: 66.0%
[ ] QA-106 | At-risk detection: CLO3 shows 13/35 students (37.1%) below 60% — most at-risk
            No CLO breaches the cohort threshold (>40% = >14 students)
[ ] QA-107 | "Which students scored below 60% on CLO3?" → 13 students listed
            Top 5: Reza (36.7%), Das (38.3%), Karim (41.7%), Faruk (43.3%), Begum (46.7%)
[ ] QA-108 | Top performers query: Hossain (94%), Rahman (87%), Paul (87%)
[ ] QA-109 | BAETE report generates PDF successfully
[ ] QA-110 | PDF report contains correct attainment numbers (verify against QA-103)
[ ] QA-111 | Attendance entry: present/absent per student per session saves correctly
[ ] QA-112 | Attendance average: 81.3% shown for ice301
[ ] QA-113 | ShadSync dashboard: charts render without errors
[ ] QA-114 | Student anonymisation: open any AI prompt log — no real names visible
[ ] QA-115 | Add new student: appears in attainment calculation immediately

---

## MODULE 7: Bloom's Taxonomy Engine

[ ] QA-130 | PDF upload UI: file picker opens, accepts .pdf files
[ ] QA-131 | PDF rejected: non-PDF file shows clear error
[ ] QA-132 | PDF processing: "Analysing document..." shown during processing
[ ] QA-133 | Output: lesson plan appears with topics, outcomes, Bloom's levels
[ ] QA-134 | All 6 Bloom's levels (C1-C6) can appear in output
[ ] QA-135 | Quiz questions: 2 questions generated per topic
[ ] QA-136 | CLO mapping: each outcome has a suggested CLO code
[ ] QA-137 | Teaching activity: suggested activity appears per topic
[ ] QA-138 | Large PDF (50+ pages): completes without timeout (allow 120 seconds)
[ ] QA-139 | Output can be saved to vault as a note
[ ] QA-140 | Output feeds into ShadSync: CLO tags imported to course

---

## MODULE 8: Email Intelligence

[ ] QA-150 | Gmail OAuth: connect button opens browser auth flow
[ ] QA-151 | After auth: inbox fetches last 50 emails
[ ] QA-152 | Classification: PERSONAL emails correctly identified (test 5 examples)
[ ] QA-153 | Classification: STUDENT emails correctly identified (test 5 examples)
[ ] QA-154 | Classification: OTP emails correctly identified (test 3 examples)
[ ] QA-155 | Classification: ADVERTISEMENT correctly identified (test 5 examples)
[ ] QA-156 | Priority HIGH: email from "dean" sender flagged as HIGH
[ ] QA-157 | Priority HIGH notification: fires immediately, bypasses snooze rules
[ ] QA-158 | Custom rule: "today only show OTPs" → only OTP notifications fire
[ ] QA-159 | Custom rule expiry: rule set for "today" expires at midnight
[ ] QA-160 | VIP sender: add email → any email from that address = HIGH priority
[ ] QA-161 | Draft reply: tap "Draft Reply" → intent prompt appears
[ ] QA-162 | Draft reply: enter intent → full email draft generated in under 5 seconds
[ ] QA-163 | End-of-day summary: snoozed emails summarised in notification
[ ] QA-164 | Disconnect Gmail: OAuth token removed, inbox clears

---

## MODULE 9: Local Vault

[ ] QA-180 | Save link via NL: "Save this Zoom link for CSE301" → saved with tag
[ ] QA-181 | Save file: upload a PDF → stored in vault with correct name
[ ] QA-182 | Save note: "Note: CSE301 students need extra help with inheritance" → saved
[ ] QA-183 | Fuzzy search: "zoom cse" → CSE301 Zoom link appears in results
[ ] QA-184 | Fuzzy search: "Thursday class link" → correct result without exact words
[ ] QA-185 | AI disambiguation: ambiguous search → clarifying question asked
[ ] QA-186 | Password save: entry created, actual password NOT visible without PIN
[ ] QA-187 | Password reveal: requires PIN confirmation before showing
[ ] QA-188 | Vault items survive app restart (data persisted in SQLite)
[ ] QA-189 | Delete vault item: item removed, no longer appears in search

---

## MODULE 10: Quick Portal Access

[ ] QA-200 | DIU Portal button opens portal inside app (not external browser)
[ ] QA-201 | BLC button opens BLC inside app (not external browser)
[ ] QA-202 | Portal loads correctly (not blank, not error page)
[ ] QA-203 | Back button inside portal WebView works
[ ] QA-204 | Close portal: returns to main FacultyMind interface
[ ] QA-205 | Portal session: professor can log in and stay logged in during session

---

## MODULE 11: Memory System

[ ] QA-220 | Profile: professor's name used in AI responses after onboarding
[ ] QA-221 | Rule: "never notify after 9pm" → notifications suppressed after 21:00
[ ] QA-222 | Rule: "always formal emails" → draft reply uses formal tone
[ ] QA-223 | Rule confirmation: AI asks "Should I make this a permanent rule?" before saving
[ ] QA-224 | Rules visible in Settings → Memory → Active Rules
[ ] QA-225 | Rule toggle: deactivate a rule → it no longer affects AI behavior
[ ] QA-226 | Rule delete: deleted rule no longer in memory context
[ ] QA-227 | Behavioral pattern: after 5x dismissing advertisement emails → auto-archived
[ ] QA-228 | Memory log: shows history of profile updates and rule additions
[ ] QA-229 | Memory wipe: "Reset all memory" → profile kept, rules and patterns cleared
[ ] QA-230 | Memory injection: open model-router.js logs → memory block visible in prompt

---

## FINAL PRE-COMPETITION QA (Run on Competition Laptop)

[ ] QA-300 | Fresh install on competition laptop: all modules work
[ ] QA-301 | DB import: all 35 students load, all demo queries return correct answers
[ ] QA-302 | WhisperFlow: laptop microphone tested and transcription works
[ ] QA-303 | All 3 AI models respond correctly with competition laptop's API keys
[ ] QA-304 | OS notifications fire on competition laptop (Windows notifications enabled)
[ ] QA-305 | App starts in under 5 seconds on competition laptop
[ ] QA-306 | Full 5-minute demo run 1: ZERO failures
[ ] QA-307 | Full 5-minute demo run 2: ZERO failures
[ ] QA-308 | Full 5-minute demo run 3: ZERO failures
[ ] QA-309 | All DUMMYDATA.md demo query answers verified correct
[ ] QA-310 | No console errors visible to audience (dev tools closed)
