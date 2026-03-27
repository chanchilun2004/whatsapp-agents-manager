const { getDb } = require('../db/app-db');
const { callLlmForJsonAuto } = require('./llm/json-call');
const whatsappService = require('./whatsapp.service');
const { getStage } = require('./stage.service');
const { buildTranscript } = require('../lib/transcript');
const cron = require('node-cron');

let digestJob = null;

async function generateClientSummary(agentId, chatJid, chatName) {
  const agent = require('./agent.service').getAgentById(agentId);
  if (!agent) throw new Error('Agent not found');

  // Fetch conversation context
  const contextMessages = await whatsappService.getConversationContext(chatJid, agent.context_message_count || 20);
  const messages = Array.isArray(contextMessages) ? contextMessages : [];

  if (messages.length === 0) return null;

  const transcript = buildTranscript(messages);

  // Get current stage if available
  const stageInfo = getStage(agentId, chatJid);
  const stageContext = stageInfo ? `Current pipeline stage: ${stageInfo.stage}` : 'No stage assigned yet';

  const roleLabel = agent.role === 'customer_success' ? 'customer success' : agent.role;

  const prompt = `You are analyzing a WhatsApp conversation for a ${roleLabel} agent.
${stageContext}

Conversation:
${transcript}

請用繁體中文分析這段客戶對話關係，內容要具體且可執行。

只回覆 JSON 格式：
{
  "summary": "2-3句描述目前客戶關係狀態與現況",
  "needs": ["具體客戶需求1", "具體客戶需求2"],
  "blockers": ["具體阻礙因素1"],
  "follow_ups": [
    {"action": "具體應採取的行動", "priority": "high|normal|low", "due_hint": "today|this_week|next_week|no_rush"}
  ]
}

如果沒有 needs/blockers，使用空陣列。至少包含一個 follow_up 行動。所有內容必須使用繁體中文。`;

  const result = await callLlmForJsonAuto(prompt, 2048);

  // Store in database
  const db = getDb();
  const row = db.prepare(`
    INSERT INTO client_summaries (agent_id, chat_jid, chat_name, summary, needs, blockers, follow_ups)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    agentId, chatJid, chatName || null,
    result.summary,
    JSON.stringify(result.needs || []),
    JSON.stringify(result.blockers || []),
    JSON.stringify(result.follow_ups || [])
  );

  return {
    id: row.lastInsertRowid,
    agent_id: agentId,
    chat_jid: chatJid,
    chat_name: chatName,
    ...result,
  };
}

async function generateAllSummaries() {
  const agentService = require('./agent.service');
  const agents = agentService.getAllAgents().filter(a => a.role !== 'general' && a.is_active);
  const results = [];

  for (const agent of agents) {
    const targets = agentService.getAgentTargets(agent.id);
    for (const target of targets) {
      try {
        const summary = await generateClientSummary(agent.id, target.chat_jid, target.chat_name);
        if (summary) results.push(summary);
      } catch (err) {
        console.warn(`[Summary] Failed for agent ${agent.id}, chat ${target.chat_jid}:`, err.message);
      }
    }
  }

  return results;
}

function listSummaries(agentId, limit = 50) {
  const db = getDb();
  if (agentId) {
    return db.prepare(`
      SELECT cs.*, a.name as agent_name, a.role as agent_role
      FROM client_summaries cs JOIN agents a ON a.id = cs.agent_id
      WHERE cs.agent_id = ? ORDER BY cs.created_at DESC LIMIT ?
    `).all(agentId, limit);
  }
  return db.prepare(`
    SELECT cs.*, a.name as agent_name, a.role as agent_role
    FROM client_summaries cs JOIN agents a ON a.id = cs.agent_id
    ORDER BY cs.created_at DESC LIMIT ?
  `).all(limit);
}

function getSummaryById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT cs.*, a.name as agent_name, a.role as agent_role
    FROM client_summaries cs JOIN agents a ON a.id = cs.agent_id
    WHERE cs.id = ?
  `).get(id);
}

async function sendSummaryToWhatsApp(summaryId, recipient) {
  const db = getDb();
  const summary = getSummaryById(summaryId);
  if (!summary) throw new Error('Summary not found');

  if (!recipient) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'reminder_recipient_phone'").get();
    recipient = row ? row.value : null;
  }
  if (!recipient) throw new Error('No recipient phone configured');

  const needs = JSON.parse(summary.needs || '[]');
  const blockers = JSON.parse(summary.blockers || '[]');
  const followUps = JSON.parse(summary.follow_ups || '[]');

  let message = `*📋 Client Summary*\n`;
  message += `*Client:* ${summary.chat_name || summary.chat_jid}\n`;
  message += `*Agent:* ${summary.agent_name}\n\n`;
  message += `*Status:* ${summary.summary}\n`;

  if (needs.length > 0) {
    message += `\n*Needs:*\n${needs.map(n => `• ${n}`).join('\n')}\n`;
  }
  if (blockers.length > 0) {
    message += `\n*⚠️ Blockers:*\n${blockers.map(b => `• ${b}`).join('\n')}\n`;
  }
  if (followUps.length > 0) {
    message += `\n*Follow-ups:*\n${followUps.map(f => `• [${f.priority?.toUpperCase()}] ${f.action} (${f.due_hint})`).join('\n')}\n`;
  }

  await whatsappService.sendMessage(recipient, message);

  db.prepare('UPDATE client_summaries SET sent_to = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(recipient, summaryId);

  return { sent: true, recipient };
}

async function generateDailyDigest(recipient) {
  const db = getDb();
  if (!recipient) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'reminder_recipient_phone'").get();
    recipient = row ? row.value : null;
  }
  if (!recipient) throw new Error('No recipient phone configured');

  // Generate fresh summaries for all active role-based agents
  const summaries = await generateAllSummaries();
  if (summaries.length === 0) {
    await whatsappService.sendMessage(recipient, '*📊 Daily Pipeline Digest*\n\nNo active client conversations to report.');
    return { sent: true, summaries_count: 0 };
  }

  let message = `*📊 Daily Pipeline Digest*\n_${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}_\n`;

  for (const s of summaries) {
    const stageInfo = getStage(s.agent_id, s.chat_jid);
    const stageLabel = stageInfo ? `[${stageInfo.stage.replace('_', ' ').toUpperCase()}]` : '';

    message += `\n*${stageLabel} ${s.chat_name || s.chat_jid}*\n`;
    message += `${s.summary}\n`;

    const followUps = Array.isArray(s.follow_ups) ? s.follow_ups : JSON.parse(s.follow_ups || '[]');
    if (followUps.length > 0) {
      message += followUps.map(f => `  → [${f.priority}] ${f.action}`).join('\n') + '\n';
    }
  }

  await whatsappService.sendMessage(recipient, message);
  return { sent: true, summaries_count: summaries.length };
}

function scheduleDigest() {
  // Cancel existing job if any
  if (digestJob) {
    digestJob.stop();
    digestJob = null;
  }

  const db = getDb();
  const enabledRow = db.prepare("SELECT value FROM settings WHERE key = 'digest_enabled'").get();
  const timeRow = db.prepare("SELECT value FROM settings WHERE key = 'digest_time'").get();

  if (!enabledRow || enabledRow.value !== 'true') {
    console.log('[Digest] Scheduled digest is disabled');
    return;
  }

  const time = timeRow ? timeRow.value : '09:00';
  const [hour, minute] = time.split(':').map(Number);

  digestJob = cron.schedule(`${minute} ${hour} * * *`, async () => {
    console.log('[Digest] Running scheduled daily digest...');
    try {
      const result = await generateDailyDigest();
      console.log(`[Digest] Sent digest with ${result.summaries_count} summaries`);
    } catch (err) {
      console.error('[Digest] Scheduled digest failed:', err.message);
    }
  });

  console.log(`[Digest] Scheduled daily digest at ${time}`);
}

module.exports = {
  generateClientSummary,
  generateAllSummaries,
  listSummaries,
  getSummaryById,
  sendSummaryToWhatsApp,
  generateDailyDigest,
  scheduleDigest,
};
