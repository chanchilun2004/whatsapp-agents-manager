const fs = require('fs');
const path = require('path');
const { getDb } = require('../../db/app-db');
const openaiAdapter = require('./openai');
const geminiAdapter = require('./gemini');

// Cache API keys to avoid hitting DB on every LLM call
const apiKeyCache = { openai: null, gemini: null, _ts: 0 };
const API_KEY_CACHE_TTL_MS = 30000;

function getApiKey(provider) {
  const now = Date.now();
  const cacheKey = provider === 'openai' ? 'openai' : 'gemini';
  if (apiKeyCache[cacheKey] !== null && (now - apiKeyCache._ts) < API_KEY_CACHE_TTL_MS) {
    return apiKeyCache[cacheKey];
  }
  const db = getDb();
  const dbKey = provider === 'openai' ? 'openai_api_key' : 'gemini_api_key';
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(dbKey);
  const value = row ? row.value : '';
  apiKeyCache[cacheKey] = value;
  apiKeyCache._ts = now;
  return value;
}

function readImageAsBase64(filePath) {
  try { return fs.readFileSync(filePath).toString('base64'); }
  catch { return null; }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  return types[ext] || 'image/jpeg';
}

const REPLY_INSTRUCTION = `\n\nIMPORTANT RULES:
- Only reply to the LAST message in the conversation
- Keep your reply short and concise — one message only, like a real chat reply
- You have access to WhatsApp tools. If someone asks you to search messages, find contacts, look up past conversations, or retrieve information, USE the tools to find the answer before replying
- When using tools, summarize the results naturally in your reply
- You can use web_search to search the internet and fetch_webpage to read any URL`;

function buildMemoryBlock(agentId, chatJid) {
  const db = getDb();

  const facts = db.prepare(
    'SELECT content FROM agent_memory WHERE agent_id = ? AND chat_jid = ? AND memory_type = ? ORDER BY created_at DESC'
  ).all(agentId, chatJid, 'fact');

  const logs = db.prepare(
    'SELECT content, created_at FROM agent_memory WHERE agent_id = ? AND chat_jid = ? AND memory_type = ? ORDER BY created_at DESC LIMIT 5'
  ).all(agentId, chatJid, 'daily_log');

  if (facts.length === 0 && logs.length === 0) return '';

  let block = '\n\n=== Memory about this contact ===';
  if (facts.length > 0) {
    block += '\n' + facts.map(f => `- ${f.content}`).join('\n');
  }
  if (logs.length > 0) {
    block += '\n\n=== Recent conversation summaries ===';
    block += '\n' + logs.map(l => {
      const date = new Date(l.created_at).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
      return `- ${date}: ${l.content}`;
    }).join('\n');
  }
  return block;
}

async function generateReply({ provider, model, systemPrompt, conversationMessages, agentId, chatJid }) {
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please set it in Settings.`);
  }

  const memoryBlock = (agentId && chatJid) ? buildMemoryBlock(agentId, chatJid) : '';
  const fullPrompt = systemPrompt + REPLY_INSTRUCTION + memoryBlock;

  if (provider === 'openai') {
    return openaiAdapter.generateReply(model, apiKey, fullPrompt, conversationMessages);
  } else if (provider === 'gemini') {
    return geminiAdapter.generateReply(model, apiKey, fullPrompt, conversationMessages);
  } else {
    throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

module.exports = { generateReply, readImageAsBase64, getMimeType, getApiKey };
