const { getApiKey } = require('./index');

function extractJson(text) {
  // Try direct parse first
  try { return JSON.parse(text); } catch {}
  // Try extracting JSON from markdown code block
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) try { return JSON.parse(match[1].trim()); } catch {}
  // Try finding first { ... } block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) try { return JSON.parse(braceMatch[0]); } catch {}
  throw new Error(`Failed to parse JSON from LLM response: ${text.substring(0, 100)}`);
}

async function callLlmForJson(provider, apiKey, prompt, maxTokens = 256) {
  if (provider === 'openai') {
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    });
    return extractJson(response.choices[0].message.content);
  }
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const response = await model.generateContent(prompt);
  const text = response.response.text();
  try {
    return extractJson(text);
  } catch (e) {
    console.error('[LLM JSON] Gemini response length:', text.length, 'text:', text.substring(0, 300));
    throw e;
  }
}

/**
 * Convenience: resolve provider + key automatically, then call LLM.
 * Falls back to whichever provider has a key configured.
 */
async function callLlmForJsonAuto(prompt, maxTokens = 256, preferredProvider) {
  let provider = preferredProvider || 'gemini';
  let apiKey = getApiKey(provider);
  if (!apiKey) {
    provider = provider === 'gemini' ? 'openai' : 'gemini';
    apiKey = getApiKey(provider);
  }
  if (!apiKey) throw new Error('No LLM API key configured. Set one in Settings.');
  return callLlmForJson(provider, apiKey, prompt, maxTokens);
}

module.exports = { callLlmForJson, callLlmForJsonAuto };
