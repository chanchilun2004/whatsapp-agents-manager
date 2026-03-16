const express = require('express');
const router = express.Router();
const agentService = require('../services/agent.service');

// GET /api/agents
router.get('/', (req, res) => {
  const agents = agentService.getAllAgents();
  res.json(agents);
});

// GET /api/agents/:id
router.get('/:id', (req, res) => {
  const agent = agentService.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// POST /api/agents
router.post('/', (req, res) => {
  const { name, system_prompt, target_jid, target_name, llm_provider, llm_model, auto_reply_mode, context_message_count } = req.body;
  if (!name || !system_prompt || !target_jid || !llm_provider || !llm_model) {
    return res.status(400).json({ error: 'Missing required fields: name, system_prompt, target_jid, llm_provider, llm_model' });
  }
  const agent = agentService.createAgent(req.body);
  res.status(201).json(agent);
});

// PUT /api/agents/:id
router.put('/:id', (req, res) => {
  const existing = agentService.getAgentById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agent not found' });
  const agent = agentService.updateAgent(req.params.id, req.body);
  res.json(agent);
});

// DELETE /api/agents/:id
router.delete('/:id', (req, res) => {
  const existing = agentService.getAgentById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agent not found' });
  agentService.deleteAgent(req.params.id);
  res.json({ success: true });
});

// PATCH /api/agents/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const existing = agentService.getAgentById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agent not found' });
  const agent = agentService.toggleAgent(req.params.id);
  res.json(agent);
});

// GET /api/agents/:id/logs
router.get('/:id/logs', (req, res) => {
  const logs = agentService.getAgentLogs(req.params.id, parseInt(req.query.limit || '50'));
  res.json(logs);
});

module.exports = router;
