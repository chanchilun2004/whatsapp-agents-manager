const { getDb } = require('../db/app-db');
const { getApiKey } = require('./llm/index');

const EXTRACTION_PROMPT_TEMPLATE = `You are a memory extraction assistant. Given a conversation exchange, do two things:

1. Write a ONE sentence summary of this interaction (for daily log)
2. Extract any important FACTS worth remembering long-term (e.g. names, roles, preferences, prices, agreements). Return only new/noteworthy facts. If nothing noteworthy, return empty array.

Respond in JSON only:
{"summary": "...", "facts": ["fact1", "fact2"]}

If there are no noteworthy facts, use: {"summary": "...", "facts": []}

User message: `;

async function callLlmForJson(provider, apiKey, prompt) {
  if (provider === 'openai') {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 256,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content);
  }
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 256, responseMimeType: 'application/json' },
  });
  const response = await model.generateContent(prompt);
  return JSON.parse(response.response.text());
}

async function extractMemory(agentId, chatJid, triggerMessage, replyText, provider) {
  try {
    const apiKey = getApiKey(provider);
    if (!apiKey) return;

    const prompt = EXTRACTION_PROMPT_TEMPLATE + `${triggerMessage}\nAssistant reply: ${replyText}`;
    const result = await callLlmForJson(provider, apiKey, prompt);

    const db = getDb();

    if (result.summary) {
      db.prepare(
        'INSERT INTO agent_memory (agent_id, chat_jid, memory_type, content) VALUES (?, ?, ?, ?)'
      ).run(agentId, chatJid, 'daily_log', result.summary);
    }

    if (result.facts && result.facts.length > 0) {
      const existing = new Set(
        db.prepare(
          'SELECT content FROM agent_memory WHERE agent_id = ? AND chat_jid = ? AND memory_type = ?'
        ).all(agentId, chatJid, 'fact').map(r => r.content.toLowerCase())
      );

      const insertStmt = db.prepare(
        'INSERT INTO agent_memory (agent_id, chat_jid, memory_type, content) VALUES (?, ?, ?, ?)'
      );
      for (const fact of result.facts) {
        if (fact && !existing.has(fact.toLowerCase())) {
          insertStmt.run(agentId, chatJid, 'fact', fact);
        }
      }
    }

    console.log(`[Memory] Extracted for agent ${agentId}: summary="${result.summary}", ${result.facts?.length || 0} facts`);
  } catch (err) {
    console.warn('[Memory] Extraction failed:', err.message);
  }
}

function getMemories(agentId, chatJid) {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM agent_memory WHERE agent_id = ? AND chat_jid = ? ORDER BY created_at DESC'
  ).all(agentId, chatJid);
}

function deleteMemory(id) {
  const db = getDb();
  db.prepare('DELETE FROM agent_memory WHERE id = ?').run(id);
}

function deleteAllMemories(agentId, chatJid) {
  const db = getDb();
  if (chatJid) {
    db.prepare('DELETE FROM agent_memory WHERE agent_id = ? AND chat_jid = ?').run(agentId, chatJid);
  } else {
    db.prepare('DELETE FROM agent_memory WHERE agent_id = ?').run(agentId);
  }
}

module.exports = { extractMemory, getMemories, deleteMemory, deleteAllMemories };
