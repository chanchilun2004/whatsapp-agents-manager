const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp.service');

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

// GET /api/conversations/:jid/messages
router.get('/:jid/messages', async (req, res, next) => {
  try {
    const { limit = 30, after } = req.query;
    const messages = await whatsappService.listMessages(req.params.jid, after || undefined, parseInt(limit));
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// GET /api/media/:chatJid/:messageId — download and serve media
router.get('/media/:chatJid/:messageId', async (req, res, next) => {
  try {
    const result = await whatsappService.downloadMedia(req.params.messageId, req.params.chatJid);
    if (result && result.success && result.file_path) {
      const fs = require('fs');
      const path = require('path');
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
