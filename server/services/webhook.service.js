const { runPipeline } = require('./pipeline');

async function handleIncomingMessage(payload) {
  await runPipeline(payload);
}

module.exports = { handleIncomingMessage };
