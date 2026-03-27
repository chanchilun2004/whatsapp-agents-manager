// Shared sender name cache — avoids circular dependency between index.js and routes
const senderNameCache = new Map();

// Cap at 5000 entries to prevent unbounded growth
const MAX_CACHE_SIZE = 5000;

function set(sender, name) {
  if (senderNameCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const firstKey = senderNameCache.keys().next().value;
    senderNameCache.delete(firstKey);
  }
  senderNameCache.set(sender, name);
}

function get(sender) {
  return senderNameCache.get(sender) || '';
}

function has(sender) {
  return senderNameCache.has(sender) && senderNameCache.get(sender);
}

module.exports = { set, get, has };
