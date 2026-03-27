const eventBus = require('../lib/eventBus');
const { PIPELINE_STEPS, MEDIA_INITIAL_DELAY_MS, MEDIA_RETRY_DELAY_MS, MEDIA_MAX_ATTEMPTS } = require('../lib/constants');
const { getActiveAgentsByJid, logAgentEvent } = require('./agent.service');
const { generateReply, readImageAsBase64, getMimeType } = require('./llm/index');
const whatsappService = require('./whatsapp.service');
const approvalService = require('./approval.service');
const { extractMemory } = require('./memory.service');

// Deduplication
const processedMessages = new Map();
const DEDUP_TTL_MS = 5 * 60 * 1000;
const DEDUP_CLEANUP_INTERVAL_MS = 60000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of processedMessages) {
    if (now - v > DEDUP_TTL_MS) processedMessages.delete(k);
  }
}, DEDUP_CLEANUP_INTERVAL_MS);

function markIfNew(agentId, messageId) {
  const key = `${agentId}:${messageId}`;
  if (processedMessages.has(key)) return false;
  processedMessages.set(key, Date.now());
  return true;
}

function emitProgress(agentId, chatJid, step, extra = {}) {
  eventBus.emit('pipeline:progress', { agent_id: agentId, chat_jid: chatJid, step, ...extra });
}

async function runPipeline(payload) {
  const { id, chat_jid, sender, content, timestamp, is_from_me, media_type, chat_name } = payload;

  // Step 1: Validate
  if (is_from_me) return;
  const hasText = content && content.trim() !== '';
  const hasImage = media_type === 'image';
  if (!hasText && !hasImage) return;

  // Step 2: Find agents
  const agents = getActiveAgentsByJid(chat_jid);
  if (agents.length === 0) return;

  const msgPreview = hasText ? content.substring(0, 50) : `[${media_type}]`;
  console.log(`[Pipeline] New message in ${chat_name || chat_jid} from ${sender}: "${msgPreview}"`);

  // Step 3: Download media (once for all agents)
  let imageBase64 = null;
  let imageMime = null;
  if (hasImage) {
    for (const agent of agents) {
      emitProgress(agent.id, chat_jid, PIPELINE_STEPS.DOWNLOADING_MEDIA, { agent_name: agent.name });
    }
    await new Promise(r => setTimeout(r, MEDIA_INITIAL_DELAY_MS));
    for (let attempt = 0; attempt < MEDIA_MAX_ATTEMPTS; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, MEDIA_RETRY_DELAY_MS));
        const mediaResult = await whatsappService.downloadMedia(id, chat_jid);
        if (mediaResult && mediaResult.success && mediaResult.file_path) {
          imageBase64 = readImageAsBase64(mediaResult.file_path);
          imageMime = getMimeType(mediaResult.file_path);
          if (imageBase64) {
            console.log(`[Pipeline] Downloaded image (attempt ${attempt + 1}): ${mediaResult.file_path}`);
            break;
          }
        }
      } catch (err) {
        console.warn(`[Pipeline] Media download attempt ${attempt + 1} failed:`, err.message);
      }
    }
    if (!imageBase64) {
      console.warn(`[Pipeline] Could not download image for message ${id} after ${MEDIA_MAX_ATTEMPTS} attempts`);
    }
  }

  // Process each matching agent
  for (const agent of agents) {
    if (!markIfNew(agent.id, id)) continue;

    try {
      logAgentEvent(agent.id, 'message_detected', {
        message_id: id, chat_jid, sender, content: msgPreview, media_type: media_type || null,
      });

      emitProgress(agent.id, chat_jid, PIPELINE_STEPS.MESSAGE_RECEIVED, {
        agent_name: agent.name, trigger_sender: sender, trigger_text: msgPreview,
      });

      // Fetch context
      emitProgress(agent.id, chat_jid, PIPELINE_STEPS.FETCHING_CONTEXT, { agent_name: agent.name });
      const contextMessages = await whatsappService.getConversationContext(chat_jid, agent.context_message_count);
      const messages = Array.isArray(contextMessages) ? contextMessages : [];

      // Attach image to triggering message
      if (imageBase64) {
        const triggerMsg = messages.find(m => m.id === id);
        if (triggerMsg) {
          triggerMsg.image_base64 = imageBase64;
          triggerMsg.image_mime = imageMime;
        }
      }
      if (imageBase64 && !messages.find(m => m.id === id)) {
        messages.push({
          id, chat_jid, sender, content: content || '', timestamp,
          is_from_me: false, media_type, image_base64: imageBase64, image_mime: imageMime,
        });
      }

      // Load memory (injected into system prompt by generateReply)
      emitProgress(agent.id, chat_jid, PIPELINE_STEPS.LOADING_MEMORY, { agent_name: agent.name });

      // Call LLM
      emitProgress(agent.id, chat_jid, PIPELINE_STEPS.CALLING_LLM, { agent_name: agent.name });
      const reply = await generateReply({
        provider: agent.llm_provider,
        model: agent.llm_model,
        systemPrompt: agent.system_prompt,
        conversationMessages: messages,
        agentId: agent.id,
        chatJid: chat_jid,
      });

      // Validate reply
      if (!reply || reply.trim() === '') {
        logAgentEvent(agent.id, 'error', { error: 'LLM returned empty reply', chat_jid, message_id: id });
        console.warn(`[Pipeline] LLM returned empty reply for agent "${agent.name}"`);
        continue;
      }

      // Deliver
      emitProgress(agent.id, chat_jid, PIPELINE_STEPS.REPLY_READY, { agent_name: agent.name });

      const effectiveMode = agent.effective_auto_reply_mode || agent.auto_reply_mode;
      if (effectiveMode === 'full') {
        await whatsappService.sendMessage(chat_jid, reply);
        logAgentEvent(agent.id, 'reply_sent', { reply: reply.substring(0, 200), chat_jid });
        eventBus.emit('pipeline:reply_sent', { agent_id: agent.id, agent_name: agent.name, chat_jid, reply });
        console.log(`[Pipeline] Auto-replied in ${chat_name || chat_jid} via agent "${agent.name}"`);
      } else if (effectiveMode === 'semi') {
        const triggerText = hasText ? content : `[Image: ${media_type}]`;
        const approval = approvalService.createApproval({
          agent_id: agent.id, chat_jid, trigger_message_id: id,
          trigger_message_text: triggerText, trigger_sender: sender, draft_reply: reply,
        });
        logAgentEvent(agent.id, 'reply_queued', { approval_id: approval.id, draft: reply.substring(0, 200) });
        eventBus.emit('pipeline:new_approval', { approval });
        console.log(`[Pipeline] Draft queued for approval in ${chat_name || chat_jid} via agent "${agent.name}"`);
      }

      // Extract memory (async, non-blocking)
      const triggerText = hasText ? content : '[Image]';
      extractMemory(agent.id, chat_jid, triggerText, reply, agent.llm_provider).catch(err => {
        console.warn(`[Pipeline] Memory extraction failed for agent ${agent.id}:`, err.message);
      });

      // Stage detection is handled by autoDetectStages after the loop (avoids duplicates)

    } catch (err) {
      console.error(`[Pipeline] Error processing agent "${agent.name}":`, err.message);
      logAgentEvent(agent.id, 'error', { error: err.message, chat_jid, message_id: id });
    }
  }

  // Auto-detect stage for ALL role agents watching this chat (including off-mode, once per agent)
  autoDetectStages(chat_jid, chat_name).catch(err => {
    console.warn(`[Pipeline] Auto stage detection failed:`, err.message);
  });
}

// Auto-detect stage for ALL role agents watching this chat (including off-mode)
async function autoDetectStages(chatJid, chatName) {
  const { getDb } = require('../db/app-db');
  const { detectAndUpdateStage } = require('./stage.service');
  const db = getDb();

  const roleAgents = db.prepare(`
    SELECT DISTINCT a.* FROM agents a
    JOIN agent_targets at ON a.id = at.agent_id
    WHERE at.chat_jid = ? AND a.is_active = 1 AND a.role != 'general'
  `).all(chatJid);

  if (roleAgents.length === 0) return;

  // Fetch context once, use max context_message_count across agents
  const maxContext = Math.max(...roleAgents.map(a => a.context_message_count || 20));
  const contextMessages = await whatsappService.getConversationContext(chatJid, maxContext);
  const messages = Array.isArray(contextMessages) ? contextMessages : [];
  if (messages.length === 0) return;

  for (const agent of roleAgents) {
    try {
      const result = await detectAndUpdateStage(agent.id, chatJid, messages, agent.role, chatName);
      if (result) {
        eventBus.emit('pipeline:stage_updated', {
          agent_id: agent.id, chat_jid: chatJid, chat_name: chatName,
          stage: result.stage, previous_stage: result.previous_stage,
          confidence: result.confidence, reasoning: result.reasoning,
        });
      }
    } catch (err) {
      console.warn(`[Pipeline] Auto stage detect failed for agent ${agent.id}:`, err.message);
    }
  }
}

module.exports = { runPipeline };
