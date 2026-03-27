function buildTranscript(messages) {
  return messages.map(m => {
    const sender = m.is_from_me ? 'Agent' : (m.sender || 'Client');
    return `[${sender}]: ${m.content || '[media]'}`;
  }).join('\n');
}

module.exports = { buildTranscript };
