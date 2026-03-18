const { getDb } = require('../db/app-db');
const { generateReply } = require('./llm/index');
const whatsappService = require('./whatsapp.service');

const SCAN_PROMPT = `You are analyzing WhatsApp messages to identify actionable work-related items. For each conversation provided, identify messages that contain:
- Scheduled meetings or calls (type: "meeting")
- Deadlines or due dates (type: "deadline")
- Follow-up requests or pending replies (type: "follow_up")
- Pending tasks or action items (type: "task")
- Important unanswered questions (type: "unanswered")
- Other important work items (type: "other")

Respond with a JSON array. Each item must have:
- message_text: the exact original message (or key excerpt, max 200 chars)
- sender: who sent it
- type: one of meeting/deadline/follow_up/task/unanswered/other
- summary: a brief 1-sentence summary of what action is needed (in the same language as the message)
- urgency: "low", "normal", or "high"

If no actionable items are found, return an empty array [].
Respond ONLY with a valid JSON array, no markdown, no code fences.`;

function getSetting(key, defaultVal) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
}

async function scanChats(chatJids) {
  const db = getDb();

  // Get chats to scan
  let chats;
  if (chatJids && chatJids.length > 0) {
    chats = chatJids.map(jid => ({ jid }));
  } else {
    const result = await whatsappService.listChats(undefined, 20, 0);
    chats = Array.isArray(result) ? result : [];
  }

  const provider = getSetting('reminder_llm_provider', 'gemini');
  const model = getSetting('reminder_llm_model', 'gemini-2.5-flash');
  let totalFound = 0;

  for (const chat of chats) {
    const chatJid = chat.jid || chat.chat_jid;
    if (!chatJid) continue;

    try {
      const messages = await whatsappService.listMessages(chatJid, null, 30);
      if (!Array.isArray(messages) || messages.length === 0) continue;

      // Format messages as a transcript
      const transcript = messages.map(m => {
        const sender = m.is_from_me ? 'Me' : (m.sender || 'Unknown');
        const time = m.timestamp || '';
        return `[${time}] ${sender}: ${m.content || '[media]'}`;
      }).join('\n');

      // Call LLM to analyze
      const reply = await generateReply({
        provider,
        model,
        systemPrompt: SCAN_PROMPT,
        conversationMessages: [
          { content: `Chat: ${chat.name || chatJid}\n\n${transcript}`, is_from_me: false, sender: 'system' }
        ],
      });

      // Parse JSON response
      let items = [];
      try {
        const cleaned = reply.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        items = JSON.parse(cleaned);
        if (!Array.isArray(items)) items = [];
      } catch {
        continue;
      }

      // Insert reminders, dedup by message_text
      for (const item of items) {
        if (!item.summary || !item.type) continue;

        // Check for duplicate
        const existing = db.prepare(
          "SELECT id FROM reminders WHERE chat_jid = ? AND message_text = ? AND status = 'active'"
        ).get(chatJid, (item.message_text || '').substring(0, 200));
        if (existing) continue;

        db.prepare(`
          INSERT INTO reminders (chat_jid, chat_name, message_sender, message_text, reminder_type, summary, urgency)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          chatJid,
          chat.name || chatJid,
          item.sender || '',
          (item.message_text || '').substring(0, 500),
          ['meeting', 'deadline', 'follow_up', 'task', 'unanswered', 'other'].includes(item.type) ? item.type : 'other',
          item.summary,
          ['low', 'normal', 'high'].includes(item.urgency) ? item.urgency : 'normal'
        );
        totalFound++;
      }
    } catch (err) {
      console.error(`[Reminders] Error scanning ${chatJid}:`, err.message);
    }
  }

  return { chats_scanned: chats.length, reminders_found: totalFound };
}

function listReminders(status = 'active', limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM reminders WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit);
}

function getActiveCount() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM reminders WHERE status = 'active'").get();
  return row.count;
}

function dismissReminder(id) {
  const db = getDb();
  db.prepare("UPDATE reminders SET status = 'dismissed' WHERE id = ?").run(id);
}

async function sendReminder(id, recipient) {
  const db = getDb();
  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
  if (!reminder) throw new Error('Reminder not found');

  const phone = recipient || getSetting('reminder_recipient_phone', '85291757723');
  const message = `*[Reminder]* ${reminder.summary}\n\nFrom: ${reminder.message_sender}\nChat: ${reminder.chat_name}\n\n"${reminder.message_text}"`;

  await whatsappService.sendMessage(phone, message);

  db.prepare("UPDATE reminders SET status = 'sent', sent_to = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(phone, id);
  return { success: true, sent_to: phone };
}

module.exports = { scanChats, listReminders, getActiveCount, dismissReminder, sendReminder };
