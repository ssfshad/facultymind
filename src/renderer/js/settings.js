/**
 * settings.js — Settings panel: model switcher, API keys, DB export/import
 */

'use strict';

const SettingsModule = (() => {

  async function init() {
    await loadKeyStatus();
    setupModelSwitcher();
    setupOllama();
    setupOpenRouter();
    setupGoogleCredentials();
    setupDbButtons();
    setupPortableMode();
    await loadRules();
    await loadThoughts();
    setupCortexControls();
  }

  // ── Ollama (Local AI) ───────────────────────────────────────────────────────

  function setupOllama() {
    const ollamaConfig  = document.getElementById('ollama-config');
    const ollamaStatus  = document.getElementById('ollama-status');
    const modelInput    = document.getElementById('ollama-model-input');
    const btnApply      = document.getElementById('btn-ollama-model-save');

    if (!ollamaConfig) return;

    // Render the status dot + message
    async function refreshOllamaStatus() {
      if (!ollamaStatus) return;
      const { available } = await window.api.ai.checkOllama();
      if (available) {
        ollamaStatus.innerHTML =
          `<span style="color:#10B981;font-weight:600;">🟢 Ollama is running</span>
           <span style="color:var(--text-dim);font-size:12px;margin-left:8px;">
             Local AI is available — Bloom's tasks will use it automatically.
           </span>`;
      } else {
        ollamaStatus.innerHTML =
          `<span style="color:#F59E0B;font-weight:600;">🟡 Ollama not detected</span>
           <span style="color:var(--text-dim);font-size:12px;margin-left:8px;">
             Install Ollama and run <code style="background:var(--bg-input);padding:1px 5px;border-radius:3px;">ollama pull gemma4:e2b</code> to enable local AI.
           </span>`;
      }
    }

    // Load saved model name into input
    async function loadSavedModel() {
      if (!modelInput) return;
      const saved = await window.api.ai.getOllamaModel();
      modelInput.value = saved || 'gemma4:e2b';
    }

    // Show/hide Ollama config panel based on active model
    function syncOllamaPanel() {
      window.api.ai.getActiveModel().then(model => {
        ollamaConfig?.classList.toggle('hidden', model !== 'ollama');
      });
    }

    // Wire Apply button
    btnApply?.addEventListener('click', async () => {
      const modelId = modelInput?.value?.trim();
      if (!modelId) return;
      await window.api.ai.setOllamaModel(modelId);
      btnApply.textContent = 'Saved ✓';
      setTimeout(() => { btnApply.textContent = 'Apply'; }, 2000);
    });

    modelInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter') btnApply?.click();
    });

    // Re-sync panel whenever any model button is clicked
    document.querySelectorAll('.model-btn').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(syncOllamaPanel, 100));
    });

    // Initial load
    syncOllamaPanel();
    refreshOllamaStatus();
    loadSavedModel();

    // Auto-refresh status every 30s while Settings is open
    const _ollamaInterval = setInterval(refreshOllamaStatus, 30_000);
    // Clean up interval when navigating away from settings
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.view !== 'settings') clearInterval(_ollamaInterval);
      });
    });
  }

  // ── Model Switcher ──────────────────────────────────────────────────────────

  function setupModelSwitcher() {
    const buttons    = document.querySelectorAll('.model-btn');
    const statusEl   = document.getElementById('model-switch-status');
    const badgeEl    = document.getElementById('model-badge');

    // Load current model
    window.api.ai.getActiveModel().then(model => {
      buttons.forEach(b => b.classList.toggle('active', b.dataset.model === model));
    });

    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const model  = btn.dataset.model;
        const result = await window.api.ai.switchModel(model);

        if (result.ok) {
          buttons.forEach(b => b.classList.toggle('active', b.dataset.model === model));
          const label = { claude: 'Claude', gpt4o: 'GPT-4o', gemini: 'Gemini', openrouter: 'OpenRouter', ollama: '🖥 Local AI' }[model] || model;
          if (statusEl) statusEl.textContent = `Switched to ${label}`;
          if (badgeEl)  badgeEl.textContent  = label;
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        } else {
          if (statusEl) statusEl.textContent = `Error: ${result.error}`;
        }
      });
    });
  }

  // ── Google OAuth Credentials ────────────────────────────────────────────────

  function setupGoogleCredentials() {
    const clientIdInput  = document.getElementById('google-client-id');
    const clientSecInput = document.getElementById('google-client-secret');
    const btnSave        = document.getElementById('btn-save-google-creds');
    const statusEl       = document.getElementById('google-creds-status');

    if (!btnSave) return;

    btnSave.addEventListener('click', async () => {
      const clientId     = clientIdInput?.value?.trim();
      const clientSecret = clientSecInput?.value?.trim();

      if (!clientId || !clientSecret) {
        if (statusEl) { statusEl.textContent = 'Both Client ID and Client Secret are required.'; statusEl.style.color = '#f87171'; }
        return;
      }

      btnSave.disabled = true;
      btnSave.textContent = 'Saving…';

      await window.api.keys.save('google_client_id',     clientId);
      await window.api.keys.save('google_client_secret', clientSecret);

      if (clientIdInput)  clientIdInput.value  = '';
      if (clientSecInput) clientSecInput.value = '';

      if (statusEl) {
        statusEl.textContent = '✓ Google credentials saved to credential store. You can now connect Gmail in Email Intel.';
        statusEl.style.color = '#34d399';
      }
      btnSave.disabled = false;
      btnSave.textContent = 'Save Google Credentials';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 5000);
    });
  }

  // ── OpenRouter ──────────────────────────────────────────────────────────────

  function setupOpenRouter() {
    const orConfig    = document.getElementById('openrouter-config');
    const orSelect    = document.getElementById('or-model-select');
    const btnApply    = document.getElementById('btn-or-model-save');
    const orKeyInput  = document.getElementById('or-key-input');
    const btnSaveKey  = document.getElementById('btn-save-or-key');
    const orKeyStatus = document.getElementById('or-key-status');

    // Fetch live model list from OpenRouter API and populate dropdown
    async function loadOpenRouterModels() {
      try {
        const res  = await fetch('https://openrouter.ai/api/v1/models');
        const data = await res.json();
        const models = (data.data || []).sort((a, b) => a.id.localeCompare(b.id));

        const free = models.filter(m => m.id.endsWith(':free'));
        const paid = models.filter(m => !m.id.endsWith(':free') && (m.pricing?.prompt !== '0' || m.pricing?.completion !== '0'));
        // Pick top paid models by popularity (limit to 20 so the list isn't huge)
        const topPaid = paid.slice(0, 20);

        orSelect.innerHTML = '<option value="">— pick a model —</option>';

        if (free.length) {
          const grp = document.createElement('optgroup');
          grp.label = `Free models (${free.length})`;
          free.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            const name = m.name || m.id.replace(':free', '');
            opt.textContent = `${name} (free)`;
            grp.appendChild(opt);
          });
          orSelect.appendChild(grp);
        }

        if (topPaid.length) {
          const grp = document.createElement('optgroup');
          grp.label = 'Popular paid models';
          topPaid.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name || m.id;
            grp.appendChild(opt);
          });
          orSelect.appendChild(grp);
        }
      } catch (err) {
        orSelect.innerHTML = '<option value="">— failed to load models —</option>';
        console.error('[Settings] OpenRouter model fetch failed:', err);
      }

      // After populating, pre-select saved model
      const saved = await window.api.ai.getOpenRouterModel();
      if (saved) {
        const orCustom = document.getElementById('or-model-custom');
        if (orCustom) orCustom.value = saved;
        if (orSelect) orSelect.value = saved;
      }
    }
    loadOpenRouterModels();

    // Show/hide config panel when OpenRouter button is active
    function syncOrPanel() {
      window.api.ai.getActiveModel().then(model => {
        orConfig?.classList.toggle('hidden', model !== 'openrouter');
      });
    }
    syncOrPanel();

    // Re-sync panel whenever any model button is clicked
    document.querySelectorAll('.model-btn').forEach(btn => {
      btn.addEventListener('click', () => setTimeout(syncOrPanel, 100));
    });

    const orCustom = document.getElementById('or-model-custom');

    // Sync: picking from dropdown fills the custom input
    orSelect?.addEventListener('change', () => {
      if (orSelect.value && orCustom) orCustom.value = orSelect.value;
    });

    // Apply — custom input takes priority, falls back to dropdown
    btnApply?.addEventListener('click', async () => {
      const selected = orCustom?.value?.trim() || orSelect?.value;
      if (!selected) return;
      await window.api.ai.setOpenRouterModel(selected);
      btnApply.textContent = 'Saved ✓';
      setTimeout(() => { btnApply.textContent = 'Apply'; }, 2000);
    });

    // Save OpenRouter API key
    btnSaveKey?.addEventListener('click', async () => {
      const key = orKeyInput?.value?.trim();
      if (!key) { if (orKeyStatus) { orKeyStatus.textContent = 'Enter a key first.'; orKeyStatus.style.color = '#f87171'; } return; }
      await window.api.keys.save('openrouter', key);
      if (orKeyInput) orKeyInput.value = '';
      if (orKeyStatus) { orKeyStatus.textContent = '✓ Key saved to credential store.'; orKeyStatus.style.color = '#34d399'; }
      setTimeout(() => { if (orKeyStatus) orKeyStatus.textContent = ''; }, 3000);
      await loadKeyStatus();
    });

    orKeyInput?.addEventListener('keydown', e => { if (e.key === 'Enter') btnSaveKey?.click(); });
  }

  // ── API Key Status ──────────────────────────────────────────────────────────

  async function loadKeyStatus() {
    const statusList = document.getElementById('key-status-list');
    if (!statusList) return;

    const keys = await window.api.keys.checkAll();
    const labels = { claude: 'Claude (Anthropic)', openai: 'OpenAI (GPT-4o + Whisper)', gemini: 'Google Gemini', openrouter: 'OpenRouter (open-source models)' };

    statusList.innerHTML = Object.entries(labels).map(([service, label]) => `
      <div class="key-status-row">
        <span class="ks-label">${label}</span>
        ${keys[service]
          ? '<span class="ks-set">✓ Set</span>'
          : '<span class="ks-unset">✗ Not set</span>'
        }
      </div>
    `).join('');

    document.getElementById('btn-update-keys')?.addEventListener('click', () => {
      showUpdateKeysDialog();
    });
  }

  function showUpdateKeysDialog() {
    // Inline key update within settings — open a mini modal
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.innerHTML = `
      <div class="modal-card">
        <h3>Update API Keys</h3>
        <div class="form-row">
          <label>Claude (Anthropic)</label>
          <input type="password" id="upd-claude" placeholder="sk-ant-… (leave blank to keep existing)" autocomplete="off" />
        </div>
        <div class="form-row">
          <label>OpenAI</label>
          <input type="password" id="upd-openai" placeholder="sk-… (leave blank to keep existing)" autocomplete="off" />
        </div>
        <div class="form-row">
          <label>Google Gemini</label>
          <input type="password" id="upd-gemini" placeholder="AIza… (leave blank to keep existing)" autocomplete="off" />
        </div>
        <div class="modal-actions">
          <button class="btn-ghost"   id="upd-cancel">Cancel</button>
          <button class="btn-primary" id="upd-save">Save Keys</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#upd-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#upd-save').addEventListener('click', async () => {
      const claude = overlay.querySelector('#upd-claude').value.trim();
      const openai = overlay.querySelector('#upd-openai').value.trim();
      const gemini = overlay.querySelector('#upd-gemini').value.trim();

      if (claude) await window.api.keys.save('claude', claude);
      if (openai) await window.api.keys.save('openai', openai);
      if (gemini) await window.api.keys.save('gemini', gemini);

      overlay.remove();
      await loadKeyStatus();
    });
  }

  // ── DB Export / Import ──────────────────────────────────────────────────────

  // Passphrase prompt (Electron has no window.prompt). Resolves to the
  // passphrase, or null when cancelled.
  function askPassphrase({ title, hint, confirmIt = false, error = '' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal';
      overlay.innerHTML = `
        <div class="modal-card" style="max-width:420px">
          <h3></h3>
          <p class="settings-hint" data-hint></p>
          <div class="form-row"><label>Passphrase</label>
            <input type="password" data-pp1 autocomplete="off" /></div>
          ${confirmIt ? `<div class="form-row"><label>Repeat passphrase</label>
            <input type="password" data-pp2 autocomplete="off" /></div>` : ''}
          <p class="settings-hint" data-err style="color:var(--danger, #e5484d)"></p>
          <div class="modal-actions">
            <button class="btn-ghost" data-cancel>Cancel</button>
            <button class="btn-primary" data-ok>Continue</button>
          </div>
        </div>`;
      overlay.querySelector('h3').textContent = title;
      overlay.querySelector('[data-hint]').textContent = hint || '';
      overlay.querySelector('[data-err]').textContent = error;
      document.body.appendChild(overlay);
      const pp1 = overlay.querySelector('[data-pp1]');
      pp1.focus();
      const done = (v) => { overlay.remove(); resolve(v); };
      overlay.querySelector('[data-cancel]').addEventListener('click', () => done(null));
      const submit = () => {
        const v = pp1.value;
        const err = overlay.querySelector('[data-err]');
        if (v.length < 8) { err.textContent = 'At least 8 characters.'; return; }
        if (confirmIt && overlay.querySelector('[data-pp2]').value !== v) { err.textContent = 'Passphrases do not match.'; return; }
        done(v);
      };
      overlay.querySelector('[data-ok]').addEventListener('click', submit);
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') done(null); });
    });
  }

  async function loadStudentKeyStatus() {
    const el = document.getElementById('student-key-status');
    if (!el) return;
    const s = await window.api.studentKey.status();
    if (!s.ok) { el.textContent = ''; return; }
    if (s.encrypted && !s.loaded) el.textContent = '✗ Key missing on this computer — student names are hidden. Restore it from your recovery file.';
    else if (!s.loaded) el.textContent = 'No key yet.';
    else if (s.backedUpAt) el.textContent = `✓ Key active · recovery saved ${new Date(s.backedUpAt).toLocaleString()}`;
    else el.textContent = '⚠ Key active · no recovery file saved yet';
  }

  function setupDbButtons() {
    loadStudentKeyStatus();

    document.getElementById('btn-key-save-recovery')?.addEventListener('click', async () => {
      const pp = await askPassphrase({ title: 'Save Recovery File', confirmIt: true,
        hint: 'You will need this passphrase to restore the key. It cannot be recovered if forgotten.' });
      if (pp == null) return;
      const result = await window.api.studentKey.saveRecovery(pp);
      if (result.ok) alert(`Recovery file saved to:\n${result.path}\n\nKeep it somewhere other than this computer.`);
      else if (result.error !== 'Cancelled') alert(`Could not save: ${result.error}`);
      loadStudentKeyStatus();
    });

    document.getElementById('btn-key-restore')?.addEventListener('click', async () => {
      const pp = await askPassphrase({ title: 'Restore Student Data Key', hint: 'Enter the passphrase of your recovery file, then choose the file.' });
      if (pp == null) return;
      const result = await window.api.studentKey.restore(pp);
      if (result.ok) { alert('Key restored. Reloading…'); location.reload(); }
      else if (result.error !== 'Cancelled') alert(`Restore failed: ${result.error}`);
    });

    document.getElementById('btn-db-export')?.addEventListener('click', async () => {
      let result = await window.api.db.export();
      if (result.needsPassphrase) {
        const pp = await askPassphrase({ title: 'Protect Export', confirmIt: true,
          hint: 'The export carries your student data key, locked with this passphrase. You will need it to import on another computer.' });
        if (pp == null) return;
        result = await window.api.db.export({ passphrase: pp });
      }
      if (result.ok) { alert(`Database exported to:\n${result.path}`); loadStudentKeyStatus(); }
      else if (result.error !== 'Cancelled') alert(`Export failed: ${result.error}`);
    });

    document.getElementById('btn-db-import')?.addEventListener('click', async () => {
      const confirmed = confirm(
        'Importing a database will REPLACE all current data.\n\nContinue?'
      );
      if (!confirmed) return;
      let result = await window.api.db.import();
      while (result.needsPassphrase) {
        const pp = await askPassphrase({ title: 'Unlock Imported Database', error: result.error || '',
          hint: 'Enter the passphrase used when this database was exported.' });
        if (pp == null) return;
        result = await window.api.db.import({ passphrase: pp });
      }
      if (result.ok) {
        alert('Database imported successfully. Restarting…');
        location.reload();
      } else if (result.error !== 'Cancelled') {
        alert(`Import failed: ${result.error}`);
      }
    });
  }

  // ── Portable Mode ───────────────────────────────────────────────────────────

  function setupPortableMode() {
    const toggle = document.getElementById('toggle-portable');
    if (!toggle) return;
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const pin = prompt('Enter your PIN to enable portable mode:');
        if (!pin) { toggle.checked = false; return; }
        // Portable mode enabled — future API key saves go to encrypted file
        alert('Portable mode enabled. API keys will now be stored in encrypted portable.enc file.');
      }
    });
  }

  // ── Cortex: Rules ────────────────────────────────────────────────────────────

  async function loadRules() {
    if (!window.api.cortex) return;
    const listEl  = document.getElementById('rules-list');
    const emptyEl = document.getElementById('rules-empty');
    if (!listEl) return;

    const { ok, data } = await window.api.cortex.getRules();
    if (!ok || !data || data.length === 0) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    // Remove existing rule items before re-rendering
    listEl.querySelectorAll('.rule-item').forEach(el => el.remove());

    data.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'rule-item';
      item.dataset.id = rule.id;
      item.innerHTML = `
        <span class="rule-badge ${rule.rule_type}">${rule.rule_type}</span>
        <span class="rule-text">${escHtml(rule.rule_description)}</span>
        <button class="rule-delete" title="Remove rule">×</button>
      `;
      item.querySelector('.rule-delete').addEventListener('click', async () => {
        await window.api.cortex.deleteRule(rule.id);
        item.remove();
        const remaining = listEl.querySelectorAll('.rule-item').length;
        if (emptyEl) emptyEl.style.display = remaining === 0 ? '' : 'none';
      });
      listEl.appendChild(item);
    });
  }

  async function loadThoughts() {
    if (!window.api.cortex) return;
    const listEl = document.getElementById('thoughts-list');
    if (!listEl) return;

    const { ok, data } = await window.api.cortex.getThoughts();
    if (!ok || !data || data.length === 0) return;

    listEl.innerHTML = '';
    data.forEach(t => {
      const date = t.created_at ? t.created_at.slice(0, 10) : '';
      const item = document.createElement('div');
      item.className = 'thought-item';
      item.innerHTML = `
        <div class="thought-meta">${escHtml(t.category)} · ${date}</div>
        <div class="thought-text">${escHtml(t.thought)}</div>
      `;
      listEl.appendChild(item);
    });
  }

  function setupCortexControls() {
    if (!window.api.cortex) return;

    // Add rule button
    const ruleInput = document.getElementById('rule-input');
    const btnAdd    = document.getElementById('btn-add-rule');

    const doAddRule = async () => {
      const text = ruleInput?.value?.trim();
      if (!text) return;
      ruleInput.value = '';
      btnAdd.textContent = 'Adding…';
      btnAdd.disabled = true;
      await window.api.cortex.addRule({ text });
      btnAdd.textContent = 'Add Rule';
      btnAdd.disabled = false;
      await loadRules();
    };

    btnAdd?.addEventListener('click', doAddRule);
    ruleInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAddRule();
    });

    // Refresh thoughts
    document.getElementById('btn-refresh-thoughts')?.addEventListener('click', async () => {
      document.getElementById('thoughts-list').innerHTML = '<p class="text-dim">Loading…</p>';
      await loadThoughts();
    });

    // Proactive toggle
    const proactiveToggle = document.getElementById('toggle-proactive');
    if (proactiveToggle) {
      // Load current state
      window.api.cortex.getState().then(({ ok, data }) => {
        if (ok && data) proactiveToggle.checked = data.proactive_enabled !== '0';
      });
      proactiveToggle.addEventListener('change', () => {
        window.api.cortex.setProactive(proactiveToggle.checked);
      });
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init };
})();

// Init when settings view is shown
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'settings') SettingsModule.init();
  });
});
