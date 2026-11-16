/**
 * email.js — Local-First Email Intelligence Controller (Ported from EmailBridge)
 */

'use strict';

const EmailModule = (() => {
  let isFetching = false;
  let cachedEmails = [];

  // BUG-S4: every email field comes from whoever sent the email — render as text
  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function init() {
    setupListeners();
    setupPushListeners();
  }

  function setupPushListeners() {
    // Background poll pushed a full inbox update
    if (window.api?.email?.onInboxUpdate) {
      window.api.email.onInboxUpdate(({ emails }) => {
        cachedEmails = emails;
        renderEmails();
        updateRefreshTimestamp();
      });
    }
    // Badge new email count
    if (window.api?.email?.onNewCount) {
      window.api.email.onNewCount(({ count }) => {
        const btn = document.getElementById('btn-email-refresh');
        if (btn) btn.textContent = `↻ ${count} new`;
        setTimeout(() => { if (btn) btn.textContent = '↻ Refresh'; }, 5000);
      });
    }
  }

  function setupListeners() {
    const btnConnect  = document.getElementById('btn-gmail-connect');
    const btnRefresh  = document.getElementById('btn-email-refresh');
    const btnSignout  = document.getElementById('btn-gmail-signout');
    const connectArea = document.getElementById('gmail-connect-area');
    const statusBadge = document.getElementById('badge-gmail-status');

    btnSignout?.addEventListener('click', async () => {
      if (!confirm('Sign out from Gmail? You will need to reconnect to sync emails.')) return;
      btnSignout.disabled = true;
      await window.api.email.signout();
      // Reset UI to disconnected state
      btnSignout.style.display = 'none';
      btnRefresh.disabled = true;
      connectArea.classList.remove('hidden');
      statusBadge.textContent = 'Not Connected';
      statusBadge.style.color = 'var(--danger)';
      const nameEl   = document.querySelector('#view-email .profile-name');
      const emailEl  = document.querySelector('#view-email .profile-email');
      const avatarEl = document.querySelector('#view-email .profile-avatar');
      if (nameEl)   nameEl.textContent  = 'Not connected';
      if (emailEl)  emailEl.textContent = 'Connect Gmail to see your account';
      if (avatarEl) avatarEl.textContent = '?';
      document.getElementById('email-inbox-list').innerHTML = '';
      cachedEmails = [];
      btnSignout.disabled = false;
    });

    // Check if already connected on load
    checkConnectionStatus();

    btnConnect?.addEventListener('click', async () => {
      btnConnect.textContent = "Connecting to Google...";
      btnConnect.disabled = true;
      try {
        const res = await window.api.email.authenticate();
        if (res.ok) {
          connectArea.classList.add('hidden');
          statusBadge.textContent = "Gmail Connected";
          statusBadge.style.color = "var(--success)";
          btnRefresh.disabled = false;
          const btnSignout = document.getElementById('btn-gmail-signout');
          if (btnSignout) btnSignout.style.display = 'inline-flex';
          await loadProfile();
          await fetchEmails();
        } else {
          alert("Failed to connect: " + res.error);
        }
      } catch (err) {
        console.error(err);
        alert("Connection error: " + err.message);
      }
      btnConnect.textContent = "✉️ Connect Gmail Account";
      btnConnect.disabled = false;
    });

    btnRefresh?.addEventListener('click', async () => {
      btnRefresh.textContent = '↻ Syncing...';
      btnRefresh.disabled = true;
      await window.api.email.refresh();
      btnRefresh.textContent = '↻ Refresh';
      btnRefresh.disabled = false;
    });
  }

  async function checkConnectionStatus() {
    const connectArea = document.getElementById('gmail-connect-area');
    const btnRefresh  = document.getElementById('btn-email-refresh');
    const btnSignout  = document.getElementById('btn-gmail-signout');
    try {
      const res = await window.api.email.profile();
      if (res.ok && res.profile) {
        connectArea.classList.add('hidden');
        btnRefresh.disabled = false;
        if (btnSignout) btnSignout.style.display = 'inline-flex';
        updateProfileCard(res.profile.email);
        await fetchEmails();
      } else {
        connectArea.classList.remove('hidden');
        if (btnSignout) btnSignout.style.display = 'none';
      }
    } catch (_) {
      connectArea.classList.remove('hidden');
      if (btnSignout) btnSignout.style.display = 'none';
    }
  }

  async function loadProfile() {
    try {
      const res = await window.api.email.profile();
      if (res.ok && res.profile) updateProfileCard(res.profile.email);
    } catch (_) {}
  }

  function updateRefreshTimestamp() {
    const badge = document.getElementById('badge-gmail-status');
    if (badge) {
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      badge.textContent = `Synced ${t}`;
      badge.style.color = 'var(--success)';
    }
  }

  function updateProfileCard(email) {
    const nameEl   = document.querySelector('#view-email .profile-name');
    const emailEl  = document.querySelector('#view-email .profile-email');
    const badgeEl  = document.getElementById('badge-gmail-status');
    const avatarEl = document.querySelector('#view-email .profile-avatar');

    if (nameEl)   nameEl.textContent  = email.split('@')[0];
    if (emailEl)  emailEl.textContent = email;
    if (badgeEl) {
      badgeEl.textContent = "Gmail Connected & Synced";
      badgeEl.style.color = "var(--success)";
    }
    if (avatarEl) avatarEl.textContent = email.charAt(0).toUpperCase();
  }

  async function fetchEmails() {
    if (isFetching) return;
    isFetching = true;
    
    const btnRefresh = document.getElementById('btn-email-refresh');
    const emptyState = document.getElementById('email-empty-state');
    const listArea = document.getElementById('email-inbox-list');
    const statusBadge = document.getElementById('badge-gmail-status');
    const connectArea = document.getElementById('gmail-connect-area');

    btnRefresh.textContent = "↻ Syncing...";
    btnRefresh.disabled = true;

    try {
      const res = await window.api.email.fetch();
      if (!res.ok) {
        if (res.error.includes("No keystore") || res.error.includes("refresh_token") || res.error.includes("connected")) {
           connectArea.classList.remove('hidden');
           statusBadge.textContent = "Not Connected";
           statusBadge.style.color = "var(--danger)";
        } else {
           alert("Error fetching emails: " + res.error);
        }
      } else {
        cachedEmails = res.data;
        connectArea.classList.add('hidden');
        statusBadge.textContent = "Gmail Connected & Synced";
        statusBadge.style.color = "var(--success)";
        renderEmails();
      }
    } catch (e) {
       console.error(e);
    }

    btnRefresh.textContent = "↻ Refresh";
    btnRefresh.disabled = false;
    isFetching = false;
  }

  function getCategoryConfig(cat) {
    switch (cat) {
      case "Personal":      return { color: "var(--text-secondary)", bg: "var(--bg-tertiary)", icon: "👤" };
      case "Work":          return { color: "var(--warning)",        bg: "var(--bg-warning)",  icon: "💼" };
      case "OTP":           return { color: "var(--success)",        bg: "var(--bg-success)",  icon: "🔑" };
      case "Advertisement": return { color: "var(--danger)",         bg: "var(--bg-danger)",   icon: "🛒" };
      case "Students":      return { color: "var(--accent-primary)", bg: "var(--bg-card)",     icon: "🎓" };
      case "Payments":      return { color: "#f59e0b",               bg: "rgba(245,158,11,.1)", icon: "💳" };
      default:              return { color: "var(--text-secondary)", bg: "var(--bg-tertiary)", icon: "ℹ️" };
    }
  }

  function renderEmails() {
    const listArea = document.getElementById('email-inbox-list');
    
    if (cachedEmails.length === 0) {
       listArea.innerHTML = `
         <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="empty-icon"><path d="M18.8 4A6.3 8.7 0 0 1 20 9"/><path d="M9 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2"/><path d="m2 5 8.9 5.2a2 2 0 0 0 2.2 0L22 5"/><path d="M22 17h-6"/></svg>
            <div class="empty-title">Inbox is zero</div>
            <p class="empty-desc">You have no emails right now.</p>
         </div>`;
       return;
    }

    listArea.innerHTML = cachedEmails.map(email => {
      const config = getCategoryConfig(email.ai_category);
      let timeAgo = "recently";
      if (email.received_at) {
         try {
           const diffMs = new Date() - new Date(email.received_at);
           const diffMins = Math.floor(diffMs / 60000);
           if (diffMins < 60) timeAgo = diffMins + "m ago";
           else if (diffMins < 1440) timeAgo = Math.floor(diffMins/60) + "h ago";
           else timeAgo = Math.floor(diffMins/1440) + "d ago";
         } catch(e) {}
      }

      return `
        <div class="email-item">
           <div class="email-avatar">${esc(email.from_name ? email.from_name.charAt(0).toUpperCase() : 'U')}</div>
           <div class="email-body">
              <div class="email-row1">
                 <span class="email-sender">${esc(email.from_name)}</span>
                 <span class="badge-default" style="background:${config.bg}; color:${config.color};">${config.icon} ${esc(email.ai_category || 'UNK')}</span>
              </div>
              <div class="email-subject">${esc(email.subject)}</div>
              <div class="email-preview">${esc(email.ai_summary ? '✨ ' + email.ai_summary : email.snippet)}</div>
           </div>
           <div class="email-meta">
              <span class="email-time">${timeAgo}</span>
           </div>
        </div>
      `;
    }).join('');
  }

  return { init };
})();

// Export globally
window.EmailModule = EmailModule;

// Auto-init 
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.view === 'email') EmailModule.init();
  });
});
