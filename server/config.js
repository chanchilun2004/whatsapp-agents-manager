require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  appDbPath: process.env.APP_DB_PATH || './data/app.db',
  mcpSseUrl: process.env.MCP_SSE_URL || 'https://alanworkphone.zeabur.app/sse',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
};
