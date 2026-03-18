const { getDb } = require('../db/app-db');
const whatsappService = require('./whatsapp.service');
const { logAgentEvent } = require('./agent.service');

function createApproval({ agent_id, chat_jid, trigger_message_id, trigger_message_text, trigger_sender, draft_reply }) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO approvals (agent_id, chat_jid, trigger_message_id, trigger_message_text, trigger_sender, draft_reply)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(agent_id, chat_jid, trigger_message_id || null, trigger_message_text || null, trigger_sender || null, draft_reply);
  return getApprovalById(result.lastInsertRowid);
}

function getApprovalById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, ag.name as agent_name
    FROM approvals a
    LEFT JOIN agents ag ON a.agent_id = ag.id
    WHERE a.id = ?
  `).get(id);
}

function listApprovals(status = 'pending', limit = 50) {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, ag.name as agent_name
    FROM approvals a
    LEFT JOIN agents ag ON a.agent_id = ag.id
    WHERE a.status = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(status, limit);
}

function getPendingCount() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'").get();
  return row.count;
}

async function approveAndSend(id) {
  const db = getDb();
  const approval = getApprovalById(id);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'pending') throw new Error('Approval is not pending');
  if (!approval.draft_reply || approval.draft_reply.trim() === '') throw new Error('Cannot send empty reply');

  await whatsappService.sendMessage(approval.chat_jid, approval.draft_reply);

  db.prepare(`
    UPDATE approvals SET status = 'approved', final_reply = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(approval.draft_reply, id);

  logAgentEvent(approval.agent_id, 'reply_sent', {
    approval_id: id,
    reply: approval.draft_reply,
    chat_jid: approval.chat_jid,
  });

  return getApprovalById(id);
}

async function editAndSend(id, editedReply) {
  const db = getDb();
  const approval = getApprovalById(id);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'pending') throw new Error('Approval is not pending');

  await whatsappService.sendMessage(approval.chat_jid, editedReply);

  db.prepare(`
    UPDATE approvals SET status = 'edited', final_reply = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(editedReply, id);

  logAgentEvent(approval.agent_id, 'reply_sent', {
    approval_id: id,
    original_draft: approval.draft_reply,
    final_reply: editedReply,
    chat_jid: approval.chat_jid,
  });

  return getApprovalById(id);
}

function rejectApproval(id) {
  const db = getDb();
  const approval = getApprovalById(id);
  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'pending') throw new Error('Approval is not pending');

  db.prepare(`
    UPDATE approvals SET status = 'rejected', resolved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(id);

  logAgentEvent(approval.agent_id, 'reply_rejected', { approval_id: id, chat_jid: approval.chat_jid });
  return getApprovalById(id);
}

module.exports = {
  createApproval,
  getApprovalById,
  listApprovals,
  getPendingCount,
  approveAndSend,
  editAndSend,
  rejectApproval,
};
