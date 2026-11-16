'use strict';

/**
 * floating-chat.js — Always-visible AI assistant widget
 *
 * Lives in the bottom-right corner across ALL views.
 * Handles proactive messages, file uploads, and instant AI chat.
 */

const FloatingChat = (() => {

  const bubble    = document.getElementById('fc-bubble');
  const panel     = document.getElementById('fc-panel');
  const closeBtn  = document.getElementById('fc-close');
  const messagesEl = document.getElementById('fc-messages');
  const inputEl   = document.getElementById('fc-input');
  const sendBtn   = document.getElementById('fc-send');
  const badge     = document.getElementById('fc-badge');
  const fileInput = document.getElementById('fc-file-input');
  const filePreview = document.getElementById('fc-file-preview');

  let isOpen       = false;
  let unreadCount  = 0;
  let pendingFile  = null; // { name, content, type }

  // ── Shared conversation history ────────────────────────────────────────────
  // window.sharedHistory is shared with the main chat view — same context everywhere
  if (!window.sharedHistory) window.sharedHistory = [];
  const MAX_HISTORY = 30;

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // Note: bubble click/drag is handled inside initDraggable()
    closeBtn.addEventListener('click', closePanel);
    sendBtn.addEventListener('click', sendMessage);
    fileInput.addEventListener('change', handleFileSelect);
    initDraggable();

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
    });

    // Listen for proactive messages from main process
    if (window.api?.ai?.onProactive) {
      window.api.ai.onProactive(payload => {
        const text    = typeof payload === 'string' ? payload : payload?.text;
        const buttons = typeof payload === 'string' ? [] : (payload?.buttons || []);
        if (text) receiveProactive(text, buttons);
      });
    }

    // Welcome message (synced across both UIs)
    window.chatSync.appendAiMsg(
      "Hey, I'm **DASH** \u2014 I'm here across every section of FacultyMind. Drop a file and I'll read it for you."
    );
  }

  // ── Panel toggle ──────────────────────────────────────────────────────────

  function togglePanel() {
    isOpen ? closePanel() : openPanel();
  }

  function openPanel() {
    isOpen = true;
    panel.classList.remove('hidden');
    bubble.classList.add('fc-open');
    // After panel renders, ensure widget is inside viewport
    setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    clearBadge();
    scrollToBottom();
    inputEl.focus();
  }

  function closePanel() {
    isOpen = false;
    panel.classList.add('hidden');
    bubble.classList.remove('fc-open');
  }

  // ── Badge ─────────────────────────────────────────────────────────────────

  function addBadge() {
    if (isOpen) return;
    unreadCount++;
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.classList.remove('hidden');
  }

  function clearBadge() {
    unreadCount = 0;
    badge.classList.add('hidden');
  }

  // ── Proactive pop-up ──────────────────────────────────────────────────────

  function receiveProactive(text, buttons = []) {
    // Render in floating chat only (proactive is UI-specific with peek behavior)
    appendAiMsgLocal(text, buttons);
    addBadge();

    // Auto-pop the panel open briefly to show the message
    if (!isOpen) {
      panel.classList.remove('hidden');
      panel.classList.add('fc-peek');
      bubble.classList.add('fc-open');

      // Auto-close after 8 seconds if user doesn't interact
      const timer = setTimeout(() => {
        if (!isOpen) {
          panel.classList.add('hidden');
          panel.classList.remove('fc-peek');
          bubble.classList.remove('fc-open');
        }
      }, 8000);

      // If user clicks anywhere in the panel, cancel auto-close and stay open
      panel.addEventListener('click', () => {
        clearTimeout(timer);
        isOpen = true;
        panel.classList.remove('fc-peek');
        clearBadge();
      }, { once: true });
    }
  }

  // ── File handling ─────────────────────────────────────────────────────────

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    filePreview.classList.remove('hidden');
    filePreview.innerHTML = `<span class="fc-file-chip">📄 ${escHtml(file.name)} <button id="fc-file-remove">✕</button></span>`;
    const removeBtn = document.getElementById('fc-file-remove');
    if (removeBtn) removeBtn.addEventListener('click', clearFile);

    try {
      if (file.type === 'application/pdf') {
        pendingFile = { name: file.name, content: await extractPdfText(file), type: 'pdf' };
      } else if (file.type.startsWith('image/')) {
        pendingFile = { name: file.name, content: await toBase64(file), type: 'image' };
      } else {
        // Plain text, CSV, MD, etc.
        pendingFile = { name: file.name, content: await file.text(), type: 'text' };
      }
    } catch (err) {
      window.chatSync.appendAiMsg('Couldn\'t read that file: ' + err.message);
    }
  }

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text && !pendingFile) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    const displayText = text || `[Attached: ${pendingFile?.name}]`;
    window.chatSync.appendUserMsg(displayText);

    const thinkId = window.chatSync.appendThinking();

    try {
      let message   = text;
      let sendOpts  = {};
      let imageB64  = null;

      // ── File handling ──────────────────────────────────────────────────────
      if (pendingFile) {
        if (pendingFile.type === 'image') {
          imageB64 = pendingFile.content;
          message  = text || 'Describe everything you can see in this image in detail.';
          sendOpts = { imageBase64: imageB64 };
        } else {
          const preview = pendingFile.content.slice(0, 6000);
          message = `I've attached a file: "${pendingFile.name}"\n\nContent:\n${preview}\n\n${text || 'Please summarise and analyse this file.'}`;
        }
        clearFile();
      }

      // ── Push this user turn into history ───────────────────────────────────
      const userHistoryEntry = { role: 'user', content: message };
      if (imageB64) userHistoryEntry.imageBase64 = imageB64;
      window.sharedHistory.push(userHistoryEntry);

      // Keep history bounded
      while (window.sharedHistory.length > MAX_HISTORY) window.sharedHistory.shift();

      // ── Send to AI with full history ───────────────────────────────────────
      sendOpts.history = window.sharedHistory.slice(0, -1); // All prior turns (not current)

      const result = await window.api.ai.send(message, {}, sendOpts);
      window.chatSync.removeThinking(thinkId);

      if (!result.ok) {
        // Remove the failed user entry from history so it doesn't corrupt context
        window.sharedHistory.pop();
        window.chatSync.appendAiMsg('⚠️ ' + (result.error || 'AI unavailable — check your API key in Settings.'));
        return;
      }

      // ── Push AI response into history ──────────────────────────────────────
      window.sharedHistory.push({ role: 'assistant', content: result.text });

      window.chatSync.appendAiMsg(result.text);

      // Handle navigation actions from AI
      if (result.data?.action === 'navigate') {
        const view    = result.data.view;
        const section = result.data.section;
        const navItem = document.querySelector(`[data-view="${view}"]`);
        if (navItem) { navItem.click(); closePanel(); }
        if (view === 'diu-portal' && section) {
          setTimeout(() => { if (typeof showDiuSection === 'function') showDiuSection(section); }, 300);
        }
      }

    } catch (err) {
      window.chatSync.removeThinking(thinkId);
      window.sharedHistory.pop(); // Remove failed user entry
      window.chatSync.appendAiMsg('⚠️ ' + err.message);
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function appendUserMsg(text) {
    const id = uid();
    messagesEl.insertAdjacentHTML('beforeend', `
      <div class="fc-msg fc-msg-user" id="${id}">
        <div class="fc-bubble-user">${escHtml(text)}</div>
      </div>`);
    scrollToBottom();
    return id;
  }

  function appendAiMsg(text, buttons = []) {
    const id = uid();
    const btns = (buttons || []).map(b =>
      `<button class="fc-action-btn" data-action="${escHtml(b.action)}">${escHtml(b.label)}</button>`
    ).join('');

    messagesEl.insertAdjacentHTML('beforeend', `
      <div class="fc-msg fc-msg-ai" id="${id}">
        <div class="fc-avatar-sm">D</div>
        <div class="fc-bubble-ai">
          ${fmtMd(escHtml(text))}
          ${btns ? `<div class="fc-actions">${btns}</div>` : ''}
        </div>
      </div>`);

    // Wire action buttons
    document.querySelectorAll(`#${id} .fc-action-btn`).forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action?.startsWith('nav:')) {
          const view = action.replace('nav:', '');
          document.querySelector(`[data-view="${view}"]`)?.click();
          closePanel();
        }
      });
    });

    scrollToBottom();
    return id;
  }

  function appendThinking() {
    const id = uid();
    messagesEl.insertAdjacentHTML('beforeend', `
      <div class="fc-msg fc-msg-ai" id="${id}">
        <div class="fc-avatar-sm">D</div>
        <div class="fc-bubble-ai fc-thinking">
          <span></span><span></span><span></span>
        </div>
      </div>`);
    scrollToBottom();
    return id;
  }

  function removeMsg(id) {
    document.getElementById(id)?.remove();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function uid() {
    return `fc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function escHtml(str = '') {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtMd(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ── Local-only AI render for proactive messages (no sync) ────────────────

  function appendAiMsgLocal(text, buttons = []) {
    const id = uid();
    const btns = (buttons || []).map(b =>
      '<button class="fc-action-btn" data-action="' + escHtml(b.action) + '">' + escHtml(b.label) + '</button>'
    ).join('');
    messagesEl.insertAdjacentHTML('beforeend',
      '<div class="fc-msg fc-msg-ai" id="' + id + '">' +
        '<div class="fc-avatar-sm">D</div>' +
        '<div class="fc-bubble-ai">' +
          fmtMd(escHtml(text)) +
          (btns ? '<div class="fc-actions">' + btns + '</div>' : '') +
        '</div>' +
      '</div>'
    );
    document.querySelectorAll('#' + id + ' .fc-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action?.startsWith('nav:')) {
          const view = action.replace('nav:', '');
          document.querySelector('[data-view="' + view + '"]')?.click();
          closePanel();
        }
      });
    });
    scrollToBottom();
    return id;
  }

  // ── Draggable ─────────────────────────────────────────────────────────────

  function initDraggable() {
    const root   = document.getElementById('fc-root');
    const header = document.getElementById('fc-header');
    const panelEl = document.getElementById('fc-panel');

    // ── Helper: get the full bounding box of the widget (panel + bubble) ──
    function getWidgetBounds() {
      const panelRect = panelEl && !panelEl.classList.contains('hidden')
        ? panelEl.getBoundingClientRect() : null;
      const bubbleRect = bubble.getBoundingClientRect();

      if (!panelRect) {
        return { width: bubbleRect.width, height: bubbleRect.height };
      }
      // Combined bounding box
      const left = Math.min(panelRect.left, bubbleRect.left);
      const top = Math.min(panelRect.top, bubbleRect.top);
      const right = Math.max(panelRect.right, bubbleRect.right);
      const bottom = Math.max(panelRect.bottom, bubbleRect.bottom);
      return { width: right - left, height: bottom - top };
    }

    // ── Helper: clamp root position so widget stays inside viewport ──
    function clampPosition() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const bounds = getWidgetBounds();

      let r = parseInt(root.style.right) || 24;
      let b = parseInt(root.style.bottom) || 24;

      // Right edge: root.right + bounds.width must be <= vw
      r = Math.max(8, Math.min(vw - bounds.width - 8, r));
      // Bottom edge: root.bottom + bounds.height must be <= vh
      b = Math.max(8, Math.min(vh - bounds.height - 8, b));

      root.style.right = r + 'px';
      root.style.bottom = b + 'px';
      root.style.transform = '';
    }

    // ── On window resize, snap back inside ──
    window.addEventListener('resize', clampPosition);

    // ── 1. Panel header drag ──
    if (root && header) {
      header.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        if (e.target.closest && e.target.closest('#fc-close')) return;
        e.preventDefault();

        const ox = e.clientX;
        const oy = e.clientY;
        const startRight = parseInt(root.style.right) || 24;
        const startBottom = parseInt(root.style.bottom) || 24;
        const bounds = getWidgetBounds();

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;cursor:move;';
        document.body.appendChild(overlay);

        overlay.addEventListener('mousemove', function (ev) {
          const dx = ev.clientX - ox;
          const dy = ev.clientY - oy;
          const vw = window.innerWidth;
          const vh = window.innerHeight;

          const newRight = Math.max(8, Math.min(vw - bounds.width - 8, startRight - dx));
          const newBottom = Math.max(8, Math.min(vh - bounds.height - 8, startBottom - dy));

          root.style.right = newRight + 'px';
          root.style.bottom = newBottom + 'px';
          root.style.transform = '';
        });

        overlay.addEventListener('mouseup', function () {
          overlay.remove();
          try {
            localStorage.setItem('fc-bubble-pos', JSON.stringify({
              right: parseInt(root.style.right) || 24,
              bottom: parseInt(root.style.bottom) || 24,
            }));
          } catch (_) {}
        });
      });
    }

    // ── 2. Bubble drag ──
    if (!bubble) return;

    // Restore saved position
    try {
      const saved = localStorage.getItem('fc-bubble-pos');
      if (saved) {
        const { bottom, right } = JSON.parse(saved);
        root.style.bottom = bottom + 'px';
        root.style.right  = right  + 'px';
      }
    } catch (_) {}
    // Clamp on load
    setTimeout(clampPosition, 100);

    bubble.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      let moved = false;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const curRight  = parseInt(root.style.right) || 24;
      const curBottom = parseInt(root.style.bottom) || 24;

      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99998;cursor:grab;';
      document.body.appendChild(overlay);

      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        moved = true;
        overlay.style.cursor = 'grabbing';

        // When bubble is dragged while panel is closed, just clamp bubble (56px)
        // When panel is open, clamp the full widget
        const bounds = getWidgetBounds();
        const newRight  = Math.max(8, Math.min(vw - bounds.width - 8, curRight - dx));
        const newBottom = Math.max(8, Math.min(vh - bounds.height - 8, curBottom - dy));

        root.style.right  = newRight  + 'px';
        root.style.bottom = newBottom + 'px';
        root.style.transform = '';
      }

      function onUp() {
        overlay.remove();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);

        if (!moved) {
          togglePanel();
          // After panel opens/closes, re-clamp
          setTimeout(clampPosition, 250);
        } else {
          try {
            localStorage.setItem('fc-bubble-pos', JSON.stringify({
              right:  parseInt(root.style.right) || 24,
              bottom: parseInt(root.style.bottom) || 24,
            }));
          } catch (_) {}
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    // Prevent double-fire
    bubble.addEventListener('click', function (e) {
      // handled in mouseup
    });
  }

  return { init, receiveProactive };

})();

// Auto-init
FloatingChat.init();
