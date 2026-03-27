const express = require('express');
const router = express.Router();
const summaryService = require('../services/summary.service');

// GET /api/summaries
router.get('/', (req, res) => {
  const { agent_id, limit } = req.query;
  const summaries = summaryService.listSummaries(agent_id ? parseInt(agent_id) : null, parseInt(limit || '50'));
  res.json(summaries);
});

// POST /api/summaries/generate-all
router.post('/generate-all', async (req, res) => {
  try {
    const results = await summaryService.generateAllSummaries();
    res.json({ success: true, count: results.length, summaries: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/summaries/digest
router.post('/digest', async (req, res) => {
  try {
    const { recipient } = req.body;
    const result = await summaryService.generateDailyDigest(recipient);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/summaries/generate/:agentId
router.post('/generate/:agentId', async (req, res) => {
  try {
    const agentService = require('../services/agent.service');
    const agent = agentService.getAgentById(req.params.agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const targets = agentService.getAgentTargets(agent.id);
    const results = [];

    for (const target of targets) {
      try {
        const summary = await summaryService.generateClientSummary(agent.id, target.chat_jid, target.chat_name);
        if (summary) results.push(summary);
      } catch (err) {
        console.warn(`[Summary] Failed for ${target.chat_jid}:`, err.message);
      }
    }

    res.json({ success: true, count: results.length, summaries: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/summaries/:id/send
router.post('/:id/send', async (req, res) => {
  try {
    const { recipient } = req.body;
    const result = await summaryService.sendSummaryToWhatsApp(parseInt(req.params.id), recipient);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
