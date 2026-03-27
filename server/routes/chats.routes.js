const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const whatsappService = require('../services/whatsapp.service');
const contactCache = require('../services/contact-cache');
const { getDb } = require('../db/app-db');

// Bridge DB path (resolved once at startup)
const BRIDGE_DB_PATH = path.resolve(__dirname, '../../..', 'WhatsApp Project/whatsapp-mcp/whatsapp-bridge/store/messages.db');

// Batch-resolve sender names from bridge's SQLite DB
function resolveSendersFromBridgeDb(senders) {
  const result = {};
  try {
    if (!fs.existsSync(BRIDGE_DB_PATH)) return result;
    const Database = require('better-sqlite3');
    const db = new Database(BRIDGE_DB_PATH, { readonly: true });
    const stmt = db.prepare('SELECT jid, name FROM chats WHERE jid = ? OR jid = ? OR jid LIKE ?');
    for (const sender of senders) {
      const num = sender.split('@')[0];
      const row = stmt.get(`${num}@s.whatsapp.net`, `${num}@lid`, `%${num}%`);
      const name = row?.name || '';
      result[sender] = (name && !/^\d+$/.test(name)) ? name : '';
    }
    db.close();
  } catch {}
  return result;
}

// GET /api/chats
router.get('/', async (req, res, next) => {
  try {
    const { q, limit = 20, page = 0 } = req.query;
    const chats = await whatsappService.listChats(q || undefined, parseInt(limit), parseInt(page));
    res.json(chats);
  } catch (err) {
    next(err);
  }
});

// GET /api/chats/search
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    const chats = await whatsappService.listChats(q, 20, 0);
    res.json(chats);
  } catch (err) {
    next(err);
  }
});

// GET /api/chats/media/:chatJid/:messageId — download and serve media
router.get('/media/:chatJid/:messageId', async (req, res, next) => {
  try {
    const result = await whatsappService.downloadMedia(req.params.messageId, req.params.chatJid);
    if (result && result.success && result.file_path) {
      if (fs.existsSync(result.file_path)) {
        const ext = path.extname(result.file_path).toLowerCase();
        const mimes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
        res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(result.file_path).pipe(res);
        return;
      }
    }
    res.status(404).json({ error: 'Media not found' });
  } catch (err) {
    next(err);
  }
});

// POST /api/chats/resolve-senders — resolve sender IDs to names
router.post('/resolve-senders', async (req, res) => {
  try {
    const { senders } = req.body;
    if (!Array.isArray(senders)) return res.json({});

    const result = {};
    const toResolve = [];

    // 1. Check in-memory cache + webhook push name cache
    for (const s of senders) {
      if (contactCache.has(s)) {
        result[s] = contactCache.get(s);
      } else {
        toResolve.push(s);
      }
    }
    if (toResolve.length === 0) return res.json(result);

    // 2. Check our contact_names DB (persisted push names)
    const stillUnresolved = [];
    const db = getDb();
    for (const sender of toResolve) {
      const row = db.prepare('SELECT name FROM contact_names WHERE sender = ?').get(sender);
      if (row && row.name) {
        contactCache.set(sender, row.name);
        result[sender] = row.name;
      } else {
        stillUnresolved.push(sender);
      }
    }
    if (stillUnresolved.length === 0) return res.json(result);

    // 3. Batch check bridge's SQLite DB (one connection for all)
    const bridgeNames = resolveSendersFromBridgeDb(stillUnresolved);
    const mcpResolve = [];
    for (const sender of stillUnresolved) {
      if (bridgeNames[sender]) {
        contactCache.set(sender, bridgeNames[sender]);
        result[sender] = bridgeNames[sender];
      } else {
        mcpResolve.push(sender);
      }
    }

    // 4. MCP fallback (only for remaining unknowns)
    for (const sender of mcpResolve) {
      try {
        const query = sender.split('@')[0];
        const contacts = await whatsappService.searchContacts(query);
        if (Array.isArray(contacts) && contacts.length > 0) {
          const name = contacts[0].name || contacts[0].push_name || '';
          if (name && name !== query && !/^\d+$/.test(name)) {
            contactCache.set(sender, name);
            result[sender] = name;
            continue;
          }
        }
      } catch {}
      contactCache.set(sender, '');
      result[sender] = '';
    }

    res.json(result);
  } catch (err) {
    res.json({});
  }
});

// GET /api/chats/:jid — get single chat info
router.get('/:jid', async (req, res) => {
  try {
    const chat = await whatsappService.getChat(req.params.jid);
    res.json(chat || { jid: req.params.jid, name: '' });
  } catch {
    res.json({ jid: req.params.jid, name: '' });
  }
});

// GET /api/chats/:jid/messages
router.get('/:jid/messages', async (req, res, next) => {
  try {
    const { limit = 30, after } = req.query;
    const messages = await whatsappService.listMessages(req.params.jid, after || undefined, parseInt(limit));
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// POST /api/chats/:jid/send
router.post('/:jid/send', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });
    const result = await whatsappService.sendMessage(req.params.jid, message);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
