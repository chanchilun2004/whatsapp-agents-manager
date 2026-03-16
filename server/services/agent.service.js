const { getDb } = require('../db/app-db');

function getAllAgents() {
  const db = getDb();
  return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();
}

function getAgentById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
}

function getActiveAgentsByJid(chatJid) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM agents WHERE target_jid = ? AND is_active = 1 AND auto_reply_mode != 'off'"
  ).all(chatJid);
}

function createAgent({ name, system_prompt, target_jid, target_name, llm_provider, llm_model, auto_reply_mode, context_message_count }) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO agents (name, system_prompt, target_jid, target_name, llm_provider, llm_model, auto_reply_mode, context_message_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, system_prompt, target_jid, target_name || null, llm_provider, llm_model, auto_reply_mode || 'off', context_message_count || 20);
  return getAgentById(result.lastInsertRowid);
}

function updateAgent(id, fields) {
  const db = getDb();
  const allowed = ['name', 'system_prompt', 'target_jid', 'target_name', 'llm_provider', 'llm_model', 'auto_reply_mode', 'is_active', 'context_message_count'];
  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return getAgentById(id);
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return getAgentById(id);
}

function deleteAgent(id) {
  const db = getDb();
  db.prepare('DELETE FROM agents WHERE id = ?').run(id);
}

function toggleAgent(id) {
  const db = getDb();
  db.prepare('UPDATE agents SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  return getAgentById(id);
}

function logAgentEvent(agentId, eventType, details) {
  const db = getDb();
  db.prepare('INSERT INTO agent_logs (agent_id, event_type, details) VALUES (?, ?, ?)').run(
    agentId, eventType, typeof details === 'string' ? details : JSON.stringify(details)
  );
}

function getAgentLogs(agentId, limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_logs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?').all(agentId, limit);
}

module.exports = {
  getAllAgents,
  getAgentById,
  getActiveAgentsByJid,
  createAgent,
  updateAgent,
  deleteAgent,
  toggleAgent,
  logAgentEvent,
  getAgentLogs,
};
