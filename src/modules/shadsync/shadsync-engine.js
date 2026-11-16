const queries = require('./shadsync-queries');

/**
 * Attainment of one outcome from the assessment columns mapped to it ({ column: weight }).
 * In a marks-sheet course a student counts only if they have at least one non-blank mark in a mapped
 * column (a blank counts as 0 for students who do). Returns null when no scored assessment is mapped.
 */
function attainmentFor(map, meta, marks, students, threshold) {
  let totalMaxMarks = 0;
  for (const [asmnt, weight] of Object.entries(map)) totalMaxMarks += (meta.max_marks[asmnt] || 0) * weight;
  if (!(totalMaxMarks > 0)) return null;

  let sum = 0, graded = 0;
  const belowList = [];
  for (const row of marks) {
    if (meta.flexible && !Object.keys(map).some(k => row[k] != null)) continue;
    let studentSum = 0;
    for (const [asmnt, weight] of Object.entries(map)) studentSum += (row[asmnt] || 0) * weight;
    const pct = (studentSum / totalMaxMarks) * 100;
    sum += pct; graded++;
    if (pct < threshold) {
      const st = students.find(s => s.id === row.student_id);
      belowList.push({ name: st ? st.realName : 'Unknown', pct: Number(pct.toFixed(1)) });
    }
  }
  belowList.sort((x, y) => x.pct - y.pct); // lowest marks first
  return { avg: graded > 0 ? sum / graded : 0, graded, belowList };
}

function calculateCourseAttainment(db, courseId) {
  const data = queries.getCourseData(db, courseId);
  const { meta, clos, cos, pos, coCloMap, coPoMap, students, marks } = data;
  
  const threshold = meta.threshold || 60; // default 60%
  
  // 1. CLO Attainment
  // Formula: For each student, Student_Score / Max_Score * 100 for the specific assessments mapped to CLO
  const cloAttainment = {}; // clo.code -> { avg: %, below_count, students_below: [{id, %}] }
  
  clos.forEach(clo => {
    const map = meta.clo_map[clo.code];
    if(!map) return;
    
    const att = attainmentFor(map, meta, marks, students, threshold);
    if(!att) return; // CLO mapped to no scored assessment: no data
    const { avg, graded, belowList } = att;
    // Average over students who have a marks row (SH2: enrolled-but-ungraded students don't count)
    
    cloAttainment[clo.code] = {
      avg: Number(avg.toFixed(1)),
      below_count: belowList.length,
      below_threshold: graded > 0 && (belowList.length / graded) > 0.4, // Failed if >40% students are below 60%
      students_below: belowList
    };
  });
  
  // 2. CO Attainment
  const coAttainment = {}; // co.code -> { avg: %, below_threshold: bool }
  cos.forEach(co => {
    // CO mapped straight to assessment columns (marks-sheet courses): no CLO in between
    const directMap = meta.co_map && meta.co_map[co.code];
    if (directMap) {
      const att = attainmentFor(directMap, meta, marks, students, threshold);
      if (att) {
        coAttainment[co.code] = { avg: Number(att.avg.toFixed(1)), below_threshold: att.avg < threshold, below_count: att.belowList.length, students_below: att.belowList };
        return;
      }
    }
    const mappings = coCloMap.filter(m => m.co_id === co.id);
    let coSum = 0;
    let totalWeight = 0;
    mappings.forEach(m => {
       const cloCode = clos.find(c => c.id === m.clo_id)?.code;
       if(cloCode && cloAttainment[cloCode]) {
          coSum += cloAttainment[cloCode].avg * m.weight;
          totalWeight += m.weight;
       }
    });
    
    // No mapped CLO with data → null ("no data"), never a fake 0%
    const avg = totalWeight > 0 ? (coSum / totalWeight) : null;
    coAttainment[co.code] = {
      avg: avg === null ? null : Number(avg.toFixed(1)),
      below_threshold: avg !== null && avg < threshold
    };
  });
  
  // 3. PO Attainment 
  const poAttainment = {}; // po.code -> { avg: %, below_threshold: bool }
  pos.forEach(po => {
    const mappings = coPoMap.filter(m => m.po_id === po.id);
    if(mappings.length === 0) return;
    
    let poSum = 0;
    let totalWeight = 0;
    mappings.forEach(m => {
       const coCode = cos.find(c => c.id === m.co_id)?.code;
       if(coCode && coAttainment[coCode] && coAttainment[coCode].avg !== null) {
          poSum += coAttainment[coCode].avg * m.weight;
          totalWeight += m.weight;
       }
    });
    
    const avg = totalWeight > 0 ? (poSum / totalWeight) : null;
    poAttainment[po.code] = {
      avg: avg === null ? null : Number(avg.toFixed(1)),
      below_threshold: avg !== null && avg < threshold
    };
  });

  return { clo: cloAttainment, co: coAttainment, po: poAttainment };
}

module.exports = {
  calculateCourseAttainment
};
