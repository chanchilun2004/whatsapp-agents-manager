const { getDb } = require('../db/app-db');
const { callLlmForJsonAuto } = require('./llm/json-call');
const eventBus = require('../lib/eventBus');
const { buildTranscript } = require('../lib/transcript');

const STAGE_DEFINITIONS = {
  sales: {
    stages: [
      { id: 'lead', name: 'Lead', color: '#6B7280', order: 0 },
      { id: 'qualified', name: 'Qualified', color: '#3B82F6', order: 1 },
      { id: 'proposal', name: 'Proposal', color: '#8B5CF6', order: 2 },
      { id: 'negotiation', name: 'Negotiation', color: '#F59E0B', order: 3 },
      { id: 'closed_won', name: 'Closed Won', color: '#10B981', order: 4 },
      { id: 'closed_lost', name: 'Closed Lost', color: '#EF4444', order: 5 },
    ],
  },
  customer_success: {
    stages: [
      { id: 'onboarding', name: 'Onboarding', color: '#3B82F6', order: 0 },
      { id: 'active', name: 'Active', color: '#10B981', order: 1 },
      { id: 'at_risk', name: 'At Risk', color: '#F59E0B', order: 2 },
      { id: 'churned', name: 'Churned', color: '#EF4444', order: 3 },
      { id: 'renewal', name: 'Renewal', color: '#8B5CF6', order: 4 },
    ],
  },
};

function getValidStages(role) {
  const def = STAGE_DEFINITIONS[role];
  return def ? def.stages.map(s => s.id) : [];
}

async function detectStage(agentId, chatJid, conversationMessages, role) {
  const stageList = getValidStages(role);
  if (stageList.length === 0) return null;

  const transcript = buildTranscript(conversationMessages);

  const stageDescriptions = role === 'sales'
    ? 'lead (initial contact, no qualification yet), qualified (needs identified, budget/authority discussed), proposal (proposal sent or being discussed), negotiation (terms being negotiated), closed_won (deal done), closed_lost (deal lost/rejected)'
    : 'onboarding (new client getting set up), active (healthy engaged client), at_risk (declining engagement, complaints, issues), churned (client has left or gone silent), renewal (renewal period, re-engagement discussion)';

  const prompt = `You are a ${role.replace('_', ' ')} pipeline analyst. Based on the conversation below, determine the current stage of this client relationship.

Valid stages: ${stageDescriptions}

Conversation:
${transcript}

Respond in JSON only:
{"stage": "one of: ${stageList.join(', ')}", "confidence": 0.0-1.0, "reasoning": "one sentence explanation"}`;

  return callLlmForJsonAuto(prompt, 512);
}

function updateStage(agentId, chatJid, chatName, newStage, confidence, reasoning) {
  const db = getDb();

  const existing = db.prepare(
    'SELECT stage FROM client_stages WHERE agent_id = ? AND chat_jid = ?'
  ).get(agentId, chatJid);

  const previousStage = existing ? existing.stage : null;

  if (existing) {
    db.prepare(`
      UPDATE client_stages SET stage = ?, chat_name = ?, confidence = ?, reasoning = ?, previous_stage = ?, updated_at = CURRENT_TIMESTAMP
      WHERE agent_id = ? AND chat_jid = ?
    `).run(newStage, chatName, confidence, reasoning, previousStage, agentId, chatJid);
  } else {
    db.prepare(`
      INSERT INTO client_stages (agent_id, chat_jid, chat_name, stage, confidence, reasoning, previous_stage)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(agentId, chatJid, chatName, newStage, confidence, reasoning, previousStage);
  }

  // Log stage change if different
  if (previousStage !== newStage) {
    db.prepare(
      'INSERT INTO stage_history (agent_id, chat_jid, from_stage, to_stage, reasoning) VALUES (?, ?, ?, ?, ?)'
    ).run(agentId, chatJid, previousStage, newStage, reasoning);

    eventBus.emit('pipeline:stage_changed', {
      agent_id: agentId, chat_jid: chatJid, chat_name: chatName,
      from_stage: previousStage, to_stage: newStage, reasoning,
    });
  }

  return { stage: newStage, previous_stage: previousStage, confidence, reasoning };
}

async function detectAndUpdateStage(agentId, chatJid, conversationMessages, role, chatName) {
  const result = await detectStage(agentId, chatJid, conversationMessages, role);
  if (!result || !result.stage) return null;

  const valid = getValidStages(role);
  if (!valid.includes(result.stage)) {
    console.warn(`[Stage] LLM returned invalid stage "${result.stage}" for role "${role}"`);
    return null;
  }

  return updateStage(agentId, chatJid, chatName || null, result.stage, result.confidence, result.reasoning);
}

function getStage(agentId, chatJid) {
  const db = getDb();
  return db.prepare('SELECT * FROM client_stages WHERE agent_id = ? AND chat_jid = ?').get(agentId, chatJid);
}

function getAllStages(role) {
  const db = getDb();
  let query = `
    SELECT cs.*, a.name as agent_name, a.role as agent_role
    FROM client_stages cs
    JOIN agents a ON a.id = cs.agent_id
  `;
  if (role) {
    query += ' WHERE a.role = ?';
    return db.prepare(query + ' ORDER BY cs.updated_at DESC').all(role);
  }
  return db.prepare(query + " WHERE a.role != 'general' ORDER BY cs.updated_at DESC").all();
}

function getStageHistory(agentId, chatJid) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM stage_history WHERE agent_id = ? AND chat_jid = ? ORDER BY created_at DESC LIMIT 50'
  ).all(agentId, chatJid);
}

function manualOverrideStage(agentId, chatJid, stage, reasoning) {
  const agent = require('./agent.service').getAgentById(agentId);
  if (!agent) throw new Error('Agent not found');
  const valid = getValidStages(agent.role);
  if (!valid.includes(stage)) throw new Error(`Invalid stage "${stage}" for role "${agent.role}"`);

  const chatName = getStage(agentId, chatJid)?.chat_name || null;
  return updateStage(agentId, chatJid, chatName, stage, 1.0, reasoning || 'Manual override');
}

module.exports = {
  STAGE_DEFINITIONS,
  detectStage,
  updateStage,
  detectAndUpdateStage,
  getStage,
  getAllStages,
  getStageHistory,
  manualOverrideStage,
  getValidStages,
};
