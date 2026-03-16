const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { getDb } = require('../db/app-db');

class McpWhatsAppClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  getSseUrl() {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('mcp_sse_url');
    return row ? row.value : 'https://alanworkphone.zeabur.app/sse';
  }

  async connect() {
    if (this.connected && this.client) return;

    const sseUrl = this.getSseUrl();
    console.log(`[MCP] Connecting to ${sseUrl}...`);

    this.client = new Client({ name: 'whatsapp-agents-manager', version: '1.0.0' });
    const transport = new SSEClientTransport(new URL(sseUrl));
    await this.client.connect(transport);
    this.connected = true;
    console.log('[MCP] Connected successfully');
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.connected = false;
    }
  }

  async callTool(name, args = {}) {
    if (!this.connected) await this.connect();
    try {
      const result = await this.client.callTool({ name, arguments: args });
      if (result.content && result.content.length > 0) {
        const text = result.content[0].text;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
      return result;
    } catch (err) {
      console.error(`[MCP] Tool call ${name} failed:`, err.message);
      // Try reconnecting once
      this.connected = false;
      await this.connect();
      const result = await this.client.callTool({ name, arguments: args });
      if (result.content && result.content.length > 0) {
        const text = result.content[0].text;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
      return result;
    }
  }

  async listChats(query, limit = 20, page = 0) {
    return this.callTool('list_chats', { query, limit, page, include_last_message: true, sort_by: 'last_active' });
  }

  async listMessages(chatJid, after, limit = 20) {
    const args = { chat_jid: chatJid, limit, include_context: false };
    if (after) args.after = after;
    return this.callTool('list_messages', args);
  }

  async searchContacts(query) {
    return this.callTool('search_contacts', { query });
  }

  async getChat(chatJid) {
    return this.callTool('get_chat', { chat_jid: chatJid, include_last_message: true });
  }

  async getMessageContext(messageId, before = 10, after = 5) {
    return this.callTool('get_message_context', { message_id: messageId, before, after });
  }

  async sendMessage(recipient, message) {
    return this.callTool('send_message', { recipient, message });
  }

  async getLastInteraction(jid) {
    return this.callTool('get_last_interaction', { jid });
  }

  async getDirectChatByContact(phoneNumber) {
    return this.callTool('get_direct_chat_by_contact', { sender_phone_number: phoneNumber });
  }
}

// Singleton
const mcpClient = new McpWhatsAppClient();

module.exports = { mcpClient };
