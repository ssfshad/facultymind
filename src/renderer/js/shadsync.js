/**
 * shadsync.js — ShadSync Module Renderer Logic
 */

'use strict';

const ShadSyncModule = (() => {

  const viewContent = document.getElementById('shadsync-content');
  const viewLoading = document.getElementById('shadsync-loading');
  const courseSel   = document.getElementById('shadsync-course-sel');

  let listenersBound = false;
  async function init() {
    if (!listenersBound) {
      setupListeners();
      listenersBound = true;
    }
    await loadCourses();
    const active = courseSel.value;
    if(active) {
      await loadAttainment(active);
    }
  }

  function setupListeners() {
    document.getElementById('btn-shadsync-refresh')?.addEventListener('click', () => {
       if(courseSel.value) loadAttainment(courseSel.value);
    });
    courseSel?.addEventListener('change', (e) => loadAttainment(e.target.value));

    // Data Manager Modal
    document.getElementById('btn-shadsync-manage')?.addEventListener('click', () => {
      try {
        const modal = document.getElementById('modal-shadsync-data');
        if (!modal) throw new Error("Modal HTML not found in document");
        modal.classList.remove('hidden');
        renderDataForm();
      } catch (err) {
        alert("Bug detected when clicking Manage Data: " + err.message);
      }
    });
    document.getElementById('btn-ss-cancel')?.addEventListener('click', () => {
      document.getElementById('modal-shadsync-data').classList.add('hidden');
    });
    document.getElementById('ss-data-type')?.addEventListener('change', renderDataForm);
    document.getElementById('btn-ss-save')?.addEventListener('click', handleDataSave);
    
    // BAETE Export
    document.getElementById('btn-shadsync-report')?.addEventListener('click', exportBaete);

    // Marks sheet import
    document.getElementById('btn-shadsync-import')?.addEventListener('click', () => document.getElementById('ss-import-file')?.click());
    document.getElementById('ss-import-file')?.addEventListener('change', onImportFileChosen);
    document.getElementById('btn-ss-import-cancel')?.addEventListener('click', closeImport);
    document.getElementById('btn-ss-import-confirm')?.addEventListener('click', confirmImport);
  }

  async function loadCourses() {
    // We can piggy-back off the schedule system or do a blank check for schedule:get for unique courses
    const res = await window.api.schedule.get();
    if(res.ok) {
       const uniqueCourses = [];
       const seen = new Set();
       const add = (code) => {
         const id = String(code || '').toUpperCase();
         if (id && !seen.has(id)) { seen.add(id); uniqueCourses.push({ id }); }
       };
       res.data.forEach(cls => { if (cls.course_id) add(cls.course_code); });
       try {
         const all = await window.api.diu.courses();
         if (all && all.ok) all.courses.forEach(c => add(c.code));
       } catch (_) {}
       courseSel.innerHTML = uniqueCourses.length 
         ? uniqueCourses.map(c => `<option value="${esc(c.id)}">${esc(c.id)}</option>`).join('')
         : '<option value="">No courses available</option>';
       
       // Force ICE301 if it's there
       if(uniqueCourses.find(c => c.id === 'ICE301')) courseSel.value = 'ICE301';
    }
  }

  async function loadAttainment(courseCode) {
    viewContent.classList.add('hidden');
    viewLoading.classList.remove('hidden');

    const res = await window.api.shadsync.attainment(courseCode);
    
    viewLoading.classList.add('hidden');
    viewContent.classList.remove('hidden');

    if(!res.ok) {
      document.getElementById('shadsync-clo-list').innerHTML = `<div style="color:var(--danger)">Error: ${res.error}</div>`;
      return;
    }

    renderAttainment(res.data);
  }

  function renderAttainment(data) {
    // CLO list with animated progress bars
    const cloHtml = Object.entries(data.clo).map(([code, clo], idx) => {
      const isRed = clo.below_threshold;
      const isAmber = !isRed && (clo.avg < 65);
      let colorClass = 'success';
      if(isRed) colorClass = 'danger';
      else if(isAmber) colorClass = 'warning';
      
      const badge = isRed ? `<span style="background:var(--danger);color:#fff;padding:2px 6px;border-radius:10px;font-size:10px;margin-left:8px">BELOW THRESHOLD</span>` : '';
      
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-light)">
           <div><strong>${code}</strong> ${badge}</div>
           <div style="display:flex;align-items:center;gap:12px;">
             <div style="width:120px;height:6px;background:var(--border-primary,rgba(255,255,255,0.1));border-radius:99px;overflow:hidden;">
               <div class="ss-progress-fill" data-width="${clo.avg}" style="height:100%;width:0;border-radius:99px;background:var(--${colorClass});transition:width 600ms cubic-bezier(0.4,0,0.2,1) ${idx * 80}ms;"></div>
             </div>
             <span style="font-weight:600;color:var(--${colorClass});min-width:44px;text-align:right;font-variant-numeric:tabular-nums;">${clo.avg}%</span>
           </div>
        </div>
      `;
    }).join('');
    document.getElementById('shadsync-clo-list').innerHTML = cloHtml ||
      '<div style="color:var(--text-secondary);font-size:13px">No CLOs for this course. Its marks sheet maps assessments to COs directly; see CO &amp; PO attainment.</div>';

    // Animate progress bars on mount
    requestAnimationFrame(() => {
      document.querySelectorAll('.ss-progress-fill').forEach(bar => {
        bar.style.width = bar.dataset.width + '%';
      });
    });

    // CO List
    const coHtml = Object.entries(data.co).map(([code, co]) => {
      const colorClass = co.below_threshold ? 'danger' : 'success';
      return `<div class="co-po-row">
         <span class="co-label">${code}</span>
         <span class="co-value" style="color:var(--${colorClass})">${co.avg === null ? 'no data' : co.avg + '%'}</span>
      </div>`;
    }).join('');
    document.getElementById('shadsync-co-list').innerHTML = coHtml;

    // PO List
    const poHtml = Object.entries(data.po).map(([code, po]) => {
      const colorClass = po.below_threshold ? 'danger' : 'success';
      return `<div class="co-po-row">
         <span class="co-label">${code}</span>
         <span class="co-value" style="color:var(--${colorClass})">${po.avg === null ? 'no data' : po.avg + '%'}</span>
      </div>`;
    }).join('');
    document.getElementById('shadsync-po-list').innerHTML = poHtml;
    
    // At-Risk
    const riskRow = (code, o) => {
       const topFail = o.students_below.slice(0, 5).map(s => `${esc(s.name)} (${s.pct}%)`).join(', ');
       return `
         <div class="at-risk-row">
            <strong>${esc(code)} (${o.avg}%)</strong> — ${o.below_count} students critically below threshold.
            <span class="at-risk-detail">${topFail}</span>
         </div>
       `;
    };
    const atRiskHtml = [
      ...Object.entries(data.clo).filter(([, clo]) => clo.below_threshold).map(([code, clo]) => riskRow(code, clo)),
      // COs computed straight from a marks sheet carry their own below-threshold lists
      ...Object.entries(data.co).filter(([, co]) => co.below_threshold && co.students_below && co.students_below.length).map(([code, co]) => riskRow(code, co)),
    ].join('') || '<div class="at-risk-empty"><span class="at-risk-check">✓</span> No CLOs broadly failing standard thresholds.</div>';
    
    document.getElementById('shadsync-at-risk').innerHTML = atRiskHtml;
  }

  // ── Data Manager Forms ──────────────────────────────────────────

  function renderDataForm() {
    try {
      const type = document.getElementById('ss-data-type').value;
      const container = document.getElementById('ss-form-container');
      const courseId = courseSel.value || 'ICE301'; // Fallback to current course
    
    let html = '';
    if (type === 'student') html = `
      <div class="form-row"><label>Course ID</label><input type="text" id="ss-cid" value="${courseId}" /></div>
      <div class="form-row"><label>Student ID</label><input type="text" id="ss-s-id" placeholder="e.g. S001" /></div>
      <div class="form-row"><label>Student Name</label><input type="text" id="ss-s-name" placeholder="John Doe" /></div>
      <div class="form-row"><label>Enrollment No</label><input type="text" id="ss-s-en" placeholder="e.g. E001" /></div>
    `;
    else if (type === 'marks') html = `
      <div class="form-row"><label>Course ID</label><input type="text" id="ss-cid" value="${courseId}" /></div>
      <div class="form-row"><label>Student ID (e.g. 1)</label><input type="number" id="ss-m-id" /></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
         <div class="form-row"><label>Q1</label><input type="number" id="ss-m-q1" value="0"/></div>
         <div class="form-row"><label>Q2</label><input type="number" id="ss-m-q2" value="0"/></div>
         <div class="form-row"><label>Midterm</label><input type="number" id="ss-m-mid" value="0"/></div>
         <div class="form-row"><label>Final</label><input type="number" id="ss-m-fin" value="0"/></div>
         <div class="form-row"><label>Assignment</label><input type="number" id="ss-m-ass" value="0"/></div>
         <div class="form-row"><label>Lab</label><input type="number" id="ss-m-lab" value="0"/></div>
      </div>
    `;
    else if (type === 'attendance') html = `
      <div class="form-row"><label>Course ID</label><input type="text" id="ss-cid" value="${courseId}" /></div>
      <div class="form-row"><label>Student ID (e.g. 1)</label><input type="number" id="ss-a-id" /></div>
      <div class="form-row"><label>Date (YYYY-MM-DD)</label><input type="text" id="ss-a-dt" value="${new Date().toISOString().split('T')[0]}" /></div>
      <div class="form-row"><label>Present</label><select id="ss-a-p"><option value="1">Yes</option><option value="0">No</option></select></div>
    `;
    else if (type === 'clo') html = `
      <div class="form-row"><label>Course ID</label><input type="text" id="ss-cid" value="${courseId}" /></div>
      <div class="form-row"><label>CLO Code</label><input type="text" id="ss-c-code" placeholder="CLO1" /></div>
      <div class="form-row"><label>Description</label><textarea id="ss-c-desc" rows="2"></textarea></div>
      <div class="form-row"><label>Bloom's Level</label><select id="ss-c-bl">
        <option value="Remember">Remember</option><option value="Understand">Understand</option>
        <option value="Apply">Apply</option><option value="Analyze">Analyze</option>
        <option value="Evaluate">Evaluate</option><option value="Create">Create</option>
      </select></div>
    `;
    else if (type === 'co') html = `
      <div class="form-row"><label>Course ID</label><input type="text" id="ss-cid" value="${courseId}" /></div>
      <div class="form-row"><label>CO Code</label><input type="text" id="ss-o-code" placeholder="CO1" /></div>
      <div class="form-row"><label>Description</label><textarea id="ss-o-desc" rows="2"></textarea></div>
    `;
    else if (type === 'po') html = `
      <div class="form-row"><label>PO Code</label><input type="text" id="ss-p-code" placeholder="PO1" /></div>
      <div class="form-row"><label>Category</label><input type="text" id="ss-p-cat" placeholder="Engineering Knowledge" /></div>
      <div class="form-row"><label>Description</label><textarea id="ss-p-desc" rows="2"></textarea></div>
    `;
    container.innerHTML = html;
    } catch (e) {
      alert("Error generating form: " + e.message);
    }
  }

  async function handleDataSave() {
    const type = document.getElementById('ss-data-type').value;
    const btn = document.getElementById('btn-ss-save');
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
      let res;
      if (type === 'student') {
        res = await window.api.shadsync.saveStudent({
           courseId: document.getElementById('ss-cid').value,
           studentId: document.getElementById('ss-s-id').value,
           name: document.getElementById('ss-s-name').value,
           enrollmentNo: document.getElementById('ss-s-en').value
        });
      } else if (type === 'marks') {
        res = await window.api.shadsync.saveMarks({
           studentId: parseInt(document.getElementById('ss-m-id').value),
           courseId: document.getElementById('ss-cid').value,
           q1: parseFloat(document.getElementById('ss-m-q1').value),
           q2: parseFloat(document.getElementById('ss-m-q2').value),
           midterm: parseFloat(document.getElementById('ss-m-mid').value),
           final: parseFloat(document.getElementById('ss-m-fin').value),
           assignment: parseFloat(document.getElementById('ss-m-ass').value),
           lab: parseFloat(document.getElementById('ss-m-lab').value),
        });
      } else if (type === 'attendance') {
        res = await window.api.shadsync.saveAttendance({
           studentId: parseInt(document.getElementById('ss-a-id').value),
           courseId: document.getElementById('ss-cid').value,
           date: document.getElementById('ss-a-dt').value,
           present: parseInt(document.getElementById('ss-a-p').value)
        });
      } else if (type === 'clo') {
        res = await window.api.shadsync.saveClo({
           courseId: document.getElementById('ss-cid').value,
           code: document.getElementById('ss-c-code').value,
           description: document.getElementById('ss-c-desc').value,
           bloomLevel: document.getElementById('ss-c-bl').value
        });
      } else if (type === 'co') {
        res = await window.api.shadsync.saveCo({
           courseId: document.getElementById('ss-cid').value,
           code: document.getElementById('ss-o-code').value,
           description: document.getElementById('ss-o-desc').value
        });
      } else if (type === 'po') {
        res = await window.api.shadsync.savePo({
           code: document.getElementById('ss-p-code').value,
           category: document.getElementById('ss-p-cat').value,
           description: document.getElementById('ss-p-desc').value
        });
      }

      if(!res.ok) alert('Error saving data: ' + res.error);
      else {
         document.getElementById('modal-shadsync-data').classList.add('hidden');
         if(courseSel.value) loadAttainment(courseSel.value);
      }
    } catch(e) {
      alert('Error: ' + e.message);
    }
    
    btn.textContent = 'Save Record';
    btn.disabled = false;
  }

  // ── BAETE PDF Export ──────────────────────────────────────────

  async function exportBaete() {
    const btn = document.getElementById('btn-shadsync-report');
    btn.textContent = 'Exporting...';
    btn.disabled = true;
    
    // Grab the rendered html content of the dashboard + report headers
    const dashboardHtml = document.getElementById('shadsync-content').innerHTML;
    // We render it to a string and send it to main.js printToPDF
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; color: #000; padding: 40px; }
          .card { border: 1px solid #ccc; padding: 20px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid; }
          h2, h3, h4 { color: #333; }
          .success { color: green; }
          .warning { color: orange; }
          .danger { color: red; }
          .footer { margin-top: 40px; font-size: 10px; color: #666; text-align: center; border-top: 1px solid #ddd; padding-top: 10px;}
        </style>
      </head>
      <body>
        <div>
           <h2>BAETE Compliance Status Report</h2>
           <p>Course: <strong>${courseSel.value}</strong> | Date Generated: ${new Date().toLocaleDateString()}</p>
        </div>
        <hr style="margin-bottom:30px;" />
        ${dashboardHtml}
        
        <div class="footer">Powered by ShadSync OBE Engine within FacultyMind</div>
      </body>
    `;

    const res = await window.api.shadsync.exportPdf(fullHtml);
    btn.textContent = 'Export BAETE Report';
    btn.disabled = false;
    
    if(res.ok) alert('✅ Exported successfully to: ' + res.path);
    else alert('Error exporting PDF: ' + res.error);
  }

  // ── Marks sheet import ──────────────────────────────────────────
  // Flow: choose file -> dry run (counts + column definitions, no student data) -> confirm -> import.
  // Everything from the sheet is untrusted text: it is only ever inserted with textContent.

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function el(tag, text, style) {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (style) n.style.cssText = style;
    return n;
  }

  let pendingImport = null; // { data: Uint8Array, fileName, code }

  function closeImport() {
    document.getElementById('modal-shadsync-import')?.classList.add('hidden');
    pendingImport = null;
  }

  function showImportMessage(text, isError) {
    const body = document.getElementById('ss-import-body');
    body.replaceChildren(el('p', text, isError ? 'color:var(--danger)' : 'color:var(--text-secondary)'));
    const confirm = document.getElementById('btn-ss-import-confirm');
    confirm.disabled = true;
    confirm.classList.add('hidden'); // messages and results have nothing left to confirm
    document.getElementById('btn-ss-import-cancel').textContent = 'Close';
  }

  async function onImportFileChosen(e) {
    const input = e.target;
    const file = input.files && input.files[0];
    input.value = ''; // allow choosing the same file again
    if (!file) return;
    const modal = document.getElementById('modal-shadsync-import');
    modal.classList.remove('hidden');
    document.getElementById('btn-ss-import-cancel').textContent = 'Cancel';
    if (!/\.(xls|xlsx)$/i.test(file.name)) return showImportMessage('Choose an .xls or .xlsx marks sheet.', true);
    if (file.size > 20 * 1024 * 1024) return showImportMessage('That file is larger than 20 MB.', true);
    showImportMessage('Reading the sheet…');
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      pendingImport = { data, fileName: file.name, code: null };
      const res = await window.api.shadsync.importMarksSheet({ data, fileName: file.name, dryRun: true });
      if (!res.ok) { pendingImport = null; return showImportMessage(res.error || 'Could not read that sheet.', true); }
      renderImportPreview(res.preview);
    } catch (err) {
      pendingImport = null;
      showImportMessage('Could not read that file: ' + err.message, true);
    }
  }

  function renderImportPreview(p) {
    const body = document.getElementById('ss-import-body');
    document.getElementById('btn-ss-import-cancel').textContent = 'Cancel';
    const code = p.course.code;
    const parts = [
      el('h4', `${p.course.name || 'Course'}${code ? ' (' + code + ')' : ''}`, 'margin:0 0 4px'),
      el('div', [p.course.section && 'Section ' + p.course.section, p.course.term, `${p.students} students`, `${p.columns.length} assessment columns`, `${p.totalMax} marks in total`]
        .filter(Boolean).join(' · '), 'color:var(--text-secondary);font-size:13px'),
    ];

    if (!code) {
      const row = el('div', null, 'margin-top:10px');
      row.append(el('label', 'The sheet does not name the course. Course code: ', 'font-size:13px'));
      const input = document.createElement('input');
      input.type = 'text'; input.id = 'ss-import-code'; input.placeholder = 'e.g. ICE415'; input.style.cssText = 'width:140px';
      input.addEventListener('input', () => { document.getElementById('btn-ss-import-confirm').disabled = !input.value.trim(); });
      row.append(input);
      parts.push(row);
    } else {
      parts.push(el('div', p.existing
        ? `${code} already exists with ${p.existing.students} students. Importing replaces its assessment marks; students are matched by student ID, nobody is duplicated.`
        : `A new course ${code} will be created.`,
        'margin-top:10px;font-size:13px'));
    }

    const table = el('table', null, 'width:100%;border-collapse:collapse;margin-top:12px;font-size:13px');
    const head = el('tr');
    ['Column', 'Max', 'CO', 'PO'].forEach(h => head.append(el('th', h, 'text-align:left;padding:4px 8px;border-bottom:1px solid var(--border)')));
    table.append(head);
    p.columns.forEach(c => {
      const tr = el('tr');
      [c.key, String(c.max), c.co.join(', ') || '–', c.po.join(', ') || '–'].forEach(t => tr.append(el('td', t, 'padding:3px 8px;border-bottom:1px solid var(--border-light)')));
      table.append(tr);
    });
    parts.push(table);

    if (p.blanks) parts.push(el('div', `${p.blanks} blank cell${p.blanks === 1 ? '' : 's'} will be kept as "not graded" (not zero).`, 'margin-top:10px;font-size:13px;color:var(--text-secondary)'));
    if (p.warnings && p.warnings.length) {
      const w = el('div', null, 'margin-top:10px;font-size:13px;color:var(--warning)');
      w.append(el('strong', `${p.warnings.length} warning${p.warnings.length > 1 ? 's' : ''}:`));
      p.warnings.slice(0, 5).forEach(t => w.append(el('div', '• ' + t)));
      if (p.warnings.length > 5) w.append(el('div', `…and ${p.warnings.length - 5} more`));
      parts.push(w);
    }
    parts.push(el('div', 'Names and student IDs are encrypted when saved. This preview shows no student data.', 'margin-top:12px;font-size:12px;color:var(--text-secondary)'));

    body.replaceChildren(...parts);
    pendingImport.code = code;
    const confirm = document.getElementById('btn-ss-import-confirm');
    confirm.textContent = 'Import';
    confirm.classList.remove('hidden');
    confirm.disabled = !code; // with no code in the sheet the teacher must type one first
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const confirm = document.getElementById('btn-ss-import-confirm');
    const codeInput = document.getElementById('ss-import-code');
    const courseCode = (codeInput ? codeInput.value : pendingImport.code || '').trim();
    if (!courseCode) return;
    confirm.disabled = true;
    confirm.textContent = 'Importing…';
    const res = await window.api.shadsync.importMarksSheet({ data: pendingImport.data, fileName: pendingImport.fileName, courseCode });
    confirm.textContent = 'Import';
    if (!res.ok) return showImportMessage(res.error || 'The import failed. Nothing was changed.', true);
    const r = res.result;
    pendingImport = null;
    showImportMessage(`Imported ${r.courseCode}: ${r.students.total} students (${r.students.created} new, ${r.students.matched} matched), ${r.columns} columns, ${r.marksWritten} marks.${r.blanks ? ' ' + r.blanks + ' blank cell' + (r.blanks === 1 ? '' : 's') + ' kept as not graded.' : ''}`, false);
    await loadCourses();
    const opt = [...courseSel.options].find(o => o.value.toUpperCase() === String(r.courseCode).toUpperCase());
    if (opt) courseSel.value = opt.value;
    if (courseSel.value) loadAttainment(courseSel.value);
  }

  window.ShadSyncModule = { init, renderDataForm };
  return window.ShadSyncModule;
})();

// Auto-init 
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'shadsync') ShadSyncModule.init();
  });
});
