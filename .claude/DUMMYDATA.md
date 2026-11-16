# FacultyMind — Demo Dataset Specification
# This is the EXACT data pre-loaded into ShadSync for the competition demo.
# Every number is fixed and verified. Do NOT use random generation.
# File to create: /src/database/seeds/ice301_dummy.json
# Load this data on first launch if database is empty.

---

## Course Details
Code:       ice301
Name:       Object Oriented Programming
Section:    A
Semester:   Spring 2026
Department: Computer Science & Engineering
University: Daffodil International University (DIU)

---

## CLO Definitions
CLO1: Understand and explain core OOP concepts including encapsulation,
      inheritance, and polymorphism. [Bloom's C2 — Understand]
CLO2: Apply OOP principles to design and implement Java programs.
      [Bloom's C3 — Apply]
CLO3: Analyze software design patterns and evaluate their applicability.
      [Bloom's C4 — Analyze]
CLO4: Design and evaluate class hierarchies for real-world systems.
      [Bloom's C5 — Evaluate]

---

## CO Definitions and CLO Mapping
CO1: Demonstrate proficiency in OOP programming concepts.
     Maps to: CLO1 (50%), CLO2 (50%)

CO2: Apply design principles to build structured software systems.
     Maps to: CLO3 (60%), CLO4 (40%)

---

## PO Definitions and CO Mapping
PO1: Engineering Knowledge — CO1 (60%), CO2 (40%)
PO2: Problem Analysis     — CO1 (40%), CO2 (60%)
PO3: Design Solutions     — CO2 (100%)
PO5: Modern Tool Usage    — CO1 (50%), CO2 (50%)

---

## Assessment Weights
Q1:         10%  (max marks: 10)
Q2:         10%  (max marks: 10)
Midterm:    20%  (max marks: 20)
Final:      40%  (max marks: 40)
Assignment: 10%  (max marks: 10)
Lab:        10%  (max marks: 10)
Total:      100%

---

## CLO-to-Assessment Mapping
CLO1: Q1 (100%), Midterm MCQ section (50%)
CLO2: Q2 (100%), Lab (100%), Assignment (50%)
CLO3: Midterm Essay section (50%), Final (50%)
CLO4: Final (50%), Assignment (50%)

---

## Attainment Threshold: 60%
Students below 60% on a CLO are flagged for intervention.
A CLO is considered "not attained" if more than 40% of students are below threshold.

---

## MEMORISE THESE DEMO QUERY ANSWERS
These are the exact answers ShadSync must return for demo queries.
Numbers verified against engine formula on 2026-04-04 — DO NOT hand-edit these again.
Test all of these before competition day.

Q: "Show ice301 CLO attainment"
A: CLO1: 66.3%  |  CLO2: 67.9%  |  CLO3: 64.4%  |  CLO4: 65.7%

Q: "Which CLOs are at risk?"
A: No CLO has breached the cohort threshold (>40% students below 60%).
   CLO3 is most at-risk: 13 out of 35 students (37.1%) scored below 60%.

Q: "Which students scored below 60% on CLO3?"
A: 13 students. Top 5 lowest: Reza (36.7%), Das (38.3%), Karim (41.7%), Faruk (43.3%), Begum (46.7%)

Q: "Show overall PO attainment"
A: PO1: 66.2%  |  PO2: 65.8%  |  PO3: 64.9%  |  PO5: 66.0%

Q: "Class average final exam marks"
A: 25.6 out of 40 (63.9%)

Q: "Show CO attainment"
A: CO1: 67.1%  |  CO2: 64.9%

Q: "Who are the top 3 students?"
A: Hossain (94%), Rahman (87%), Paul (87%)

Q: "What is the class attendance average?"
A: 81.3% across all sessions

---

## Student Dataset (All 35 Students)
Format: Token | Name | Q1 | Q2 | Mid | Final | Asgn | Lab | Att%

S001 | Rahman    |  9 |  8 | 17 | 35 |  9 |  9 | 96%
S002 | Hossain   | 10 |  9 | 18 | 37 | 10 | 10 | 98%
S003 | Islam     |  6 |  5 | 12 | 22 |  7 |  7 | 78%
S004 | Ahmed     |  8 |  9 | 16 | 33 |  8 |  9 | 88%
S005 | Begum     |  5 |  4 | 10 | 18 |  6 |  6 | 71%
S006 | Khatun    |  7 |  7 | 14 | 28 |  8 |  8 | 85%
S007 | Karim     |  4 |  4 |  9 | 16 |  5 |  5 | 68%
S008 | Akter     |  8 |  8 | 15 | 30 |  8 |  8 | 90%
S009 | Sultana   |  5 |  5 | 11 | 20 |  6 |  6 | 74%
S010 | Miah      |  9 |  8 | 16 | 32 |  9 |  9 | 92%
S011 | Chowdhury |  7 |  6 | 13 | 26 |  7 |  7 | 82%
S012 | Biswas    |  6 |  6 | 12 | 24 |  7 |  7 | 79%
S013 | Sarkar    |  8 |  7 | 15 | 29 |  8 |  8 | 87%
S014 | Mondol    |  5 |  5 | 10 | 19 |  6 |  6 | 72%
S015 | Paul      |  9 |  9 | 17 | 34 |  9 |  9 | 94%
S016 | Das       |  4 |  3 |  8 | 15 |  5 |  4 | 65%
S017 | Roy       |  7 |  7 | 14 | 27 |  8 |  7 | 84%
S018 | Moni      |  5 |  4 | 10 | 19 |  6 |  6 | 73%
S019 | Reza      |  4 |  3 |  8 | 14 |  5 |  4 | 62%
S020 | Parveen   |  5 |  5 | 11 | 18 |  6 |  5 | 70%
S021 | Noor      |  8 |  8 | 15 | 31 |  8 |  8 | 89%
S022 | Kabir     |  6 |  6 | 13 | 25 |  7 |  7 | 80%
S023 | Jahan     |  7 |  7 | 14 | 28 |  8 |  8 | 86%
S024 | Ullah     |  9 |  8 | 16 | 33 |  9 |  8 | 91%
S025 | Bhuiyan   |  6 |  5 | 12 | 23 |  7 |  6 | 77%
S026 | Sikder    |  5 |  4 | 10 | 19 |  6 |  5 | 71%
S027 | Talukder  |  8 |  8 | 15 | 30 |  8 |  8 | 88%
S028 | Haider    |  7 |  6 | 13 | 26 |  7 |  7 | 83%
S029 | Mamun     |  9 |  9 | 17 | 34 |  9 |  9 | 93%
S030 | Faruk     |  4 |  4 |  9 | 17 |  5 |  5 | 67%
S031 | Nasrin    |  8 |  7 | 15 | 29 |  8 |  8 | 86%
S032 | Halim     |  6 |  6 | 12 | 24 |  7 |  6 | 78%
S033 | Asma      |  7 |  7 | 14 | 27 |  8 |  7 | 85%
S034 | Rubel     |  5 |  5 | 11 | 21 |  6 |  6 | 73%
S035 | Shirin    |  9 |  8 | 16 | 32 |  9 |  9 | 90%

---

## Demo Schedule Data (Pre-loaded)
Monday:    ice301 OOP           | 08:00–09:30 | Room: 701 | Zoom: https://diu.zoom.us/j/demo301
Tuesday:   ICE401 Data Structures | 10:00–11:30 | Room: 702 | Zoom: https://diu.zoom.us/j/demo401
Wednesday: ice301 OOP (Lab)     | 13:00–14:30 | Room: Lab3
Thursday:  ICE205 Discrete Math | 09:00–10:30 | Room: 603
Friday:    Office Hours         | 11:00–12:00 | Room: Faculty Office 201

## Last Lesson Log (Pre-loaded for Demo)
ice301 — Last covered: Inheritance and Method Overriding
ice301 — Next topic:   Polymorphism and Interface Implementation
ICE401 — Last covered: Stack and Queue ADTs
ICE401 — Next topic:   Linked List Implementation
