const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db;

function getDb() {
  if (!db) {
    const dbDir = path.dirname(config.appDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(config.appDbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'app-schema.sql'), 'utf8');
    db.exec(schema);

    // Seed default settings
    const seedSettings = db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
    );
    seedSettings.run('mcp_sse_url', config.mcpSseUrl);
    seedSettings.run('openai_api_key', config.openaiApiKey);
    seedSettings.run('gemini_api_key', config.geminiApiKey);
    seedSettings.run('reminder_recipient_phone', '85291757723');
    seedSettings.run('digest_enabled', 'false');
    seedSettings.run('digest_time', '09:00');

    // Migrations for existing databases
    try { db.exec("ALTER TABLE agents ADD COLUMN role TEXT NOT NULL DEFAULT 'general'"); } catch {}
    try { db.exec("ALTER TABLE agent_targets ADD COLUMN auto_reply_mode TEXT DEFAULT NULL"); } catch {}
  }
  return db;
}

module.exports = { getDb };
