const OpenAI = require('openai');
const { MCP_TOOLS_OPENAI, executeTool } = require('./tools');

function formatMessages(rawMessages) {
  const messages = [];
  if (!Array.isArray(rawMessages)) return messages;
  for (const msg of rawMessages) {
    const role = msg.is_from_me ? 'assistant' : 'user';
    const textContent = msg.content || '';
    const prefix = (!msg.is_from_me && msg.sender) ? `[${msg.sender}]: ` : '';
    if (msg.image_base64) {
      const parts = [];
      if (textContent || prefix) parts.push({ type: 'text', text: prefix + textContent });
      parts.push({ type: 'image_url', image_url: { url: `data:${msg.image_mime || 'image/jpeg'};base64,${msg.image_base64}` } });
      messages.push({ role, content: parts });
    } else if (textContent.trim() || prefix.trim()) {
      messages.push({ role, content: prefix + textContent });
    }
  }
  return messages;
}

async function generateReply(model, apiKey, systemPrompt, conversationMessages) {
  const client = new OpenAI({ apiKey });
  const formatted = formatMessages(conversationMessages);
  const messages = [{ role: 'system', content: systemPrompt }, ...formatted];

  for (let i = 0; i < 5; i++) {
    const response = await client.chat.completions.create({
      model: model || 'gpt-4o',
      messages,
      max_tokens: 512,
      tools: MCP_TOOLS_OPENAI,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];

    if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls) {
      messages.push(choice.message);
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        console.log(`[LLM] OpenAI tool call: ${toolCall.function.name}(${JSON.stringify(args)})`);
        const result = await executeTool(toolCall.function.name, args);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
      }
      continue;
    }

    return choice.message.content || '';
  }

  return messages[messages.length - 1]?.content || '';
}

module.exports = { generateReply, formatMessages };
