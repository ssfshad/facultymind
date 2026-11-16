'use strict';
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'facultymind', 'facultymind.db');
const db = new Database(dbPath);
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ollama_model', 'deepseek-r1:8b')").run();
const row = db.prepare("SELECT value FROM settings WHERE key = 'ollama_model'").get();
console.log('ollama_model is now:', row.value);
db.close();
