const express = require('express');
const router = express.Router();
const reminderService = require('../services/reminder.service');

// GET /api/reminders
router.get('/', (req, res) => {
  const { status = 'active', limit = 50 } = req.query;
  res.json(reminderService.listReminders(status, parseInt(limit)));
});

// GET /api/reminders/count
router.get('/count', (req, res) => {
  res.json({ count: reminderService.getActiveCount() });
});

// POST /api/reminders/scan
router.post('/scan', async (req, res, next) => {
  try {
    const { chatJids } = req.body || {};
    const result = await reminderService.scanChats(chatJids);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/reminders/:id/send
router.post('/:id/send', async (req, res, next) => {
  try {
    const { recipient } = req.body || {};
    const result = await reminderService.sendReminder(req.params.id, recipient);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/reminders/:id/dismiss
router.post('/:id/dismiss', (req, res) => {
  reminderService.dismissReminder(req.params.id);
  res.json({ success: true });
});

module.exports = router;
