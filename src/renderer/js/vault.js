/**
 * vault.js — Stashboard-style Local Vault
 * Full port: sidebar nav, stats strip, item cards with hover actions,
 * inline password reveal, copy-with-countdown, Ctrl+K search, lock, vault location.
 */

'use strict';

const VaultModule = (() => {

  let items = [];
  let currentFilter = 'all';
  let _initialized = false;

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!_initialized) {
      setupListeners();
      setupDragDrop();
      _initialized = true;
    }
    loadItems();
  }

  // ── Listeners ─────────────────────────────────────────────────────────────

  function setupListeners() {
    // Nav filters (sidebar)
    document.querySelectorAll('[data-vfilter]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-vfilter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.vfilter;

        // Update page title
        const titles = {
          all: '📋 All Items', favorites: '⭐ Favorites',
          password: '🔑 Passwords', note: '📝 Notes', link: '🔗 Links'
        };
        const titleEl = document.getElementById('vault-page-title');
        if (titleEl) titleEl.textContent = titles[currentFilter] || '📋 All Items';

        renderItems();
      });
    });

    // Add item buttons
    document.getElementById('btn-vault-add')?.addEventListener('click', openAddModal);
    document.getElementById('btn-vault-add-empty')?.addEventListener('click', openAddModal);

    // Cancel buttons
    document.getElementById('btn-vault-cancel')?.addEventListener('click', closeAddModal);
    document.getElementById('btn-vault-cancel-2')?.addEventListener('click', closeAddModal);

    // Save
    document.getElementById('btn-vault-save')?.addEventListener('click', handleSaveItem);

    // Type toggle
    document.getElementById('v-type')?.addEventListener('change', e => toggleTypeView(e.target.value));

    // Ctrl+K search overlay
    document.getElementById('btn-vault-search-trigger')?.addEventListener('click', () => {
      document.getElementById('vault-search-overlay').classList.remove('hidden');
      document.getElementById('vault-search-input')?.focus();
    });
    document.getElementById('vault-search-input')?.addEventListener('input', e => {
      renderSearchResults(e.target.value);
    });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'k') {
        const overlay = document.getElementById('vault-search-overlay');
        if (overlay && !document.getElementById('view-vault')?.classList.contains('hidden')) {
          e.preventDefault();
          overlay.classList.toggle('hidden');
          if (!overlay.classList.contains('hidden')) {
            document.getElementById('vault-search-input')?.focus();
          }
        }
      }
      if (e.key === 'Escape') {
        document.getElementById('vault-search-overlay')?.classList.add('hidden');
      }
    });

    // Lock vault button — lock the session and show PIN screen
    document.getElementById('btn-vault-lock')?.addEventListener('click', () => {
      if (confirm('Lock FacultyMind? You will need to re-enter your PIN.')) {
        // Reload the window to hit the PIN lock screen
        window.location.reload();
      }
    });

    // Vault location button
    document.getElementById('btn-vault-open-location')?.addEventListener('click', async () => {
      const modal = document.getElementById('modal-vault-location');
      if (modal) {
        modal.classList.remove('hidden');
        const pathEl = document.getElementById('vault-location-path');
        if (pathEl) {
          if (window.api?.vault?.getPath) {
            const res = await window.api.vault.getPath();
            pathEl.textContent = res?.path || '%APPDATA%\\FacultyMind\\facultymind.db';
          } else {
            pathEl.textContent = '%APPDATA%\\FacultyMind\\facultymind.db';
          }
        }
      }
    });

    // Change vault location button
    document.getElementById('btn-vault-change-location')?.addEventListener('click', async () => {
      const btn     = document.getElementById('btn-vault-change-location');
      const pathEl  = document.getElementById('vault-location-path');
      btn.textContent = '⏳ Choosing...';
      btn.disabled = true;
      try {
        const res = await window.api.vault.changePath();
        if (res.canceled) {
          // user dismissed picker — no change
        } else if (res.ok) {
          if (pathEl) pathEl.textContent = res.path;
          // Show restart notice
          const modal = document.getElementById('modal-vault-location');
          const existing = modal?.querySelector('.vault-restart-notice');
          if (!existing && modal) {
            const notice = document.createElement('div');
            notice.className = 'vault-restart-notice';
            notice.style.cssText = 'margin-top:12px;padding:10px 14px;background:var(--bg-warning,rgba(245,158,11,.15));border:1px solid var(--warning,#f59e0b);border-radius:8px;font-size:13px;color:var(--warning,#f59e0b);';
            notice.innerHTML = '✅ Vault moved. <strong>Restart FacultyMind</strong> to use the new location.';
            modal.querySelector('.modal-body, .modal-content')?.appendChild(notice)
              || modal.appendChild(notice);
          }
        } else {
          alert('Could not change vault location: ' + (res.error || 'Unknown error'));
        }
      } catch(e) {
        alert('Error: ' + e.message);
      }
      btn.textContent = '📁 Change';
      btn.disabled = false;
    });

    // PIN confirm unlock
    document.getElementById('btn-vault-confirm-unlock')?.addEventListener('click', handleConfirmUnlock);
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openAddModal() {
    document.getElementById('v-title').value = '';
    document.getElementById('v-type').value = 'note';
    document.getElementById('v-content').value = '';
    document.getElementById('v-username').value = '';
    document.getElementById('v-password').value = '';
    if (document.getElementById('v-url')) document.getElementById('v-url').value = '';
    document.getElementById('v-favorite').checked = false;
    toggleTypeView('note');
    document.getElementById('modal-vault-add').classList.remove('hidden');
    document.getElementById('v-title').focus();
  }

  function closeAddModal() {
    document.getElementById('modal-vault-add').classList.add('hidden');
  }

  function toggleTypeView(type) {
    const credFields = document.getElementById('v-cred-fields');
    const urlField = document.getElementById('v-url-field');
    credFields?.classList.toggle('hidden', type !== 'password');
    urlField?.classList.toggle('hidden', type !== 'link');
  }

  // ── Load & Stats ──────────────────────────────────────────────────────────

  async function loadItems() {
    if (!window.api?.vault) {
      renderItems();
      return;
    }
    const res = await window.api.vault.get();
    if (res.ok) {
      items = res.data;
    }
    renderItems();
    updateStats();
  }

  function updateStats() {
    const total = items.length;
    const passwords = items.filter(i => i.type === 'password').length;
    const favorites = items.filter(i => i.is_favorite === 1).length;
    const storageBytes = items.reduce((acc, i) => {
      return acc + (i.content_enc?.length || 0) + (i.username_enc?.length || 0) + (i.password_enc?.length || 0);
    }, 0);

    document.getElementById('stat-vault-total').textContent = total;
    document.getElementById('stat-vault-passwords').textContent = passwords;
    document.getElementById('stat-vault-favorites').textContent = favorites;
    document.getElementById('stat-vault-storage').textContent = formatBytes(storageBytes);

    const countEl = document.getElementById('vault-item-count');
    if (countEl) countEl.textContent = total > 0 ? `${total} item${total !== 1 ? 's' : ''}` : '';
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // ── Save Item ─────────────────────────────────────────────────────────────

  async function handleSaveItem() {
    const btn = document.getElementById('btn-vault-save');
    btn.textContent = '⏳ Encrypting...';

    const record = {
      title: document.getElementById('v-title').value.trim(),
      type: document.getElementById('v-type').value,
      content: document.getElementById('v-content').value,
      username: document.getElementById('v-username').value,
      password: document.getElementById('v-password').value,
      url: document.getElementById('v-url')?.value || '',
      favorite: document.getElementById('v-favorite').checked
    };

    if (!record.title) {
      alert('Title is required.');
      btn.textContent = '🔒 Encrypt & Save';
      return;
    }

    if (window.api?.vault) {
      const res = await window.api.vault.save(record);
      if (res.ok) {
        closeAddModal();
        loadItems();
      } else {
        alert('Vault Save Error: ' + res.error);
      }
    } else {
      // Demo mode — just add locally
      items.push({ id: Date.now(), ...record, is_favorite: record.favorite ? 1 : 0 });
      closeAddModal();
      renderItems();
      updateStats();
    }

    btn.textContent = '🔒 Encrypt & Save';
  }

  // ── Render Items Grid ─────────────────────────────────────────────────────

  function renderItems() {
    const grid = document.getElementById('vault-items-grid');
    const empty = document.getElementById('vault-empty-state');
    if (!grid || !empty) return;

    let filtered = items;

    if (currentFilter === 'favorites') {
      filtered = filtered.filter(i => i.is_favorite === 1);
    } else if (currentFilter !== 'all') {
      filtered = filtered.filter(i => i.type === currentFilter);
    }

    // Update count badge
    document.getElementById('vault-item-count').textContent =
      filtered.length > 0 ? `${filtered.length} item${filtered.length !== 1 ? 's' : ''}` : '';

    if (filtered.length === 0) {
      empty.classList.remove('hidden');
      grid.innerHTML = '';
      return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = '';
    filtered.forEach((item, index) => {
      const card = createItemCard(item);
      card.style.animationDelay = `${index * 40}ms`;
      grid.appendChild(card);
    });
  }

  function createItemCard(item) {
    const typeIcons = { link: '🔗', password: '🔑', note: '📝', post: '💬', file: '📎' };
    const icon = typeIcons[item.type] || '📋';
    const isFav = item.is_favorite === 1;

    const div = document.createElement('div');
    div.className = 'vault-item-card animate-fade';
    div.dataset.id = item.id;

    div.innerHTML = `
      <div class="vic-header">
        <span class="vic-type-icon">${icon}</span>
        <h3 class="vic-title">${escHtml(item.title)}</h3>
        <button class="vic-fav-btn ${isFav ? 'active' : ''}" data-action="fav" title="Toggle favorite">
          ${isFav ? '⭐' : '☆'}
        </button>
      </div>

      ${item.type === 'link' && item.url ? `
        <div class="vic-url">${escHtml(item.url)}</div>
      ` : ''}

      ${item.type === 'password' ? `
        <div class="vic-password-row">
          <span class="vic-password-val" id="pwval-${item.id}">••••••••••••</span>
          <div class="vic-password-actions">
            <button class="vic-icon-btn" data-action="reveal" title="Reveal/Hide">👁️</button>
            <button class="vic-icon-btn" data-action="copy-pw" title="Copy password">📋</button>
          </div>
        </div>
        <div class="vic-countdown hidden" id="countdown-${item.id}">
          <div class="vic-countdown-bar" id="countdown-bar-${item.id}"></div>
        </div>
      ` : ''}

      ${item.content ? `
        <p class="vic-content">${escHtml(item.content.substring(0, 120))}${item.content.length > 120 ? '…' : ''}</p>
      ` : ''}

      <div class="vic-footer">
        <span class="vic-category-badge" style="background:${typeBadgeBg(item.type)}; color:${typeBadgeColor(item.type)}">
          ${icon} ${capitalize(item.type)}
        </span>
        <div class="vic-actions">
          <button class="vic-icon-btn" data-action="pin" title="Pin">📌</button>
          <button class="vic-icon-btn" data-action="unlock" title="View Decrypted">🔓</button>
          <button class="vic-icon-btn danger" data-action="delete" title="Delete">🗑️</button>
        </div>
      </div>
    `;

    // Wire up buttons
    div.querySelector('[data-action="fav"]').addEventListener('click', (e) => { e.stopPropagation(); toggleFav(item.id, div); });
    div.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); deleteCard(item.id, div); });
    div.querySelector('[data-action="unlock"]').addEventListener('click', (e) => { e.stopPropagation(); openUnlock(item.id); });

    // Click card body to open — password items require PIN, others open directly
    div.addEventListener('click', () => {
      if (item.type === 'password') {
        openUnlock(item.id);
      } else {
        showItemDetail(item);
      }
    });
    div.style.cursor = 'pointer';

    if (item.type === 'password') {
      div.querySelector('[data-action="reveal"]').addEventListener('click', () => handleReveal(item));
      div.querySelector('[data-action="copy-pw"]').addEventListener('click', () => handleCopyPw(item));
    }

    return div;
  }

  function typeBadgeBg(type) {
    const map = { password: 'rgba(99,102,241,0.12)', note: 'rgba(34,197,94,0.12)', link: 'rgba(245,158,11,0.12)' };
    return map[type] || 'rgba(255,255,255,0.06)';
  }
  function typeBadgeColor(type) {
    const map = { password: '#6366f1', note: '#22c55e', link: '#f59e0b' };
    return map[type] || '#8b8b9e';
  }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  // ── Reveal Password ───────────────────────────────────────────────────────

  const _revealedPasswords = new Map(); // itemId -> plaintext

  async function handleReveal(item) {
    const valEl = document.getElementById(`pwval-${item.id}`);
    if (!valEl) return;

    if (_revealedPasswords.has(item.id)) {
      // Hide again
      valEl.textContent = '••••••••••••';
      _revealedPasswords.delete(item.id);
      return;
    }

    // Must unlock first if not already revealed
    try {
      if (window.api?.vault?.decrypt && item.password_enc) {
        const res = await window.api.vault.decrypt(item.password_enc);
        if (res.ok) {
          _revealedPasswords.set(item.id, res.data);
          valEl.textContent = res.data;
          setTimeout(() => {
            valEl.textContent = '••••••••••••';
            _revealedPasswords.delete(item.id);
          }, 10000);
        } else {
          openUnlock(item.id);
        }
      } else {
        valEl.textContent = item.password || '(encrypted)';
        setTimeout(() => { valEl.textContent = '••••••••••••'; }, 10000);
      }
    } catch (e) {
      valEl.textContent = '(error)';
    }
  }

  async function handleCopyPw(item) {
    let pwd = _revealedPasswords.get(item.id);

    if (!pwd && window.api?.vault?.decrypt && item.password_enc) {
      const res = await window.api.vault.decrypt(item.password_enc);
      if (res.ok) pwd = res.data;
      else { openUnlock(item.id); return; }
    } else if (!pwd) {
      pwd = item.password || '';
    }

    navigator.clipboard.writeText(pwd);

    // 30s countdown bar
    const countEl = document.getElementById(`countdown-${item.id}`);
    const barEl = document.getElementById(`countdown-bar-${item.id}`);
    if (countEl && barEl) {
      countEl.classList.remove('hidden');
      let pct = 100;
      const tick = setInterval(() => {
        pct -= (100 / 300); // 300 ticks = 30s at 100ms
        barEl.style.width = Math.max(0, pct) + '%';
        if (pct <= 0) {
          clearInterval(tick);
          navigator.clipboard.writeText('');
          countEl.classList.add('hidden');
          barEl.style.width = '100%';
        }
      }, 100);
    }
  }

  // ── Unlock Flow ───────────────────────────────────────────────────────────

  let _pendingUnlockId = null;

  function openUnlock(id) {
    _pendingUnlockId = id;
    document.getElementById('vault-unlock-pin').value = '';
    document.getElementById('modal-vault-unlock').classList.remove('hidden');
    document.getElementById('vault-unlock-pin').focus();
  }

  async function handleConfirmUnlock() {
    const pin = document.getElementById('vault-unlock-pin').value;
    const authRes = window.api?.auth?.verifyActivePin
      ? await window.api.auth.verifyActivePin(pin)
      : { ok: true };

    if (!authRes.ok) {
      document.getElementById('vault-unlock-pin').style.borderColor = 'var(--danger)';
      setTimeout(() => { document.getElementById('vault-unlock-pin').style.borderColor = ''; }, 800);
      return;
    }

    document.getElementById('modal-vault-unlock').classList.add('hidden');

    const item = items.find(i => i.id === _pendingUnlockId);
    if (!item) return;

    await showItemDetail(item);
  }

  async function showItemDetail(item) {
    const modal   = document.getElementById('modal-vault-view');
    const titleEl = document.getElementById('vault-view-title');
    const bodyEl  = document.getElementById('vault-view-body');
    if (!modal || !bodyEl) return;

    const typeIcons = { link: '🔗', password: '🔑', note: '📝', file: '📎' };
    titleEl.textContent = (typeIcons[item.type] || '📋') + ' ' + item.title;
    bodyEl.innerHTML = '';

    // Type badge
    const badge = document.createElement('div');
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;font-size:12px;';
    badge.style.background = typeBadgeBg(item.type);
    badge.style.color = typeBadgeColor(item.type);
    badge.textContent = (typeIcons[item.type] || '📋') + ' ' + capitalize(item.type);
    bodyEl.appendChild(badge);

    function makeRow(label, value, isSecret) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'background:var(--bg-tertiary);border-radius:8px;padding:12px 14px;';

      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;';
      lbl.textContent = label;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;';

      const valEl = document.createElement('span');
      valEl.style.cssText = 'flex:1;font-size:14px;color:var(--text-primary);word-break:break-all;';
      valEl.textContent = isSecret ? '••••••••••••' : value;

      row.appendChild(valEl);

      if (isSecret) {
        const eyeBtn = document.createElement('button');
        eyeBtn.className = 'btn-ghost small';
        eyeBtn.style.flexShrink = '0';
        eyeBtn.textContent = '👁';
        let revealed = false;
        eyeBtn.addEventListener('click', () => {
          revealed = !revealed;
          valEl.textContent = revealed ? value : '••••••••••••';
          eyeBtn.textContent = revealed ? '🙈' : '👁';
        });
        row.appendChild(eyeBtn);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-ghost small';
      copyBtn.style.flexShrink = '0';
      copyBtn.textContent = '📋';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(value);
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
      });
      row.appendChild(copyBtn);

      wrap.appendChild(lbl);
      wrap.appendChild(row);
      bodyEl.appendChild(wrap);
    }

    if (item.url) makeRow('URL', item.url, false);

    if (item.username_enc && window.api?.vault?.decrypt) {
      const u = await window.api.vault.decrypt(item.username_enc);
      if (u.ok && u.data) makeRow('Username', u.data, false);
    }
    if (item.password_enc && window.api?.vault?.decrypt) {
      const p = await window.api.vault.decrypt(item.password_enc);
      if (p.ok && p.data) makeRow('Password', p.data, true);
    }
    if (item.content_enc && window.api?.vault?.decrypt) {
      const c = await window.api.vault.decrypt(item.content_enc);
      if (c.ok && c.data) makeRow('Notes', c.data, false);
    }

    if (!item.url && !item.username_enc && !item.password_enc && !item.content_enc) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:var(--text-dim);font-size:13px;text-align:center;padding:20px;';
      empty.textContent = 'No content stored for this item.';
      bodyEl.appendChild(empty);
    }

    if (item.created_at) {
      const ts = document.createElement('div');
      ts.style.cssText = 'font-size:11px;color:var(--text-dim);text-align:right;margin-top:4px;';
      ts.textContent = 'Added ' + new Date(item.created_at).toLocaleString();
      bodyEl.appendChild(ts);
    }

    modal.classList.remove('hidden');
  }

  // ── Toggling fav / delete ─────────────────────────────────────────────────

  function toggleFav(id, cardEl) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    item.is_favorite = item.is_favorite === 1 ? 0 : 1;
    const btn = cardEl.querySelector('[data-action="fav"]');
    if (btn) {
      btn.textContent = item.is_favorite === 1 ? '⭐' : '☆';
      btn.classList.toggle('active', item.is_favorite === 1);
    }
    // Persist to DB
    if (window.api?.vault?.favorite) {
      window.api.vault.favorite(id, item.is_favorite === 1);
    }
    updateStats();
  }

  function deleteCard(id, cardEl) {
    if (!confirm('Delete this vault item?')) return;
    items = items.filter(i => i.id !== id);
    cardEl.style.animation = 'fadeOut 0.2s ease forwards';
    setTimeout(() => { cardEl.remove(); updateStats(); }, 200);
    // Persist deletion to DB
    if (window.api?.vault?.delete) {
      window.api.vault.delete(id);
    }
  }

  // ── Drag and Drop ──────────────────────────────────────────────────────────

  function setupDragDrop() {
    const vaultView = document.getElementById('view-vault');
    const overlay   = document.getElementById('vault-drag-overlay');
    if (!vaultView || !overlay) return;

    let dragCounter = 0;

    vaultView.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      overlay.classList.remove('hidden');
    });

    vaultView.addEventListener('dragleave', () => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay.classList.add('hidden');
      }
    });

    vaultView.addEventListener('dragover', (e) => {
      e.preventDefault(); // required to allow drop
    });

    vaultView.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay.classList.add('hidden');

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      for (const file of files) {
        const record = {
          title: file.name,
          type: 'note',
          content: `Dropped file: ${file.name} (${formatBytes(file.size)}) — ${new Date().toLocaleString()}`,
          username: '',
          password: '',
          url: '',
          favorite: false,
        };
        if (window.api?.vault?.save) {
          await window.api.vault.save(record);
        } else {
          items.push({ id: Date.now() + Math.random(), ...record, is_favorite: 0 });
        }
      }
      loadItems();
    });
  }

  // ── Search Overlay ─────────────────────────────────────────────────────────

  function renderSearchResults(query) {
    const container = document.getElementById('vault-search-results');
    if (!container) return;
    if (!query.trim()) { container.innerHTML = ''; return; }

    let results = items;
    if (window.Fuse) {
      const fuse = new Fuse(items, { keys: ['title', 'content', 'url', 'type'], threshold: 0.4 });
      results = fuse.search(query).map(r => r.item);
    } else {
      results = items.filter(i => i.title.toLowerCase().includes(query.toLowerCase()));
    }

    if (results.length === 0) {
      container.innerHTML = '<div class="vault-search-empty">No results found</div>';
      return;
    }

    container.innerHTML = results.slice(0, 10).map(item => {
      const icons = { password: '🔑', note: '📝', link: '🔗' };
      return `
        <div class="vault-search-result" onclick="window.VaultModule._scrollTo(${item.id})">
          <span>${icons[item.type] || '📋'}</span>
          <span style="flex:1">${escHtml(item.title)}</span>
          <span style="font-size:11px; color:var(--text-dim); text-transform:capitalize">${item.type}</span>
        </div>
      `;
    }).join('');
  }

  function _scrollTo(id) {
    document.getElementById('vault-search-overlay')?.classList.add('hidden');
    // Switch to All and scroll
    document.querySelector('[data-vfilter="all"]')?.click();
    setTimeout(() => {
      const card = document.querySelector(`.vault-item-card[data-id="${id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('card--highlighted');
        setTimeout(() => card.classList.remove('card--highlighted'), 2000);
      }
    }, 100);
  }

  // ── Util ──────────────────────────────────────────────────────────────────

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, unlock: openUnlock, _scrollTo };
})();

// Export for onclick attributes
window.VaultModule = VaultModule;

// Auto-init when nav item is clicked
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'vault') VaultModule.init();
  });
});
