const { mcpClient } = require('./mcp-client');

async function listChats(query, limit = 20, page = 0) {
  return mcpClient.listChats(query, limit, page);
}

async function listMessages(chatJid, after, limit = 20) {
  return mcpClient.listMessages(chatJid, after, limit);
}

async function searchContacts(query) {
  return mcpClient.searchContacts(query);
}

async function getChat(chatJid) {
  return mcpClient.getChat(chatJid);
}

async function sendMessage(recipient, message) {
  return mcpClient.sendMessage(recipient, message);
}

async function getConversationContext(chatJid, messageCount = 20) {
  const messages = await mcpClient.listMessages(chatJid, null, messageCount);
  // MCP returns DESC (newest first), reverse to chronological order for LLM
  if (Array.isArray(messages)) {
    return messages.reverse();
  }
  return messages;
}

async function downloadMedia(messageId, chatJid) {
  return mcpClient.downloadMedia(messageId, chatJid);
}

module.exports = {
  listChats,
  listMessages,
  searchContacts,
  getChat,
  sendMessage,
  getConversationContext,
  downloadMedia,
};
