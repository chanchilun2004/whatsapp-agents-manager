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
  const { name, system_prompt, llm_provider, llm_model } = req.body;
  if (!name || !system_prompt || !llm_provider || !llm_model) {
    return res.status(400).json({ error: 'Missing required fields: name, system_prompt, llm_provider, llm_model' });
  }
  const agent = agentService.createAgent(req.body);
  res.status(201).json(agent);
});

// POST /api/agents/detect-chats — AI detect relevant chats for a role
// Must be before /:id routes to avoid being captured
router.post('/detect-chats', async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || role === 'general') return res.status(400).json({ error: 'Role must be sales or customer_success' });

    const whatsappService = require('../services/whatsapp.service');
    const { callLlmForJsonAuto } = require('../services/llm/json-call');

    const chats = await whatsappService.listChats(null, 50);
    if (!Array.isArray(chats) || chats.length === 0) return res.json({ chats: [] });

    const chatSummaries = [];
    for (const chat of chats.slice(0, 30)) {
      const jid = chat.jid || chat.chat_jid;
      const name = chat.name || jid;
      try {
        const msgs = await whatsappService.listMessages(jid, null, 5);
        const preview = Array.isArray(msgs) ? msgs.map(m => `${m.is_from_me ? 'Me' : m.sender || 'Them'}: ${(m.content || '').substring(0, 60)}`).join(' | ') : '';
        chatSummaries.push({ jid, name, preview });
      } catch {
        chatSummaries.push({ jid, name, preview: '' });
      }
    }

    const roleLabel = role === 'customer_success' ? 'customer success' : role;
    const prompt = `You are analyzing WhatsApp chats to find ones relevant for a ${roleLabel} agent.

Here are the available chats with recent message previews:
${chatSummaries.map((c, i) => `${i + 1}. "${c.name}" (${c.jid}): ${c.preview || 'no messages'}`).join('\n')}

Identify which chats are likely ${roleLabel}-related (client conversations, prospect chats, business discussions).
Exclude personal chats, family groups, and irrelevant groups.

Respond in JSON only. Keep reasons very short (under 10 words each):
{"recommended": [{"jid": "the chat jid", "name": "chat name", "reason": "short reason"}]}

If none are relevant, return {"recommended": []}. Be very selective. Maximum 10 results.`;

    const result = await callLlmForJsonAuto(prompt, 4096);
    res.json({ chats: result.recommended || [] });
  } catch (err) {
    console.error('[AI Detect Chats] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
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

// GET /api/agents/:id/targets
router.get('/:id/targets', (req, res) => {
  const agent = agentService.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const targets = agentService.getAgentTargets(req.params.id);
  res.json(targets);
});

// POST /api/agents/:id/targets
router.post('/:id/targets', (req, res) => {
  const agent = agentService.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { chat_jid, chat_name, auto_reply_mode } = req.body;
  if (!chat_jid) return res.status(400).json({ error: 'chat_jid required' });
  const targets = agentService.addAgentTarget(req.params.id, chat_jid, chat_name, auto_reply_mode);
  res.json(targets);
});

// PATCH /api/agents/:id/targets/:chatJid/mode — set per-chat auto reply mode
router.patch('/:id/targets/:chatJid/mode', (req, res) => {
  const agent = agentService.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { auto_reply_mode } = req.body;
  if (!['off', 'semi', 'full', 'default'].includes(auto_reply_mode)) {
    return res.status(400).json({ error: 'auto_reply_mode must be off, semi, full, or default' });
  }
  const targets = agentService.updateTargetMode(parseInt(req.params.id), req.params.chatJid, auto_reply_mode);
  res.json(targets);
});

// DELETE /api/agents/:id/targets/:chatJid
router.delete('/:id/targets/:chatJid', (req, res) => {
  const agent = agentService.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const targets = agentService.removeAgentTarget(req.params.id, req.params.chatJid);
  res.json(targets);
});

// POST /api/agents/:id/generate — generate AI reply without sending
router.post('/:id/generate', async (req, res, next) => {
  try {
    const agent = agentService.getAgentById(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const whatsappService = require('../services/whatsapp.service');
    const { generateReply, readImageAsBase64, getMimeType } = require('../services/llm/index');

    // Support multi-chat agents: accept chat_jid in body or query, fallback to target_jid
    const chatJid = req.body.chat_jid || req.query.chat_jid || agent.target_jid;
    if (!chatJid) return res.status(400).json({ error: 'No chat_jid specified and agent has no target_jid' });

    const contextMessages = await whatsappService.getConversationContext(chatJid, agent.context_message_count);
    const messages = Array.isArray(contextMessages) ? contextMessages : [];

    // Download images for recent image messages so LLM can see them
    for (const msg of messages) {
      if (msg.media_type === 'image' && !msg.image_base64) {
        try {
          const mediaResult = await whatsappService.downloadMedia(msg.id, msg.chat_jid || chatJid);
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
      chatJid: chatJid,
    });

    res.json({ reply });
  } catch (err) {
    res.json({ error: err.message });
  }
});

module.exports = router;
