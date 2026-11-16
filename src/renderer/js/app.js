/**
 * app.js — Main renderer entry point
 * Orchestrates: screen routing, sidebar nav, init sequence
 */

'use strict';

// ─── Screen & View Routing ────────────────────────────────────────────────────

// ─── Theme Toggle (read before render to prevent flash) ───────────────────────
(function initTheme() {
  const saved = localStorage.getItem('fm-theme');
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
})();

const screens = {
  onboarding: document.getElementById('screen-onboarding'),
  pinLock:    document.getElementById('screen-pin-lock'),
  main:       document.getElementById('screen-main'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  if (screens[name]) screens[name].classList.remove('hidden');
}

let _viewTransitioning = false;

function showView(name) {
  const currentView = document.querySelector('.view:not(.hidden)');
  const nextView = document.getElementById(`view-${name}`);
  if (!nextView) return;

  // If same view or mid-transition, do nothing
  if (currentView === nextView) return;
  if (_viewTransitioning) {
    // Force-complete: hide all, show target immediately
    document.querySelectorAll('.view').forEach(v => {
      v.classList.add('hidden');
      v.classList.remove('page-enter', 'page-exit');
    });
    nextView.classList.remove('hidden');
    _viewTransitioning = false;
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === name);
    });
    return;
  }

  _viewTransitioning = true;

  // Animate out current view
  if (currentView && currentView !== nextView) {
    currentView.classList.add('page-exit');
    currentView.addEventListener('animationend', function onOut() {
      currentView.removeEventListener('animationend', onOut);
      currentView.classList.add('hidden');
      currentView.classList.remove('page-exit');
    }, { once: true });
  } else {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  }

  // Animate in next view (slight delay to let exit start)
  setTimeout(() => {
    nextView.classList.remove('hidden');
    nextView.classList.add('page-enter');
    nextView.addEventListener('animationend', function onIn() {
      nextView.removeEventListener('animationend', onIn);
      nextView.classList.remove('page-enter');
      _viewTransitioning = false;
      // Trigger fadeUp cleanup on cards
      nextView.querySelectorAll('.animate-fadeUp').forEach(el => {
        el.addEventListener('animationend', function onFade() {
          el.removeEventListener('animationend', onFade);
          el.classList.add('animated');
        }, { once: true });
      });
    }, { once: true });
  }, 20);

  document.querySelectorAll('.nav-item').forEach(item => {
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
}

// ─── Window Controls ──────────────────────────────────────────────────────────

document.getElementById('btn-minimize').addEventListener('click', () => window.api.window.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.window.maximize());
document.getElementById('btn-close').addEventListener('click',    () => window.api.window.close());

// ─── Sidebar Navigation ───────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (!item.dataset.view) return; // skip non-nav items like theme toggle
    showView(item.dataset.view);
    if (item.dataset.view === 'diu-portal') initDiuPortal();
  });
});

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>';
const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';

const themeBtn = document.getElementById('btn-theme-toggle');
if (themeBtn) {
  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const html = document.documentElement;
    html.classList.add('theme-transitioning');
    const isLight = html.getAttribute('data-theme') === 'light';
    if (isLight) {
      html.removeAttribute('data-theme');
      localStorage.setItem('fm-theme', 'dark');
      themeBtn.querySelector('.nav-icon').innerHTML = MOON_SVG;
    } else {
      html.setAttribute('data-theme', 'light');
      localStorage.setItem('fm-theme', 'light');
      themeBtn.querySelector('.nav-icon').innerHTML = SUN_SVG;
    }
    setTimeout(() => html.classList.remove('theme-transitioning'), 300);
  });
  // Set correct icon on load
  if (localStorage.getItem('fm-theme') === 'light') {
    themeBtn.querySelector('.nav-icon').innerHTML = SUN_SVG;
  }
}

// ─── Activity — reset session timer on any interaction ───────────────────────

document.addEventListener('mousemove', () => window.api.auth.resetSessionTimer());
document.addEventListener('keydown',   () => window.api.auth.resetSessionTimer());

// Poll session state every 30s — if timed out, show PIN lock
setInterval(async () => {
  try {
    const { active } = await window.api.auth.session();
    if (!active) {
      const first = await window.api.auth.isFirstLaunch();
      if (!first) {
        if (!window.__pinLockInited) {
          window.__pinLockInited = true;
          initPinLock(() => {
            showScreen('main');
          });
        }
        showScreen('pinLock');
      }
    }
  } catch (e) {
    console.error('[session poll]', e);
  }
}, 30_000);

// ─── Renderer error logging ──────────────────────────────────────────────────
window.addEventListener('error', (e) => {
  try { window.api?.cortex?.log('renderer_error', 'app', { message: e.message, source: e.filename, line: e.lineno }); } catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
  try { window.api?.cortex?.log('renderer_error', 'app', { message: String(e.reason) }); } catch (_) {}
});

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init() {
  const isFirst = await window.api.auth.isFirstLaunch();

  if (isFirst) {
    showScreen('onboarding');
    initOnboarding();
    return;
  }

  showScreen('pinLock');
  window.__pinLockInited = true;
  initPinLock(() => {
    showScreen('main');
    initMainApp();
  });
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

function initOnboarding() {
  const pinStep  = document.getElementById('onboard-step-pin');
  const keysStep = document.getElementById('onboard-step-keys');

  // PIN input auto-advance
  setupPinInputs('pin-create-inputs', () => {
    const nextGroup = document.getElementById('pin-confirm-inputs');
    if (nextGroup) nextGroup.querySelector('.pin-digit').focus();
  });
  setupPinInputs('pin-confirm-inputs', () => {
    document.getElementById('btn-setup-pin').focus();
  });

  document.getElementById('btn-setup-pin').addEventListener('click', async () => {
    const pin1 = getPinValue('pin-create-inputs');
    const pin2 = getPinValue('pin-confirm-inputs');
    const err  = document.getElementById('onboard-pin-error');

    if (pin1.length < 4) { showError(err, 'PIN must be at least 4 digits'); return; }
    if (pin1 !== pin2)   { showError(err, 'PINs do not match'); return; }

    const result = await window.api.auth.setupPin(pin1);
    if (!result.ok) { showError(err, result.error || 'Failed to set PIN'); return; }

    err.classList.add('hidden');
    pinStep.classList.add('hidden');
    keysStep.classList.remove('hidden');
  });

  document.getElementById('btn-save-keys').addEventListener('click', async () => {
    const claudeKey = document.getElementById('key-claude').value.trim();
    const openaiKey = document.getElementById('key-openai').value.trim();
    const geminiKey = document.getElementById('key-gemini').value.trim();
    const err       = document.getElementById('onboard-key-error');

    if (!claudeKey) { showError(err, 'Claude API key is required to use AI features'); return; }

    // Format validation (QA-005)
    if (claudeKey && !claudeKey.startsWith('sk-ant-')) {
      showError(err, 'Claude key should start with “sk-ant-” — check console.anthropic.com'); return;
    }
    if (openaiKey && !openaiKey.startsWith('sk-')) {
      showError(err, 'OpenAI key should start with “sk-” — check platform.openai.com'); return;
    }
    if (geminiKey && !geminiKey.startsWith('AIza')) {
      showError(err, 'Gemini key should start with “AIza” — check aistudio.google.com'); return;
    }

    err.classList.add('hidden');
    if (claudeKey) await window.api.keys.save('claude', claudeKey);
    if (openaiKey) await window.api.keys.save('openai', openaiKey);
    if (geminiKey) await window.api.keys.save('gemini', geminiKey);

    showScreen('main');
    initMainApp();
  });

  document.getElementById('btn-skip-keys').addEventListener('click', () => {
    showScreen('main');
    initMainApp();
  });
}

// ─── PIN Lock ─────────────────────────────────────────────────────────────────

function initPinLock(onSuccess) {
  setupPinInputs('pin-lock-inputs', async () => {
    const pin    = getPinValue('pin-lock-inputs');
    const err    = document.getElementById('pin-lock-error');
    const result = await window.api.auth.verifyPin(pin);
    if (result.ok) {
      err.classList.add('hidden');
      onSuccess();
    } else {
      // Shows specific lockout message or generic wrong-PIN message
      showError(err, result.error || 'Incorrect PIN');
      clearPinInputs('pin-lock-inputs');
    }
  });
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function initMainApp() {
  showView('chat');
  initChat();
  initSettings();
  loadModelBadge();

  if (window.api && window.api.ai.onNavigate) {
    window.api.ai.onNavigate((route) => {
      showView(route);
    });
  }
}

// ─── PIN Input Helpers ────────────────────────────────────────────────────────

function setupPinInputs(containerId, onComplete) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('.pin-digit'));

  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(-1);
      input.classList.toggle('filled', !!input.value);
      if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
      if (i === inputs.length - 1 && input.value && onComplete) onComplete();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus();
    });
  });

  // Auto-focus first input
  inputs[0]?.focus();
}

function getPinValue(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return '';
  return Array.from(container.querySelectorAll('.pin-digit'))
    .map(i => i.value).join('');
}

function clearPinInputs(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('.pin-digit'));
  inputs.forEach(i => { i.value = ''; i.classList.remove('filled'); });
  inputs[0]?.focus();
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ─── Model badge ──────────────────────────────────────────────────────────────

async function loadModelBadge() {
  const model = await window.api.ai.getActiveModel();
  const badge = document.getElementById('model-badge');
  if (badge) {
    const displayMap = { 
      claude: 'Claude', 
      gpt4o: 'GPT-4o', 
      gemini: 'Gemini', 
      openrouter: 'OpenRouter',
      ollama: 'Local AI'
    };
    const displayName = displayMap[model] || model;
    badge.innerHTML = `<span class="status-dot"></span>${displayName}`;
  }
}

// ─── Load external modules ────────────────────────────────────────────────────

function initChat() {
  if (typeof ChatModule !== 'undefined') ChatModule.init();
}

function initSettings() {
  if (typeof SettingsModule !== 'undefined') SettingsModule.init();
}

// ─── PIN Change (QA-011) ─────────────────────────────────────────────────────

function openChangePinModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.id = 'modal-change-pin';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>Change PIN</h3>
      <p style="color:var(--text-dim);font-size:13px;margin-bottom:8px">
        Enter your current PIN to continue.
      </p>
      <div class="form-row">
        <label>Current PIN</label>
        <div class="pin-inputs" id="change-pin-current"></div>
      </div>
      <div class="form-row">
        <label>New PIN</label>
        <div class="pin-inputs" id="change-pin-new"></div>
      </div>
      <div class="form-row">
        <label>Confirm New PIN</label>
        <div class="pin-inputs" id="change-pin-confirm"></div>
      </div>
      <div id="change-pin-error" class="error-msg hidden"></div>
      <div class="modal-actions">
        <button class="btn-ghost"   id="change-pin-cancel">Cancel</button>
        <button class="btn-primary" id="change-pin-save">Change PIN</button>
      </div>
    </div>
  `;

  // Build 4-digit PIN inputs
  ['change-pin-current','change-pin-new','change-pin-confirm'].forEach(id => {
    const wrap = overlay.querySelector(`#${id}`);
    for (let i = 0; i < 4; i++) {
      const inp = document.createElement('input');
      inp.type = 'password';
      inp.maxLength = 1;
      inp.inputMode = 'numeric';
      inp.className = 'pin-digit';
      inp.style.userSelect = 'text';
      wrap.appendChild(inp);
    }
  });
  
  setupPinInputs('change-pin-current', () => {
    overlay.querySelector('#change-pin-new .pin-digit').focus();
  });
  setupPinInputs('change-pin-new', () => {
    overlay.querySelector('#change-pin-confirm .pin-digit').focus();
  });
  setupPinInputs('change-pin-confirm', () => {
    overlay.querySelector('#change-pin-save').focus();
  });

  document.body.appendChild(overlay);
  overlay.querySelector('#change-pin-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#change-pin-save').addEventListener('click', async () => {
    const errEl   = overlay.querySelector('#change-pin-error');
    const current = Array.from(overlay.querySelectorAll('#change-pin-current .pin-digit')).map(i => i.value).join('');
    const newPin  = Array.from(overlay.querySelectorAll('#change-pin-new .pin-digit')).map(i => i.value).join('');
    const confirm = Array.from(overlay.querySelectorAll('#change-pin-confirm .pin-digit')).map(i => i.value).join('');

    if (current.length < 4) { showError(errEl, 'Enter your current 4-digit PIN'); return; }
    if (newPin.length  < 4) { showError(errEl, 'New PIN must be at least 4 digits'); return; }
    if (newPin !== confirm) { showError(errEl, 'New PINs do not match'); return; }

    // Verify current PIN first
    const check = await window.api.auth.verifyPin(current);
    if (!check.ok) { showError(errEl, check.error || 'Current PIN is incorrect'); return; }

    // Set new PIN (main checks the current PIN again — BUG-A3)
    const result = await window.api.auth.setupPin(newPin, current);
    if (!result.ok) { showError(errEl, result.error || 'Failed to change PIN'); return; }

    overlay.remove();
  });
}

// Expose for settings panel to call
window.openChangePinModal = openChangePinModal;

// ─── Global Smart Drop Zone ───────────────────────────────────────────────

function setupGlobalDropZone() {
  const overlay = document.getElementById('global-drop-overlay');
  if (!overlay) return;

  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter++;
      overlay.classList.remove('hidden');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault(); // necessary to allow dropping
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      overlay.classList.add('hidden');
    }
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.add('hidden');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      try {
        const buffer = await file.arrayBuffer();
        
        // Show loading indicator
        document.getElementById('dash-global-loading')?.classList.remove('hidden');
        
        const res = await window.api.ai.smartRoute(buffer, file.type, file.name);
        if (res.ok) {
          // Navigation is handled by the backend sending an IPC event back to the frontend
          // or we can handle it here based on response category
        } else {
          alert('Smart Route failed: ' + res.error);
        }
      } catch (err) {
        console.error(err);
      } finally {
        document.getElementById('dash-global-loading')?.classList.add('hidden');
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Boot 
// ══════════════════════════════════════════════════════════════════════════

init().then(() => {
  setupGlobalDropZone();
}).catch(console.error);
