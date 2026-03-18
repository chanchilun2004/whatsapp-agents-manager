const { mcpClient } = require('../mcp-client');

// MCP tools definition for Gemini function calling
const MCP_TOOLS_GEMINI = [{
  functionDeclarations: [
    {
      name: 'search_contacts',
      description: 'Search WhatsApp contacts by name or phone number',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search term' } }, required: ['query'] },
    },
    {
      name: 'list_messages',
      description: 'Search WhatsApp messages by keyword, sender, chat, or date range',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword in message content' },
          chat_jid: { type: 'string', description: 'Filter by chat JID' },
          sender_phone_number: { type: 'string', description: 'Filter by sender phone number' },
          after: { type: 'string', description: 'ISO-8601 date, return messages after this date' },
          before: { type: 'string', description: 'ISO-8601 date, return messages before this date' },
          limit: { type: 'integer', description: 'Max messages to return (default 20)' },
        },
      },
    },
    {
      name: 'list_chats',
      description: 'List WhatsApp chats, optionally filter by name',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search chats by name' },
          limit: { type: 'integer', description: 'Max chats to return (default 20)' },
        },
      },
    },
    {
      name: 'get_chat',
      description: 'Get WhatsApp chat details by JID',
      parameters: { type: 'object', properties: { chat_jid: { type: 'string' } }, required: ['chat_jid'] },
    },
    {
      name: 'get_direct_chat_by_contact',
      description: 'Find a direct chat by phone number',
      parameters: { type: 'object', properties: { sender_phone_number: { type: 'string' } }, required: ['sender_phone_number'] },
    },
    {
      name: 'get_contact_chats',
      description: 'Get all chats involving a contact',
      parameters: { type: 'object', properties: { jid: { type: 'string' } }, required: ['jid'] },
    },
    {
      name: 'get_last_interaction',
      description: 'Get most recent message from a contact',
      parameters: { type: 'object', properties: { jid: { type: 'string' } }, required: ['jid'] },
    },
    {
      name: 'get_message_context',
      description: 'Get messages before and after a specific message',
      parameters: {
        type: 'object',
        properties: {
          message_id: { type: 'string' },
          before: { type: 'integer', description: 'Messages before (default 5)' },
          after: { type: 'integer', description: 'Messages after (default 5)' },
        },
        required: ['message_id'],
      },
    },
    {
      name: 'send_message',
      description: 'Send a WhatsApp message to a person or group',
      parameters: {
        type: 'object',
        properties: {
          recipient: { type: 'string', description: 'Phone number or JID' },
          message: { type: 'string', description: 'Message text' },
        },
        required: ['recipient', 'message'],
      },
    },
    {
      name: 'web_search',
      description: 'Search the internet for information using DuckDuckGo',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'fetch_webpage',
      description: 'Fetch and read the text content of any webpage URL',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
  ],
}];

// OpenAI function calling tools (derived from Gemini format)
const MCP_TOOLS_OPENAI = MCP_TOOLS_GEMINI[0].functionDeclarations.map(fn => ({
  type: 'function',
  function: {
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters,
  },
}));

const MAX_TOOL_RESULT_LEN = 3000;

function truncateResult(obj) {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return str.substring(0, MAX_TOOL_RESULT_LEN);
}

async function executeWebSearch(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsAppAgent/1.0)' },
  });
  const html = await res.text();
  // Extract result snippets from DDG HTML
  const results = [];
  const regex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>(.+?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = regex.exec(html)) && results.length < 5) {
    results.push({
      url: match[1],
      title: match[2].replace(/<[^>]+>/g, ''),
      snippet: match[3].replace(/<[^>]+>/g, ''),
    });
  }
  return results.length > 0 ? results : [{ message: 'No results found' }];
}

async function executeFetchWebpage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsAppAgent/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  const html = await res.text();
  // Strip HTML tags for a text-only version
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.substring(0, 4000);
}

// Execute a tool call — routes to MCP or built-in
async function executeTool(name, args) {
  try {
    if (name === 'web_search') {
      return truncateResult(await executeWebSearch(args.query));
    }
    if (name === 'fetch_webpage') {
      return truncateResult(await executeFetchWebpage(args.url));
    }
    // MCP tool
    if (!mcpClient.connected) await mcpClient.connect();
    const result = await mcpClient.callTool(name, args || {});
    return truncateResult(result);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

module.exports = {
  MCP_TOOLS_GEMINI,
  MCP_TOOLS_OPENAI,
  executeTool,
};
