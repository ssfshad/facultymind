'use strict';

const { Notification, BrowserWindow } = require('electron');
const { fetchEmails } = require('./email-backend');
const { classifyBatch } = require('./email-classifier');
const { triggerEmailAlert } = require('../ai/proactive-engine');

let latestSeenId    = null;
let pollTimer       = null;
let eodTimer        = null;
let _keychain       = null;
let _aiRouter       = null;
let _isConnected    = false;
let _cachedEmails   = []; // Last synced inbox snapshot

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes
const suppressedQueue = [];

function getRecentEmails() { return _cachedEmails; }

// ── Push email update to renderer window ─────────────────────────────────────

function pushToRenderer(channel, payload) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ── Full fetch + classify + push ─────────────────────────────────────────────

async function syncEmails() {
  if (!_keychain || !_isConnected) return;
  try {
    let emails = await fetchEmails(_keychain);
    if (!emails || emails.length === 0) return;

    if (_aiRouter) {
      const activeModel = _aiRouter.getActiveModel();
      const { getApiKey, isUsable } = require('../ai/api-key');
      const apiKey = await getApiKey(_keychain, activeModel);
      if (isUsable(activeModel, apiKey)) {
        const { classifyBatch } = require('./email-classifier');
        emails = await classifyBatch(_aiRouter, emails, apiKey, activeModel);
      }
    }

    // Push full inbox to renderer (handles both initial load and refresh)
    _cachedEmails = emails;
    pushToRenderer('email:inbox-update', { emails });

    // Detect genuinely new emails (arrived since last poll)
    if (latestSeenId) {
      const newEmails = [];
      for (const e of emails) {
        if (e.id === latestSeenId) break;
        newEmails.push(e);
      }

      if (newEmails.length > 0) {
        pushToRenderer('email:new-count', { count: newEmails.filter(e => !['Advertisement','OTP'].includes(e.ai_category)).length });

        for (const mail of newEmails) {
          // Let the proactive AI announce each email in chat
          try {
            const alert = await triggerEmailAlert(null, _aiRouter, _keychain, mail);
            if (alert && alert.text) {
              pushToRenderer('ai:proactive', { text: alert.text, buttons: alert.buttons || [] });
            }
          } catch (_) {
            // Fallback: OS notification for important emails
            if (!['Advertisement'].includes(mail.ai_category)) {
              new Notification({
                title: `📬 ${mail.ai_category}: ${mail.subject}`,
                body:  `${mail.from_name}: ${mail.ai_summary || mail.snippet}`,
              }).show();
            }
          }

          if (!['Advertisement', 'OTP'].includes(mail.ai_category)) {
            suppressedQueue.push(mail);
          }
        }
      }
    }

    latestSeenId = emails[0]?.id || null;
  } catch (err) {
    if (!err.message.includes('not connected') && !err.message.includes('refresh_token')) {
      console.error('[Email Monitor] Polling error:', err.message);
    }
  }
}

// ── Start the monitor ─────────────────────────────────────────────────────────

function startEmailMonitor(keychain, aiRouter) {
  _keychain  = keychain;
  _aiRouter  = aiRouter;

  if (pollTimer) clearInterval(pollTimer);
  if (eodTimer)  clearInterval(eodTimer);

  // Check if Gmail is connected before starting
  keychain.getKey('gmail_refresh').then(token => {
    if (!token) return; // not connected — stay silent
    _isConnected = true;

    // Immediate first sync
    syncEmails();

    // Recurring poll every 2 minutes
    pollTimer = setInterval(syncEmails, POLL_INTERVAL);

    // End-of-day snooze summary at 5 PM
    eodTimer = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 17 && suppressedQueue.length > 0) {
        new Notification({
          title: '💤 End of Day Summary',
          body:  `You snoozed ${suppressedQueue.length} emails today. They are in your Smart Inbox.`,
        }).show();
        suppressedQueue.length = 0;
      }
    }, 10 * 60 * 1000);

  }).catch(() => {});
}

// Called after successful OAuth to activate polling without restart
function setConnected(keychain, aiRouter) {
  _keychain    = keychain;
  _aiRouter    = aiRouter;
  _isConnected = true;
  if (!pollTimer) {
    syncEmails();
    pollTimer = setInterval(syncEmails, POLL_INTERVAL);
  }
}

module.exports = { startEmailMonitor, setConnected, syncEmails, getRecentEmails };
