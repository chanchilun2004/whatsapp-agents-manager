const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { getDb } = require('../db/app-db');

class McpConnection {
  constructor(name, urlGetter) {
    this.name = name;
    this.urlGetter = urlGetter;
    this.client = null;
    this.connected = false;
    this._connectingPromise = null;
  }

  getUrl() {
    return typeof this.urlGetter === 'function' ? this.urlGetter() : this.urlGetter;
  }

  async connect() {
    if (this.connected && this.client) return;
    // Prevent concurrent connect attempts
    if (this._connectingPromise) return this._connectingPromise;

    this._connectingPromise = (async () => {
      try {
        const sseUrl = this.getUrl();
        console.log(`[MCP:${this.name}] Connecting to ${sseUrl}...`);

        this.client = new Client({ name: `whatsapp-agents-${this.name}`, version: '1.0.0' });
        const transport = new SSEClientTransport(new URL(sseUrl));
        await this.client.connect(transport);
        this.connected = true;
        console.log(`[MCP:${this.name}] Connected successfully`);
      } finally {
        this._connectingPromise = null;
      }
    })();
    return this._connectingPromise;
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.connected = false;
    }
  }

  tryParseJson(text) {
    try { return JSON.parse(text); }
    catch (e) { if (e instanceof SyntaxError) return text; throw e; }
  }

  parseResult(result) {
    if (result.structuredContent && result.structuredContent.result !== undefined) {
      return result.structuredContent.result;
    }
    if (result.content && result.content.length > 0) {
      if (result.content.length === 1) {
        return this.tryParseJson(result.content[0].text);
      }
      return result.content.map(item => this.tryParseJson(item.text));
    }
    return result;
  }

  async callTool(name, args = {}) {
    if (!this.connected) await this.connect();
    try {
      const result = await this.client.callTool({ name, arguments: args });
      return this.parseResult(result);
    } catch (err) {
      console.error(`[MCP:${this.name}] Tool call ${name} failed:`, err.message);
      this.connected = false;
      try {
        await this.connect();
        const result = await this.client.callTool({ name, arguments: args });
        return this.parseResult(result);
      } catch (retryErr) {
        this.connected = false;
        throw retryErr;
      }
    }
  }
}

// MCP connection pool
const connections = {};

function getWhatsAppSseUrl() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('mcp_sse_url');
  return row ? row.value : 'https://alanworkphone.zeabur.app/sse';
}

function getConnection(name) {
  if (!connections[name]) {
    throw new Error(`MCP connection "${name}" not registered`);
  }
  return connections[name];
}

function registerConnection(name, urlGetter) {
  connections[name] = new McpConnection(name, urlGetter);
  return connections[name];
}

// Register default WhatsApp connection
registerConnection('whatsapp', getWhatsAppSseUrl);

// Backward-compatible singleton that delegates to the 'whatsapp' connection
const mcpClient = {
  get connected() {
    return connections.whatsapp?.connected || false;
  },

  connect() {
    return connections.whatsapp.connect();
  },

  disconnect() {
    return connections.whatsapp.disconnect();
  },

  callTool(name, args) {
    return connections.whatsapp.callTool(name, args);
  },

  // Convenience methods
  listChats(query, limit = 20, page = 0) {
    return this.callTool('list_chats', { query, limit, page, include_last_message: true, sort_by: 'last_active' });
  },
  listMessages(chatJid, after, limit = 20) {
    const args = { chat_jid: chatJid, limit, include_context: false };
    if (after) args.after = after;
    return this.callTool('list_messages', args);
  },
  searchContacts(query) {
    return this.callTool('search_contacts', { query });
  },
  getChat(chatJid) {
    return this.callTool('get_chat', { chat_jid: chatJid, include_last_message: true });
  },
  getMessageContext(messageId, before = 10, after = 5) {
    return this.callTool('get_message_context', { message_id: messageId, before, after });
  },
  sendMessage(recipient, message) {
    return this.callTool('send_message', { recipient, message });
  },
  getLastInteraction(jid) {
    return this.callTool('get_last_interaction', { jid });
  },
  getDirectChatByContact(phoneNumber) {
    return this.callTool('get_direct_chat_by_contact', { sender_phone_number: phoneNumber });
  },
  downloadMedia(messageId, chatJid) {
    return this.callTool('download_media', { message_id: messageId, chat_jid: chatJid });
  },
};

module.exports = { mcpClient, McpConnection, getConnection, registerConnection, connections };
