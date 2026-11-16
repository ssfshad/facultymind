/**
 * notarize.js — macOS notarization hook for electron-builder
 *
 * Only runs on macOS CI builds when APPLE_ID env var is set.
 * On Windows or when credentials are absent, exits silently.
 */
'use strict';

exports.default = async function notarize(context) {
  const { electronPlatformName } = context;
  if (electronPlatformName !== 'darwin') return;
  if (!process.env.APPLE_ID) {
    console.log('[notarize] APPLE_ID not set — skipping notarization');
    return;
  }
  try {
    const { notarize } = require('@electron/notarize');
    await notarize({
      appBundleId: 'com.shad.facultymind',
      appPath:     context.appOutDir + '/FacultyMind.app',
      appleId:     process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId:      process.env.APPLE_TEAM_ID,
    });
  } catch (e) {
    console.warn('[notarize] Notarization failed (non-fatal):', e.message);
  }
};
