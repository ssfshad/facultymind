const fs = require('fs');
const path = require('path');
const encryption = require('../../modules/security/encryption');

function seedDatabase(db) {
  const check = db.prepare('SELECT COUNT(*) as count FROM courses').get();
  if (check.count > 0) {
    // Courses already seeded — but still seed the KB if it's empty
    _seedKnowledgeBase(db);
    return;
  }
  
  console.log('[db] Seeding dummy data...');
  
  const seedPath = path.join(__dirname, 'ice301_dummy.json');
  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  
  // 1. Insert Course
  const insertCourse = db.prepare(`
    INSERT INTO courses (code, name, section, semester, year)
    VALUES (?, ?, ?, ?, ?)
  `);
  let year = 2026;
  if(seedData.course.semester) {
    const parts = seedData.course.semester.split(' ');
    if(parts.length > 1) year = parseInt(parts[1], 10);
  }
  const courseResult = insertCourse.run(
    seedData.course.code,
    seedData.course.name,
    seedData.course.section,
    seedData.course.semester,
    year
  );
  const courseId = courseResult.lastInsertRowid;
  
  // 2. Insert CLOs
  const insertClo = db.prepare('INSERT INTO clos (course_id, code, description, bloom_level) VALUES (?, ?, ?, ?)');
  const cloIdMap = {};
  for (const clo of seedData.clos) {
    const res = insertClo.run(courseId, clo.code, clo.description, clo.bloom_level);
    cloIdMap[clo.code] = res.lastInsertRowid;
  }
  
  // 3. Insert COs and CO-CLO map
  const insertCo = db.prepare('INSERT INTO cos (course_id, code, description) VALUES (?, ?, ?)');
  const insertCoClo = db.prepare('INSERT INTO co_clo_map (co_id, clo_id, weight) VALUES (?, ?, ?)');
  const coIdMap = {};
  for (const co of seedData.cos) {
    const res = insertCo.run(courseId, co.code, co.description);
    coIdMap[co.code] = res.lastInsertRowid;
    for (const [cloCode, weight] of Object.entries(co.clo_map)) {
      insertCoClo.run(res.lastInsertRowid, cloIdMap[cloCode], weight);
    }
  }
  
  // 4. Insert POs and CO-PO map
  const insertPo = db.prepare('INSERT INTO pos (code, description, category) VALUES (?, ?, ?)');
  const insertCoPo = db.prepare('INSERT INTO co_po_map (co_id, po_id, weight) VALUES (?, ?, ?)');
  for (const po of seedData.pos) {
    // Only insert POs if they don't exist yet (this might run multiple times for different courses hypothetically)
    let poId;
    let existing = db.prepare('SELECT id FROM pos WHERE code = ?').get(po.code);
    if (!existing) {
      const res = insertPo.run(po.code, po.description, po.category);
      poId = res.lastInsertRowid;
    } else {
      poId = existing.id;
    }
    
    for (const [coCode, weight] of Object.entries(po.co_map)) {
      insertCoPo.run(coIdMap[coCode], poId, weight);
    }
  }
  
  // Save specific Assessment mapping info into settings (to be retrieved by attainment logic)
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('ice301_assessment_meta', JSON.stringify({
    weights: seedData.assessment.weights,
    max_marks: seedData.assessment.max_marks,
    clo_map: seedData.assessment.clo_map,
    threshold: seedData.assessment.threshold
  }));
  
  // 5. Insert Students and Marks and Attendance
  const insertStudent = db.prepare(`
    INSERT INTO students (course_id, student_id_anon, name_anon, enrollment_no_anon, name_enc, student_id_enc, enrollment_no_enc)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMark = db.prepare(`
    INSERT INTO marks (student_id, course_id, q1, q2, midterm, final, assignment, lab)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAtt = db.prepare('INSERT INTO attendance (student_id, course_id, date, present) VALUES (?, ?, ?, ?)');
  
  // Dummy student name encryption payload since we don't need real keys just placeholders
  const encData = (val) => val ? val + '_enc' : '';
  
  for (const s of seedData.students) {
    // Basic anonymization structure 
    const stdNameAnon = 'Student_' + s.token;
    const stdIdAnon = s.token;
    const enrollAnon = s.token.replace('S', 'E');
    
    const res = insertStudent.run(
      courseId, stdIdAnon, stdNameAnon, enrollAnon,
      encData(s.name), 
      encData(stdIdAnon), 
      encData(enrollAnon)
    );
    const sId = res.lastInsertRowid;
    
    insertMark.run(sId, courseId, 
      s.marks.q1, s.marks.q2, s.marks.midterm, s.marks.final, s.marks.assignment, s.marks.lab
    );
    
    // Create some fake attendance dates for up to standard calculation
    const daysAttended = Math.floor(20 * (s.attendance_pct / 100)); // 20 sessions hypothetical
    for (let i = 1; i <= 20; i++) {
      const date = `2026-03-${i < 10 ? '0'+i : i}`;
      const present = i <= daysAttended ? 1 : 0;
      insertAtt.run(sId, courseId, date, present);
    }
  }

  // 6. Preload specific schedule list
  const insertSchedule = db.prepare('INSERT INTO schedule (course_id, day_of_week, start_time, end_time, room, zoom_link) VALUES (?, ?, ?, ?, ?, ?)');
  for (const sch of seedData.schedule) {
    let cId = null;
    if(sch.course_code === 'ICE301') cId = courseId;
    else {
      // Fake insertion for other demo courses like ICE401
      let existingC = db.prepare('SELECT id FROM courses WHERE code = ?').get(sch.course_code);
      if(!existingC) {
         if(sch.course_code !== 'Office Hours') {
             const cr = insertCourse.run(sch.course_code, sch.course_code, 'A', seedData.course.semester, year);
             cId = cr.lastInsertRowid;
         }
      } else cId = existingC.id;
    }
    insertSchedule.run(cId, sch.day_of_week, sch.start_time, sch.end_time, sch.room, sch.zoom_link);
  }

  // 7. Insert the lesson LOG
  const insertLog = db.prepare('INSERT INTO lesson_log (course_id, date, topic_covered, topic_next, notes) VALUES (?, ?, ?, ?, ?)');
  for(const log of seedData.lesson_log) {
     let cId = null;
     if(log.course_code === 'ICE301') cId = courseId;
     else {
        let existingC = db.prepare('SELECT id FROM courses WHERE code = ?').get(log.course_code);
        if(existingC) cId = existingC.id;
     }
     if(cId) {
        insertLog.run(cId, log.date, log.topic_covered, log.topic_next, log.notes);
     }
  }

  console.log('[db] Dummy data seeded successfully');

  // Seed the CLO Knowledge Base with pre-verified engineering questions
  _seedKnowledgeBase(db);
}

/**
 * Seed the CLO Knowledge Base with 150 pre-verified engineering exam questions.
 * Only runs when the KB is empty (idempotent — safe to call on every launch).
 * Embeddings are computed lazily by the embedding engine after first use.
 */
function _seedKnowledgeBase(db) {
  try {
    // Check if the table exists (migration 005 may not have run yet in tests)
    const tableExists = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='clo_knowledge_base'`
    ).get();
    if (!tableExists) return;

    const kbCount = db.prepare('SELECT COUNT(*) as n FROM clo_knowledge_base').get().n;
    if (kbCount > 0) return; // Already seeded

    // Try the bundled path first (production: extraResources), then dev path
    const { app } = require('electron');
    let seedPath;
    try {
      seedPath = path.join(process.resourcesPath, 'seeds', 'clo-seed-dataset.json');
      if (!fs.existsSync(seedPath)) throw new Error('not found');
    } catch (_) {
      seedPath = path.join(__dirname, 'clo-seed-dataset.json');
    }

    if (!fs.existsSync(seedPath)) {
      console.warn('[db] CLO seed dataset not found at', seedPath);
      return;
    }

    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    if (!Array.isArray(seedData) || seedData.length === 0) return;

    // Also load the ICE-specific engineering seed if available
    let iceSeedData = [];
    try {
      const iceSeedPath = path.join(__dirname, 'clo-seed-ice.json');
      if (fs.existsSync(iceSeedPath)) {
        iceSeedData = JSON.parse(fs.readFileSync(iceSeedPath, 'utf8'));
      }
    } catch (_) {}

    const allSeedData = [...seedData, ...iceSeedData];

    const insert = db.prepare(`
      INSERT INTO clo_knowledge_base
        (course_code, question_text, clo_code, bloom_level, bloom_name,
         action_verbs, source, verified, root_verb)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    const insertAll = db.transaction((records) => {
      for (const r of records) {
        insert.run(
          r.course_code || 'SEED',
          r.text,
          '',
          r.bloom_level,
          r.bloom_name,
          JSON.stringify([r.root_verb]),
          'seed',
          r.root_verb,
        );
      }
    });

    insertAll(allSeedData);
    console.log(`[db] CLO Knowledge Base seeded with ${allSeedData.length} pre-verified questions (${seedData.length} general + ${iceSeedData.length} ICE-specific)`);
  } catch (e) {
    console.warn('[db] CLO KB seed failed (non-fatal):', e.message);
  }
}

module.exports = { seedDatabase };
