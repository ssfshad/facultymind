# Writes eval/data/entity-commands.json: commands whose HANDLER needs details the model must extract.
# Each item: text, intent (the intent is certain), checks (all must pass):
#   url / course_code / model / portal : exact match on that entity (case-insensitive)
#   has: words that must appear (case-insensitive) in the named field      e.g. {"field": "reminder_text", "words": ["marks"]}
#   datetime: true  -> the datetime entity must be present and parseable as a date
# Synthetic, hand-written.   python eval/data/make-entity-commands.py
import json, os

R = 'REMINDER_SET'; VS = 'VAULT_SAVE'; VQ = 'VAULT_SEARCH'; SQ = 'SHADSYNC_QUERY'; MS = 'MODEL_SWITCH'; PO = 'PORTAL_OPEN'
rows = []
def add(text, intent, **checks): rows.append({'text': text, 'intent': intent, 'checks': checks})

def rem(text, words, dt=True):
    add(text, R, has={'field': 'reminder_text', 'words': words}, **({'datetime': True} if dt else {}))

# REMINDER_SET (text + time)
rem('Remind me to submit the marks sheet by Thursday', ['marks'])
rem('set a reminder to call the registrar at 3pm', ['registrar'])
rem('remind me tomorrow morning to print the question papers', ['question', 'papers'])
rem("don't let me forget to upload the syllabus on Sunday", ['syllabus'])
rem('remind me about the faculty meeting on Monday at 10am', ['faculty', 'meeting'])
rem('notify me 15 minutes before my ICE301 lecture', ['ICE301'], dt=False)
rem('please remind me to grade the quizzes tonight', ['quizzes'])
rem('set a reminder: send the attendance report on Wednesday', ['attendance'])
rem('ping me at 4:30pm to prepare the lab sheet', ['lab'])
rem('remind me next Tuesday to book the seminar hall', ['seminar'])
rem('alert me before the thesis defence on Thursday', ['thesis'])
rem('remind me to email the dean today at 2pm', ['dean'])
rem('amake kal sokal 9 tay quiz er kotha mone koriye dio', ['quiz'])
rem('thesis defence er age amake janio', ['thesis'], dt=False)

# VAULT_SAVE (content / url / password)
add('Save this link: https://blc.example.edu/course/12', VS, url='https://blc.example.edu/course/12')
add('remember this link for later: https://slides.example.com/ice301', VS, url='https://slides.example.com/ice301')
add('store https://www.example.edu/forms in my vault', VS, url='https://www.example.edu/forms')
add('save this url https://portal.example.org/results', VS, url='https://portal.example.org/results')
add('save a note: midterm questions due Friday', VS, has={'field': 'content', 'words': ['midterm', 'friday']})
add('save a note: bring the projector adapter', VS, has={'field': 'content', 'words': ['projector']})
add('write down in the vault that lab 3 needs new cables', VS, has={'field': 'content', 'words': ['lab', 'cables']})
add('store my wifi password in the vault, it is Tiger2026', VS, password='Tiger2026')
add('save my router login in the vault: user admin password Blue77', VS, password='Blue77')
add('keep this password safe: Maple#55 for the library portal', VS, password='Maple#55')

# VAULT_SEARCH (query)
add('Find my saved notes about the midterm', VQ, has={'field': 'query', 'words': ['midterm']})
add('search the vault for the wifi password', VQ, has={'field': 'query', 'words': ['wifi']})
add('where is the syllabus file I saved', VQ, has={'field': 'query', 'words': ['syllabus']})
add('look up the link I stored for the library', VQ, has={'field': 'query', 'words': ['library']})
add('what did I save about recursion', VQ, has={'field': 'query', 'words': ['recursion']})
add('do I have a password saved for the lab server', VQ, has={'field': 'query', 'words': ['lab']})
add('vault e antenna design er note khuje dao', VQ, has={'field': 'query', 'words': ['antenna']})
add('locate my note on Fourier series', VQ, has={'field': 'query', 'words': ['fourier']})

# SHADSYNC_QUERY (course code)
for text, code in [('What is the CLO attainment for ICE301?', 'ICE301'), ('show me PO attainment of ICE415', 'ICE415'),
                   ('how many students are below 60% in CLO3 of EEE1345', 'EEE1345'), ("what's the CO2 attainment for MAT2137", 'MAT2137'),
                   ('list at-risk students in CSE221', 'CSE221'), ('is CLO4 attained in HUM101', 'HUM101'),
                   ('ICE205 er CO2 attainment koto?', 'ICE205'), ('show weak CLOs for BBA101', 'BBA101')]:
    add(text, SQ, course_code=code)

# MODEL_SWITCH (model name as the handler expects it)
for text, model in [('Switch to Gemini', 'gemini'), ('use GPT-4o from now on', 'gpt4o'), ('change the AI model to Claude', 'claude'),
                    ("let's use Gemini for this", 'gemini'), ('I want to talk to Claude instead', 'claude'), ('model ta gpt4o e change koro', 'gpt4o')]:
    add(text, MS, model=model)

# PORTAL_OPEN (portal)
for text, portal in [('Open the DIU portal', 'diu'), ('open BLC', 'blc'), ('take me to the BLC website', 'blc'), ('launch the DIU teachers portal', 'diu')]:
    add(text, PO, portal=portal)

for i, r in enumerate(rows, 1):
    r['id'] = f'ent-{i:03d}'
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'entity-commands.json'), 'w', encoding='utf8') as f:
    json.dump(rows, f, indent=1, ensure_ascii=False); f.write('\n')
print(len(rows), 'entity commands')
