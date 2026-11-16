#!/usr/bin/env node
/**
 * Test runner — executes tests/**\/*.test.js with node:test under Electron's
 * bundled Node (ELECTRON_RUN_AS_NODE=1) so native modules built for the
 * Electron ABI (better-sqlite3, keytar) load correctly.
 *
 *   npm test                      run everything
 *   npm test -- tests/unit        run one folder / file
 *
 * Tests marked { todo: 'BUG-…' } document confirmed, unfixed bugs: they are
 * expected to fail and do not fail the run. When a bug is fixed its todo test
 * starts passing — remove the todo flag then.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const electron = require('electron'); // resolves to the binary path in plain Node
const targets = process.argv.slice(2);
const args = ['--test', '--test-reporter=spec', ...(targets.length ? targets : [path.join(__dirname)])];

const res = spawnSync(electron, args, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', FM_TEST: '1' },
});
process.exit(res.status ?? 1);
