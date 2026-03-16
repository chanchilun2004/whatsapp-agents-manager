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

module.exports = router;
