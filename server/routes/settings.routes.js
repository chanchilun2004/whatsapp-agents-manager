const express = require('express');
const router = express.Router();
const { getDb } = require('../db/app-db');

// GET /api/settings
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    // Mask API keys in response
    if (row.key.includes('api_key') && row.value) {
      settings[row.key] = row.value.substring(0, 8) + '...' + row.value.substring(row.value.length - 4);
    } else {
      settings[row.key] = row.value;
    }
  }
  res.json(settings);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const db = getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const allowed = ['mcp_sse_url', 'openai_api_key', 'gemini_api_key', 'reminder_recipient_phone'];
  const updates = {};
  for (const [key, value] of Object.entries(req.body)) {
    if (allowed.includes(key)) {
      upsert.run(key, value);
      updates[key] = key.includes('api_key') ? '***' : value;
    }
  }
  res.json({ success: true, updated: updates });
});

module.exports = router;
