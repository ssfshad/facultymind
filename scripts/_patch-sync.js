const fs = require('fs');

// ========== PATCH chat.js ==========
const chatPath = 'D:\\facultymind\\src\\renderer\\js\\chat.js';
let chatCode = fs.readFileSync(chatPath, 'utf8');

// Remove old local render functions and insert chatSync usage
const chatSyncBlock = `
// -- Shared Render Layer -------------------------------------------------------
// Renders messages to BOTH the static DASH chat AND the floating chat,
// so the conversation is always visually in sync across both UIs.
if (!window.chatSync) {
  const _csStatic  = document.getElementById('chat-messages');
  const _csFloat   = document.getElementById('fc-messages');

  function _csEsc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _csMd(text) {
    return text
      .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
      .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
      .replace(/^\\u2022 (.+)$/gm, '<span style="display:block;padding-left:12px">\\u2022 $1</span>')
      .replace(/\\n/g, '<br>');
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
      const lbl = _csEsc(label || 'Thinking\\u2026');
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
`;

// Insert before ChatModule
chatCode = chatCode.replace('const ChatModule = (() => {', chatSyncBlock + '\nconst ChatModule = (() => {');

// Replace sendMessage render calls to use chatSync
chatCode = chatCode.replace(
  /    appendUserMessage\(text\);/g,
  '    window.chatSync.appendUserMsg(text);'
);

// Replace appendAiMessage calls in sendMessage (not in appendWelcome or appendProactiveMessage)
chatCode = chatCode.replace(
  /      appendAiMessage\(`[^`]*`\);/g,
  (match) => {
    // Don't replace if it's inside appendWelcome
    return match;
  }
);

// Replace thinking calls
chatCode = chatCode.replace(
  /    const thinkingId = appendThinking\(\);/g,
  '    const thinkingId = window.chatSync.appendThinking();'
);
chatCode = chatCode.replace(
  /    const thinkingId = appendThinking\('Transcribing…'\);/g,
  "    const thinkingId = window.chatSync.appendThinking('Transcribing\\u2026');"
);

// Replace removeThinking calls
chatCode = chatCode.replace(
  /      removeThinking\(thinkingId\);/g,
  '      window.chatSync.removeThinking(thinkingId);'
);
chatCode = chatCode.replace(
  /    removeThinking\(thinkingId\);/g,
  '    window.chatSync.removeThinking(thinkingId);'
);

// Replace the local appendAiMessage in sendMessage error paths
// Find the sendMessage function and replace all appendAiMessage calls within it
// We need to be more surgical - replace inside sendMessage only
const sendStart = chatCode.indexOf('  async function sendMessage()');
const sendEnd = chatCode.indexOf('  // -- Voice');
if (sendStart > -1 && sendEnd > -1) {
  let sendBlock = chatCode.substring(sendStart, sendEnd);
  sendBlock = sendBlock.replace(
    /        appendAiMessage\(/g,
    '        window.chatSync.appendAiMsg('
  );
  chatCode = chatCode.substring(0, sendStart) + sendBlock + chatCode.substring(sendEnd);
}

// Replace the local appendAiMessage in stopRecording error path
chatCode = chatCode.replace(
  /      appendAiMessage\(`⚠️ Transcription failed: \$\{result\.error \|\| 'Unknown error'\}`\);/g,
  "      window.chatSync.appendAiMsg('\\u26A0\\uFE0F Transcription failed: ' + (result.error || 'Unknown error'));"
);

// Replace appendAiMessage in startRecording error path
chatCode = chatCode.replace(
  /      appendAiMessage\(`⚠️ Microphone access denied: \$\{err\.message\}`\);/g,
  "      window.chatSync.appendAiMsg('\\u26A0\\uFE0F Microphone access denied: ' + err.message);"
);

// Now replace the local appendAiMessage function to use chatSync
chatCode = chatCode.replace(
  /  function appendAiMessage\(text\) \{[\s\S]*?^\  \}/m,
  `  function appendAiMessage(text) {
    window.chatSync.appendAiMsg(text);
  }`
);

// Replace local formatMarkdown and escHtml to use chatSync versions
// But keep them for appendProactiveMessage
chatCode = chatCode.replace(
  /  function formatMarkdown\(text\) \{[\s\S]*?^\  \}/m,
  `  function formatMarkdown(text) {
    return window.chatSync.fmtMd(text);
  }`
);

fs.writeFileSync(chatPath, chatCode, 'utf8');
console.log('chat.js patched: ' + fs.statSync(chatPath).size + ' bytes');

// ========== PATCH floating-chat.js ==========
const fcPath = 'D:\\facultymind\\src\\renderer\\js\\floating-chat.js';
let fcCode = fs.readFileSync(fcPath, 'utf8');

// Replace sendMessage render calls to use chatSync
fcCode = fcCode.replace(
  /    appendUserMsg\(displayText\);/g,
  '    window.chatSync.appendUserMsg(displayText);'
);

fcCode = fcCode.replace(
  /    const thinkId = appendThinking\(\);/g,
  '    const thinkId = window.chatSync.appendThinking();'
);

fcCode = fcCode.replace(
  /      removeMsg\(thinkId\);/g,
  '      window.chatSync.removeThinking(thinkId);'
);
fcCode = fcCode.replace(
  /    removeMsg\(thinkId\);/g,
  '    window.chatSync.removeThinking(thinkId);'
);

// Replace AI message rendering in sendMessage
const fcSendStart = fcCode.indexOf('  async function sendMessage()');
const fcSendEnd = fcCode.indexOf('  // -- Rendering');
if (fcSendStart > -1 && fcSendEnd > -1) {
  let fcSendBlock = fcCode.substring(fcSendStart, fcSendEnd);
  fcSendBlock = fcSendBlock.replace(
    /        appendAiMsg\(`⚠️ \$\{result\.error[^)]*\}`, \[\]\);/g,
    "        window.chatSync.appendAiMsg('\\u26A0\\uFE0F ' + (result.error || 'AI unavailable \\u2014 check your API key in Settings.'));"
  );
  fcSendBlock = fcSendBlock.replace(
    /      appendAiMsg\(result\.text, \[\]\);/g,
    '      window.chatSync.appendAiMsg(result.text);'
  );
  fcSendBlock = fcSendBlock.replace(
    /      appendAiMsg\(`⚠️ \$\{err\.message\}`, \[\]\);/g,
    "      window.chatSync.appendAiMsg('\\u26A0\\uFE0F ' + err.message);"
  );
  fcCode = fcCode.substring(0, fcSendStart) + fcSendBlock + fcCode.substring(fcSendEnd);
}

// Keep local appendUserMsg and appendAiMsg for welcome message and proactive
// But the welcome message in init() should also use chatSync
fcCode = fcCode.replace(
  /  function init\(\) \{[\s\S]*?appendAiMsg\(\s*"Hey, I'm \*\*DASH\*\*[^"]*",\s*\[\]\s*\);/,
  `  function init() {
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
      "Hey, I'm **DASH** \\u2014 I'm here across every section of FacultyMind. Drop a file and I'll read it for you."
    );`
);

// Fix receiveProactive to not double-render (since chatSync handles it)
fcCode = fcCode.replace(
  /  function receiveProactive\(text, buttons = \[\]\) \{\n    appendAiMsg\(text, buttons\);/g,
  `  function receiveProactive(text, buttons = []) {
    // Render in floating chat only (proactive is UI-specific with peek behavior)
    appendAiMsgLocal(text, buttons);`
);

// Add local render helper for proactive (doesn't sync since proactive has special UI)
// We need to add appendAiMsgLocal function
const insertBeforeDraggable = '  // -- Draggable';
const localAiMsg = `
  // Local-only AI message render (for proactive with peek behavior)
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

`;
fcCode = fcCode.replace(insertBeforeDraggable, localAiMsg + insertBeforeDraggable);

fs.writeFileSync(fcPath, fcCode, 'utf8');
console.log('floating-chat.js patched: ' + fs.statSync(fcPath).size + ' bytes');

// ========== PATCH app.js showView() ==========
const appPath = 'D:\\facultymind\\src\\renderer\\js\\app.js';
let appCode = fs.readFileSync(appPath, 'utf8');

// Add floating chat visibility toggle in showView()
const showViewOld = `  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === name);
  });

  // Log module navigation for Cortex activity tracking
  if (window.api && window.api.cortex) {
    window.api.cortex.log('module_visit', name, { view: name });
  }
}`;

const showViewNew = `  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === name);
  });

  // Toggle floating chat bubble: hidden on DASH AI view, visible on all others
  const fcRoot = document.getElementById('fc-root');
  if (fcRoot) {
    if (name === 'chat') {
      // Close floating panel if open, then hide bubble
      const fcPanel = document.getElementById('fc-panel');
      const fcBubble = document.getElementById('fc-bubble');
      if (fcPanel) fcPanel.classList.add('hidden');
      if (fcBubble) fcBubble.classList.remove('fc-open');
      fcRoot.classList.add('hidden');
    } else {
      fcRoot.classList.remove('hidden');
    }
  }

  // Log module navigation for Cortex activity tracking
  if (window.api && window.api.cortex) {
    window.api.cortex.log('module_visit', name, { view: name });
  }
}`;

appCode = appCode.replace(showViewOld, showViewNew);

fs.writeFileSync(appPath, appCode, 'utf8');
console.log('app.js patched: ' + fs.statSync(appPath).size + ' bytes');

// ========== PATCH main.css ==========
const cssPath = 'D:\\facultymind\\src\\renderer\\styles\\main.css';
let cssCode = fs.readFileSync(cssPath, 'utf8');

// Add #fc-root.hidden rule after the existing .hidden rule
if (!cssCode.includes('#fc-root.hidden')) {
  cssCode = cssCode.replace(
    /\.hidden \{ display: none !important; \}\n#screen-onboarding\.hidden,/,
    `.hidden { display: none !important; }
#fc-root.hidden { display: none !important; }
#screen-onboarding.hidden,`
  );
  fs.writeFileSync(cssPath, cssCode, 'utf8');
  console.log('main.css patched: ' + fs.statSync(cssPath).size + ' bytes');
} else {
  console.log('main.css already has #fc-root.hidden rule');
}

console.log('All patches applied!');
