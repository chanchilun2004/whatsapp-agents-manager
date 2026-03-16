const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getDb } = require('../db/app-db');

function getApiKey(provider) {
  const db = getDb();
  const key = provider === 'openai' ? 'openai_api_key' : 'gemini_api_key';
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function formatMessagesForLLM(rawMessages, systemPrompt) {
  const messages = [];
  if (!Array.isArray(rawMessages)) return messages;

  for (const msg of rawMessages) {
    const role = msg.is_from_me ? 'assistant' : 'user';
    let content = msg.content || '';
    // For group chats, prefix with sender name
    if (!msg.is_from_me && msg.sender) {
      content = `[${msg.sender}]: ${content}`;
    }
    if (content.trim()) {
      messages.push({ role, content });
    }
  }
  return messages;
}

async function generateReplyOpenAI(model, apiKey, systemPrompt, conversationMessages) {
  const client = new OpenAI({ apiKey });
  const messages = [
    { role: 'system', content: systemPrompt },
    ...formatMessagesForLLM(conversationMessages),
  ];

  const response = await client.chat.completions.create({
    model: model || 'gpt-4o',
    messages,
    max_tokens: 1024,
  });

  return response.choices[0].message.content;
}

async function generateReplyGemini(model, apiKey, systemPrompt, conversationMessages) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model: model || 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  const formatted = formatMessagesForLLM(conversationMessages);
  const history = formatted.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = formatted.length > 0 ? formatted[formatted.length - 1].content : '';

  const chat = genModel.startChat({ history });
  const result = await chat.sendMessage(lastMessage);
  return result.response.text();
}

async function generateReply({ provider, model, systemPrompt, conversationMessages }) {
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please set it in Settings.`);
  }

  if (provider === 'openai') {
    return generateReplyOpenAI(model, apiKey, systemPrompt, conversationMessages);
  } else if (provider === 'gemini') {
    return generateReplyGemini(model, apiKey, systemPrompt, conversationMessages);
  } else {
    throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

module.exports = { generateReply };
