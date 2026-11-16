const engine = require('./shadsync-engine');
const queries = require('./shadsync-queries');
const modelRouter = require('../ai/model-router');
const prompts = require('../../prompts/templates/shadsync-query');

async function handleNlQuery(db, userMessage, courseCode) {
  // First, we find the proper course ID
  const course = db.prepare('SELECT id, code FROM courses WHERE code = ? COLLATE NOCASE').get(courseCode);
  if (!course) {
    return `I couldn't find a course matching "${courseCode}". Please select an active course or add one first.`;
  }

  // Generate prompt
  const prompt = prompts.shadsyncQueryPrompt(userMessage, course.code);

  // Marks / attendance queries: local model only (S2 local-only policy)
  const aiResp = await modelRouter.send(prompt.user, {}, {
    systemPrompt: prompt.system,
    isJson: true,
    localOnly: true,
  });

  let parsed;
  try {
    parsed = JSON.parse(aiResp.text);
  } catch (e) {
    return "I couldn't understand that data request. Could you rephrase it?";
  }

  // Get raw data and compute attainments
  const data = queries.getCourseData(db, course.id);
  const attainment = engine.calculateCourseAttainment(db, course.id);
  
  // Format the output based on parsed intent
  const qType = parsed.query_type;
  const f = parsed.filters || {};
  
  if (qType === 'attainment_summary') {
    if (f.co_code) {
      const co = attainment.co[f.co_code];
      return co ? co.avg === null ? `No data for ${f.co_code}` : `${f.co_code} attainment is ${co.avg}% ${co.below_threshold ? '⚠️ BELOW THRESHOLD' : ''}` : `No data for ${f.co_code}`;
    }
    if (f.po_code) {
      const po = attainment.po[f.po_code];
      return po ? po.avg === null ? `No data for ${f.po_code}` : `${f.po_code} attainment is ${po.avg}% ${po.below_threshold ? '⚠️ BELOW THRESHOLD' : ''}` : `No data for ${f.po_code}`;
    }
    // Default to CLO summary
    const cloLines = Object.entries(attainment.clo).map(([code, clo]) => {
      const warning = clo.below_threshold ? ' ← BELOW THRESHOLD' : '';
      return `${code}: ${clo.avg}% ${warning}`;
    }).join(' | ');
    return cloLines || 'No CLO data available.';
  }
  
  if (qType === 'below_threshold') {
    const failedCols = Object.entries(attainment.clo).filter(([k,v]) => v.below_threshold);
    if(failedCols.length === 0) return "No CLOs are currently flagged as below threshold.";
    return failedCols.map(([k,v]) => `${k} (${v.avg}%) — ${v.below_count} out of ${data.students.length} students below 60%`).join('\n');
  }
  
  if (qType === 'student_list' && f.clo_code && f.threshold_filter === 'below') {
    const clo = attainment.clo[f.clo_code];
    if(!clo) return `Cannot find data for ${f.clo_code}`;
    const top5 = clo.students_below.slice(0, 5).map(s => `${s.name} (${s.pct}%)`).join(', ');
    return `${clo.below_count} students. Top 5: ${top5}`;
  }
  
  if (qType === 'top_performers') {
    if(!data.students || data.students.length === 0) return "No students enrolled.";
    const totals = data.marks.map(m => {
      const total = (m.q1||0) + (m.q2||0) + (m.midterm||0) + (m.final||0) + (m.assignment||0) + (m.lab||0);
      const stu = data.students.find(s => s.id === m.student_id);
      return { name: stu ? stu.realName : 'Unknown', pct: total }; // Assuming totals scale to 100 max
    }).sort((a,b) => b.pct - a.pct).slice(0, 3);
    
    return totals.map(t => `${t.name} (${t.pct}%)`).join(', ');
  }
  
  if (qType === 'attendance_report') {
    const allAtt = db.prepare('SELECT present FROM attendance WHERE course_id = ?').all(course.id);
    if(allAtt.length === 0) return "No attendance logged.";
    const totalPresent = allAtt.filter(a => a.present === 1).length;
    const avg = (totalPresent / allAtt.length) * 100;
    return `${avg.toFixed(1)}% across all sessions`;
  }
  
  // Fallback pattern matching for specific DUMMYDATA.md queries
  if (userMessage.toLowerCase().includes("average final exam")) {
    const finalMarks = data.marks.map(m => m.final || 0);
    const avg = finalMarks.reduce((a,b)=>a+b, 0) / finalMarks.length;
    const pct = (avg / data.meta.max_marks.final) * 100;
    return `${avg.toFixed(1)} out of ${data.meta.max_marks.final} (${pct.toFixed(0)}%)`;
  }

  // Provide general descriptive fallback
  return `Okay, here is what I found based on your request:\n${parsed.response_template}\n\n(For detailed breakdown please check the ShadSync dashboard)`;
}

module.exports = {
  handleNlQuery
};
