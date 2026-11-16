# Writes eval/data/intent-commands.json for the intent-router eval.
#   1. the 100 hand-written commands (ids cmd-001..; 7 flagged ambiguous = reported, not scored)
#   2. ~1000 generated commands (ids gen-0001..): varied hand-written TEMPLATES x slot values, typos injected
#      with a fixed seed, ~52 per intent, labels correct by construction. No ambiguous templates.
# tag: clean | typo (typos / casual spelling) | banglish (Bangla in English letters)
# Synthetic: no real data.   python eval/data/make-intent-commands.py
import json, os, random, re
from collections import Counter

random.seed(20261111)
C, T, B = 'clean', 'typo', 'banglish'

# ------------------------------------------------------------------ 1. hand-written base (100)
BASE = [
 ('What classes do I have today?', 'SCHEDULE_QUERY', C), ('show me my timetable for tomorrow', 'SCHEDULE_QUERY', C),
 ('wat is my next class', 'SCHEDULE_QUERY', T), ('aj amar koyta class ache?', 'SCHEDULE_QUERY', B), ('when is my ICE301 class this week', 'SCHEDULE_QUERY', C),
 ('Remind me to submit the marks sheet by Thursday', 'REMINDER_SET', C), ('set a reminder for the faculty meeting at 3pm', 'REMINDER_SET', C),
 ('remind me tmrw to bring the question papers', 'REMINDER_SET', T), ('amake kal sokal 9 tay quiz er kotha mone koriye dio', 'REMINDER_SET', B), ('notify me 10 minutes before my next lecture', 'REMINDER_SET', C),
 ('Generate a lesson plan from this PDF', 'BLOOM_GENERATE', C), ('make a quiz from the uploaded chapter', 'BLOOM_GENERATE', C),
 ('genrate quiz questions from the syllabus pdf', 'BLOOM_GENERATE', T), ('ei pdf theke ekta lesson plan banao', 'BLOOM_GENERATE', B), ('create a 10 question test from my lecture notes file', 'BLOOM_GENERATE', C),
 ("Map my CLOs to Bloom's levels", 'BLOOM_CLO_MAP', C), ('which bloom level is CLO3: Design a database schema', 'BLOOM_CLO_MAP', C), ('suggest action verbs for my course outcomes', 'BLOOM_CLO_MAP', C),
 ('analize these CLOs and tell me if they match blooms taxonomy', 'BLOOM_CLO_MAP', T), ('amar CLO gula Bloom level e map koro', 'BLOOM_CLO_MAP', B),
 ('What is the CLO attainment for ICE301?', 'SHADSYNC_QUERY', C), ('show PO attainment of ICE415', 'SHADSYNC_QUERY', C), ('how many students are below 60% in CLO3', 'SHADSYNC_QUERY', C),
 ('attendence of student Karim in ICE301', 'SHADSYNC_QUERY', T, True), ('ICE301 er CO2 attainment koto?', 'SHADSYNC_QUERY', B),
 ('Enter marks for ICE301 midterm', 'SHADSYNC_UPDATE', C), ("update attendance for today's class", 'SHADSYNC_UPDATE', C, True), ('i want to input quiz marks for section A', 'SHADSYNC_UPDATE', C),
 ('marks entry korbo ICE415 er jonno', 'SHADSYNC_UPDATE', B), ('record absent students for ICE301 lecture 5', 'SHADSYNC_UPDATE', C),
 ('Any new emails?', 'EMAIL_FETCH', C), ('check my inbox', 'EMAIL_FETCH', C), ('refersh my emails', 'EMAIL_FETCH', T), ('email gula ekbar check koro', 'EMAIL_FETCH', B), ('sync emails', 'EMAIL_FETCH', C),
 ('Today only show me emails from the dean', 'EMAIL_RULE', C), ('ignore all emails from advertisements', 'EMAIL_RULE', C), ('only show student emails for the next hour', 'EMAIL_RULE', C),
 ('promotional email gula ignore koro', 'EMAIL_RULE', B), ('hide OTP emails from now on', 'EMAIL_RULE', C),
 ('Draft a reply to the last email from the department head', 'EMAIL_DRAFT', C), ('write an email to students about the quiz postponement', 'EMAIL_DRAFT', C),
 ('reply to this mail saying i will attend', 'EMAIL_DRAFT', C), ('drfat a polite email to decline the meeting', 'EMAIL_DRAFT', T), ('head er email er ekta reply likhe dao', 'EMAIL_DRAFT', B),
 ('Save this link: https://blc.example.edu', 'VAULT_SAVE', C), ('store my wifi password in the vault', 'VAULT_SAVE', C), ('save a note: midterm questions due Friday', 'VAULT_SAVE', C),
 ('ei file ta vault e save koro', 'VAULT_SAVE', B), ('add this document to my vault', 'VAULT_SAVE', C),
 ('Find my saved notes about the midterm', 'VAULT_SEARCH', C), ('search the vault for the wifi password', 'VAULT_SEARCH', C), ('wher is the syllabus file i saved', 'VAULT_SEARCH', T),
 ('vault e amar notes khuje dao', 'VAULT_SEARCH', B), ('look up the link i saved for BLC', 'VAULT_SEARCH', C),
 ('Open the DIU portal', 'PORTAL_OPEN', C), ('open BLC', 'PORTAL_OPEN', C), ('take me to the BLC website', 'PORTAL_OPEN', C), ('diu portal ta open koro', 'PORTAL_OPEN', B), ('launch the university portal', 'PORTAL_OPEN', C),
 ('Who failed in ICE301 in the portal results?', 'DIU_PORTAL_QUERY', C), ('what is the grade distribution of my course', 'DIU_PORTAL_QUERY', C), ('show the average CT score', 'DIU_PORTAL_QUERY', C, True),
 ('how many students passed this semester', 'DIU_PORTAL_QUERY', C), ('result e ke ke fail korse?', 'DIU_PORTAL_QUERY', B),
 ('Open marks entry', 'DIU_PORTAL_NAV', C, True), ('go to attendance in the portal', 'DIU_PORTAL_NAV', C), ('show the result sheet', 'DIU_PORTAL_NAV', C),
 ('open course registration', 'DIU_PORTAL_NAV', C), ('portal er dashboard dekhao', 'DIU_PORTAL_NAV', B),
 ('Switch to Gemini', 'MODEL_SWITCH', C), ('use GPT-4o from now on', 'MODEL_SWITCH', C), ('change the AI model to Claude', 'MODEL_SWITCH', C),
 ('swtich to the local model', 'MODEL_SWITCH', T), ('model ta gemini te change koro', 'MODEL_SWITCH', B),
 ('How much have you learned about me?', 'MEMORY_STATUS', C), ('what have you learned so far', 'MEMORY_STATUS', C), ('show your memory stats', 'MEMORY_STATUS', C),
 ('tumi ki ki shikhecho?', 'MEMORY_STATUS', B), ("how's your self learning going", 'MEMORY_STATUS', C),
 ('Add a new student Rahim to ICE301', 'DATA_ADD', C), ('create a new course ICE450', 'DATA_ADD', C), ('add a class on Sunday 10am for ICE301', 'DATA_ADD', C),
 ('notun student add koro Karim', 'DATA_ADD', B), ('add a new rule to ignore spam emails', 'DATA_ADD', C, True),
 ('Change the name of student S004 to Rahman', 'DATA_EDIT', C), ('modify my Sunday class time to 11am', 'DATA_EDIT', C), ('updte the marks of Karim in midterm to 18', 'DATA_EDIT', T, True),
 ('student er naam ta change kore dao', 'DATA_EDIT', B), ('edit the ICE301 section to B', 'DATA_EDIT', C),
 ('Delete student Rahim from ICE301', 'DATA_DELETE', C), ('remove the course ICE205', 'DATA_DELETE', C), ('clear the spam email rule', 'DATA_DELETE', C, True),
 ('student ta delete kore dao', 'DATA_DELETE', B), ('delete my Sunday class', 'DATA_DELETE', C),
 ('Hello, how are you?', 'GENERAL_CHAT', C), ("explain what Bloom's taxonomy is", 'GENERAL_CHAT', C), ('what is the capital of Bangladesh', 'GENERAL_CHAT', C),
 ('thanks for your help', 'GENERAL_CHAT', C), ('ki khobor?', 'GENERAL_CHAT', B),
]

# ------------------------------------------------------------------ 2. generated
COURSES = ['ICE301', 'ICE415', 'ICE205', 'ICE401', 'ICE420', 'CSE221', 'EEE1345', 'MAT2137', 'HUM101', 'ICE2241', 'BBA101', 'ICE329', 'PHY1022']
STUDENTS = ['Rahim', 'Karim', 'Nusrat', 'Tania', 'Sabbir', 'Mehedi', 'Farhana', 'Jamal', 'Ayesha', 'Imran', 'Shoaib', 'Mim']
SIDS = ['S004', 'S012', 'S021', 'S033']
DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']
DAYS_B = ['Ravibar', 'Sombar', 'Mongolbar', 'Budhbar', 'Brihospotibar']
TIMES = ['9am', '10:30', '2pm', '11 am', '8:30', '12pm', '3:15pm']
WHEN = ['today', 'tomorrow', 'this week', 'on Monday', 'next Tuesday', 'tonight', 'this afternoon', 'by Thursday']
WHEN_B = ['aj', 'kal', 'ei soptahe', 'porshu', 'ajke']
MODELS = ['Gemini', 'Claude', 'GPT-4o', 'OpenRouter', 'the local model']
CATS = ['advertisement', 'spam', 'OTP', 'newsletter', 'promotional', 'marketing', 'student', 'work']
PEOPLE = ['the dean', 'the department head', 'the registrar', 'my supervisor', 'the chairman', 'Dr. Hasan', 'the exam controller', 'HR']
PEOPLE_B = ['dean', 'department head', 'registrar', 'supervisor', 'chairman', 'exam controller']
TASKS = ['submit the marks', 'call the registrar', 'grade the quizzes', 'upload the syllabus', 'print the question papers', 'prepare the lab sheet', 'send the attendance report']
TASKS_B = ['marks submit korte', 'question paper print korte', 'quiz grade korte', 'syllabus upload korte', 'lab sheet toiri korte']
EVENTS = ['faculty meeting', 'department seminar', 'viva session', 'thesis defence', 'exam invigilation']
FILES = ['lecture notes', 'syllabus pdf', 'chapter 4 pdf', 'course outline', 'slides', 'textbook chapter', 'question bank']
TOPICS = ['pointers', 'Fourier series', 'normalisation', 'recursion', 'antenna design', 'machine learning', 'OOP', 'signal processing']
CLOS = ['Design a database schema', 'Explain the OSI model', "Apply Ohm's law to solve circuits", 'Evaluate sorting algorithms', 'Analyse a modulation scheme']
SUBJECTS = ['the quiz postponement', 'the lab schedule change', 'extending the deadline', 'the make-up class', 'tomorrow\'s cancelled lecture']
ASKS = ['a recommendation letter', 'extra time', 'the room key', 'a meeting slot', 'the seminar slides']
THINGS = ['wifi', 'portal', 'router', 'library', 'lab server', 'department']
NOTES = ['midterm questions due Friday', 'bring the projector adapter', 'lab 3 needs new cables', 'results meeting at noon']
URLS = ['https://blc.example.edu/course/12', 'https://slides.example.com/ice301', 'www.example.edu/forms']
EXAMS = ['midterm', 'quiz 2', 'final', 'class test 1', 'lab test', 'assignment 3']
SECS = ['A', 'B', 'C', 'D']
ROOMS = ['room 304', 'lab 2', 'the seminar hall', 'room 210']
PORTAL_SECTIONS = ['marks entry', 'attendance', 'result sheet', 'dashboard', 'course registration', 'grade sheet', 'CT marks page']
NAMES = ['Data Structures', 'Digital Logic', 'Microwave Basics', 'Signals and Systems', 'Network Design']
CONCEPTS = ["Bloom's taxonomy", 'recursion', 'entropy', "Ohm's law", 'supply and demand', 'the Nyquist theorem', 'photosynthesis']
COUNTRIES = ['Bangladesh', 'Japan', 'Canada', 'Brazil', 'Egypt']

def fill(tpl):
    def pick(name, pool):
        return random.choice(pool)
    slots = {
        'course': COURSES, 'student': STUDENTS, 'sid': SIDS, 'day': DAYS, 'day2': DAYS, 'day_b': DAYS_B, 'time': TIMES, 'when': WHEN, 'when_b': WHEN_B,
        'model': MODELS, 'cat': CATS, 'person': PEOPLE, 'person_b': PEOPLE_B, 'task': TASKS, 'task_b': TASKS_B, 'event': EVENTS, 'file': FILES,
        'topic': TOPICS, 'clo': CLOS, 'subject': SUBJECTS, 'ask': ASKS, 'thing': THINGS, 'note': NOTES, 'url': URLS, 'exam': EXAMS, 'sec': SECS,
        'room': ROOMS, 'section': PORTAL_SECTIONS, 'name': NAMES, 'concept': CONCEPTS, 'country': COUNTRIES,
    }
    out = tpl
    for key in re.findall(r'\{(\w+)\}', tpl):
        if key == 'n':
            val = str(random.randint(2, 15))
        elif key == 'pct':
            val = random.choice(['40', '50', '60', '70', '75'])
        elif key == 'clon':
            val = str(random.randint(1, 5))
        elif key == 'mins':
            val = random.choice(['10', '15', '30', '5'])
        else:
            val = random.choice(slots[key])
        out = out.replace('{' + key + '}', val, 1)
    return out

E = {
 'SCHEDULE_QUERY': ["What classes do I have {when}?", "Do I have any lectures on {day}?", "show my timetable for {when}", "when is my next {course} class?", "which room is my {course} lecture in on {day}",
   "what's on my schedule {when}", "am I free at {time} on {day}?", "list all my classes this week", "is there a class after {time} today?", "tell me about my upcoming classes",
   "how many classes do I have on {day}", "what time does my {course} class start", "give me my class routine for {day}"],
 'REMINDER_SET': ["Remind me to {task} {when}", "set a reminder to {task} at {time}", "notify me before my {course} class", "don't let me forget to {task}", "remind me about the {event} on {day}",
   "I need a reminder for the {event} {when}", "alert me {mins} minutes before the {course} lecture", "please remind me to {task}", "set a reminder: {task} on {day}", "ping me at {time} to {task}"],
 'BLOOM_GENERATE': ["Generate a lesson plan from this {file}", "make a quiz from the {file}", "create {n} multiple choice questions from the uploaded {file}", "turn this {file} into a lesson plan",
   "build a test paper from the {file}", "can you prepare practice questions from my {file}", "generate quiz questions on {topic} from the pdf", "write a worksheet based on the attached {file}",
   "I uploaded my {file}, make an exam from it", "produce a lesson outline from the document", "use the {file} to create a short quiz"],
 'BLOOM_CLO_MAP': ["Map my CLOs to Bloom's levels", "which Bloom level is this outcome: {clo}", "analyse my course outcomes against Bloom's taxonomy", "suggest better action verbs for {course} CLOs",
   "is this CLO measurable: {clo}", "classify these learning outcomes by cognitive level", "check whether my CLOs match their Bloom levels", "what Bloom's level does '{clo}' sit at",
   "improve the wording of my outcomes so they are measurable", "rate the verbs used in my {course} outcomes", "align the {course} CLOs with Bloom's taxonomy"],
 'SHADSYNC_QUERY': ["What is the CLO attainment for {course}?", "show me PO attainment of {course}", "how many students are below {pct}% in CLO{clon}", "which students failed CLO{clon} in {course}",
   "what's the CO{clon} attainment for {course}", "list at-risk students in {course}", "what is {student}'s attendance in {course}", "is CLO{clon} attained in {course}",
   "how is {course} performing against the threshold", "show weak CLOs for {course}", "give me the attainment summary for {course}", "who is below {pct}% attendance in {course}"],
 'SHADSYNC_UPDATE': ["Enter marks for {course} {exam}", "I want to input {exam} marks for section {sec}", "record absent students for {course} lecture {n}", "log today's attendance for {course}",
   "let me type in the {exam} scores", "start marks entry for {course}", "take attendance for my {course} class", "save the {exam} scores for {course}", "I need to enter attendance for section {sec}"],
 'EMAIL_FETCH': ["Any new emails?", "check my inbox", "refresh my emails", "sync my mail", "do I have unread messages", "fetch new emails", "has anyone emailed me", "show me what arrived in my inbox",
   "see if there's new mail", "pull the latest emails", "is there anything new in my email"],
 'EMAIL_RULE': ["Today only show me emails from {person}", "ignore all {cat} emails", "hide {cat} emails from now on", "mute emails from {person} for a week", "only show {cat} emails until tomorrow",
   "stop showing me {cat} mail", "filter out {cat} emails", "prioritise emails from {person}", "from now on treat {cat} emails as low priority", "don't notify me about {cat} emails"],
 'EMAIL_DRAFT': ["Draft a reply to the last email from {person}", "write an email to my students about {subject}", "reply to {person} saying I will attend", "compose a polite email declining the invitation",
   "help me write to {person} about {subject}", "prepare an email to the department about {subject}", "respond to this mail: I need more time", "write a message to {person} asking for {ask}",
   "draft an email requesting {ask}"],
 'VAULT_SAVE': ["Save this link: {url}", "store my {thing} password in the vault", "save a note: {note}", "add this document to my vault", "keep this file safely in the vault",
   "remember this link for later: {url}", "put my {thing} login in the vault", "write down in the vault that {note}", "save this {file} to my vault"],
 'VAULT_SEARCH': ["Find my saved notes about {topic}", "search the vault for the {thing} password", "where is the {file} I saved", "look up the link I stored for {thing}", "what did I save about {topic}",
   "do I have a password saved for {thing}", "locate my note on {topic}", "find the file I saved about {topic}", "search my vault for {topic}"],
 'PORTAL_OPEN': ["Open the DIU portal", "open BLC", "take me to the BLC website", "launch the university portal", "go to the DIU teachers portal", "I want to use the BLC live site",
   "bring up the DIU portal", "open DIU teachers portal please", "start the BLC portal"],
 'DIU_PORTAL_QUERY': ["Who failed {course} in the portal results?", "what is the grade distribution of {course}", "how many students passed {course} this semester", "show the highest total in {course} results",
   "which students have irregular attendance in the portal", "what's the pass rate for {course}", "list students with grade F in {course}", "how many got A+ in {course}", "who scored the lowest in the {course} final",
   "give me the grand total ranking for {course}"],
 'DIU_PORTAL_NAV': ["go to {section} in the portal", "open {section} in the DIU portal", "take me to the portal {section}", "navigate to the {section} section of the portal", "show the {section} page in the portal",
   "open the portal's {section}", "jump to {section} on the teachers portal", "bring up {section} in the portal"],
 'MODEL_SWITCH': ["Switch to {model}", "use {model} from now on", "change the AI model to {model}", "I want to talk to {model} instead", "let's use {model} for this", "set the assistant to {model}",
   "swap the model to {model}", "can you run on {model}", "start using {model}"],
 'MEMORY_STATUS': ["How much have you learned about me?", "what have you learned so far", "show your memory stats", "how's your self learning going", "what do you remember about my habits",
   "how well do you know my schedule", "give me a report on your learning", "how many things have you memorised", "what have you picked up from my activity", "are you getting better at helping me"],
 'DATA_ADD': ["Add a new student {student} to {course}", "create a new course {course}", "add a class on {day} at {time} for {course}", "register a new section for {course}", "enrol {student} in {course}",
   "set up a new course called {name}", "add {student} to my {course} list", "create a class entry for {day} {time}"],
 'DATA_EDIT': ["Change the name of student {sid} to {student}", "move my {day} class to {time}", "rename {course} to {name}", "edit the section of {course} to {sec}", "correct {student}'s ID in {course}",
   "update the room of my {course} class to {room}", "modify the {day} class time", "fix the spelling of {student}'s name", "switch my {course} class from {day} to {day2}"],
 'DATA_DELETE': ["Delete student {student} from {course}", "remove the course {course}", "drop {student} from {course}", "delete the {day} class", "erase section {sec} of {course}",
   "get rid of the {course} course", "remove {student} from my list", "delete the {course} class on {day}"],
 'GENERAL_CHAT': ["Hello, how are you?", "good morning", "thanks a lot", "explain what {concept} is", "what is the capital of {country}", "can you help me understand {concept}", "tell me about {concept}",
   "who invented the telephone", "write a short poem about {thing}", "what's the difference between a virus and a bacterium", "give me tips for teaching large classes", "how do I stay organised during exam week", "you're awesome", "good evening"],
}
BN = {
 'SCHEDULE_QUERY': ["{when_b} amar koyta class ache?", "amar porer class ta kokhon?", "{day_b} e ki ki class ache amar?", "{course} er class kokhon?", "amar timetable ta dekhao", "{when_b} kono class ache ki?"],
 'REMINDER_SET': ["amake {when_b} {task_b} mone koriye dio", "{time} e meeting er reminder set koro", "{event} er age amake janio", "{task_b} bhule jeno na jai, reminder dao"],
 'BLOOM_GENERATE': ["ei {file} theke ekta quiz banao", "{file} diye lesson plan toiri koro", "upload kora pdf theke {n} ta question banao", "ei chapter theke test paper banai dao"],
 'BLOOM_CLO_MAP': ["amar {course} er CLO gula Bloom level e map koro", "ei CLO ta kon Bloom level e porbe", "CLO er action verb gula thik ache ki?", "outcome gular Bloom level ber koro"],
 'SHADSYNC_QUERY': ["{course} er CO{clon} attainment koto?", "{course} e koyjon student {pct}% er niche?", "{student} er attendance koto {course} te?", "kon CLO ta weak {course} er?", "{course} er PO attainment dekhao"],
 'SHADSYNC_UPDATE': ["{course} er {exam} marks entry korbo", "aj er attendance nite chai {course} er", "{exam} er number gula input dibo", "absent student der list ta record koro"],
 'EMAIL_FETCH': ["email gula check koro", "notun mail ache ki?", "inbox ta refresh koro", "kono mail ashche ki amar?"],
 'EMAIL_RULE': ["{cat} email gula ignore koro", "shudhu {person_b} er email dekhao aj", "{cat} mail ar dekhabe na", "{person_b} er email ke priority dao"],
 'EMAIL_DRAFT': ["{person_b} er email er reply likhe dao", "student der ekta email likho {subject} niye", "{person_b} ke ekta formal mail draft koro"],
 'VAULT_SAVE': ["ei link ta vault e rakho", "{thing} er password ta vault e save koro", "ei note ta save kore rakho: {note}", "file ta vault e jog koro"],
 'VAULT_SEARCH': ["vault e {topic} er note khuje dao", "{thing} er link ta kothay rakhsilam", "amar save kora {file} ta ber koro"],
 'PORTAL_OPEN': ["diu portal ta open koro", "blc site e niye jao", "portal ta khule dao", "amake blc te nao"],
 'DIU_PORTAL_QUERY': ["{course} e ke ke fail korse?", "result e koyjon pass korse?", "{course} er grade distribution ta bolo", "ke sob theke beshi number peyeche {course} e?"],
 'DIU_PORTAL_NAV': ["portal er {section} page e jao", "{section} dekhao portal e", "portal e {section} ta kholo"],
 'MODEL_SWITCH': ["model ta {model} e change koro", "ekhon theke {model} use koro", "{model} diye kaj koro", "AI model {model} koro"],
 'MEMORY_STATUS': ["tumi ki ki shikhecho?", "amar somporke koto jano?", "tomar learning kemon cholche?", "ami ki ki bole diyechi tomake mone ache?"],
 'DATA_ADD': ["notun student {student} add koro {course} e", "{course} nam e ekta notun course banao", "{day_b} e {time} e ekta class add koro", "{student} ke {course} e enrol koro"],
 'DATA_EDIT': ["student er naam ta {student} koro", "{course} er section ta {sec} e change koro", "{day_b} er class ta {time} e soriye dao", "{student} er ID ta thik koro"],
 'DATA_DELETE': ["{student} ke {course} theke delete koro", "{day_b} er class ta muche felo", "{course} course ta remove kore dao", "student ta list theke bad dao"],
 'GENERAL_CHAT': ["ki khobor?", "kemon acho?", "dhonnobad", "{concept} ta ki bujhiye dao", "{country} er rajdhani ki?", "tumi ke?"],
}

def typo(text):
    words = text.split(' ')
    cand = [i for i, w in enumerate(words) if len(re.sub(r'\W', '', w)) >= 5 and not re.search(r'\d|[A-Z]{2}', w)]
    if not cand:
        return None
    i = random.choice(cand); w = words[i]
    letters = [j for j, ch in enumerate(w) if ch.isalpha()]
    j = random.choice(letters[1:-1]) if len(letters) > 3 else letters[0]
    kind = random.choice(['swap', 'drop', 'dup'])
    if kind == 'swap' and j + 1 < len(w): w = w[:j] + w[j + 1] + w[j] + w[j + 2:]
    elif kind == 'dup': w = w[:j] + w[j] + w[j:]
    else: w = w[:j] + w[j + 1:]
    words[i] = w
    return ' '.join(words)

generated = []
seen = set(t[0].lower() for t in BASE)
PER = 53
for intent in E:
    items = []
    tries = 0
    while len(items) < PER and tries < 4000:
        tries += 1
        r = random.random()
        if r < 0.32 and intent in BN:
            tpl, tag = random.choice(BN[intent]), B
            text = fill(tpl)
        else:
            tpl = random.choice(E[intent]); text = fill(tpl); tag = C
            r2 = random.random()
            if r2 < 0.14:
                t = typo(text)
                if t: text, tag = t, T
            elif r2 < 0.22:
                text, tag = re.sub(r'[?.!]$', '', text.lower()), T   # casual: lower-case, no punctuation
        if text.lower() in seen:
            continue
        seen.add(text.lower()); items.append((text, intent, tag))
    generated += items

random.shuffle(generated)
generated = generated[:1000]
cmds = []
for i, r in enumerate(BASE, 1):
    d = {'id': f'cmd-{i:03d}', 'text': r[0], 'intent': r[1], 'tag': r[2]}
    if len(r) > 3 and r[3]: d['ambiguous'] = True
    cmds.append(d)
for i, r in enumerate(generated, 1):
    cmds.append({'id': f'gen-{i:04d}', 'text': r[0], 'intent': r[1], 'tag': r[2]})
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'intent-commands.json'), 'w', encoding='utf8') as f:
    json.dump(cmds, f, indent=1, ensure_ascii=False); f.write('\n')
print(len(cmds), 'commands;', dict(Counter(x['tag'] for x in cmds)), '; per intent:', sorted(Counter(x['intent'] for x in cmds).values()))
