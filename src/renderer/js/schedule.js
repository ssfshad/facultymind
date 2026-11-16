/**
 * schedule.js — Smart Schedule Manager UI
 * Timetable grid, add/edit/delete classes, lesson log
 */

'use strict';

const ScheduleModule = (() => {

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let _schedule = [];
  let _editId    = null;

  // ── Init ────────────────────────────────────────────────────────────────────

  async function init() {
    await loadSchedule();
    renderTimetable();
    renderLessonLog();
    setupAddClass();
    setupLessonLog();
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  async function loadSchedule() {
    const result = await window.api.schedule.get();
    _schedule = result.ok ? result.data : [];
  }

  // ── Timetable Render ────────────────────────────────────────────────────────

  function renderTimetable() {
    const grid   = document.getElementById('timetable-grid');
    const todayI = new Date().getDay();

    grid.innerHTML = DAYS.map((day, i) => {
      const classes = _schedule.filter(c => c.day_of_week === i);
      const isToday = i === todayI;
      return `
        <div class="timetable-day ${isToday ? 'today' : ''}">
          <div class="timetable-day-label">${day}${isToday ? ' ●' : ''}</div>
          ${classes.length
            ? classes.map(c => classCard(c)).join('')
            : `<div class="empty-day">—</div>`
          }
        </div>
      `;
    }).join('');

    // Click class card → open edit modal
    grid.querySelectorAll('.class-card').forEach(card => {
      card.addEventListener('click', () => openScheduleModal(card.dataset.id));
    });
  }

  function classCard(c) {
    return `
      <div class="class-card" data-id="${c.id}">
        <div class="cc-code">${escHtml(c.course_code || '')}</div>
        <div class="cc-time">${c.start_time} – ${c.end_time}</div>
        ${c.room ? `<div class="cc-room">${escHtml(c.room)}</div>` : ''}
      </div>
    `;
  }

  // ── Add / Edit Modal ────────────────────────────────────────────────────────

  function setupAddClass() {
    document.getElementById('btn-add-class').addEventListener('click', () => openScheduleModal(null));
    document.getElementById('btn-schedule-cancel').addEventListener('click', closeScheduleModal);
    document.getElementById('btn-schedule-save').addEventListener('click', saveScheduleEntry);

    // Close modal on backdrop click
    document.getElementById('modal-schedule').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeScheduleModal();
    });
  }

  function openScheduleModal(id) {
    _editId = id ? Number(id) : null;
    const modal = document.getElementById('modal-schedule');
    const title = document.getElementById('modal-schedule-title');

    if (_editId) {
      const entry = _schedule.find(c => c.id === _editId);
      if (entry) {
        document.getElementById('sch-course-code').value = entry.course_code || '';
        document.getElementById('sch-course-name').value = entry.course_name || '';
        document.getElementById('sch-day').value         = entry.day_of_week;
        document.getElementById('sch-start').value       = entry.start_time;
        document.getElementById('sch-end').value         = entry.end_time;
        document.getElementById('sch-room').value        = entry.room || '';
        document.getElementById('sch-zoom').value        = entry.zoom_link || '';
      }
      title.textContent = 'Edit Class';
    } else {
      ['sch-course-code','sch-course-name','sch-room','sch-zoom'].forEach(id =>
        document.getElementById(id).value = ''
      );
      document.getElementById('sch-day').value   = new Date().getDay();
      document.getElementById('sch-start').value = '08:00';
      document.getElementById('sch-end').value   = '09:30';
      title.textContent = 'Add Class';
    }

    modal.classList.remove('hidden');
  }

  function closeScheduleModal() {
    document.getElementById('modal-schedule').classList.add('hidden');
    _editId = null;
  }

  async function saveScheduleEntry() {
    const courseCode = document.getElementById('sch-course-code').value.trim();
    const courseName = document.getElementById('sch-course-name').value.trim();
    const startTime  = document.getElementById('sch-start').value;
    const endTime    = document.getElementById('sch-end').value;
    if (!courseCode || !startTime || !endTime) return;

    const entry = {
      id:          _editId || undefined,
      course_code: courseCode,
      course_name: courseName,
      day_of_week: Number(document.getElementById('sch-day').value),
      start_time:  startTime,
      end_time:    endTime,
      room:        document.getElementById('sch-room').value.trim(),
      zoom_link:   document.getElementById('sch-zoom').value.trim(),
    };

    // Capture _editId BEFORE closeScheduleModal() resets it to null
    const wasEditing = !!_editId;
    await window.api.schedule.save(entry);
    closeScheduleModal();
    await loadSchedule();
    renderTimetable();
    renderLessonLog();
    // Desktop notification — class saved
    if (window.api && window.api.notify) {
      const action = wasEditing ? 'updated' : 'added';
      window.api.notify.send('📅 Schedule Updated', `${courseCode} ${action} to your timetable`, true);
    }
  }

  // ── Lesson Log ───────────────────────────────────────────────────────────────

  async function renderLessonLog() {
    const list = document.getElementById('lesson-log-list');

    // Fetch all lessons across all courses
    const allLessons = [];
    for (const cls of _schedule) {
      const courseId = cls.course_id;
      if (!courseId) continue;
      const res = await window.api.lessonLog.get(courseId);
      if (res.ok && res.data.length) allLessons.push(...res.data);
    }

    if (!allLessons.length) {
      list.innerHTML = `<p style="color:var(--text-dim);font-size:13px">
        No lesson logs yet. Add a class first, then log lessons after each session.
      </p>`;
      return;
    }

    // Sort by date descending, show last 10
    allLessons.sort((a, b) => b.date.localeCompare(a.date));
    const recent = allLessons.slice(0, 10);

    list.innerHTML = recent.map(log => {
      const cls = _schedule.find(c => c.course_id === log.course_id);
      const label = cls ? cls.course_code : 'Unknown';
      return `
        <div class="lesson-log-item">
          <div class="ll-header">
            <span class="ll-course">${escHtml(label)}</span>
            <span class="ll-date">${escHtml(log.date)}</span>
          </div>
          ${log.topic_covered ? `<div class="ll-row"><span class="ll-key">Covered:</span> ${escHtml(log.topic_covered)}</div>` : ''}
          ${log.topic_next    ? `<div class="ll-row"><span class="ll-key">Next:</span> ${escHtml(log.topic_next)}</div>` : ''}
          ${log.notes         ? `<div class="ll-row ll-notes">${escHtml(log.notes)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function setupLessonLog() {
    document.getElementById('btn-add-lesson').addEventListener('click', () => {
      // Populate course selector from loaded schedule
      const select = document.getElementById('lesson-course');
      const uniqueCourses = [];
      const seen = new Set();
      _schedule.forEach(cls => {
        if (cls.course_id && !seen.has(cls.course_id)) {
          seen.add(cls.course_id);
          uniqueCourses.push({ id: cls.course_id, code: cls.course_code || cls.course_id });
        }
      });
      select.innerHTML = uniqueCourses.length
        ? uniqueCourses.map(c => `<option value="${c.id}">${escHtml(c.code)}</option>`).join('')
        : '<option value="">No courses — add a class first</option>';

      document.getElementById('lesson-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('modal-lesson').classList.remove('hidden');
    });
    document.getElementById('btn-lesson-cancel').addEventListener('click', () =>
      document.getElementById('modal-lesson').classList.add('hidden')
    );
    document.getElementById('btn-lesson-save').addEventListener('click', async () => {
      const courseId = document.getElementById('lesson-course').value;
      const entry = {
        course_id:     courseId ? Number(courseId) : null,
        date:          document.getElementById('lesson-date').value,
        topic_covered: document.getElementById('lesson-covered').value.trim(),
        topic_next:    document.getElementById('lesson-next').value.trim(),
        notes:         document.getElementById('lesson-notes').value.trim(),
      };
      if (!entry.date || !entry.topic_covered) return;
      await window.api.lessonLog.save(entry);
      document.getElementById('modal-lesson').classList.add('hidden');
      // Clear fields
      ['lesson-covered','lesson-next','lesson-notes'].forEach(id =>
        document.getElementById(id).value = ''
      );
      await renderLessonLog();
      // Desktop notification — lesson logged
      if (window.api && window.api.notify) {
        window.api.notify.send('📝 Lesson Logged', `Lesson log saved for ${entry.date}`, true);
      }
    });
    document.getElementById('modal-lesson').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init };
})();

// Auto-init when Schedule view is activated
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'schedule') ScheduleModule.init();
  });
});
