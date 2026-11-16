/**
 * blooms.js — Bloom's Engine Module Renderer Logic
 * Supports two modes:
 *   1. Lesson Plan Generator — upload PDF/DOCX → generate structured lesson plan
 *   2. CLO Mapper — paste CLOs or upload document → map each CLO to Bloom's level
 */

'use strict';

const BloomsModule = (() => {

  // ── Shared elements ──────────────────────────────────────────────────────
  const uploadArea = document.getElementById('blooms-upload-area');
  const fileInput  = document.getElementById('blooms-file-input');
  const loading    = document.getElementById('blooms-loading');
  const resultArea = document.getElementById('blooms-result');
  const topicTitle = document.getElementById('blooms-topic-title');
  const duration   = document.getElementById('blooms-duration');
  const summary    = document.getElementById('blooms-clo-summary');
  const planList   = document.getElementById('blooms-lesson-plan');

  // ── Mode state ───────────────────────────────────────────────────────────
  let currentMode = 'lesson-plan'; // 'lesson-plan' | 'clo-mapper'

  function init() {
    if (fileInput) fileInput.setAttribute('accept', '.pdf,.docx');
    injectModeToggle();
    setupUploadHandlers();
    setupCloMapperHandlers();
    setupOcrProgressListener();
    setupKbHandlers();
    setupSyllabusHandlers();
    loadKbStats();
    loadKbRecords();
  }

  // ── Mode toggle UI ───────────────────────────────────────────────────────

  function injectModeToggle() {
    // Only inject once
    if (document.getElementById('blooms-mode-toggle')) return;

    const container = uploadArea ? uploadArea.parentElement : null;
    if (!container) return;

    const toggleHtml = `
      <div id="blooms-mode-toggle" class="fm-tab-bar">
        <button id="btn-mode-lesson" class="fm-tab active-mode">📄 Lesson Plan</button>
        <button id="btn-mode-clo"    class="fm-tab">🎯 CLO Mapper</button>
        <button id="btn-mode-kb"     class="fm-tab">📚 Knowledge Base</button>
        <button id="btn-mode-syllabus" class="fm-tab">📋 Syllabus</button>
      </div>

      <!-- CLO Mapper section (hidden by default) -->
      <div id="blooms-clo-section" class="hidden">
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:.5px;">
            Course Code
          </label>
          <input id="blooms-clo-course" type="text" placeholder="e.g. ICE301"
            style="width:100%; margin-top:4px; padding:8px 12px; border-radius:6px;
                   border:1px solid var(--border); background:var(--bg-input);
                   color:var(--text); font-size:13px; box-sizing:border-box;" />
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:12px; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:.5px;">
            CLO Text
          </label>
          <textarea id="blooms-clo-textarea" rows="6"
            placeholder="Paste your CLOs here, or upload a document above...&#10;&#10;Example:&#10;CLO1: Students will be able to recall fundamental networking concepts.&#10;CLO2: Students will be able to design a secure network topology."
            style="width:100%; margin-top:4px; padding:10px 12px; border-radius:6px;
                   border:1px solid var(--border); background:var(--bg-input);
                   color:var(--text); font-size:13px; resize:vertical; box-sizing:border-box;
                   font-family:inherit;"></textarea>
        </div>
        <button id="btn-analyze-clos"
          style="width:100%; padding:10px; border-radius:8px; border:none;
                 background:var(--text-active); color:#fff; font-size:14px;
                 font-weight:600; cursor:pointer;">
          🔍 Analyze CLOs
        </button>
        <div id="blooms-clo-result" class="hidden" style="margin-top:20px;"></div>
      </div>

      <!-- Knowledge Base section (hidden by default) -->
      <div id="blooms-kb-section" class="hidden">
        <div id="kb-stats-bar" style="display:flex; gap:12px; margin-bottom:16px; padding:12px 16px;
             background:var(--bg-input); border-radius:8px; font-size:13px; color:var(--text-dim);">
          <span id="kb-stat-total">0 records</span>
          <span>·</span>
          <span id="kb-stat-verified">0 verified</span>
          <span>·</span>
          <span id="kb-stat-courses">0 courses</span>
        </div>

        <!-- Import section -->
        <div id="kb-import-section" style="background:var(--bg-card); border:1px solid var(--border); border-radius:8px; padding:16px;">
          <h4 style="margin:0 0 12px 0; font-size:14px;">Import Exam Questions</h4>
          <input type="text" id="kb-course-input" placeholder="Course code (e.g. EEE1245)"
            style="width:100%; padding:8px 12px; border-radius:6px; border:1px solid var(--border);
                   background:var(--bg-input); color:var(--text); font-size:13px;
                   box-sizing:border-box; margin-bottom:10px;" />
          <div style="text-align:center; padding: 20px 0;">
            <button id="btn-kb-select" class="btn-secondary" onclick="document.getElementById('kb-file-input').click()">📸 Select Exam Question Images</button>
            <p style="margin-top:12px; font-size:12px; color:var(--text-dim);">Or drag and drop anywhere on screen</p>
            <input type="file" id="kb-file-input" accept=".png,.jpg,.jpeg,.webp" multiple
              style="display:none" />
          </div>
          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <button id="btn-kb-import" class="btn-primary" style="flex:1;">🔍 Parse &amp; Import Selected</button>
            <button id="btn-kb-scan-folder" class="btn-ghost" style="flex:1;">📁 Scan Folder</button>
          </div>
          <p style="font-size:12px; color:var(--text-dim); margin:0 0 10px 0;">
            💡 <strong>Scan Folder:</strong> Put all your exam question images in one folder, click Scan Folder, and FacultyMind will process them all at once.
          </p>          <div id="kb-import-progress" class="hidden"
            style="margin-top:10px; font-size:13px; color:var(--text-dim);"></div>
        </div>

        <!-- Review section (shown after import) -->
        <div id="kb-review-section" class="hidden" style="margin-top:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h4 style="margin:0; font-size:14px;">Review Parsed Questions</h4>
            <button id="btn-kb-accept-all" class="btn-primary small">✓ Accept All</button>
          </div>
          <div id="kb-review-list"></div>
          <button id="btn-kb-save-accepted" class="btn-primary"
            style="width:100%; margin-top:12px;">💾 Save Accepted to Knowledge Base</button>
        </div>

        <!-- Existing knowledge base -->
        <div id="kb-existing-section" style="margin-top:24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
            <h4 style="margin:0; font-size:14px;">Knowledge Base</h4>
            <div style="display:flex; gap:8px; align-items:center;">
              <button id="btn-kb-verify-all" class="btn-primary small">✓ Verify All</button>
              <button id="btn-kb-delete-all" class="btn-ghost small" style="color:var(--danger);">🗑 Clear All</button>
              <select id="kb-filter-course"
                style="padding:4px 8px; border-radius:4px; border:1px solid var(--border);
                       background:var(--bg-input); color:var(--text); font-size:12px;">
                <option value="">All courses</option>
              </select>
            </div>
          </div>
          <div id="kb-records-list"></div>
        </div>

      </div>

      <!-- Syllabus Mapper section (hidden by default) -->
      <div id="blooms-syllabus-section" class="hidden">
        <p style="font-size:13px; color:var(--text-dim); margin:0 0 12px 0;">
          Upload your <strong>Course Profile</strong> document (DOCX or PDF). The engine extracts your Course Outcomes and weekly topics, then flags any alignment gaps automatically.
        </p>
        <div style="text-align:center; padding: 20px 0; margin-bottom:10px;">
          <button class="btn-secondary" onclick="document.getElementById('syllabus-file-input').click()">📄 Select Course Profile (DOCX or PDF)</button>
          <p style="margin-top:12px; font-size:12px; color:var(--text-dim);">Or drag and drop anywhere on screen</p>
          <input type="file" id="syllabus-file-input" accept=".pdf,.docx" style="display:none" />
        </div>
        <div style="text-align:center; margin-bottom:10px;">
          <button id="btn-syllabus-manual-toggle" class="btn-ghost small" style="font-size:12px;">
            ✏️ Or paste CO and weekly text manually
          </button>
        </div>
        <div id="syllabus-manual-section" class="hidden" style="margin-bottom:12px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase;">Course Outcomes</label>
              <textarea id="syllabus-cos-input" rows="6" placeholder="CO1: Demonstrate the ability to...
CO2: Apply circuit analysis techniques to...
CO3: Design and analyze AC/DC circuits..."
                style="width:100%; margin-top:4px; padding:8px 12px; border-radius:6px;
                       border:1px solid var(--border); background:var(--bg-input);
                       color:var(--text); font-size:12px; resize:vertical;
                       box-sizing:border-box; font-family:inherit;"></textarea>
            </div>
            <div>
              <label style="font-size:11px; font-weight:600; color:var(--text-dim); text-transform:uppercase;">Weekly Topics (one per line)</label>
              <textarea id="syllabus-weeks-input" rows="6" placeholder="Week 1: Introduction to circuits, Ohm's law
Week 2: Nodal analysis, mesh analysis
Week 3: Thevenin's theorem, Norton's theorem
..."
                style="width:100%; margin-top:4px; padding:8px 12px; border-radius:6px;
                       border:1px solid var(--border); background:var(--bg-input);
                       color:var(--text); font-size:12px; resize:vertical;
                       box-sizing:border-box; font-family:inherit;"></textarea>
            </div>
          </div>
          <button id="btn-syllabus-analyze-manual" class="btn-primary"
            style="width:100%; margin-top:10px; padding:8px;">
            🔍 Analyze Manual Input
          </button>
        </div>
        <div id="syllabus-progress" class="hidden"
          style="padding:10px 14px; background:var(--bg-input); border-radius:8px;
                 font-size:13px; color:var(--text-dim); border-left:3px solid var(--text-active);
                 margin-bottom:12px;"></div>
        <div id="syllabus-result" class="hidden"></div>
      </div>`;

    uploadArea.insertAdjacentHTML('beforebegin', toggleHtml);

    // Wire mode buttons
    document.getElementById('btn-mode-lesson').addEventListener('click', () => switchMode('lesson-plan'));
    document.getElementById('btn-mode-clo').addEventListener('click', () => switchMode('clo-mapper'));
    document.getElementById('btn-mode-kb').addEventListener('click', () => switchMode('kb'));
    document.getElementById('btn-mode-syllabus').addEventListener('click', () => switchMode('syllabus'));
  }

  function switchMode(mode) {
    currentMode = mode;
    const lessonBtn      = document.getElementById('btn-mode-lesson');
    const cloBtn         = document.getElementById('btn-mode-clo');
    const kbBtn          = document.getElementById('btn-mode-kb');
    const syllabusBtn    = document.getElementById('btn-mode-syllabus');
    const cloSection     = document.getElementById('blooms-clo-section');
    const kbSection      = document.getElementById('blooms-kb-section');
    const syllabusSection = document.getElementById('blooms-syllabus-section');

    // Reset all tab buttons
    [lessonBtn, cloBtn, kbBtn, syllabusBtn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (mode === 'lesson-plan') {
      if (lessonBtn)      lessonBtn.classList.add('active');
      if (uploadArea)     uploadArea.classList.remove('hidden');
      if (cloSection)     cloSection.classList.add('hidden');
      if (kbSection)      kbSection.classList.add('hidden');
      if (syllabusSection) syllabusSection.classList.add('hidden');
    } else if (mode === 'clo-mapper') {
      if (cloBtn)         cloBtn.classList.add('active');
      if (uploadArea)     uploadArea.classList.remove('hidden');
      if (cloSection)     cloSection.classList.remove('hidden');
      if (kbSection)      kbSection.classList.add('hidden');
      if (syllabusSection) syllabusSection.classList.add('hidden');
      if (resultArea)     resultArea.classList.add('hidden');
    } else if (mode === 'kb') {
      if (kbBtn)          kbBtn.classList.add('active');
      if (uploadArea)     uploadArea.classList.add('hidden');
      if (cloSection)     cloSection.classList.add('hidden');
      if (kbSection)      kbSection.classList.remove('hidden');
      if (syllabusSection) syllabusSection.classList.add('hidden');
      if (resultArea)     resultArea.classList.add('hidden');
      loadKbStats();
      loadKbRecords();
    } else if (mode === 'syllabus') {
      if (syllabusBtn)    syllabusBtn.classList.add('active');
      if (uploadArea)     uploadArea.classList.add('hidden');
      if (cloSection)     cloSection.classList.add('hidden');
      if (kbSection)      kbSection.classList.add('hidden');
      if (syllabusSection) syllabusSection.classList.remove('hidden');
      if (resultArea)     resultArea.classList.add('hidden');
    }
  }
  // ── File type helper ─────────────────────────────────────────────────────

  function getMimeType(file) {
    if (file.name.endsWith('.pdf'))  return 'application/pdf';
    if (file.name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (file.name.endsWith('.png'))  return 'image/png';
    if (file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')) return 'image/jpeg';
    if (file.name.endsWith('.webp')) return 'image/webp';
    if (file.name.endsWith('.bmp'))  return 'image/bmp';
    if (file.name.endsWith('.tiff') || file.name.endsWith('.tif')) return 'image/tiff';
    return file.type || 'application/octet-stream';
  }

  // ── Upload handlers ──────────────────────────────────────────────────────

  function setupUploadHandlers() {
    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });
  }

  async function handleFile(file) {
    const mimeType = getMimeType(file);
    const supported = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/bmp', 'image/tiff'];

    if (!supported.includes(mimeType)) {
      alert('Please upload a PDF, DOCX, or image file (PNG, JPG, WEBP, BMP).');
      return;
    }

    const buffer = await file.arrayBuffer();

    if (currentMode === 'clo-mapper') {
      // In CLO mapper mode: extract text via IPC and populate the textarea
      const cloSection = document.getElementById('blooms-clo-section');
      if (cloSection) cloSection.classList.remove('hidden');

      const textarea = document.getElementById('blooms-clo-textarea');
      if (textarea) textarea.value = 'Extracting text from document…';

      try {
        // Use mapCLOs with buffer to extract + analyze in one shot
        const courseCode = (document.getElementById('blooms-clo-course') || {}).value || 'ICE301';
        await runCloAnalysis(null, buffer, mimeType, courseCode);
      } catch (e) {
        if (textarea) textarea.value = '';
        alert('Failed to process document: ' + e.message);
      }
      return;
    }

    // Lesson plan mode
    uploadArea.classList.add('hidden');
    resultArea.classList.add('hidden');
    loading.classList.remove('hidden');

    try {
      const res = await window.api.blooms.generate(buffer, 'ICE301', mimeType);
      if (!res.ok) throw new Error(res.error);
      renderPlan(res.plan);
      // Desktop notification — lesson plan ready
      if (window.api && window.api.notify) {
        window.api.notify.send('📄 Lesson Plan Ready', "Bloom's analysis complete — your lesson plan is ready", true);
      }
    } catch (e) {
      alert('Error generating lesson plan: ' + e.message);
      uploadArea.classList.remove('hidden');
    } finally {
      // Reset loading text back to default in case OCR updated it
      const loadingText = document.getElementById('blooms-loading-text');
      if (loadingText) loadingText.textContent = 'AI Thinking...';
      loading.classList.add('hidden');
    }
  }

  // ── CLO Mapper handlers ──────────────────────────────────────────────────

  function setupCloMapperHandlers() {
    // Button wired after DOM injection — use event delegation on document
    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'btn-analyze-clos') {
        const courseCode = (document.getElementById('blooms-clo-course') || {}).value || 'ICE301';
        const cloText    = (document.getElementById('blooms-clo-textarea') || {}).value || '';
        await runCloAnalysis(cloText, null, null, courseCode);
      }
    });
  }

  async function runCloAnalysis(text, buffer, mimeType, courseCode) {
    const resultDiv  = document.getElementById('blooms-clo-result');
    const analyzeBtn = document.getElementById('btn-analyze-clos');
    const progressEl = document.getElementById('kb-import-progress') || (() => {
      // Create a progress element inside the CLO section if it doesn't exist
      const el = document.createElement('div');
      el.id = 'clo-analysis-progress';
      el.style.cssText = 'margin-top:10px; font-size:13px; color:var(--text-dim); padding:8px 12px; background:var(--bg-input); border-radius:6px;';
      const cloSection = document.getElementById('blooms-clo-section');
      if (cloSection) cloSection.insertBefore(el, document.getElementById('blooms-clo-result'));
      return el;
    })();

    // Use a dedicated progress div inside the CLO section
    let cloProgressEl = document.getElementById('clo-analysis-progress');
    if (!cloProgressEl) {
      cloProgressEl = document.createElement('div');
      cloProgressEl.id = 'clo-analysis-progress';
      cloProgressEl.style.cssText = 'margin-top:10px; font-size:13px; color:var(--text-dim); padding:10px 14px; background:var(--bg-input); border-radius:8px; border-left:3px solid var(--text-active);';
      const cloSection = document.getElementById('blooms-clo-section');
      const resultDiv2 = document.getElementById('blooms-clo-result');
      if (cloSection && resultDiv2) cloSection.insertBefore(cloProgressEl, resultDiv2);
    }

    const setProgress = (msg, icon = '⏳') => {
      if (cloProgressEl) {
        cloProgressEl.style.display = '';
        cloProgressEl.innerHTML = `${icon} ${msg}`;
      }
    };

    if (!text && !buffer) {
      alert('Please paste CLO text or upload a document first.');
      return;
    }

    if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing…'; }
    if (resultDiv)  resultDiv.classList.add('hidden');
    setProgress('Starting analysis…');

    // Listen for step-by-step progress from the engine
    const stepLabels = {
      ocr:        '🔍 Extracting text from document…',
      ocr_done:   '✅ Text extracted',
      kb:         '📚 Searching knowledge base for similar examples…',
      kb_done:    null, // use detail directly
      pass1:      '🤖 Pass 1: Mapping CLOs to Bloom\'s levels…',
      pass1_done: null,
      pass2:      '🔎 Pass 2: Expert review checking for errors…',
      pass2_done: null,
      pass3:      '✏️ Pass 3: Applying corrections…',
      pass3_done: null,
      done:       '✅ Analysis complete',
    };

    let progressListener = null;
    if (window.api && window.api.blooms && window.api.blooms.onCloProgress) {
      progressListener = window.api.blooms.onCloProgress((data) => {
        const label = stepLabels[data.step];
        const msg = label !== null ? (label || data.detail) : data.detail;
        if (msg) setProgress(msg, data.step.endsWith('_done') ? '✅' : '⏳');
      });
    }

    try {
      const res = await window.api.blooms.mapCLOs(text || '', buffer, mimeType, courseCode);
      if (!res.ok) throw new Error(res.error);
      renderCloMappingResult(res.result, resultDiv);
      if (cloProgressEl) cloProgressEl.style.display = 'none';
      // Desktop notification — CLO mapping complete
      if (window.api && window.api.notify) {
        window.api.notify.send(
          '🎯 CLO Mapping Complete',
          `Analysis for ${courseCode || 'your course'} is ready to review`,
          true
        );
      }
    } catch (e) {
      setProgress(`❌ ${e.message}`, '');
      alert('CLO analysis failed: ' + e.message);
    } finally {
      if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = '🔍 Analyze CLOs'; }
    }
  }

  // ── CLO mapping result renderer ──────────────────────────────────────────

  // Per-render edit state: { [clo_code]: { bloom_level, suggested_verbs[] } }
  let cloEditState = {};
  // Snapshot of the most recent result so export buttons can build output
  // from the latest data the professor sees, including edits.
  let cloLastResult = null;
  let cloLastCourseCode = '';

  function renderCloMappingResult(result, container) {
    if (!container) return;

    // Reset edit state on every new render
    cloEditState = {};
    cloLastResult = result;

    const mappings = result.clo_mappings || [];
    const dist     = result.level_distribution || {};
    const recs     = result.recommendations || [];
    const verified = !!result.verified;
    const reviewQuality = result.review_quality || 'high';
    const improvements = result.improvements_applied || [];

    cloLastCourseCode = (document.getElementById('blooms-clo-course') || {}).value || result.course_code || 'ICE301';

    // Seed edit state from the AI output so unedited rows still serialise
    mappings.forEach(m => {
      cloEditState[m.clo_code] = {
        bloom_level:     m.bloom_level,
        bloom_name:      m.bloom_name,
        suggested_verbs: (m.suggested_verbs || []).slice(),
      };
    });

    const bloomNameMap = {
      C1: 'Remember', C2: 'Understand', C3: 'Apply',
      C4: 'Analyze',  C5: 'Evaluate',   C6: 'Create',
    };

    const rows = mappings.map(m => {
      const verbs      = (m.detected_verbs || []).join(', ') || '—';
      const suggested  = (m.suggested_verbs || []).join(', ') || '—';
      const safeCode   = escapeHtml(m.clo_code);
      const alignRow   = m.alignment_issue
        ? `<tr style="background:#FFF3CD;">
             <td colspan="5" style="padding:6px 10px; font-size:12px; color:#856404;">
               ⚠️ <strong>Alignment issue:</strong> ${escapeHtml(m.alignment_note || 'Verb may not match cognitive demand.')}
             </td>
           </tr>`
        : '';

      const levelOptions = ['C1','C2','C3','C4','C5','C6'].map(lvl =>
        `<option value="${lvl}" ${lvl === m.bloom_level ? 'selected' : ''}>${lvl} ${bloomNameMap[lvl]}</option>`
      ).join('');

      // Show multi-level display if available (e.g. "C1, C5")
      const levelDisplay = m.bloom_levels_display || m.bloom_level || '—';
      const isRejected = !m.bloom_level || m.confidence === 'rejected';
      const levelBadge = isRejected
        ? `<span style="padding:3px 8px; border-radius:8px; background:#EF4444; color:#fff; font-size:11px; font-weight:700;" title="${escapeHtml(m.alignment_note || 'Rejected')}">REJECTED</span>`
        : m.bloom_levels && m.bloom_levels.length > 1
          ? `<span style="padding:3px 8px; border-radius:8px; background:${getBloomColor(m.bloom_level)}; color:#fff; font-size:11px; font-weight:700; cursor:default;" title="Multiple cognitive levels detected">${escapeHtml(levelDisplay)}</span>`
          : `<select class="clo-bloom-select" data-clo-code="${safeCode}"
              style="padding:3px 6px; border-radius:8px; border:1px solid var(--border);
                     background:${getBloomColor(m.bloom_level)}; color:#fff; font-size:11px;
                     font-weight:700; cursor:pointer;">
              ${levelOptions}
            </select>`;

      return `
        <tr style="border-bottom:1px solid var(--border);" data-clo-code="${safeCode}">
          <td style="padding:8px 10px; font-weight:600; font-size:13px; white-space:nowrap;">${safeCode}</td>
          <td style="padding:8px 10px; font-size:12px; color:var(--text-dim); max-width:220px;">${escapeHtml(m.clo_text || '')}</td>
          <td style="padding:8px 10px; text-align:center;">
            ${levelBadge}
          </td>
          <td style="padding:8px 10px; font-size:12px; color:var(--text-dim);">${escapeHtml(verbs)}</td>
          <td style="padding:8px 10px; font-size:12px; color:#0D9488;">
            <span class="clo-suggested-edit" data-clo-code="${safeCode}"
              contenteditable="true" spellcheck="false"
              style="display:inline-block; min-width:120px; padding:2px 6px;
                     border:1px dashed transparent; border-radius:4px;"
              title="Click to edit (comma-separated)">${escapeHtml(suggested)}</span>
          </td>
        </tr>
        ${alignRow}`;
    }).join('');

    // Distribution bar
    const distItems = ['C1','C2','C3','C4','C5','C6'].map(level => {
      const count = dist[level] || 0;
      if (!count) return '';
      return `<span class="clo-dist-chip" data-level="${level}" style="padding:3px 10px; border-radius:12px; background:${getBloomColor(level)}; color:#fff; font-size:12px; font-weight:600; margin-right:6px;">${level}: ${count}</span>`;
    }).join('');

    // Recommendations
    const recHtml = recs.length
      ? `<div style="margin-top:16px; padding:12px; background:var(--bg-input); border-radius:8px;">
           <strong style="font-size:12px; text-transform:uppercase; color:var(--text-dim);">Recommendations</strong>
           <ul style="margin:8px 0 0 0; padding-left:18px; font-size:13px; color:var(--text);">
             ${recs.map(r => `<li style="margin-bottom:4px;">${escapeHtml(r)}</li>`).join('')}
           </ul>
         </div>`
      : '';

    // Verified badge — three states per plan:
    //   verified + corrections   → green "AI Self-Review applied N corrections"
    //   verified + no corrections → green "Verified — no corrections needed"
    //   unverified               → amber "Unverified output"
    let verifiedBadge = '';
    if (verified && improvements.length > 0) {
      verifiedBadge = `<span style="padding:3px 10px; border-radius:12px; background:#10B981; color:#fff; font-size:12px; font-weight:700;">✓ AI Self-Review applied ${improvements.length} correction${improvements.length === 1 ? '' : 's'}</span>
         <span style="padding:3px 10px; border-radius:12px; background:var(--bg-input); color:var(--text-dim); font-size:11px; margin-left:6px; text-transform:uppercase;">Quality: ${reviewQuality}</span>`;
    } else if (verified) {
      verifiedBadge = `<span style="padding:3px 10px; border-radius:12px; background:#10B981; color:#fff; font-size:12px; font-weight:700;">✓ Verified — no corrections needed</span>
         <span style="padding:3px 10px; border-radius:12px; background:var(--bg-input); color:var(--text-dim); font-size:11px; margin-left:6px; text-transform:uppercase;">Quality: ${reviewQuality}</span>`;
    } else {
      verifiedBadge = `<span style="padding:3px 10px; border-radius:12px; background:#F59E0B; color:#fff; font-size:12px; font-weight:700;">⚠ Unverified output</span>`;
    }

    const improvementsHtml = improvements.length
      ? `<details style="margin-top:10px; padding:10px 12px; background:#EEF2FF; border:1px solid #C7D2FE; border-radius:8px;">
           <summary style="cursor:pointer; font-size:13px; color:#3730A3; font-weight:600;">
             🔍 What the AI improved (${improvements.length})
           </summary>
           <ul style="margin:8px 0 0 0; padding-left:18px; font-size:12px; color:#312E81;">
             ${improvements.map(c => {
               const code = c.clo_code || '';
               const field = c.field || '';
               const orig = c.original !== undefined && c.original !== null ? String(c.original) : '';
               const corr = c.corrected !== undefined && c.corrected !== null ? String(c.corrected) : '';
               const hasArrow = orig || corr;
               const arrowPart = hasArrow
                 ? ` "${escapeHtml(orig)}" → "${escapeHtml(corr)}"`
                 : '';
               const reason = c.reason ? ` <em>(${escapeHtml(c.reason)})</em>` : '';
               return `<li style="margin-bottom:4px;"><strong>${escapeHtml(code)} ${escapeHtml(field)}:</strong>${arrowPart}${reason}</li>`;
             }).join('')}
           </ul>
         </details>`
      : '';

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
        <h3 style="margin:0; font-size:15px;">CLO → Bloom's Mapping for ${escapeHtml(cloLastCourseCode)}</h3>
        ${verifiedBadge}
      </div>
      ${improvementsHtml}
      <div style="overflow-x:auto; margin-top:14px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:var(--bg-input); text-align:left;">
              <th style="padding:8px 10px; font-size:11px; text-transform:uppercase; color:var(--text-dim);">CLO</th>
              <th style="padding:8px 10px; font-size:11px; text-transform:uppercase; color:var(--text-dim);">Statement</th>
              <th style="padding:8px 10px; font-size:11px; text-transform:uppercase; color:var(--text-dim); text-align:center;">Bloom's Level</th>
              <th style="padding:8px 10px; font-size:11px; text-transform:uppercase; color:var(--text-dim);">Detected Verbs</th>
              <th style="padding:8px 10px; font-size:11px; text-transform:uppercase; color:var(--text-dim);">Suggested Verbs</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:14px;">
        <strong style="font-size:12px; text-transform:uppercase; color:var(--text-dim);">Level Distribution: </strong>
        ${distItems || '<span style="font-size:12px; color:var(--text-dim);">No data</span>'}
      </div>
      ${recHtml}
      <div style="display:flex; gap:10px; margin-top:20px;">
        <button id="btn-clo-copy-md" class="btn-ghost small">📋 Copy as Markdown</button>
        <button id="btn-clo-export-pdf" class="btn-primary small">📄 Export as PDF</button>
        <button id="btn-clo-shadow-edit" class="btn-ghost small" style="margin-left:auto;">📝 Shadow Edit</button>
      </div>`;

    container.classList.remove('hidden');

    wireCloEditHandlers(container);
    wireCloExportHandlers(container);
  }

  // ── Inline edit wiring ───────────────────────────────────────────────────

  function wireCloEditHandlers(container) {
    // Bloom's level dropdown — update state + recolor + recompute distribution
    container.querySelectorAll('.clo-bloom-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const code = e.target.dataset.cloCode;
        const newLvl = e.target.value;
        const bloomNames = {
          C1: 'Remember', C2: 'Understand', C3: 'Apply',
          C4: 'Analyze',  C5: 'Evaluate',   C6: 'Create',
        };
        if (!cloEditState[code]) cloEditState[code] = {};
        cloEditState[code].bloom_level = newLvl;
        cloEditState[code].bloom_name  = bloomNames[newLvl];
        e.target.style.background = getBloomColor(newLvl);
        recomputeDistributionChips(container);
      });
    });

    // Suggested verbs — debounce on blur, store comma-split values
    container.querySelectorAll('.clo-suggested-edit').forEach(span => {
      span.addEventListener('focus', () => {
        span.style.borderColor = 'var(--text-active)';
      });
      span.addEventListener('blur', (e) => {
        const code = e.target.dataset.cloCode;
        const raw  = (e.target.textContent || '').trim();
        const list = raw.split(',').map(v => v.trim()).filter(Boolean);
        if (!cloEditState[code]) cloEditState[code] = {};
        cloEditState[code].suggested_verbs = list;
        span.style.borderColor = 'transparent';
      });
    });
  }

  function recomputeDistributionChips(container) {
    const dist = { C1:0, C2:0, C3:0, C4:0, C5:0, C6:0 };
    Object.values(cloEditState).forEach(s => {
      if (s.bloom_level && dist.hasOwnProperty(s.bloom_level)) dist[s.bloom_level]++;
    });
    container.querySelectorAll('.clo-dist-chip').forEach(chip => {
      const lvl = chip.dataset.level;
      if (dist[lvl] > 0) {
        chip.textContent = `${lvl}: ${dist[lvl]}`;
        chip.style.display = '';
      } else {
        chip.style.display = 'none';
      }
    });
  }

  // ── Export handlers ──────────────────────────────────────────────────────

  function wireCloExportHandlers(container) {
    const copyBtn   = container.querySelector('#btn-clo-copy-md');
    const pdfBtn    = container.querySelector('#btn-clo-export-pdf');
    const shadowBtn = container.querySelector('#btn-clo-shadow-edit');

    if (shadowBtn) {
      shadowBtn.addEventListener('click', () => {
        const mappings = getCurrentCloMappings();
        renderShadowEditor(container, mappings);
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          const md = buildCloMarkdown();
          await navigator.clipboard.writeText(md);
          const orig = copyBtn.textContent;
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyBtn.textContent = orig; }, 1500);
        } catch (e) {
          alert('Could not copy to clipboard: ' + e.message);
        }
      });
    }

    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        try {
          pdfBtn.disabled = true;
          const orig = pdfBtn.textContent;
          pdfBtn.textContent = 'Saving…';
          const html = buildCloHtml();
          const res = await window.api.blooms.exportPdf(html);
          if (!res || !res.ok) throw new Error((res && res.error) || 'Export failed');
          pdfBtn.textContent = '✓ Saved to Desktop';
          setTimeout(() => { pdfBtn.textContent = orig; pdfBtn.disabled = false; }, 2000);
        } catch (e) {
          alert('PDF export failed: ' + e.message);
          pdfBtn.disabled = false;
          pdfBtn.textContent = '📄 Export as PDF';
        }
      });
    }
  }

  // Pull the current state of every row, applying any in-memory edits on top
  // of the original AI mapping.
  function getCurrentCloMappings() {
    if (!cloLastResult) return [];
    return (cloLastResult.clo_mappings || []).map(m => {
      const edits = cloEditState[m.clo_code] || {};
      return {
        clo_code:           m.clo_code,
        clo_text:           m.clo_text || '',
        bloom_level:        edits.bloom_level     || m.bloom_level,
        bloom_name:         edits.bloom_name      || m.bloom_name,
        bloom_levels:       m.bloom_levels        || [m.bloom_level],
        bloom_levels_display: m.bloom_levels_display || m.bloom_level,
        detected_verbs:     m.detected_verbs      || [],
        suggested_verbs:    edits.suggested_verbs || m.suggested_verbs || [],
        alignment_issue:    !!m.alignment_issue,
        alignment_note:     m.alignment_note || '',
      };
    });
  }

  function buildCloMarkdown() {
    const mappings = getCurrentCloMappings();
    const date = new Date().toLocaleDateString();
    const improvementsCount = (cloLastResult && cloLastResult.improvements_applied)
      ? cloLastResult.improvements_applied.length : 0;

    const header = `# CLO → Bloom's Mapping for ${cloLastCourseCode}\nGenerated: ${date} by FacultyMind ShadSync OBE Engine\n`;
    const tableHeader = `| CLO | Bloom's Level | Action Verbs | Statement |\n|------|---------------|--------------|-----------|`;
    const rows = mappings.map(m => {
      const verbs = (m.suggested_verbs || []).join(', ');
      const text  = (m.clo_text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const levelStr = m.bloom_levels_display
        || (m.bloom_level ? `${m.bloom_level} ${m.bloom_name || ''}`.trim() : 'REJECTED');
      return `| ${m.clo_code} | ${levelStr} | ${verbs} | ${text} |`;
    }).join('\n');

    const review = improvementsCount > 0
      ? `\n\n**AI Self-Review:** ${improvementsCount} correction${improvementsCount === 1 ? '' : 's'} applied`
      : `\n\n**AI Self-Review:** No corrections needed`;

    return `${header}\n${tableHeader}\n${rows}${review}\n`;
  }

  function buildCloHtml() {
    const mappings = getCurrentCloMappings();
    const date = new Date().toLocaleDateString();
    const improvementsCount = (cloLastResult && cloLastResult.improvements_applied)
      ? cloLastResult.improvements_applied.length : 0;

    const rows = mappings.map(m => {
      const color = getBloomColor(m.bloom_level);
      const verbs = (m.suggested_verbs || []).join(', ');
      const text  = m.clo_text || '';
      return `<tr>
        <td style="padding:8px 10px; font-weight:600; border-bottom:1px solid #e5e7eb;">${escapeHtml(m.clo_code)}</td>
        <td style="padding:8px 10px; border-bottom:1px solid #e5e7eb;">${escapeHtml(text)}</td>
        <td style="padding:8px 10px; text-align:center; border-bottom:1px solid #e5e7eb;">
          <span style="padding:3px 10px; border-radius:12px; background:${color}; color:#fff; font-size:11px; font-weight:700;">${escapeHtml(m.bloom_level)} ${escapeHtml(m.bloom_name)}</span>
        </td>
        <td style="padding:8px 10px; color:#0D9488; border-bottom:1px solid #e5e7eb;">${escapeHtml(verbs)}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CLO Mapping ${escapeHtml(cloLastCourseCode)}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1F2937; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #6B7280; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead tr { background: #F3F4F6; text-align: left; }
        thead th { padding: 8px 10px; font-size: 11px; text-transform: uppercase; color: #4B5563; }
        .footer { margin-top: 24px; font-size: 11px; color: #6B7280; }
      </style></head><body>
      <h1>CLO → Bloom's Mapping for ${escapeHtml(cloLastCourseCode)}</h1>
      <div class="meta">Generated ${escapeHtml(date)} by FacultyMind ShadSync OBE Engine</div>
      <table>
        <thead><tr>
          <th>CLO</th><th>Statement</th><th style="text-align:center;">Bloom's Level</th><th>Suggested Verbs</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">AI Self-Review: ${improvementsCount} correction${improvementsCount === 1 ? '' : 's'} applied</div>
    </body></html>`;
  }

  // ── Lesson plan renderer ─────────────────────────────────────────────────

  function renderPlan(plan) {
    topicTitle.innerText = plan.course_topic || 'Generated Lesson Plan';
    duration.innerText = plan.estimated_duration_minutes ? `${plan.estimated_duration_minutes} minutes` : '1 Hour';

    // Summary
    const s = plan.clo_coverage_summary || {};
    summary.innerHTML = Object.entries(s).map(([c, val]) => `${c}: ${val}`).join(' | ');
    summary.innerHTML += ` &nbsp; <button id="btn-blooms-save-shadsync" class="btn-ghost small" style="margin-left:12px;">Save Outcomes to ShadSync</button>`;

    // Plan Items
    const html = (plan.lesson_plan || []).map(item => {
      const bColor  = getBloomColor(item.bloom_level);
      const quizzes = (item.quiz_questions || []).map(q => `<li>${q}</li>`).join('');

      return `
      <div style="border:1px solid var(--border); border-radius:8px; padding:15px; background:#fff">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px">
          <h4 style="margin:0; font-size:15px">${item.topic}</h4>
          <div style="display:flex; gap:8px">
            <span style="font-size:11px; padding:3px 8px; border-radius:12px; background:${bColor}; color:#fff">${item.bloom_level} ${item.bloom_name}</span>
            <span style="font-size:11px; padding:3px 8px; border-radius:12px; background:#E2E8F0; color:#1E293B">Suggests ${item.suggested_clo}</span>
          </div>
        </div>
        <p style="font-size:13px; margin:0 0 10px 0; color:var(--text-dim)"><strong>Outcome:</strong> ${item.learning_outcome}</p>
        <p style="font-size:13px; margin:0 0 10px 0; color:var(--text-dim)"><strong>Activity:</strong> ${item.teaching_activity}</p>
        <div style="background:var(--bg-input); border-radius:6px; padding:10px;">
          <strong style="font-size:12px; text-transform:uppercase; color:var(--text-dim)">Quizzes:</strong>
          <ul style="margin:5px 0 0 0; padding-left:20px; font-size:13px; color:var(--text)">${quizzes}</ul>
        </div>
      </div>`;
    }).join('');

    planList.innerHTML = html;
    resultArea.classList.remove('hidden');

    // Attach save handler
    document.getElementById('btn-blooms-save-shadsync').addEventListener('click', async (e) => {
      const btn = e.target;
      btn.textContent = 'Saving...';
      btn.disabled = true;
      try {
        let savedCount = 0;
        for (const item of (plan.lesson_plan || [])) {
          if (item.suggested_clo && item.suggested_clo.startsWith('CLO')) {
            await window.api.shadsync.saveClo({
              courseId:   'ICE301',
              code:       item.suggested_clo,
              description: item.learning_outcome,
              bloomLevel: item.bloom_name,
            });
            savedCount++;
          }
        }
        btn.textContent = `Saved ${savedCount} CLOs!`;
        btn.style.color = 'var(--success)';
        btn.style.borderColor = 'var(--success)';
      } catch (err) {
        alert('Failed to save to ShadSync: ' + err.message);
        btn.textContent = 'Error';
      }
    });
  }

  // ── Syllabus Mapper handlers ─────────────────────────────────────────────

  function setupSyllabusHandlers() {
    const fileInput = document.getElementById('syllabus-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files?.[0]) runSyllabusAnalysis(e.target.files[0]);
      });
    }

    // Manual paste toggle
    document.addEventListener('click', (e) => {
      if (e.target?.id === 'btn-syllabus-manual-toggle') {
        const sec = document.getElementById('syllabus-manual-section');
        if (sec) sec.classList.toggle('hidden');
      }
      if (e.target?.id === 'btn-syllabus-analyze-manual') {
        runSyllabusManualAnalysis();
      }
    });

    if (window.api?.blooms?.onSyllabusProgress) {
      window.api.blooms.onSyllabusProgress((data) => {
        const el = document.getElementById('syllabus-progress');
        if (el) {
          el.classList.remove('hidden');
          el.innerHTML = `⏳ ${escapeHtml(data.detail || data.step)}`;
        }
      });
    }
  }

  async function runSyllabusManualAnalysis() {
    const cosText   = (document.getElementById('syllabus-cos-input') || {}).value || '';
    const weeksText = (document.getElementById('syllabus-weeks-input') || {}).value || '';
    if (cosText.trim().length < 20 || weeksText.trim().length < 20) {
      alert('Please paste both Course Outcome text and Weekly topic text (at least 20 characters each).');
      return;
    }
    const progressEl = document.getElementById('syllabus-progress');
    const resultEl   = document.getElementById('syllabus-result');
    if (progressEl) { progressEl.classList.remove('hidden'); progressEl.innerHTML = '⏳ Analyzing manual input…'; }
    if (resultEl) resultEl.classList.add('hidden');

    try {
      const res = await window.api.blooms.analyzeSyllabusManual(cosText, weeksText);
      if (!res.ok) throw new Error(res.error);
      renderSyllabusResult(res.result, resultEl);
      if (progressEl) progressEl.classList.add('hidden');
    } catch (e) {
      if (progressEl) progressEl.innerHTML = `❌ ${escapeHtml(e.message)}`;
      alert('Manual analysis failed: ' + e.message);
    }
  }

  async function runSyllabusAnalysis(file) {
    const mimeType = getMimeType(file);
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mimeType)) {
      alert('Please upload a PDF or DOCX course profile document.');
      return;
    }

    const progressEl = document.getElementById('syllabus-progress');
    const resultEl   = document.getElementById('syllabus-result');
    const dropZone   = document.getElementById('syllabus-drop-zone');

    if (progressEl) { progressEl.classList.remove('hidden'); progressEl.innerHTML = '⏳ Reading document…'; }
    if (resultEl)   resultEl.classList.add('hidden');
    if (dropZone)   dropZone.style.opacity = '0.5';

    try {
      const buffer = await file.arrayBuffer();
      const res = await window.api.blooms.analyzeSyllabus(buffer, mimeType);
      if (!res.ok) throw new Error(res.error);
      renderSyllabusResult(res.result, resultEl);
      if (progressEl) progressEl.classList.add('hidden');
    } catch (e) {
      if (progressEl) { progressEl.innerHTML = `❌ ${escapeHtml(e.message)}`; }
      alert('Syllabus analysis failed: ' + e.message);
    } finally {
      if (dropZone) dropZone.style.opacity = '1';
    }
  }

  function renderSyllabusResult(result, container) {
    if (!container) return;

    const { courseOutcomes, weeklyTopics, alignmentGaps, summary, diagnostics } = result;

    const healthClass = summary.overallHealth === 'ALIGNED' ? 'fm-health-aligned'
      : summary.overallHealth === 'MINOR_GAPS' ? 'fm-health-minor'
      : summary.overallHealth === 'EXTRACTION_FAILED' ? 'fm-health-failed' : 'fm-health-review';
    const healthLabel = summary.overallHealth === 'ALIGNED' ? '✅ Fully Aligned'
      : summary.overallHealth === 'MINOR_GAPS' ? '⚠️ Minor Gaps'
      : summary.overallHealth === 'EXTRACTION_FAILED' ? '⚠️ Extraction Incomplete' : '🚨 Needs Review';

    // Diagnostics notice
    const diagnosticsHtml = diagnostics?.suggestion
      ? `<div class="fm-notice-banner warn fm-animate">
           <span class="fm-notice-icon">⚠️</span>
           <div>
             <strong>Extraction Notice</strong><br/>
             ${escapeHtml(diagnostics.suggestion)}
             <div style="margin-top:6px; font-size:11px; opacity:0.7;">
               Strategy: <code>${escapeHtml(diagnostics.strategy || 'unknown')}</code>
               · ${diagnostics.cosFound || 0} COs · ${diagnostics.weeksFound || 0} weeks
             </div>
           </div>
         </div>` : '';

    // Gap cards
    const gapCards = alignmentGaps.map((gap, i) => {
      const isNonMeasurable = gap.gap_type === 'NON_MEASURABLE_VERB';
      const isDomain = gap.gap_type === 'DOMAIN_MISMATCH';
      const cardClass = isNonMeasurable ? 'non-measurable' : isDomain ? 'domain-mismatch' : 'level-mismatch';
      const typeLabel = isNonMeasurable ? 'Non-Measurable' : isDomain ? 'Domain Mismatch' : 'Level Mismatch';
      const typeBadgeClass = isNonMeasurable ? 'measure' : isDomain ? 'domain' : 'level';
      const pulseClass = isDomain || isNonMeasurable ? '' : 'warn';

      const verbChips = (gap.suggested_verbs || []).map(v =>
        `<span class="fm-verb-chip">${escapeHtml(v)}</span>`
      ).join('');

      const rewrite = gap.suggested_rewrite || '';
      const rewriteId = `rewrite-${i}`;

      return `
        <div class="fm-gap-card ${cardClass} fm-animate" style="animation-delay:${i * 50}ms">
          <div class="fm-gap-header">
            <span class="fm-gap-pulse ${pulseClass}"></span>
            <span class="fm-gap-co-label">${escapeHtml(gap.co)}</span>
            <span class="fm-gap-type-badge ${typeBadgeClass}">${escapeHtml(typeLabel)}</span>
          </div>
          <p class="fm-gap-description">${escapeHtml(gap.gap_description || '')}</p>
          ${gap.expected_level ? `
            <div style="margin-bottom:10px; font-size:12px; color:var(--text-dim);">
              <strong>Recommended:</strong>
              <span class="fm-level-pill" style="background:${getBloomColor(gap.expected_level)}22; color:${getBloomColor(gap.expected_level)}; margin-left:6px;">
                ${escapeHtml(gap.expected_level)} ${escapeHtml(gap.expected_level_name || '')}
              </span>
            </div>` : ''}
          ${verbChips ? `<div class="fm-verb-chips">${verbChips}</div>` : ''}
          ${rewrite ? `
            <div class="fm-rewrite-box" style="margin-top:12px;">
              <div class="fm-rewrite-text" id="${rewriteId}">"${escapeHtml(rewrite)}"</div>
              <button class="fm-copy-btn" onclick="
                navigator.clipboard.writeText(document.getElementById('${rewriteId}').textContent.replace(/^\"|\"$/g,'').trim());
                this.textContent='✓ Copied';
                this.classList.add('copied');
                setTimeout(()=>{this.textContent='📋 Copy';this.classList.remove('copied');},1500);
              ">📋 Copy</button>
            </div>` : ''}
        </div>`;
    }).join('');

    // CO rows
    const coRows = courseOutcomes.map(co => {
      const hasGap = alignmentGaps.some(g => g.co === co.code);
      return `
        <div class="fm-co-row fm-animate">
          <span class="fm-co-code">${escapeHtml(co.code)}</span>
          <span class="fm-co-text">${escapeHtml((co.text || '').slice(0, 140))}${(co.text || '').length > 140 ? '…' : ''}</span>
          ${hasGap
            ? `<span class="fm-status-gap"><span class="fm-gap-pulse" style="width:6px;height:6px;"></span> Gap</span>`
            : `<span class="fm-status-ok">✓ OK</span>`}
        </div>`;
    }).join('');

    // Weekly rows
    const bloomColors = { C1:'#94A3B8', C2:'#38BDF8', C3:'#2563EB', C4:'#8B5CF6', C5:'#D946EF', C6:'#F43F5E' };
    const weekRows = weeklyTopics.map(w => {
      const color = bloomColors[w.mappedLevel] || null;
      const levelPill = w.mappedLevel
        ? `<span class="fm-level-pill" style="background:${color}22; color:${color};">${escapeHtml(w.mappedLevel)} ${escapeHtml(w.mappedLevelName || '')}</span>`
        : `<span style="color:var(--text-dim); font-size:12px;">—</span>`;
      const verbs = (w.mappedVerbs || []).slice(0, 3).map(v =>
        `<span class="fm-verb-chip" style="font-size:10px;">${escapeHtml(v)}</span>`
      ).join('');
      return `<tr>
        <td style="font-weight:700; color:var(--text-dim); white-space:nowrap;">${escapeHtml(w.week)}</td>
        <td style="color:var(--text); max-width:300px;">${escapeHtml((w.topics || '').slice(0, 120))}${(w.topics||'').length > 120 ? '…' : ''}</td>
        <td>${levelPill}</td>
        <td><div class="fm-verb-chips" style="margin:0;">${verbs || '<span style="color:var(--text-dim);font-size:11px;">—</span>'}</div></td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div class="fm-report-header">
        <h3 class="fm-report-title">Syllabus Alignment Report</h3>
        <span class="fm-health-badge ${healthClass}">${healthLabel}</span>
        <span class="fm-report-meta">${summary.totalCOs} COs · ${summary.totalWeeks} weeks · ${summary.gapsFound} gap${summary.gapsFound === 1 ? '' : 's'}</span>
        <div class="fm-export-row">
          <button id="btn-syllabus-copy-md" class="fm-copy-btn">📋 Markdown</button>
          <button id="btn-syllabus-export-pdf" class="btn-primary small">📄 Export PDF</button>
        </div>
      </div>

      ${diagnosticsHtml}

      ${alignmentGaps.length > 0
        ? `<div style="margin-bottom:20px;">
             <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.6px; color:var(--fm-gap-text); margin-bottom:10px;">
               🚨 Alignment Gaps (${alignmentGaps.length})
             </div>
             ${gapCards}
           </div>`
        : `<div class="fm-notice-banner info fm-animate">
             <span class="fm-notice-icon">✅</span>
             <div>All Course Outcomes are aligned with the weekly syllabus content.</div>
           </div>`}

      <details class="fm-accordion fm-animate" style="margin-bottom:12px;">
        <summary>📋 Course Outcomes (${courseOutcomes.length})</summary>
        <div class="fm-accordion-body">
          ${coRows || '<p style="color:var(--text-dim);font-size:13px;">No Course Outcomes detected.</p>'}
        </div>
      </details>

      <details class="fm-accordion fm-animate">
        <summary>📅 Unit / Topic Mapping (${weeklyTopics.length} units)</summary>
        <div class="fm-accordion-body" style="padding:0; overflow-x:auto;">
          <table class="fm-week-table">
            <thead><tr>
              <th>Unit</th><th>Topics</th><th>Bloom's Level</th><th>Suggested Verbs</th>
            </tr></thead>
            <tbody>${weekRows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:var(--text-dim);">No unit topics detected.</td></tr>'}</tbody>
          </table>
        </div>
      </details>`;

    container.classList.remove('hidden');
    wireSyllabusExportHandlers(container, result);
  }

  // ── Syllabus export handlers ─────────────────────────────────────────────

  let _lastSyllabusResult = null;

  function wireSyllabusExportHandlers(container, result) {
    _lastSyllabusResult = result;

    const copyBtn = container.querySelector('#btn-syllabus-copy-md');
    const pdfBtn  = container.querySelector('#btn-syllabus-export-pdf');

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          const md = buildSyllabusMarkdown(result);
          await navigator.clipboard.writeText(md);
          const orig = copyBtn.textContent;
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyBtn.textContent = orig; }, 1500);
        } catch (e) {
          alert('Could not copy to clipboard: ' + e.message);
        }
      });
    }

    if (pdfBtn) {
      pdfBtn.addEventListener('click', async () => {
        try {
          pdfBtn.disabled = true;
          const orig = pdfBtn.textContent;
          pdfBtn.textContent = 'Saving…';
          const html = buildSyllabusHtml(result);
          const res = await window.api.blooms.exportPdf(html);
          if (!res || !res.ok) throw new Error((res && res.error) || 'Export failed');
          pdfBtn.textContent = '✓ Saved to Desktop';
          setTimeout(() => { pdfBtn.textContent = orig; pdfBtn.disabled = false; }, 2000);
        } catch (e) {
          alert('PDF export failed: ' + e.message);
          pdfBtn.disabled = false;
          pdfBtn.textContent = '📄 Export as PDF';
        }
      });
    }
  }

  function buildSyllabusMarkdown(result) {
    const { courseOutcomes, weeklyTopics, alignmentGaps, summary } = result;
    const date = new Date().toLocaleDateString();

    const healthLabel = summary.overallHealth === 'ALIGNED' ? '✅ Fully Aligned'
      : summary.overallHealth === 'MINOR_GAPS' ? '⚠️ Minor Gaps Found'
      : summary.overallHealth === 'EXTRACTION_FAILED' ? '⚠️ Extraction Incomplete' : '🚨 Needs Review';

    let md = `# Syllabus Alignment Report\n\n`;
    md += `**Generated:** ${date} by FacultyMind ShadSync OBE Engine\n`;
    md += `**Status:** ${healthLabel}\n`;
    md += `**Summary:** ${summary.totalCOs} Course Outcomes · ${summary.totalWeeks} weeks · ${summary.gapsFound} alignment gap${summary.gapsFound === 1 ? '' : 's'}\n\n`;

    if (alignmentGaps.length > 0) {
      md += `## 🚨 Alignment Gaps\n\n`;
      for (const g of alignmentGaps) {
        const gapType = g.gap_type === 'DOMAIN_MISMATCH' ? 'Domain Mismatch' : 'Level Mismatch';
        md += `### ${g.co} — ${gapType}\n\n`;
        md += `**Issue:** ${g.gap_description}\n\n`;
        md += `**Recommended Level:** ${g.expected_level} ${g.expected_level_name}\n\n`;
        md += `**Suggested Verbs:** ${(g.suggested_verbs || []).join(', ')}\n\n`;
        md += `**Suggested Rewrite:**\n> ${g.suggested_rewrite}\n\n`;
      }
    } else {
      md += `## ✅ All Aligned\n\nAll Course Outcomes are aligned with the weekly syllabus content.\n\n`;
    }

    md += `## Course Outcomes\n\n`;
    md += `| CO | Statement | Status |\n|----|-----------|--------|\n`;
    for (const co of courseOutcomes) {
      const hasGap = alignmentGaps.some(g => g.co === co.code);
      const status = hasGap ? '🚨 Gap' : '✅ OK';
      const text = (co.text || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      md += `| ${co.code} | ${text} | ${status} |\n`;
    }
    md += '\n';

    md += `## Unit / Topic Mapping\n\n`;
    md += `| Unit | Topics | Bloom's Level | Suggested Verbs |\n|------|--------|---------------|------------------|\n`;
    for (const w of weeklyTopics) {
      const lvl    = w.mappedLevel ? `${w.mappedLevel} ${w.mappedLevelName}` : '—';
      const verbs  = (w.mappedVerbs || []).slice(0, 3).join(', ') || '—';
      const topics = (w.topics || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
      md += `| ${w.week} | ${topics} | ${lvl} | ${verbs} |\n`;
    }
    md += '\n';

    return md;
  }

  function buildSyllabusHtml(result) {
    const { courseOutcomes, weeklyTopics, alignmentGaps, summary } = result;
    const date = new Date().toLocaleDateString();

    const healthColor = summary.overallHealth === 'ALIGNED' ? '#10B981'
      : summary.overallHealth === 'MINOR_GAPS' ? '#F59E0B'
      : summary.overallHealth === 'EXTRACTION_FAILED' ? '#6B7280' : '#EF4444';
    const healthLabel = summary.overallHealth === 'ALIGNED' ? '✅ Fully Aligned'
      : summary.overallHealth === 'MINOR_GAPS' ? '⚠️ Minor Gaps Found'
      : summary.overallHealth === 'EXTRACTION_FAILED' ? '⚠️ Extraction Incomplete' : '🚨 Needs Review';

    const gapsHtml = alignmentGaps.length === 0
      ? `<div style="padding:14px 18px; background:#D1FAE5; border-radius:8px; color:#065F46; margin-bottom:20px;">✅ All Course Outcomes are aligned with the weekly syllabus content.</div>`
      : alignmentGaps.map(g => {
          const gapType = g.gap_type === 'DOMAIN_MISMATCH' ? 'Domain Mismatch' : 'Level Mismatch';
          const verbs  = (g.suggested_verbs || []).join(', ');
          return `
            <div style="border:1px solid #FCA5A5; border-radius:10px; padding:18px; margin-bottom:14px; background:#FEF2F2; page-break-inside:avoid;">
              <div style="font-size:13px; font-weight:700; color:#DC2626; margin-bottom:8px;">🚨 ${escapeHtml(g.co)} — ${escapeHtml(gapType)}</div>
              <p style="font-size:13px; color:#374151; margin:0 0 10px 0;">${escapeHtml(g.gap_description)}</p>
              <p style="font-size:13px; margin:0 0 6px 0;"><strong>Recommended Level:</strong> ${escapeHtml(g.expected_level)} ${escapeHtml(g.expected_level_name)}</p>
              <p style="font-size:13px; margin:0 0 10px 0;"><strong>Suggested Verbs:</strong> ${escapeHtml(verbs)}</p>
              <div style="background:#FEF3C7; border-left:3px solid #F59E0B; padding:10px 14px; font-size:13px; color:#78350F; font-style:italic;">
                <strong style="font-style:normal;">✏️ Suggested Rewrite:</strong><br/>"${escapeHtml(g.suggested_rewrite)}"
              </div>
            </div>`;
        }).join('');

    const coRows = courseOutcomes.map(co => {
      const hasGap = alignmentGaps.some(g => g.co === co.code);
      const statusBadge = hasGap
        ? '<span style="padding:2px 8px; border-radius:10px; background:#FEE2E2; color:#DC2626; font-size:11px; font-weight:700;">🚨 Gap</span>'
        : '<span style="padding:2px 8px; border-radius:10px; background:#D1FAE5; color:#065F46; font-size:11px; font-weight:700;">✅ OK</span>';
      return `<tr>
        <td style="padding:8px 12px; font-weight:700; vertical-align:top; border-bottom:1px solid #e5e7eb;">${escapeHtml(co.code)}</td>
        <td style="padding:8px 12px; vertical-align:top; border-bottom:1px solid #e5e7eb;">${escapeHtml(co.text)}</td>
        <td style="padding:8px 12px; text-align:center; border-bottom:1px solid #e5e7eb;">${statusBadge}</td>
      </tr>`;
    }).join('');

    const bloomColors = { C1:'#94A3B8', C2:'#38BDF8', C3:'#2563EB', C4:'#8B5CF6', C5:'#D946EF', C6:'#F43F5E' };
    const weekRows = weeklyTopics.map(w => {
      const color = bloomColors[w.mappedLevel] || '#9CA3AF';
      const lvlBadge = w.mappedLevel
        ? `<span style="padding:2px 8px; border-radius:10px; background:${color}; color:#fff; font-size:11px; font-weight:700;">${escapeHtml(w.mappedLevel)} ${escapeHtml(w.mappedLevelName)}</span>`
        : '<span style="color:#9CA3AF;">—</span>';
      const verbs = (w.mappedVerbs || []).slice(0, 3).join(', ') || '—';
      return `<tr>
        <td style="padding:6px 12px; font-weight:600; vertical-align:top; border-bottom:1px solid #e5e7eb;">${escapeHtml(w.week)}</td>
        <td style="padding:6px 12px; vertical-align:top; border-bottom:1px solid #e5e7eb; font-size:12px;">${escapeHtml((w.topics || '').slice(0, 200))}</td>
        <td style="padding:6px 12px; text-align:center; vertical-align:top; border-bottom:1px solid #e5e7eb;">${lvlBadge}</td>
        <td style="padding:6px 12px; vertical-align:top; border-bottom:1px solid #e5e7eb; font-size:12px; color:#0D9488;">${escapeHtml(verbs)}</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Syllabus Alignment Report</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1F2937; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        h2 { font-size: 16px; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; }
        .meta { font-size: 12px; color: #6B7280; margin-bottom: 4px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; background: ${healthColor}; color: #fff; font-size: 12px; font-weight: 700; margin-right: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead tr { background: #F3F4F6; text-align: left; }
        thead th { padding: 8px 12px; font-size: 11px; text-transform: uppercase; color: #4B5563; }
        .footer { margin-top: 24px; font-size: 11px; color: #6B7280; }
      </style></head><body>
      <h1>Syllabus Alignment Report</h1>
      <div class="meta">
        <span class="badge">${escapeHtml(healthLabel)}</span>
        <span>${summary.totalCOs} COs · ${summary.totalWeeks} weeks · ${summary.gapsFound} gap${summary.gapsFound === 1 ? '' : 's'}</span>
      </div>
      <div class="meta">Generated ${escapeHtml(date)} by FacultyMind ShadSync OBE Engine</div>

      <h2>Alignment Gaps</h2>
      ${gapsHtml}

      <h2>Course Outcomes</h2>
      <table>
        <thead><tr><th>CO</th><th>Statement</th><th style="text-align:center;">Status</th></tr></thead>
        <tbody>${coRows}</tbody>
      </table>

      <h2>Unit / Topic Mapping</h2>
      <table>
        <thead><tr><th>Unit</th><th>Topics</th><th style="text-align:center;">Bloom's Level</th><th>Suggested Verbs</th></tr></thead>
        <tbody>${weekRows}</tbody>
      </table>

      <div class="footer">FacultyMind — Outcome-Based Education Alignment Engine</div>
    </body></html>`;
  }

  // ── Knowledge Base handlers ──────────────────────────────────────────────

  // Pending parsed records from the last import (before professor accepts/rejects)
  let kbPendingRecords = []; // [{ ...parsedQuestion, _accepted: bool }]

  function setupKbHandlers() {
    const kbFileInput = document.getElementById('kb-file-input');

    // Live progress listener — updates the progress bar as images are processed
    if (window.api && window.api.cloKb && window.api.cloKb.onProgress) {
      window.api.cloKb.onProgress((data) => {
        const progressEl = document.getElementById('kb-import-progress');
        if (!progressEl) return;
        const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
        const bar = `<div style="background:var(--bg-input);border-radius:4px;height:6px;margin:6px 0;">
          <div style="background:#10B981;height:6px;border-radius:4px;width:${pct}%;transition:width .3s;"></div>
        </div>`;
        progressEl.innerHTML = `${bar}Processing image ${data.index + 1} of ${data.total} — ${data.current} done${data.questionsFound > 0 ? ` (${data.questionsFound} CLO${data.questionsFound === 1 ? '' : 's'} found)` : ''}${data.error ? ` ⚠️ ${escapeHtml(data.error)}` : ''}`;
        progressEl.classList.remove('hidden');
      });
    }

    if (kbFileInput) {
      kbFileInput.addEventListener('change', (e) => {
        kbFileInput._pendingFiles = Array.from(e.target.files || []);
        updateDropZoneLabel(kbFileInput._pendingFiles.length);
      });
    }

    // Parse & Import button + Scan Folder button + Verify All + Delete All
    document.addEventListener('click', async (e) => {
      if (e.target && e.target.id === 'btn-kb-import') {
        await handleKbImport();
      }
      if (e.target && e.target.id === 'btn-kb-scan-folder') {
        await handleKbScanFolder();
      }
      if (e.target && e.target.id === 'btn-kb-accept-all') {
        kbPendingRecords.forEach(r => { r._accepted = true; });
        renderKbReviewList();
      }
      if (e.target && e.target.id === 'btn-kb-save-accepted') {
        await handleKbSaveAccepted();
      }
      if (e.target && e.target.id === 'btn-kb-verify-all') {
        await handleKbVerifyAll();
      }
      if (e.target && e.target.id === 'btn-kb-delete-all') {
        await handleKbDeleteAll();
      }
    });

    // Course filter change
    document.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'kb-filter-course') {
        loadKbRecords(e.target.value || undefined);
      }
    });
  }

  function updateDropZoneLabel(count) {
    const btn = document.getElementById('btn-kb-select');
    if (!btn) return;
    btn.textContent = count > 0
      ? `📸 ${count} image${count === 1 ? '' : 's'} selected — click to change`
      : '📸 Select Exam Question Images';
  }

  async function handleKbImport() {
    const kbFileInput = document.getElementById('kb-file-input');
    const courseCodeEl = document.getElementById('kb-course-code');
    const progressEl = document.getElementById('kb-import-progress');
    const importBtn = document.getElementById('btn-kb-import');

    const files = (kbFileInput && kbFileInput._pendingFiles) || (kbFileInput && kbFileInput.files ? Array.from(kbFileInput.files) : []);
    if (!files || files.length === 0) {
      alert('Please select at least one image file first.');
      return;
    }

    const courseCode = (courseCodeEl && courseCodeEl.value.trim()) || 'UNKNOWN';

    if (importBtn) { importBtn.disabled = true; importBtn.textContent = 'Parsing…'; }
    if (progressEl) { progressEl.classList.remove('hidden'); progressEl.textContent = 'Preparing images…'; }

    try {
      // Read all files as ArrayBuffers
      const imageBuffers = [];
      const mimeTypes = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        imageBuffers.push(buf);
        mimeTypes.push(file.type || 'image/jpeg');
      }

      if (progressEl) progressEl.textContent = `Parsing ${files.length} image${files.length === 1 ? '' : 's'} with OCR + AI…`;

      const res = await window.api.cloKb.importImages(imageBuffers, mimeTypes, courseCode);
      if (!res.ok) throw new Error(res.error || 'Import failed');

      // Flatten all parsed questions from all images
      kbPendingRecords = [];
      for (const imgResult of (res.results || [])) {
        if (!imgResult.ok) {
          console.warn(`[KB] Image ${imgResult.index} failed:`, imgResult.error);
          continue;
        }
        const questions = (imgResult.parsed && imgResult.parsed.parsed_questions) || [];
        questions.forEach(q => {
          kbPendingRecords.push({ ...q, course_code: courseCode, _accepted: true });
        });
      }

      if (kbPendingRecords.length === 0) {
        if (progressEl) progressEl.textContent = 'No questions could be parsed from the images.';
        return;
      }

      // Build per-image status summary
      const fileNames = files.map(f => f.name || `Image ${files.indexOf(f) + 1}`);
      const statusLines = (res.results || []).map((imgResult, i) => {
        const name = fileNames[i] || `Image ${i + 1}`;
        const parsed = imgResult.ok ? ((imgResult.parsed && imgResult.parsed.parsed_questions) || []).length : 0;
        if (!imgResult.ok) return `<span style="color:#EF4444;">❌ ${escapeHtml(name)} — failed</span>`;
        if (parsed === 0)  return `<span style="color:#F59E0B;">⚠️ ${escapeHtml(name)} — no CLO questions found</span>`;
        return `<span style="color:#10B981;">✅ ${escapeHtml(name)} — ${parsed} question${parsed === 1 ? '' : 's'}</span>`;
      }).join('<br/>');

      if (progressEl) {
        progressEl.innerHTML = `Parsed <strong>${kbPendingRecords.length}</strong> question${kbPendingRecords.length === 1 ? '' : 's'} — review below.<br/><br/><details style="margin-top:6px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-dim);">📋 Per-image status</summary><div style="margin-top:6px;font-size:12px;line-height:1.8;">${statusLines}</div></details>`;
      }

      const reviewSection = document.getElementById('kb-review-section');
      if (reviewSection) reviewSection.classList.remove('hidden');
      renderKbReviewList();

    } catch (err) {
      if (progressEl) progressEl.textContent = 'Error: ' + err.message;
      alert('Import failed: ' + err.message);
    } finally {
      if (importBtn) { importBtn.disabled = false; importBtn.textContent = '🔍 Parse & Import'; }
    }
  }

  async function handleKbScanFolder() {
    const courseCodeEl = document.getElementById('kb-course-code');
    const progressEl   = document.getElementById('kb-import-progress');
    const scanBtn      = document.getElementById('btn-kb-scan-folder');
    const importBtn    = document.getElementById('btn-kb-import');

    const courseCode = (courseCodeEl && courseCodeEl.value.trim()) || 'UNKNOWN';

    if (scanBtn)  { scanBtn.disabled  = true;  scanBtn.textContent  = 'Scanning…'; }
    if (importBtn){ importBtn.disabled = true; }
    if (progressEl){ progressEl.classList.remove('hidden'); progressEl.textContent = 'Opening folder picker…'; }

    try {
      // Step 1: Let user pick a folder — main process reads all images from it
      const scanRes = await window.api.cloKb.scanFolder();

      if (scanRes.canceled) {
        if (progressEl) progressEl.classList.add('hidden');
        return;
      }
      if (!scanRes.ok) throw new Error(scanRes.error);

      const { files, folderPath, count } = scanRes;
      if (progressEl) progressEl.textContent = `Found ${count} image${count === 1 ? '' : 's'} in folder. Parsing with OCR + AI…`;

      // Step 2: Send buffers to the same import pipeline
      // files: [{ name, buffer: number[], mimeType }]
      const imageBuffers = files.map(f => new Uint8Array(f.buffer).buffer);
      const mimeTypes    = files.map(f => f.mimeType);

      const res = await window.api.cloKb.importImages(imageBuffers, mimeTypes, courseCode);
      if (!res.ok) throw new Error(res.error || 'Import failed');

      // Flatten parsed questions
      kbPendingRecords = [];
      for (const imgResult of (res.results || [])) {
        if (!imgResult.ok) {
          console.warn(`[KB] Image ${imgResult.index} (${files[imgResult.index]?.name}) failed:`, imgResult.error);
          continue;
        }
        const questions = (imgResult.parsed && imgResult.parsed.parsed_questions) || [];
        questions.forEach(q => {
          kbPendingRecords.push({ ...q, course_code: courseCode, _accepted: true });
        });
      }

      if (kbPendingRecords.length === 0) {
        if (progressEl) progressEl.textContent = `Scanned ${count} images but no CLO questions could be parsed. Check that images contain exam questions with CLO annotations.`;
        return;
      }

      // Build per-image status summary
      const statusLines = (res.results || []).map((imgResult, i) => {
        const name = files[i]?.name || `Image ${i + 1}`;
        const parsed = imgResult.ok ? ((imgResult.parsed && imgResult.parsed.parsed_questions) || []).length : 0;
        if (!imgResult.ok) return `<span style="color:#EF4444;">❌ ${escapeHtml(name)} — failed: ${escapeHtml(imgResult.error || 'unknown error')}</span>`;
        if (parsed === 0)  return `<span style="color:#F59E0B;">⚠️ ${escapeHtml(name)} — no CLO questions found</span>`;
        return `<span style="color:#10B981;">✅ ${escapeHtml(name)} — ${parsed} question${parsed === 1 ? '' : 's'} extracted</span>`;
      }).join('<br/>');

      if (progressEl) {
        progressEl.innerHTML = `✓ Parsed <strong>${kbPendingRecords.length}</strong> question${kbPendingRecords.length === 1 ? '' : 's'} from <strong>${count}</strong> images in "<strong>${escapeHtml(folderPath.split('\\').pop() || folderPath)}</strong>". Review below.<br/><br/><details style="margin-top:6px;"><summary style="cursor:pointer;font-size:12px;color:var(--text-dim);">📋 Per-image status</summary><div style="margin-top:6px;font-size:12px;line-height:1.8;">${statusLines}</div></details>`;
      }

      const reviewSection = document.getElementById('kb-review-section');
      if (reviewSection) reviewSection.classList.remove('hidden');
      renderKbReviewList();

    } catch (err) {
      if (progressEl) progressEl.textContent = 'Error: ' + err.message;
      alert('Folder scan failed: ' + err.message);
    } finally {
      if (scanBtn)  { scanBtn.disabled  = false; scanBtn.textContent  = '📁 Scan Folder'; }
      if (importBtn){ importBtn.disabled = false; }
    }
  }

  function renderKbReviewList() {    const list = document.getElementById('kb-review-list');
    if (!list) return;

    if (kbPendingRecords.length === 0) {
      list.innerHTML = '<p style="font-size:13px; color:var(--text-dim);">No records to review.</p>';
      return;
    }

    const rows = kbPendingRecords.map((r, i) => {
      const bloomColor = getBloomColor(r.bloom_level || '');
      const accepted = r._accepted !== false;
      const verbs = Array.isArray(r.action_verbs) ? r.action_verbs.join(', ') : (r.action_verbs || '');
      const confidence = r.confidence != null ? Math.round(r.confidence * 100) + '%' : '—';

      return `<div data-kb-idx="${i}" style="display:flex; align-items:flex-start; gap:10px; padding:10px 12px;
               border:1px solid var(--border); border-radius:8px; margin-bottom:8px;
               background:${accepted ? 'var(--bg-input)' : 'rgba(239,68,68,0.05)'};
               opacity:${accepted ? '1' : '0.6'};">
        <input type="checkbox" class="kb-accept-check" data-idx="${i}"
          ${accepted ? 'checked' : ''} style="margin-top:3px; cursor:pointer;" />
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; color:var(--text); margin-bottom:4px; word-break:break-word;">
            ${escapeHtml(r.question_text || '')}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; font-size:11px;">
            ${r.clo_code ? `<span style="padding:2px 8px; border-radius:10px; background:var(--bg-active); color:#fff;">${escapeHtml(r.clo_code)}</span>` : ''}
            ${r.bloom_level ? `<span style="padding:2px 8px; border-radius:10px; background:${bloomColor}; color:#fff;">${escapeHtml(r.bloom_level)} ${escapeHtml(r.bloom_name || '')}</span>` : ''}
            ${verbs ? `<span style="color:var(--text-dim);">verbs: ${escapeHtml(verbs)}</span>` : ''}
            <span style="color:var(--text-dim);">confidence: ${confidence}</span>
          </div>
        </div>
      </div>`;
    }).join('');

    list.innerHTML = rows;

    // Wire checkboxes
    list.querySelectorAll('.kb-accept-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        if (!isNaN(idx) && kbPendingRecords[idx]) {
          kbPendingRecords[idx]._accepted = e.target.checked;
          renderKbReviewList();
        }
      });
    });
  }

  async function handleKbVerifyAll() {
    const btn = document.getElementById('btn-kb-verify-all');
    const courseCode = (document.getElementById('kb-filter-course') || {}).value || undefined;
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
    try {
      const res = await window.api.cloKb.verifyAll(courseCode);
      if (!res.ok) throw new Error(res.error);
      await loadKbStats();
      await loadKbRecords(courseCode);
      if (window.api && window.api.notify) {
        window.api.notify.send('✅ All Verified', `${res.count} records marked as verified`, true);
      }
    } catch (e) {
      alert('Verify all failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✓ Verify All'; }
    }
  }

  async function handleKbDeleteAll() {
    const courseCode = (document.getElementById('kb-filter-course') || {}).value || undefined;
    const label = courseCode ? `all records for ${courseCode}` : 'the entire knowledge base';
    if (!confirm(`This will permanently delete ${label}. Are you sure?`)) return;
    const btn = document.getElementById('btn-kb-delete-all');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
    try {
      const res = await window.api.cloKb.deleteAll(courseCode);
      if (!res.ok) throw new Error(res.error);
      await loadKbStats();
      await loadKbRecords();
    } catch (e) {
      alert('Delete all failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🗑 Clear All'; }
    }
  }

  async function handleKbSaveAccepted() {
    const saveBtn = document.getElementById('btn-kb-save-accepted');
    const courseCodeEl = document.getElementById('kb-course-code');
    const courseCode = (courseCodeEl && courseCodeEl.value.trim()) || 'UNKNOWN';

    const accepted = kbPendingRecords.filter(r => r._accepted !== false);
    if (accepted.length === 0) {
      alert('No records accepted. Check at least one record to save.');
      return;
    }

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
      const toSave = accepted.map(r => ({
        course_code:   courseCode,
        question_text: r.question_text || '',
        clo_code:      r.clo_code || '',
        bloom_level:   r.bloom_level || '',
        bloom_name:    r.bloom_name || '',
        action_verbs:  Array.isArray(r.action_verbs) ? r.action_verbs : [],
        source:        'ocr_import',
      }));

      const res = await window.api.cloKb.saveBatch(toSave, courseCode);
      if (!res.ok) throw new Error(res.error || 'Save failed');

      // Clear pending state
      kbPendingRecords = [];
      const reviewSection = document.getElementById('kb-review-section');
      if (reviewSection) reviewSection.classList.add('hidden');
      const progressEl = document.getElementById('kb-import-progress');
      if (progressEl) progressEl.textContent = `✓ Saved ${toSave.length} record${toSave.length === 1 ? '' : 's'} to knowledge base.`;

      // Refresh stats and records list
      await loadKbStats();
      await loadKbRecords();

      // Desktop notification — training complete
      if (window.api && window.api.notify) {
        window.api.notify.send(
          '📚 Training Complete',
          `${toSave.length} question${toSave.length === 1 ? '' : 's'} added to CLO Knowledge Base for ${courseCode}`,
          true
        );
      }

    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Save Accepted to Knowledge Base'; }
    }
  }

  async function loadKbStats() {
    if (!window.api || !window.api.cloKb) return;
    try {
      const res = await window.api.cloKb.stats();
      if (!res.ok) return;
      const s = res.stats;
      const totalEl    = document.getElementById('kb-stat-total');
      const verifiedEl = document.getElementById('kb-stat-verified');
      const coursesEl  = document.getElementById('kb-stat-courses');
      if (totalEl)    totalEl.textContent    = `${s.total} record${s.total === 1 ? '' : 's'}`;
      if (verifiedEl) verifiedEl.textContent = `${s.verified} verified`;
      if (coursesEl)  coursesEl.textContent  = `${Object.keys(s.byCourse || {}).length} course${Object.keys(s.byCourse || {}).length === 1 ? '' : 's'}`;
    } catch (_) {}
  }

  async function loadKbRecords(courseCodeFilter) {
    if (!window.api || !window.api.cloKb) return;
    try {
      const res = await window.api.cloKb.get(courseCodeFilter || undefined);
      if (!res.ok) return;
      const records = res.data || [];

      // Update course filter dropdown
      const filterSel = document.getElementById('kb-filter-course');
      if (filterSel) {
        const courses = [...new Set(records.map(r => r.course_code))].sort();
        const currentVal = filterSel.value;
        filterSel.innerHTML = '<option value="">All courses</option>' +
          courses.map(c => `<option value="${escapeHtml(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
      }

      renderKbRecordsList(records);
    } catch (_) {}
  }

  function renderKbRecordsList(records) {
    const list = document.getElementById('kb-records-list');
    if (!list) return;

    if (records.length === 0) {
      list.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-dim); font-size:13px;">
        No records yet. Import exam question images to build the knowledge base.
      </div>`;
      return;
    }

    const rows = records.map(r => {
      const bloomColor = getBloomColor(r.bloom_level || '');
      const verbs = (() => {
        try { return JSON.parse(r.action_verbs || '[]').join(', '); } catch (_) { return ''; }
      })();
      const verifiedBadge = r.verified
        ? `<span style="padding:2px 8px; border-radius:10px; background:#10B981; color:#fff; font-size:10px; font-weight:700;">✓ Verified</span>`
        : `<span style="padding:2px 8px; border-radius:10px; background:#F59E0B; color:#fff; font-size:10px; font-weight:700;">Unverified</span>`;

      return `<div data-kb-id="${r.id}" style="display:flex; align-items:flex-start; gap:10px; padding:10px 12px;
               border:1px solid var(--border); border-radius:8px; margin-bottom:8px;
               background:var(--bg-input);">
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; color:var(--text); margin-bottom:6px; word-break:break-word;">
            ${escapeHtml(r.question_text || '')}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; font-size:11px; align-items:center;">
            <span style="padding:2px 8px; border-radius:10px; background:var(--bg-active); color:#fff;">${escapeHtml(r.course_code)}</span>
            ${r.clo_code ? `<span style="padding:2px 8px; border-radius:10px; border:1px solid var(--border); color:var(--text);">${escapeHtml(r.clo_code)}</span>` : ''}
            ${r.bloom_level ? `<span style="padding:2px 8px; border-radius:10px; background:${bloomColor}; color:#fff;">${escapeHtml(r.bloom_level)} ${escapeHtml(r.bloom_name || '')}</span>` : ''}
            ${verbs ? `<span style="color:var(--text-dim);">verbs: ${escapeHtml(verbs)}</span>` : ''}
            ${verifiedBadge}
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
          <button class="btn-kb-toggle-verify btn-ghost small" data-id="${r.id}" data-verified="${r.verified}"
            style="font-size:11px; padding:3px 8px;">
            ${r.verified ? '✗ Unverify' : '✓ Verify'}
          </button>
          <button class="btn-kb-delete btn-ghost small" data-id="${r.id}"
            style="font-size:11px; padding:3px 8px; color:var(--danger, #ef4444);">
            🗑 Delete
          </button>
        </div>
      </div>`;
    }).join('');

    list.innerHTML = rows;

    // Wire verify/unverify buttons
    list.querySelectorAll('.btn-kb-toggle-verify').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        const isVerified = e.target.dataset.verified === '1';
        try {
          if (isVerified) {
            await window.api.cloKb.unverify(id);
          } else {
            await window.api.cloKb.verify(id);
          }
          const filterSel = document.getElementById('kb-filter-course');
          await loadKbStats();
          await loadKbRecords(filterSel ? filterSel.value || undefined : undefined);
        } catch (err) {
          alert('Failed to update record: ' + err.message);
        }
      });
    });

    // Wire delete buttons
    list.querySelectorAll('.btn-kb-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = parseInt(e.target.dataset.id, 10);
        if (!confirm('Delete this knowledge base record?')) return;
        try {
          await window.api.cloKb.delete(id);
          const filterSel = document.getElementById('kb-filter-course');
          await loadKbStats();
          await loadKbRecords(filterSel ? filterSel.value || undefined : undefined);
        } catch (err) {
          alert('Failed to delete record: ' + err.message);
        }
      });
    });
  }

  // ── OCR progress listener ────────────────────────────────────────────────

  function setupOcrProgressListener() {
    if (!window.api || !window.api.blooms || !window.api.blooms.onOcrProgress) return;

    window.api.blooms.onOcrProgress((data) => {
      const loadingText = document.getElementById('blooms-loading-text');
      if (loadingText && data && data.page) {
        const totalStr = data.total && data.total !== '?' ? ` of ${data.total}` : '';
        loadingText.textContent = `OCR: extracting page ${data.page}${totalStr}…`;
      }
    });
  }

  // ── HTML safety helper ────────────────────────────────────────────────────

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    let str;
    if (Array.isArray(value)) {
      str = value.map(v => (v == null ? '' : String(v))).join(', ');
    } else if (typeof value === 'object') {
      try { str = JSON.stringify(value); } catch (_) { str = String(value); }
    } else {
      str = String(value);
    }
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Bloom's level color map ──────────────────────────────────────────────

  function getBloomColor(level) {
    const map = {
      'C1': '#94A3B8', // Gray   — Remember
      'C2': '#38BDF8', // Blue   — Understand
      'C3': '#2563EB', // Indigo — Apply
      'C4': '#8B5CF6', // Purple — Analyze
      'C5': '#D946EF', // Fuchsia — Evaluate
      'C6': '#F43F5E', // Rose   — Create
    };
    return map[level] || '#0D9488';
  }

  // ── Shadow Editor ─────────────────────────────────────────────────────────
  // Interactive verb-badge view. Replaces the table when the professor clicks
  // "📝 Shadow Edit". Each question row shows the full text with the detected
  // action verb wrapped in a color-coded badge. Clicking the badge opens a
  // micro-dropdown to change the Bloom's level. Changes are saved to the KB
  // and the badge color updates instantly.

  let _shadowActiveRowId   = null;
  let _shadowActiveVerb    = null;
  let _shadowMappings      = [];   // live copy of clo_mappings for this result

  /**
   * Inject the shadow editor view into the CLO result container.
   * Called when the professor clicks "📝 Shadow Edit".
   */
  function renderShadowEditor(container, mappings) {
    _shadowMappings = mappings.map(m => ({ ...m })); // deep-ish copy

    const BLOOM_NAMES = {
      C1: 'Remember', C2: 'Understand', C3: 'Apply',
      C4: 'Analyze',  C5: 'Evaluate',   C6: 'Create',
    };

    // Confidence → badge class
    function badgeClass(m) {
      if (m.confidence === 'rejected') return 'se-badge-red';
      if (m.confidence === 'low')      return 'se-badge-red';
      if (m.confidence === 'medium')   return 'se-badge-amber';
      return 'se-badge-green';
    }

    // Build question rows
    const rows = _shadowMappings.map(m => {
      const verb      = (m.detected_verbs && m.detected_verbs[0]) || '—';
      const levelText = m.bloom_level ? `${m.bloom_level} ${BLOOM_NAMES[m.bloom_level] || ''}` : 'REJECTED';
      const cls       = badgeClass(m);
      const safeId    = escapeHtml(m.clo_code);
      const safeVerb  = escapeHtml(verb);
      const safeText  = escapeHtml(m.clo_text || '');
      const tooltip   = m.confidence === 'rejected'
        ? (m.alignment_note || 'Rejected — non-cognitive or non-measurable')
        : m.justification || '';

      // Highlight the verb inside the question text (case-insensitive, first occurrence)
      let displayText = safeText;
      if (verb && verb !== '—') {
        const re = new RegExp(`\\b(${verb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'i');
        displayText = safeText.replace(re, `<span class="se-verb-highlight">$1</span>`);
      }

      return `
        <div class="se-question-row" data-id="${safeId}">
          <div class="se-question-body">
            <span class="se-q-id">${safeId}</span>
            <span class="se-q-text">${displayText}</span>
          </div>
          <div class="se-question-meta">
            <button class="se-verb-badge ${cls}"
              data-id="${safeId}" data-verb="${safeVerb}"
              title="${escapeHtml(tooltip)}"
              onclick="BloomsModule._shadowOpenPopover(event, '${safeId}', '${safeVerb}')">
              ${safeVerb}
            </button>
            <span class="se-level-label" id="se-level-${safeId}">${levelText}</span>
            <span class="se-dot-indicator ${cls}" title="${escapeHtml(tooltip)}">●</span>
          </div>
        </div>`;
    }).join('');

    // Tier popover (shared, repositioned on each click)
    const popoverHtml = `
      <div id="se-tier-popover" class="se-tier-popover hidden">
        <div class="se-popover-header">Select Bloom's Level</div>
        <ul class="se-tier-list">
          ${['C1','C2','C3','C4','C5','C6'].map(lvl => `
            <li class="se-tier-item" onclick="BloomsModule._shadowSelectTier('${lvl}')">
              <span class="se-tier-dot" style="background:${getBloomColor(lvl)};"></span>
              <span class="se-tier-code">${lvl}</span>
              <span class="se-tier-name">${BLOOM_NAMES[lvl]}</span>
            </li>`).join('')}
        </ul>
      </div>`;

    // Inject CSS once
    if (!document.getElementById('se-styles')) {
      const style = document.createElement('style');
      style.id = 'se-styles';
      style.textContent = `
        .se-question-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 12px 16px; border-bottom: 1px solid var(--border);
          background: rgba(255,255,255,0.04); transition: background .15s;
          gap: 12px;
        }
        .se-question-row:hover { background: rgba(255,255,255,0.08); }
        .se-question-body { flex: 1; font-size: 13px; line-height: 1.6; color: var(--text); }
        .se-q-id { font-weight: 700; color: var(--text-dim); margin-right: 8px; font-size: 12px; white-space: nowrap; }
        .se-q-text { }
        .se-verb-highlight { background: rgba(255,200,0,0.18); border-radius: 2px; padding: 0 2px; }
        .se-question-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .se-verb-badge {
          font-weight: 700; font-size: 11px; text-transform: lowercase;
          padding: 3px 9px; border-radius: 5px; cursor: pointer;
          border: 1px solid transparent; transition: all .15s; white-space: nowrap;
        }
        .se-badge-green { background: #e2f4e8; color: #117332; border-color: #a3dfb8; }
        .se-badge-amber { background: #fff1cc; color: #8a6d3b; border-color: #ffd166; }
        .se-badge-red   { background: #fce8e6; color: #c53929; border-color: #f7a8a0; }
        .se-verb-badge:hover { filter: brightness(0.92); transform: scale(1.04); }
        .se-level-label { font-size: 11px; color: var(--text-dim); white-space: nowrap; }
        .se-dot-indicator { font-size: 10px; }
        .se-dot-indicator.se-badge-green { color: #117332; }
        .se-dot-indicator.se-badge-amber { color: #8a6d3b; }
        .se-dot-indicator.se-badge-red   { color: #c53929; }
        .se-tier-popover {
          position: fixed; background: #fff; border: 1px solid #111;
          box-shadow: 0 6px 20px rgba(0,0,0,.15); border-radius: 8px;
          z-index: 9999; width: 190px; overflow: hidden;
        }
        .se-tier-popover.hidden { display: none; }
        .se-popover-header {
          padding: 8px 12px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; color: #666; border-bottom: 1px solid #eee;
          background: #fafafa;
        }
        .se-tier-list { list-style: none; margin: 0; padding: 4px 0; }
        .se-tier-item {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 12px; cursor: pointer; font-size: 13px;
          transition: background .1s;
        }
        .se-tier-item:hover { background: #f3f4f6; }
        .se-tier-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .se-tier-code { font-weight: 700; font-size: 12px; color: #333; width: 24px; }
        .se-tier-name { color: #555; }
      `;
      document.head.appendChild(style);
    }

    container.innerHTML = `
      <div style="margin-bottom:12px; display:flex; align-items:center; gap:10px;">
        <span style="font-size:13px; font-weight:600; color:var(--text-dim);">
          📝 Shadow Edit — click any verb badge to change its Bloom's level
        </span>
        <button onclick="BloomsModule._shadowClose()" class="btn-ghost small">✕ Close Shadow Edit</button>
      </div>
      <div class="se-document-stream">${rows}</div>
      ${popoverHtml}`;

    // Close popover on outside click
    document.addEventListener('click', _shadowOutsideClick, { capture: true });
  }

  function _shadowOutsideClick(e) {
    const popover = document.getElementById('se-tier-popover');
    if (popover && !popover.contains(e.target) && !e.target.classList.contains('se-verb-badge')) {
      popover.classList.add('hidden');
    }
  }

  function _shadowOpenPopover(event, rowId, rootVerb) {
    event.stopPropagation();
    _shadowActiveRowId = rowId;
    _shadowActiveVerb  = rootVerb;

    const popover = document.getElementById('se-tier-popover');
    if (!popover) return;

    // Position near the badge
    const rect = event.target.getBoundingClientRect();
    const top  = Math.min(rect.bottom + 6, window.innerHeight - 260);
    const left = Math.min(rect.left, window.innerWidth - 200);
    popover.style.top  = `${top}px`;
    popover.style.left = `${left}px`;
    popover.classList.remove('hidden');
  }

  async function _shadowSelectTier(targetLevel) {
    if (!_shadowActiveRowId || !_shadowActiveVerb) return;

    const popover = document.getElementById('se-tier-popover');
    if (popover) popover.classList.add('hidden');

    const BLOOM_NAMES = {
      C1: 'Remember', C2: 'Understand', C3: 'Apply',
      C4: 'Analyze',  C5: 'Evaluate',   C6: 'Create',
    };

    // ── Poison prevention check ───────────────────────────────────────────
    if (window.api && window.api.cloKb && window.api.cloKb.checkConflict) {
      try {
        const res = await window.api.cloKb.checkConflict(_shadowActiveVerb, targetLevel);
        if (res && res.warning) {
          const proceed = confirm(`${res.warning}\n\nProceed with this custom override?`);
          if (!proceed) return;
        }
      } catch (_) {}
    }

    // ── Update DOM instantly ──────────────────────────────────────────────
    const badge = document.querySelector(`.se-verb-badge[data-id="${_shadowActiveRowId}"]`);
    const dot   = document.querySelector(`.se-question-row[data-id="${_shadowActiveRowId}"] .se-dot-indicator`);
    const label = document.getElementById(`se-level-${_shadowActiveRowId}`);

    if (badge) {
      badge.className = 'se-verb-badge se-badge-green';
    }
    if (dot) {
      dot.className = 'se-dot-indicator se-badge-green';
    }
    if (label) {
      label.textContent = `${targetLevel} ${BLOOM_NAMES[targetLevel]}`;
    }

    // ── Update in-memory state ────────────────────────────────────────────
    const mapping = _shadowMappings.find(m => m.clo_code === _shadowActiveRowId);
    if (mapping) {
      mapping.bloom_level = targetLevel;
      mapping.bloom_name  = BLOOM_NAMES[targetLevel];
      mapping.confidence  = 'high'; // professor confirmed
    }
    // Also sync to cloEditState so export picks up the change
    if (!cloEditState[_shadowActiveRowId]) cloEditState[_shadowActiveRowId] = {};
    cloEditState[_shadowActiveRowId].bloom_level = targetLevel;
    cloEditState[_shadowActiveRowId].bloom_name  = BLOOM_NAMES[targetLevel];

    // ── Save to KB (fire-and-forget) ──────────────────────────────────────
    if (window.api && window.api.cloKb && window.api.cloKb.saveBatch) {
      const questionText = mapping ? (mapping.clo_text || '') : '';
      window.api.cloKb.saveBatch([{
        question_text: questionText,
        root_verb:     _shadowActiveVerb,
        bloom_level:   targetLevel,
        bloom_name:    BLOOM_NAMES[targetLevel],
        action_verbs:  [_shadowActiveVerb],
        source:        'teacher_override',
        course_code:   cloLastCourseCode || 'UNKNOWN',
      }], cloLastCourseCode || 'UNKNOWN').catch(() => {});
    }
  }

  function _shadowClose() {
    // Re-render the table view with the current (possibly edited) state
    const resultDiv = document.getElementById('blooms-clo-result');
    if (resultDiv && cloLastResult) {
      // Merge shadow edits back into the result before re-rendering
      const merged = {
        ...cloLastResult,
        clo_mappings: (cloLastResult.clo_mappings || []).map(m => {
          const shadow = _shadowMappings.find(s => s.clo_code === m.clo_code);
          return shadow ? { ...m, bloom_level: shadow.bloom_level, bloom_name: shadow.bloom_name } : m;
        }),
      };
      renderCloMappingResult(merged, resultDiv);
    }
    document.removeEventListener('click', _shadowOutsideClick, { capture: true });
  }

  // Expose shadow editor methods on the module so inline onclick handlers work
  // (they reference BloomsModule._shadowOpenPopover etc.)
  const _shadowPublic = { _shadowOpenPopover, _shadowSelectTier, _shadowClose };

  return { init, ..._shadowPublic };})();

// Auto-init when the Bloom's nav item is clicked
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'blooms') BloomsModule.init();
  });
});
