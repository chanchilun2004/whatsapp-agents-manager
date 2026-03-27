const express = require('express');
const router = express.Router();
const stageService = require('../services/stage.service');
const agentService = require('../services/agent.service');
const whatsappService = require('../services/whatsapp.service');

// GET /api/pipeline — all agents with stages (kanban data)
router.get('/', (req, res) => {
  const { role } = req.query;
  const stages = stageService.getAllStages(role || null);
  res.json(stages);
});

// GET /api/pipeline/definitions — stage definitions for UI
router.get('/definitions', (req, res) => {
  res.json(stageService.STAGE_DEFINITIONS);
});

// POST /api/pipeline/detect-all — detect stages for all agent targets
router.post('/detect-all', async (req, res) => {
  try {
    const agents = agentService.getAllAgents().filter(a => a.role && a.role !== 'general' && a.is_active);
    const results = [];

    for (const agent of agents) {
      const targets = agentService.getAgentTargets(agent.id);
      for (const target of targets) {
        try {
          const contextMessages = await whatsappService.getConversationContext(target.chat_jid, agent.context_message_count || 20);
          const messages = Array.isArray(contextMessages) ? contextMessages : [];
          if (messages.length === 0) continue;
          const result = await stageService.detectAndUpdateStage(agent.id, target.chat_jid, messages, agent.role, target.chat_name);
          if (result) results.push({ agent_id: agent.id, agent_name: agent.name, chat_jid: target.chat_jid, chat_name: target.chat_name, ...result });
        } catch (err) {
          console.warn(`[Pipeline] Stage detect failed for ${target.chat_jid}:`, err.message);
        }
      }
    }

    res.json({ success: true, count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pipeline/:agentId/stage — current stages for agent's targets
router.get('/:agentId/stage', (req, res) => {
  const targets = agentService.getAgentTargets(req.params.agentId);
  const stages = targets.map(t => ({
    ...t,
    stage: stageService.getStage(req.params.agentId, t.chat_jid),
  }));
  res.json(stages);
});

// GET /api/pipeline/:agentId/history — stage change history
router.get('/:agentId/history', (req, res) => {
  const { chat_jid } = req.query;
  if (!chat_jid) return res.status(400).json({ error: 'chat_jid query param required' });
  const history = stageService.getStageHistory(req.params.agentId, chat_jid);
  res.json(history);
});

// POST /api/pipeline/:agentId/stage — manual override
router.post('/:agentId/stage', (req, res) => {
  const { chat_jid, stage, reasoning } = req.body;
  if (!chat_jid || !stage) return res.status(400).json({ error: 'chat_jid and stage required' });
  try {
    const result = stageService.manualOverrideStage(parseInt(req.params.agentId), chat_jid, stage, reasoning);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/pipeline/:agentId/detect — trigger re-detection
router.post('/:agentId/detect', async (req, res) => {
  try {
    const agent = agentService.getAgentById(req.params.agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.role === 'general') return res.status(400).json({ error: 'Agent has no role for stage detection' });

    const { chat_jid } = req.body;
    if (!chat_jid) return res.status(400).json({ error: 'chat_jid required' });

    const contextMessages = await whatsappService.getConversationContext(chat_jid, agent.context_message_count || 20);
    const messages = Array.isArray(contextMessages) ? contextMessages : [];

    const result = await stageService.detectAndUpdateStage(agent.id, chat_jid, messages, agent.role);
    res.json(result || { stage: null, message: 'Could not detect stage' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
