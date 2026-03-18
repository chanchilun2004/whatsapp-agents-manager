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

// POST /api/agents/:id/generate — generate AI reply without sending
router.post('/:id/generate', async (req, res, next) => {
  try {
    const agent = agentService.getAgentById(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const whatsappService = require('../services/whatsapp.service');
    const { generateReply, readImageAsBase64, getMimeType } = require('../services/llm/index');

    const contextMessages = await whatsappService.getConversationContext(agent.target_jid, agent.context_message_count);
    const messages = Array.isArray(contextMessages) ? contextMessages : [];

    // Download images for recent image messages so LLM can see them
    for (const msg of messages) {
      if (msg.media_type === 'image' && !msg.image_base64) {
        try {
          const mediaResult = await whatsappService.downloadMedia(msg.id, msg.chat_jid || agent.target_jid);
          if (mediaResult && mediaResult.success && mediaResult.file_path) {
            const b64 = readImageAsBase64(mediaResult.file_path);
            if (b64) {
              msg.image_base64 = b64;
              msg.image_mime = getMimeType(mediaResult.file_path);
            }
          }
        } catch {}
      }
    }

    const reply = await generateReply({
      provider: agent.llm_provider,
      model: agent.llm_model,
      systemPrompt: agent.system_prompt,
      conversationMessages: messages,
      agentId: agent.id,
      chatJid: agent.target_jid,
    });

    res.json({ reply });
  } catch (err) {
    res.json({ error: err.message });
  }
});

module.exports = router;
