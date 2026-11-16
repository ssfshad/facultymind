/**
 * chat.js — Natural Language Interface + WhisperFlow UI
 * Intent classification → module routing → response display
 */

'use strict';

if (!window.chatSync) {
  const _csStatic  = document.getElementById('chat-messages');
  const _csFloat   = document.getElementById('fc-messages');

  function _csEsc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _csMd(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^• (.+)$/gm, '<span style="display:block;padding-left:12px">• $1</span>')
      .replace(/\n/g, '<br>');
  }
  function _csScroll(el) { if (el) el.scrollTop = el.scrollHeight; }

  window.chatSync = {
    appendUserMsg(text) {
      const esc = _csEsc(text);
      const ts = Date.now();
      if (_csStatic) {
        _csStatic.insertAdjacentHTML('beforeend',
          '<div class="msg user" id="su-'+ts+'"><div class="msg-avatar">You</div><div class="msg-bubble">'+esc+'</div></div>');
        _csScroll(_csStatic);
      }
      if (_csFloat) {
        _csFloat.insertAdjacentHTML('beforeend',
          '<div class="fc-msg fc-msg-user" id="suf-'+ts+'"><div class="fc-bubble-user">'+esc+'</div></div>');
        _csScroll(_csFloat);
      }
    },
    appendAiMsg(text) {
      const html = _csMd(_csEsc(text));
      const ts = Date.now() + '-' + Math.random().toString(36).slice(2,7);
      if (_csStatic) {
        _csStatic.insertAdjacentHTML('beforeend',
          '<div class="msg ai" id="sa-'+ts+'"><div class="msg-avatar">D</div><div class="msg-bubble">'+html+'</div></div>');
        _csScroll(_csStatic);
      }
      if (_csFloat) {
        _csFloat.insertAdjacentHTML('beforeend',
          '<div class="fc-msg fc-msg-ai" id="saf-'+ts+'"><div class="fc-avatar-sm">D</div><div class="fc-bubble-ai">'+html+'</div></div>');
        _csScroll(_csFloat);
      }
    },
    appendThinking(label) {
      const id = 'sth-' + Date.now();
      const lbl = _csEsc(label || 'Thinking\u2026');
      if (_csStatic) {
        _csStatic.insertAdjacentHTML('beforeend',
          '<div class="msg ai msg-thinking" id="'+id+'-s"><div class="msg-avatar">D</div><div class="msg-bubble"><span>'+lbl+'</span><span class="typing-dots"><span></span><span></span><span></span></span></div></div>');
        _csScroll(_csStatic);
      }
      if (_csFloat) {
        _csFloat.insertAdjacentHTML('beforeend',
          '<div class="fc-msg fc-msg-ai" id="'+id+'-f"><div class="fc-avatar-sm">D</div><div class="fc-bubble-ai fc-thinking"><span></span><span></span><span></span></div></div>');
        _csScroll(_csFloat);
      }
      return id;
    },
    removeThinking(id) {
      document.getElementById(id + '-s')?.remove();
      document.getElementById(id + '-f')?.remove();
    },
    escHtml: _csEsc,
    fmtMd: _csMd,
  };
}

const ChatModule = (() => {

  const msgsEl   = document.getElementById('chat-messages');
  const inputEl  = document.getElementById('chat-input');
  const btnSend  = document.getElementById('btn-send');
  const btnMic   = document.getElementById('btn-mic');
  const recInd   = document.getElementById('recording-indicator');

  let mediaRecorder = null;
  let audioChunks   = [];
  let isRecording   = false;
  let isSending     = false; // prevent double-send on rapid Enter

  // ── Shared conversation history (synced with floating chat) ────────────────
  // window.sharedHistory is the single source of truth for both UIs
  if (!window.sharedHistory) window.sharedHistory = [];
  const MAX_HISTORY = 30;

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    appendWelcome();
    setupInput();
    setupVoice();
    setupModelBadge();

    if (window.api && window.api.ai.onProactive) {
      window.api.ai.onProactive((payload) => {
        if (typeof payload === 'string') {
          appendProactiveMessage(payload, []);
        } else if (payload && payload.text) {
          appendProactiveMessage(payload.text, payload.buttons || []);
        }
      });
    }

    // Listen for auto-model-switch events (e.g. Ollama auto-detected)
    if (window.api && window.api.ai.onModelChanged) {
      window.api.ai.onModelChanged((model) => {
        updateModelBadge(model);
      });
    }

    if (window.api && window.api.cortex) {
      window.api.cortex.navLog('chat');
    }
  }

  // ── Model badge ─────────────────────────────────────────────────────────────

  function setupModelBadge() {
    if (!window.api) return;
    window.api.ai.getActiveModel().then(model => updateModelBadge(model));
  }

  function updateModelBadge(model) {
    const badgeEl = document.getElementById('model-badge');
    if (!badgeEl) return;
    const labels = {
      claude:      'Claude',
      gpt4o:       'GPT-4o',
      gemini:      'Gemini',
      openrouter:  'OpenRouter',
      ollama:      'Local AI',
    };
    const displayName = labels[model] || model;
    badgeEl.innerHTML = `<span class="status-dot"></span>${displayName}`;
    
    // Highlight local AI badge differently
    badgeEl.style.background = model === 'ollama' ? '#10B981' : '';
    badgeEl.style.color      = model === 'ollama' ? '#fff'    : '';
  }

  function appendWelcome() {
    appendAiMessage(
      `Hey! I'm **DASH** — your AI academic assistant.\n\n` +
      `I can help you with:\n` +
      `• **Schedule** — check today's classes, set reminders\n` +
      `• **ShadSync OBE** — query student marks, CLO/PO attainment\n` +
      `• **Bloom's Engine** — generate lesson plans from a PDF\n` +
      `• **Email** — classify and draft replies\n` +
      `• **Vault** — save and find your notes and files\n\n` +
      `What would you like to do today?`
    );
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  function setupInput() {
    btnSend.addEventListener('click', sendMessage);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
    });
  }

  async function sendMessage() {
    if (isSending) return;
    const text = inputEl.value.trim();
    if (!text) return;
    isSending = true;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    window.chatSync.appendUserMsg(text);

    if (window.api && window.api.cortex) {
      window.api.cortex.log('query_sent', 'chat', { length: text.length });
    }

    // Push to shared history
    window.sharedHistory.push({ role: 'user', content: text });
    while (window.sharedHistory.length > MAX_HISTORY) window.sharedHistory.shift();

    const thinkingId = window.chatSync.appendThinking();

    try {
      const result = await window.api.ai.send(text, {}, {
        history: window.sharedHistory.slice(0, -1),
      });

      window.chatSync.removeThinking(thinkingId);

      if (!result.ok) {
        window.sharedHistory.pop();
        window.chatSync.appendAiMsg(`⚠️ ${result.error || 'Could not reach AI. Check your API key in Settings.'}`);
        return;
      }

      window.sharedHistory.push({ role: 'assistant', content: result.text });
      window.chatSync.appendAiMsg(result.text);

      if (result.data?.action === 'email:refresh') {
        window.api.email.refresh().catch(() => {});
        const navItem = document.querySelector('[data-view="email"]');
        if (navItem) navItem.click();
      }

      if (result.data?.action === 'navigate') {
        const view    = result.data.view;
        const section = result.data.section;
        const navItem = document.querySelector(`[data-view="${view}"]`);
        if (navItem) navItem.click();
        // If navigating to diu-portal with a specific section, open that section
        if (view === 'diu-portal' && section) {
          setTimeout(() => {
            if (typeof showDiuSection === 'function') showDiuSection(section);
          }, 300);
        }
      }

    } catch (err) {
      window.chatSync.removeThinking(thinkingId);
      window.sharedHistory.pop();
      window.chatSync.appendAiMsg(`⚠️ Error: ${err.message}`);
    } finally {
      isSending = false;
    }
  }

  // ── Voice (WhisperFlow) ─────────────────────────────────────────────────────

  function setupVoice() {
    btnMic.addEventListener('mousedown', startRecording);
    btnMic.addEventListener('mouseup',   stopRecording);
    btnMic.addEventListener('mouseleave', () => { if (isRecording) stopRecording(); });

    // Touch support
    btnMic.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
    btnMic.addEventListener('touchend',   (e) => { e.preventDefault(); stopRecording(); });
  }

  async function startRecording() {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks  = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.start(100); // collect in 100ms chunks
      isRecording = true;

      btnMic.classList.add('recording');
      recInd.classList.remove('hidden');
    } catch (err) {
      window.chatSync.appendAiMsg(`⚠️ Microphone access denied: ${err.message}`);
    }
  }

  async function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    isRecording = false;

    btnMic.classList.remove('recording');
    recInd.classList.add('hidden');

    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());

    await new Promise(r => (mediaRecorder.onstop = r));

    const blob   = new Blob(audioChunks, { type: 'audio/webm' });
    const buffer = await blob.arrayBuffer();

    const thinkingId = window.chatSync.appendThinking('Transcribing…');
    const result = await window.api.voice.transcribe(buffer);
    window.chatSync.removeThinking(thinkingId);

    if (result.ok && result.transcript) {
      inputEl.value = result.transcript;
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
      inputEl.focus();
      // Highlight text so user can edit before sending
      inputEl.select();
    } else {
      window.chatSync.appendAiMsg(`⚠️ Transcription failed: ${result.error || 'Unknown error'}`);
    }
  }

  // ── Message rendering ───────────────────────────────────────────────────────

  function appendUserMessage(text) {
    const id = `msg-${Date.now()}`;
    msgsEl.insertAdjacentHTML('beforeend', `
      <div class="msg user" id="${id}">
        <div class="msg-avatar">You</div>
        <div class="msg-bubble">${escHtml(text)}</div>
      </div>
    `);
    scrollToBottom();
    return id;
  }

  function appendAiMessage(text) {
    window.chatSync.appendAiMsg(text);
  }

  /**
   * Proactive message — visually distinct from regular AI messages.
   * Has a pulsing cortex indicator and optional quick-action buttons.
   * @param {string}   text
   * @param {object[]} buttons — [{ label, action }] where action is 'nav:email' etc.
   */
  function appendProactiveMessage(text, buttons = []) {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const buttonsHtml = buttons.length > 0
      ? `<div class="proactive-actions">${
          buttons.map(b =>
            `<button class="proactive-btn" data-action="${escHtml(b.action)}">${escHtml(b.label)}</button>`
          ).join('')
        }</div>`
      : '';

    msgsEl.insertAdjacentHTML('beforeend', `
      <div class="msg ai proactive" id="${id}">
        <div class="msg-avatar cortex">
          <span class="cortex-pulse"></span>
          D
        </div>
        <div class="msg-bubble proactive-bubble">
          <div class="proactive-label">DASH</div>
          ${formatMarkdown(escHtml(text))}
          ${buttonsHtml}
        </div>
      </div>
    `);

    // Wire up action buttons
    document.querySelectorAll(`#${id} .proactive-btn`).forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action && action.startsWith('nav:')) {
          const view = action.replace('nav:', '');
          // Trigger sidebar nav programmatically
          const navItem = document.querySelector(`[data-view="${view}"]`);
          if (navItem) navItem.click();
        }
      });
    });

    scrollToBottom();
    return id;
  }

  function appendThinking(label = 'Thinking…') {
    const id = `thinking-${Date.now()}`;
    msgsEl.insertAdjacentHTML('beforeend', `
      <div class="msg ai msg-thinking" id="${id}">
        <div class="msg-avatar">D</div>
        <div class="msg-bubble">
          <span>${escHtml(label)}</span>
          <span class="typing-dots">
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>
    `);
    scrollToBottom();
    return id;
  }

  function removeThinking(id) {
    document.getElementById(id)?.remove();
  }

  function scrollToBottom() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // Basic markdown: **bold**, *italic*, bullet lines
  function formatMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^• (.+)$/gm, '<span style="display:block;padding-left:12px">• $1</span>');
  }

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init };
})();
