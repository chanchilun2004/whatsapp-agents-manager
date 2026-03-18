const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MCP_TOOLS_GEMINI, executeTool } = require('./tools');

function formatMessages(rawMessages) {
  const messages = [];
  if (!Array.isArray(rawMessages)) return messages;
  for (const msg of rawMessages) {
    const role = msg.is_from_me ? 'model' : 'user';
    const textContent = msg.content || '';
    const prefix = (!msg.is_from_me && msg.sender) ? `[${msg.sender}]: ` : '';
    const parts = [];
    if (textContent.trim() || prefix.trim()) parts.push({ text: prefix + textContent });
    if (msg.image_base64) parts.push({ inlineData: { mimeType: msg.image_mime || 'image/jpeg', data: msg.image_base64 } });
    if (parts.length > 0) messages.push({ role, parts });
  }
  return messages;
}

async function generateReply(model, apiKey, systemPrompt, conversationMessages) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model: model || 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    tools: MCP_TOOLS_GEMINI,
    generationConfig: { maxOutputTokens: 2048 },
  });

  const allFormatted = formatMessages(conversationMessages);
  const firstUserIdx = allFormatted.findIndex(m => m.role === 'user');
  const formatted = firstUserIdx >= 0 ? allFormatted.slice(firstUserIdx) : allFormatted;

  if (formatted.length === 0) {
    throw new Error('No user messages found in conversation context');
  }

  const history = formatted.slice(0, -1);
  const lastMessage = formatted[formatted.length - 1].parts;

  const chat = genModel.startChat({ history });

  let response = await chat.sendMessage(lastMessage);

  for (let i = 0; i < 5; i++) {
    const candidate = response.response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const functionCalls = parts.filter(p => p.functionCall);
    if (functionCalls.length === 0) break;

    const functionResponses = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      console.log(`[LLM] Gemini tool call: ${name}(${JSON.stringify(args)})`);
      const result = await executeTool(name, args);
      functionResponses.push({
        functionResponse: { name, response: { result } },
      });
    }

    response = await chat.sendMessage(functionResponses);
  }

  return response.response.text();
}

module.exports = { generateReply, formatMessages };
