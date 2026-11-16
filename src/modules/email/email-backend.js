const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const { shell } = require('electron');

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send'
];

/**
 * Resolve Google OAuth credentials from keychain.
 * Falls back to .env for backward compatibility during first-time setup.
 * After first save, credentials live in keytar only.
 */
async function getOAuthCredentials(keychain) {
  // Try keytar first (preferred — same pattern as all other API keys)
  let clientId     = null;
  let clientSecret = null;
  try { clientId     = await keychain.getKey('google_client_id');     } catch (_) {}
  try { clientSecret = await keychain.getKey('google_client_secret'); } catch (_) {}

  // Fallback: .env (for backward compat — will be migrated to keytar on next save)
  if (!clientId || !clientSecret) {
    try {
      const path = require('path');
      require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
    } catch (_) {}
    clientId     = clientId     || process.env.GOOGLE_CLIENT_ID     || '';
    clientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';

    // Auto-migrate to keytar if found in .env
    if (clientId && clientSecret) {
      try { await keychain.setKey('google_client_id',     clientId);     } catch (_) {}
      try { await keychain.setKey('google_client_secret', clientSecret); } catch (_) {}
    }
  }

  return { clientId, clientSecret };
}

/**
 * Perform OAuth2 flow: spin up local HTTP server, open browser, capture code, exchange for tokens.
 * @param {object} keychain - The active keychain/portableConfig instance
 * @returns {Promise<boolean>}
 */
async function authenticate(keychain) {
  const { clientId, clientSecret } = await getOAuthCredentials(keychain);

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Go to Settings → API Keys and add your Google Client ID and Secret, or add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.');
  }

  return new Promise((resolve, reject) => {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      REDIRECT_URI
    );

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',   // force consent screen so refresh_token is always returned
    });

    let settled = false;

    const server = http.createServer(async (req, res) => {
      if (settled) { res.end(); return; }
      try {
        const parsed = url.parse(req.url, true);
        if (parsed.pathname !== '/oauth2callback') { res.end(); return; }

        const code  = parsed.query.code;
        const error = parsed.query.error;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h2 style="font-family:sans-serif;color:#e74c3c">Access denied. You can close this tab.</h2>');
          settled = true;
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) { res.end('No code.'); return; }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;background:#0f1117;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <div style="font-size:48px">✓</div>
            <h2 style="color:#34d399">Gmail connected!</h2>
            <p style="color:#aaa">You can close this tab and return to FacultyMind.</p>
          </div></body></html>`);

        settled = true;
        server.close();

        const { tokens } = await oauth2Client.getToken(code);
        if (tokens.refresh_token) await keychain.setKey('gmail_refresh', tokens.refresh_token);
        if (tokens.access_token)  await keychain.setKey('gmail_access',  tokens.access_token);
        resolve(true);

      } catch (err) {
        res.end('<h2>Error. Close this tab.</h2>');
        settled = true;
        server.close();
        reject(err);
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 3000 is in use. Close any other apps using it and try again.'));
      } else {
        reject(err);
      }
    });

    server.listen(3000, () => {
      shell.openExternal(authUrl);
    });
  });
}

/**
 * Helper to get an authenticated OAuth2 driver.
 */
async function getAuthClient(keychain) {
  const refresh_token = await keychain.getKey('gmail_refresh');
  const access_token  = await keychain.getKey('gmail_access');

  if (!refresh_token) return null;

  const { clientId, clientSecret } = await getOAuthCredentials(keychain);
  if (!clientId || !clientSecret) return null;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token,
    access_token
  });

  return oauth2Client;
}

/**
 * Fetch the connected Gmail account profile (email address + display name).
 */
async function fetchProfile(keychain) {
  const auth = await getAuthClient(keychain);
  if (!auth) return null;
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.getProfile({ userId: 'me' });
    return { email: res.data.emailAddress, messagesTotal: res.data.messagesTotal };
  } catch (_) { return null; }
}

/**
 * Fetch the last 50 emails from the inbox.
 */
async function fetchEmails(keychain) {
  const auth = await getAuthClient(keychain);
  if (!auth) throw new Error("Gmail not connected");

  const gmail = google.gmail({ version: 'v1', auth });

  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 20,
    q: 'in:inbox'
  });

  const messages = res.data.messages || [];

  // Fetch all messages in parallel (batches of 10 to avoid rate limits)
  async function fetchOne(msg) {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = detail.data.payload?.headers || [];
      const fromHeader = headers.find(h => h.name === 'From')?.value    || '';
      const subject    = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const date       = headers.find(h => h.name === 'Date')?.value    || '';

      let fromName  = fromHeader;
      let fromEmail = fromHeader;
      const emailMatch = fromHeader.match(/<([^>]+)>/);
      if (emailMatch) {
        fromEmail = emailMatch[1];
        fromName  = fromHeader.replace(/<[^>]+>/, '').trim().replace(/^"|"$/g, '');
      }
      if (!fromName) fromName = fromEmail;

      let receivedAt = null;
      try { receivedAt = date ? new Date(date).toISOString() : null; } catch (_) {}

      return {
        id:          msg.id,
        snippet:     detail.data.snippet || '',
        subject,
        body:        extractBody(detail.data.payload),
        from_name:   fromName  || 'Unknown',
        from_email:  fromEmail || '',
        received_at: receivedAt,
        labels:      detail.data.labelIds || [],
      };
    } catch (_) {
      return null; // skip malformed
    }
  }

  // Run in 2 batches of 10 concurrently
  const BATCH = 10;
  const fullEmails = [];
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(fetchOne));
    results.forEach(r => { if (r) fullEmails.push(r); });
  }

  return fullEmails;
}

/**
 * Recursively extract plain text body from Gmail MIME payload.
 * Returns up to 800 chars — enough for classification, not wasteful.
 */
function extractBody(payload) {
  if (!payload) return '';

  // Direct plain text part
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    return decoded.replace(/\s+/g, ' ').trim().slice(0, 2000);
  }

  // Multipart — recurse into parts, prefer text/plain over text/html
  if (payload.parts && payload.parts.length) {
    // Try text/plain first
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
        return decoded.replace(/\s+/g, ' ').trim().slice(0, 2000);
      }
    }
    // Fallback: recurse into nested multipart
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  // Last resort: use snippet only
  return '';
}

/**
 * Sign out — wipe stored Gmail tokens from keystore.
 */
async function signOut(keychain) {
  try { await keychain.setKey('gmail_refresh', ''); } catch (_) {}
  try { await keychain.setKey('gmail_access',  ''); } catch (_) {}
}

module.exports = {
  authenticate,
  fetchEmails,
  fetchProfile,
  getAuthClient,
  signOut
};
