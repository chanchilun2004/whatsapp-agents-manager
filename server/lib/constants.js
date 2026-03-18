// Pipeline step names — single source of truth
const PIPELINE_STEPS = {
  MESSAGE_RECEIVED: 'message_received',
  DOWNLOADING_MEDIA: 'downloading_media',
  FETCHING_CONTEXT: 'fetching_context',
  LOADING_MEMORY: 'loading_memory',
  CALLING_LLM: 'calling_llm',
  REPLY_READY: 'reply_ready',
};

// Media download timing
const MEDIA_INITIAL_DELAY_MS = 500;
const MEDIA_RETRY_DELAY_MS = 1500;
const MEDIA_MAX_ATTEMPTS = 2;

module.exports = {
  PIPELINE_STEPS,
  MEDIA_INITIAL_DELAY_MS,
  MEDIA_RETRY_DELAY_MS,
  MEDIA_MAX_ATTEMPTS,
};
