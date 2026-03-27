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
  // Check agent_targets first (new multi-chat model), fallback to legacy target_jid
  // Per-chat auto_reply_mode overrides agent-level mode
  const fromTargets = db.prepare(`
    SELECT DISTINCT a.*, at.auto_reply_mode as chat_auto_reply_mode FROM agents a
    JOIN agent_targets at ON a.id = at.agent_id
    WHERE at.chat_jid = ? AND a.is_active = 1
  `).all(chatJid).map(a => {
    // Effective mode: per-chat override > agent default
    const effectiveMode = a.chat_auto_reply_mode || a.auto_reply_mode;
    return { ...a, effective_auto_reply_mode: effectiveMode };
  }).filter(a => a.effective_auto_reply_mode !== 'off');

  const fromLegacy = db.prepare(`
    SELECT * FROM agents
    WHERE target_jid = ? AND is_active = 1 AND auto_reply_mode != 'off'
      AND id NOT IN (SELECT DISTINCT agent_id FROM agent_targets)
  `).all(chatJid).map(a => ({ ...a, effective_auto_reply_mode: a.auto_reply_mode }));

  return [...fromTargets, ...fromLegacy];
}

function createAgent({ name, system_prompt, target_jid, target_name, llm_provider, llm_model, auto_reply_mode, context_message_count, role }) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO agents (name, system_prompt, target_jid, target_name, llm_provider, llm_model, auto_reply_mode, context_message_count, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, system_prompt, target_jid || '', target_name || null, llm_provider, llm_model, auto_reply_mode || 'off', context_message_count || 20, role || 'general');
  return getAgentById(result.lastInsertRowid);
}

function updateAgent(id, fields) {
  const db = getDb();
  const allowed = ['name', 'system_prompt', 'target_jid', 'target_name', 'llm_provider', 'llm_model', 'auto_reply_mode', 'is_active', 'context_message_count', 'role'];
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

// Agent targets (multi-chat assignment)
function addAgentTarget(agentId, chatJid, chatName, autoReplyMode) {
  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO agent_targets (agent_id, chat_jid, chat_name, auto_reply_mode) VALUES (?, ?, ?, ?)').run(agentId, chatJid, chatName || null, autoReplyMode || null);
  return getAgentTargets(agentId);
}

function updateTargetMode(agentId, chatJid, autoReplyMode) {
  const db = getDb();
  // null means use agent default
  const mode = autoReplyMode === 'default' ? null : autoReplyMode;
  db.prepare('UPDATE agent_targets SET auto_reply_mode = ? WHERE agent_id = ? AND chat_jid = ?').run(mode, agentId, chatJid);
  return getAgentTargets(agentId);
}

function removeAgentTarget(agentId, chatJid) {
  const db = getDb();
  db.prepare('DELETE FROM agent_targets WHERE agent_id = ? AND chat_jid = ?').run(agentId, chatJid);
  return getAgentTargets(agentId);
}

function getAgentTargets(agentId) {
  const db = getDb();
  return db.prepare('SELECT * FROM agent_targets WHERE agent_id = ? ORDER BY created_at DESC').all(agentId);
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
  addAgentTarget,
  removeAgentTarget,
  getAgentTargets,
  updateTargetMode,
  logAgentEvent,
  getAgentLogs,
};
