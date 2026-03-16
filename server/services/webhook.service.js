const { getActiveAgentsByJid, logAgentEvent } = require('./agent.service');
const { generateReply } = require('./llm.service');
const whatsappService = require('./whatsapp.service');
const approvalService = require('./approval.service');

let wsBroadcast = null;

function setWsBroadcast(fn) {
  wsBroadcast = fn;
}

function broadcast(event, data) {
  if (wsBroadcast) {
    wsBroadcast(JSON.stringify({ event, data }));
  }
}

async function handleIncomingMessage(payload) {
  const { id, chat_jid, sender, content, timestamp, is_from_me, media_type, chat_name } = payload;

  // Skip our own messages
  if (is_from_me) return;

  // Skip media-only messages (no text content)
  if (!content || content.trim() === '') return;

  // Find active agents for this chat
  const agents = getActiveAgentsByJid(chat_jid);
  if (agents.length === 0) return;

  console.log(`[Webhook] New message in ${chat_name || chat_jid} from ${sender}: "${content.substring(0, 50)}..."`);

  for (const agent of agents) {
    try {
      logAgentEvent(agent.id, 'message_detected', {
        message_id: id,
        chat_jid,
        sender,
        content: content.substring(0, 200),
      });

      // Fetch conversation context
      const contextMessages = await whatsappService.getConversationContext(chat_jid, agent.context_message_count);

      // Generate LLM reply
      const reply = await generateReply({
        provider: agent.llm_provider,
        model: agent.llm_model,
        systemPrompt: agent.system_prompt,
        conversationMessages: Array.isArray(contextMessages) ? contextMessages : [],
      });

      if (agent.auto_reply_mode === 'full') {
        // Send immediately
        await whatsappService.sendMessage(chat_jid, reply);
        logAgentEvent(agent.id, 'reply_sent', { reply: reply.substring(0, 200), chat_jid });
        broadcast('reply_sent', { agent_id: agent.id, agent_name: agent.name, chat_jid, reply });
        console.log(`[Webhook] Auto-replied in ${chat_name || chat_jid} via agent "${agent.name}"`);
      } else if (agent.auto_reply_mode === 'semi') {
        // Queue for approval
        const approval = approvalService.createApproval({
          agent_id: agent.id,
          chat_jid,
          trigger_message_id: id,
          trigger_message_text: content,
          trigger_sender: sender,
          draft_reply: reply,
        });
        logAgentEvent(agent.id, 'reply_queued', { approval_id: approval.id, draft: reply.substring(0, 200) });
        broadcast('new_approval', { approval });
        console.log(`[Webhook] Draft queued for approval in ${chat_name || chat_jid} via agent "${agent.name}"`);
      }
    } catch (err) {
      console.error(`[Webhook] Error processing agent "${agent.name}":`, err.message);
      logAgentEvent(agent.id, 'error', { error: err.message, chat_jid, message_id: id });
    }
  }
}

module.exports = { handleIncomingMessage, setWsBroadcast, broadcast };
