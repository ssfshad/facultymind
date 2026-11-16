/* ── DIU Teachers Portal ────────────────────────────────────────────── */

let _diuCourses   = [];
let _diuStudents  = [];
let _diuCourseId  = null;
let _attRecords   = {};  // { studentId: true/false }

// ── Grade calculator (DIU standard) ──────────────────────────────────
function diuGrade(total) {
  if (total >= 80) return { grade: 'A+', gpa: '4.00' };
  if (total >= 75) return { grade: 'A',  gpa: '3.75' };
  if (total >= 70) return { grade: 'A-', gpa: '3.50' };
  if (total >= 65) return { grade: 'B+', gpa: '3.25' };
  if (total >= 60) return { grade: 'B',  gpa: '3.00' };
  if (total >= 55) return { grade: 'B-', gpa: '2.75' };
  if (total >= 50) return { grade: 'C+', gpa: '2.50' };
  if (total >= 45) return { grade: 'C',  gpa: '2.25' };
  if (total >= 40) return { grade: 'D',  gpa: '2.00' };
  return { grade: 'F', gpa: '0.00' };
}

function gradeClass(g) {
  return 'grade-' + g.replace('+','p').replace('-','m');
}

// ── Toast ─────────────────────────────────────────────────────────────
function diuToast(msg, type = '') {
  let t = document.getElementById('diu-toast');
  if (!t) { t = document.createElement('div'); t.id = 'diu-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = ''; }, 2800);
}

// ── Init ──────────────────────────────────────────────────────────────
async function initDiuPortal() {
  const res = await window.api.diu.courses();
  _diuCourses = res.ok ? res.courses : [];

  populateDiuCourseSelector();
  if (_diuCourses.length > 0) {
    _diuCourseId = _diuCourses[0].id;
    document.getElementById('diu-course-sel').value = _diuCourseId;
  }

  showDiuSection('dashboard');
}

function populateDiuCourseSelector() {
  const sel = document.getElementById('diu-course-sel');
  sel.innerHTML = _diuCourses.length
    ? _diuCourses.map(c => `<option value="${c.id}">${c.code} — ${c.name} (${c.section || 'A'})</option>`).join('')
    : '<option value="">No courses found</option>';
}

// ── Section navigation ─────────────────────────────────────────────────
function showDiuSection(name) {
  document.querySelectorAll('.diu-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.diu-nav-item').forEach(n => n.classList.remove('active'));

  const sec = document.getElementById('diu-sec-' + name);
  if (sec) sec.classList.remove('hidden');
  const nav = document.querySelector(`.diu-nav-item[data-sec="${name}"]`);
  if (nav) nav.classList.add('active');

  _diuCourseId = parseInt(document.getElementById('diu-course-sel').value) || _diuCourseId;

  switch (name) {
    case 'dashboard':  renderDiuDashboard(); break;
    case 'attendance': renderDiuAttendance(); break;
    case 'marks':      renderDiuMarks(); break;
    case 'result':     renderDiuResult(); break;
    case 'course-reg': renderDiuCourseReg(); break;
  }

  const topTitle = document.getElementById('diu-topbar-title');
  if (topTitle) {
    const labels = {
      dashboard:  'Dashboard',
      attendance: 'Student Attendance',
      marks:      'Marks Entry',
      result:     'Result / Gradesheet',
      'course-reg': 'Course Registration',
    };
    topTitle.textContent = labels[name] || 'DIU Teachers Portal';
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────
async function renderDiuDashboard() {
  const el = document.getElementById('diu-sec-dashboard');
  if (!_diuCourseId) { el.innerHTML = '<p style="color:#888;padding:20px">Select a course above.</p>'; return; }

  const [sr, ar] = await Promise.all([
    window.api.diu.students(_diuCourseId),
    window.api.diu.attendance(_diuCourseId),
  ]);

  const students = sr.ok ? sr.students : [];
  const attData  = ar.ok ? ar : { students: [], dates: [] };

  const totals = students.map(s => {
    const ct = Math.round(((s.ct1 + s.ct2 + s.ct3) / 3) * 10) / 10;
    return s.attendance + ct + s.presentation + s.assignment + s.midterm + s.finalExam;
  });

  const avg = totals.length ? Math.round(totals.reduce((a,b)=>a+b,0)/totals.length * 10)/10 : 0;
  const passing = totals.filter(t => t >= 40).length;
  const at_risk = totals.filter(t => t < 40).length;
  const avgAtt  = attData.students.length
    ? Math.round(attData.students.reduce((a,s)=>a+(s.totalDays?s.daysPresent/s.totalDays*100:0),0)/attData.students.length)
    : 0;

  const course = _diuCourses.find(c => c.id === _diuCourseId) || {};

  el.innerHTML = `
    <div class="diu-dashboard-cards">
      <div class="diu-stat-card">
        <div class="stat-label">Total Students</div>
        <div class="stat-value">${students.length}</div>
        <div class="stat-sub">${course.code || ''} — ${course.section || 'A'}</div>
      </div>
      <div class="diu-stat-card green">
        <div class="stat-label">Passing</div>
        <div class="stat-value">${passing}</div>
        <div class="stat-sub">Grand Total ≥ 40</div>
      </div>
      <div class="diu-stat-card red">
        <div class="stat-label">At Risk</div>
        <div class="stat-value">${at_risk}</div>
        <div class="stat-sub">Grand Total &lt; 40</div>
      </div>
      <div class="diu-stat-card orange">
        <div class="stat-label">Class Avg</div>
        <div class="stat-value">${avg}</div>
        <div class="stat-sub">Out of 100</div>
      </div>
      <div class="diu-stat-card">
        <div class="stat-label">Avg Attendance</div>
        <div class="stat-value">${avgAtt}%</div>
        <div class="stat-sub">${attData.dates.length} classes held</div>
      </div>
    </div>

    <div class="diu-card">
      <div class="diu-card-header">Course Information</div>
      <div class="diu-card-body">
        <table style="width:100%;font-size:13px;font-family:Arial,sans-serif;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 12px;color:#888;width:140px">Course Code</td>
            <td style="padding:6px 12px;font-weight:600">${course.code || '—'}</td>
            <td style="padding:6px 12px;color:#888;width:140px">Section</td>
            <td style="padding:6px 12px;font-weight:600">${course.section || 'A'}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:6px 12px;color:#888">Course Title</td>
            <td style="padding:6px 12px;font-weight:600" colspan="3">${course.name || '—'}</td>
          </tr>
          <tr>
            <td style="padding:6px 12px;color:#888">Semester</td>
            <td style="padding:6px 12px;font-weight:600">${course.semester || '—'}</td>
            <td style="padding:6px 12px;color:#888">Year</td>
            <td style="padding:6px 12px;font-weight:600">${course.year || '—'}</td>
          </tr>
        </table>
      </div>
    </div>
  `;
}

// ── Attendance ─────────────────────────────────────────────────────────
async function renderDiuAttendance() {
  const el = document.getElementById('diu-sec-attendance');
  if (!_diuCourseId) { el.innerHTML = '<p style="color:#888;padding:20px">Select a course above.</p>'; return; }

  el.innerHTML = `
    <div class="diu-card">
      <div class="diu-card-header">
        <span>Mark Attendance</span>
        <button class="diu-btn diu-btn-success" id="diu-att-save">Save Attendance</button>
      </div>
      <div class="diu-card-body">
        <div class="diu-att-header">
          <label style="font-size:13px;font-family:Arial,sans-serif;font-weight:600">Date:</label>
          <input type="date" id="diu-att-date" value="${new Date().toISOString().split('T')[0]}" />
          <button class="diu-btn diu-btn-outline" id="diu-att-all-present">All Present</button>
          <button class="diu-btn diu-btn-outline" id="diu-att-all-absent">All Absent</button>
        </div>
        <div class="diu-table-wrap" id="diu-att-table-wrap">
          <p style="color:#aaa;font-size:13px">Loading...</p>
        </div>
      </div>
    </div>

    <div class="diu-card" style="margin-top:16px">
      <div class="diu-card-header">Attendance Summary</div>
      <div class="diu-card-body">
        <div class="diu-table-wrap" id="diu-att-summary-wrap">
          <p style="color:#aaa;font-size:13px">Loading...</p>
        </div>
      </div>
    </div>
  `;

  const res = await window.api.diu.students(_diuCourseId);
  _diuStudents = res.ok ? res.students : [];
  _attRecords = {};
  _diuStudents.forEach(s => { _attRecords[s.id] = true; });  // default present

  renderAttTable();
  await renderAttSummary();

  document.getElementById('diu-att-all-present').addEventListener('click', () => {
    _diuStudents.forEach(s => { _attRecords[s.id] = true; });
    renderAttTable();
  });
  document.getElementById('diu-att-all-absent').addEventListener('click', () => {
    _diuStudents.forEach(s => { _attRecords[s.id] = false; });
    renderAttTable();
  });
  document.getElementById('diu-att-save').addEventListener('click', saveAttendance);
}

function renderAttTable() {
  const wrap = document.getElementById('diu-att-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <table class="diu-table">
      <thead>
        <tr>
          <th style="width:40px">SL</th>
          <th class="left">Student ID</th>
          <th class="left">Name</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${_diuStudents.map((s, i) => `
          <tr id="att-row-${s.id}" class="${_attRecords[s.id] ? 'att-present' : 'att-absent'}">
            <td>${i+1}</td>
            <td class="left">${s.studentId}</td>
            <td class="left">${s.name}</td>
            <td>
              <button class="att-toggle ${_attRecords[s.id] ? 'present' : 'absent'}"
                data-sid="${s.id}">
                ${_attRecords[s.id] ? 'Present' : 'Absent'}
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('.att-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = parseInt(btn.dataset.sid);
      _attRecords[sid] = !_attRecords[sid];
      const row = document.getElementById('att-row-' + sid);
      if (_attRecords[sid]) {
        row.className = 'att-present';
        btn.className = 'att-toggle present';
        btn.textContent = 'Present';
      } else {
        row.className = 'att-absent';
        btn.className = 'att-toggle absent';
        btn.textContent = 'Absent';
      }
    });
  });
}

async function renderAttSummary() {
  const wrap = document.getElementById('diu-att-summary-wrap');
  if (!wrap) return;
  const ar = await window.api.diu.attendance(_diuCourseId);
  if (!ar.ok) { wrap.innerHTML = '<p style="color:#dc3545">Error loading attendance.</p>'; return; }

  wrap.innerHTML = `
    <table class="diu-table">
      <thead>
        <tr>
          <th>SL</th>
          <th class="left">Student ID</th>
          <th class="left">Name</th>
          <th>Days Present</th>
          <th>Total Classes</th>
          <th>Attendance %</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${ar.students.map((s, i) => {
          const pct = s.totalDays ? Math.round(s.daysPresent / s.totalDays * 100) : 0;
          const ok  = pct >= 75;
          return `
            <tr>
              <td>${i+1}</td>
              <td class="left">${s.studentId}</td>
              <td class="left">${s.name}</td>
              <td>${s.daysPresent}</td>
              <td>${s.totalDays}</td>
              <td>${pct}%</td>
              <td><span style="color:${ok?'#28a745':'#dc3545'};font-weight:700">${ok?'Regular':'Irregular'}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function saveAttendance() {
  const date = document.getElementById('diu-att-date').value;
  if (!date) { diuToast('Select a date first.', 'error'); return; }
  const records = _diuStudents.map(s => ({ studentId: s.id, present: !!_attRecords[s.id] }));
  const r = await window.api.diu.saveAttendance({ courseId: _diuCourseId, date, records });
  if (r.ok) {
    diuToast('Attendance saved!', 'success');
    await renderAttSummary();
  } else {
    diuToast('Error: ' + r.error, 'error');
  }
}

// ── Marks Entry ────────────────────────────────────────────────────────
async function renderDiuMarks() {
  const el = document.getElementById('diu-sec-marks');
  if (!_diuCourseId) { el.innerHTML = '<p style="color:#888;padding:20px">Select a course above.</p>'; return; }

  const res = await window.api.diu.students(_diuCourseId);
  _diuStudents = res.ok ? res.students : [];

  el.innerHTML = `
    <div class="diu-card">
      <div class="diu-card-header">
        <span>Marks Entry</span>
        <button class="diu-btn diu-btn-success" id="diu-marks-save">Save All Marks</button>
      </div>
      <div class="diu-card-body">
        <div class="diu-table-wrap">
          <table class="diu-table" id="diu-marks-table">
            <thead>
              <tr>
                <th rowspan="2">SL</th>
                <th rowspan="2" class="left">Student ID</th>
                <th rowspan="2" class="left">Name of the Student</th>
                <th rowspan="2">Class<br>Attendance<br>(out of 7)</th>
                <th>CT-1<br>(out of 15)</th>
                <th>CT-2<br>(out of 15)</th>
                <th>CT-3<br>(out of 15)</th>
                <th>Class Test<br>(out of 15)</th>
                <th>Presentation/<br>Viva-Voce/<br>Proj (out of 8)</th>
                <th>Assignment<br>(out of 5)</th>
                <th>Mid Term<br>Exam<br>(out of 25)</th>
                <th>Final Exam<br>(out of 40)</th>
                <th>Grand<br>Total<br>(out of 100)</th>
                <th>Final<br>Grade</th>
              </tr>
            </thead>
            <tbody>
              ${_diuStudents.map((s, i) => {
                const ct = Math.round(((s.ct1+s.ct2+s.ct3)/3)*10)/10;
                const gt = Math.round((s.attendance+ct+s.presentation+s.assignment+s.midterm+s.finalExam)*10)/10;
                const { grade } = diuGrade(gt);
                return `
                  <tr data-sid="${s.id}">
                    <td>${i+1}</td>
                    <td class="left">${s.studentId}</td>
                    <td class="left">${s.name}</td>
                    <td><input type="number" class="m-att" min="0" max="7" step="0.5" value="${s.attendance}"></td>
                    <td><input type="number" class="m-ct1" min="0" max="15" step="0.5" value="${s.ct1}"></td>
                    <td><input type="number" class="m-ct2" min="0" max="15" step="0.5" value="${s.ct2}"></td>
                    <td><input type="number" class="m-ct3" min="0" max="15" step="0.5" value="${s.ct3}"></td>
                    <td class="auto-calc m-ct">${ct.toFixed(2)}</td>
                    <td><input type="number" class="m-pres" min="0" max="8" step="0.5" value="${s.presentation}"></td>
                    <td><input type="number" class="m-asgn" min="0" max="5" step="0.5" value="${s.assignment}"></td>
                    <td><input type="number" class="m-mid" min="0" max="25" step="0.5" value="${s.midterm}"></td>
                    <td><input type="number" class="m-fin" min="0" max="40" step="0.5" value="${s.finalExam}"></td>
                    <td class="auto-calc m-gt">${gt.toFixed(2)}</td>
                    <td class="auto-calc m-grade"><span class="diu-grade ${gradeClass(grade)}">${grade}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Wire auto-recalc on input
  document.getElementById('diu-marks-table').addEventListener('input', e => {
    if (!e.target.matches('input[type="number"]')) return;
    const row = e.target.closest('tr');
    recalcRow(row);
  });

  document.getElementById('diu-marks-save').addEventListener('click', saveDiuMarks);
}

function recalcRow(row) {
  const v = sel => {
    const inp = row.querySelector(sel);
    return inp ? Math.min(parseFloat(inp.max||99), Math.max(0, parseFloat(inp.value)||0)) : 0;
  };
  const att  = v('.m-att');
  const ct1  = v('.m-ct1');
  const ct2  = v('.m-ct2');
  const ct3  = v('.m-ct3');
  const pres = v('.m-pres');
  const asgn = v('.m-asgn');
  const mid  = v('.m-mid');
  const fin  = v('.m-fin');
  const ct   = Math.round(((ct1+ct2+ct3)/3)*100)/100;
  const gt   = Math.round((att+ct+pres+asgn+mid+fin)*100)/100;
  const { grade } = diuGrade(gt);
  row.querySelector('.m-ct').textContent    = ct.toFixed(2);
  row.querySelector('.m-gt').textContent    = gt.toFixed(2);
  row.querySelector('.m-grade').innerHTML   = `<span class="diu-grade ${gradeClass(grade)}">${grade}</span>`;
}

async function saveDiuMarks() {
  const rows = document.querySelectorAll('#diu-marks-table tbody tr');
  const marks = [];
  rows.forEach(row => {
    const v = sel => {
      const inp = row.querySelector(sel);
      return inp ? Math.min(parseFloat(inp.max||99), Math.max(0, parseFloat(inp.value)||0)) : 0;
    };
    marks.push({
      studentId:   parseInt(row.dataset.sid),
      attendance:  v('.m-att'),
      ct1:         v('.m-ct1'),
      ct2:         v('.m-ct2'),
      ct3:         v('.m-ct3'),
      presentation:v('.m-pres'),
      assignment:  v('.m-asgn'),
      midterm:     v('.m-mid'),
      finalExam:   v('.m-fin'),
    });
  });
  const r = await window.api.diu.saveMarks({ courseId: _diuCourseId, marks });
  if (r.ok) {
    diuToast('Marks saved and synced to ShadSync OBE!', 'success');
  } else {
    diuToast('Error: ' + r.error, 'error');
  }
}

// ── Result / Grade Sheet ───────────────────────────────────────────────
async function renderDiuResult() {
  const el = document.getElementById('diu-sec-result');
  if (!_diuCourseId) { el.innerHTML = '<p style="color:#888;padding:20px">Select a course above.</p>'; return; }

  const res = await window.api.diu.students(_diuCourseId);
  _diuStudents = res.ok ? res.students : [];
  const course = _diuCourses.find(c => c.id === _diuCourseId) || {};

  const rows = _diuStudents.map((s, i) => {
    const ct = Math.round(((s.ct1+s.ct2+s.ct3)/3)*100)/100;
    const gt = Math.round((s.attendance+ct+s.presentation+s.assignment+s.midterm+s.finalExam)*100)/100;
    const { grade, gpa } = diuGrade(gt);
    return { ...s, ct, gt, grade, gpa, sl: i+1 };
  });

  // Grade summary
  const gradeCounts = ['A+','A','A-','B+','B','B-','C+','C','D','F'].reduce((acc,g) => {
    acc[g] = rows.filter(r => r.grade === g).length; return acc;
  }, {});

  const today = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });

  el.innerHTML = `
    <div class="diu-gs-actions">
      <button class="diu-btn diu-btn-primary" onclick="window.print()">🖨 Print</button>
      <button class="diu-btn diu-btn-outline" onclick="renderDiuResult()">🔄 Refresh</button>
    </div>
    <div class="diu-grade-sheet" id="diu-gs-print">
      <div class="diu-gs-status">Published</div>
      <div class="diu-gs-header">
        <h1>Daffodil International University</h1>
        <h2>Final Grade Sheet</h2>
      </div>

      <div style="font-size:12px;font-family:Arial,sans-serif;margin-bottom:4px">
        <strong>Faculty of Engineering</strong>
      </div>

      <div class="diu-gs-meta">
        <div class="diu-gs-meta-cell"><strong>Semester:</strong><span>${course.semester || 'Spring 2026'}</span></div>
        <div class="diu-gs-meta-cell"><strong>Program:</strong><span>B.Sc. in ICE</span></div>
        <div class="diu-gs-meta-cell"><strong>Course Code:</strong><span>${course.code || '—'}</span></div>
        <div class="diu-gs-meta-cell"><strong>Section:</strong><span>${course.section || 'A'}</span></div>
        <div class="diu-gs-meta-cell"><strong>Course Title:</strong><span>${course.name || '—'}</span></div>
        <div class="diu-gs-meta-cell"><strong>Credit:</strong><span>3.00</span></div>
        <div class="diu-gs-meta-cell"><strong>Course Teacher:</strong><span>Shad (FacultyMind Demo)</span></div>
        <div class="diu-gs-meta-cell"><strong>Date:</strong><span>${today}</span></div>
      </div>

      <div class="diu-table-wrap">
        <table class="diu-table">
          <thead>
            <tr>
              <th>SL</th>
              <th class="left">Student ID</th>
              <th class="left">Name of the Student</th>
              <th>Class<br>Attendance<br>(out of 7)</th>
              <th>CT-1<br>(out of 15)</th>
              <th>CT-2<br>(out of 15)</th>
              <th>CT-3<br>(out of 15)</th>
              <th>Class Test<br>(out of 15)</th>
              <th>Presentation/<br>Viva-Voce/<br>Proj<br>(out of 8)</th>
              <th>Assignment<br>(out of 5)</th>
              <th>Mid Term<br>Exam<br>(out of 25)</th>
              <th>Final Exam<br>(out of 40)</th>
              <th>Grand<br>Total<br>(out of 100)</th>
              <th>Final<br>Grade</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(s => `
              <tr>
                <td>${s.sl}</td>
                <td class="left">${s.studentId}</td>
                <td class="left">${s.name}</td>
                <td>${s.attendance.toFixed(2)}</td>
                <td>${s.ct1.toFixed(2)}</td>
                <td>${s.ct2.toFixed(2)}</td>
                <td>${s.ct3.toFixed(2)}</td>
                <td>${s.ct.toFixed(2)}</td>
                <td>${s.presentation.toFixed(2)}</td>
                <td>${s.assignment.toFixed(2)}</td>
                <td>${s.midterm.toFixed(2)}</td>
                <td>${s.finalExam.toFixed(2)}</td>
                <td><strong>${s.gt.toFixed(2)}</strong></td>
                <td><span class="diu-grade ${gradeClass(s.grade)}">${s.grade}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="diu-gs-summary">
        <strong>Grade Summary:</strong>
        ${['A+','A','A-','B+','B','B-','C+','C','D','F'].map(g =>
          `<span><strong>${g}:</strong> ${gradeCounts[g]}</span>`
        ).join('  ')}
      </div>
    </div>
  `;
}

// ── Course Registration ────────────────────────────────────────────────
async function renderDiuCourseReg() {
  const el = document.getElementById('diu-sec-course-reg');
  const courses = _diuCourses;

  el.innerHTML = `
    <div class="diu-card">
      <div class="diu-card-header">Add New Course</div>
      <div class="diu-card-body">
        <div class="diu-form-grid">
          <div class="diu-form-group">
            <label>Course Code *</label>
            <input type="text" id="diu-cr-code" placeholder="e.g. ICE301" />
          </div>
          <div class="diu-form-group">
            <label>Section</label>
            <input type="text" id="diu-cr-section" placeholder="e.g. A" value="A" />
          </div>
          <div class="diu-form-group" style="grid-column:1/-1">
            <label>Course Title *</label>
            <input type="text" id="diu-cr-name" placeholder="e.g. Object Oriented Programming" />
          </div>
          <div class="diu-form-group">
            <label>Semester</label>
            <input type="text" id="diu-cr-semester" placeholder="Spring 2026" value="Spring 2026" />
          </div>
          <div class="diu-form-group">
            <label>Year</label>
            <input type="number" id="diu-cr-year" value="${new Date().getFullYear()}" />
          </div>
        </div>
        <button class="diu-btn diu-btn-primary" id="diu-cr-save">Register Course</button>
        <div id="diu-cr-msg" style="margin-top:10px;font-size:13px;font-family:Arial"></div>
      </div>
    </div>

    <div class="diu-card" style="margin-top:16px">
      <div class="diu-card-header">Registered Courses</div>
      <div class="diu-card-body">
        <div class="diu-table-wrap">
          <table class="diu-table">
            <thead>
              <tr>
                <th>SL</th>
                <th class="left">Code</th>
                <th class="left">Title</th>
                <th>Section</th>
                <th>Semester</th>
                <th>Year</th>
              </tr>
            </thead>
            <tbody>
              ${courses.map((c,i) => `
                <tr>
                  <td>${i+1}</td>
                  <td class="left"><strong>${c.code}</strong></td>
                  <td class="left">${c.name}</td>
                  <td>${c.section || 'A'}</td>
                  <td>${c.semester || '—'}</td>
                  <td>${c.year || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('diu-cr-save').addEventListener('click', async () => {
    const code     = document.getElementById('diu-cr-code').value.trim();
    const name     = document.getElementById('diu-cr-name').value.trim();
    const section  = document.getElementById('diu-cr-section').value.trim() || 'A';
    const semester = document.getElementById('diu-cr-semester').value.trim() || 'Spring 2026';
    const year     = parseInt(document.getElementById('diu-cr-year').value) || new Date().getFullYear();
    const msg      = document.getElementById('diu-cr-msg');

    if (!code || !name) { msg.style.color='#dc3545'; msg.textContent='Course Code and Title are required.'; return; }

    const r = await window.api.diu.saveCourse({ code, name, section, semester, year });
    if (r.ok) {
      msg.style.color = '#28a745';
      msg.textContent = `Course ${code.toUpperCase()} registered successfully.`;
      const res = await window.api.diu.courses();
      _diuCourses = res.ok ? res.courses : _diuCourses;
      populateDiuCourseSelector();
      renderDiuCourseReg();
    } else {
      msg.style.color = '#dc3545';
      msg.textContent = 'Error: ' + r.error;
    }
  });
}

// ── Bootstrap ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Nav clicks inside the portal
  document.querySelectorAll('.diu-nav-item[data-sec]').forEach(item => {
    item.addEventListener('click', () => {
      const sec = item.dataset.sec;
      if (item.classList.contains('diu-stub')) {
        diuToast('This section is available on the live DIU portal.', '');
        return;
      }
      showDiuSection(sec);
    });
  });

  // Course selector change
  const sel = document.getElementById('diu-course-sel');
  if (sel) {
    sel.addEventListener('change', () => {
      _diuCourseId = parseInt(sel.value) || null;
      // Re-render current section
      const active = document.querySelector('.diu-nav-item.active');
      if (active) showDiuSection(active.dataset.sec);
    });
  }
});
