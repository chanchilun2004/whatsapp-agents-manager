CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    target_jid TEXT NOT NULL,
    target_name TEXT,
    llm_provider TEXT NOT NULL CHECK(llm_provider IN ('openai', 'gemini')),
    llm_model TEXT NOT NULL,
    auto_reply_mode TEXT NOT NULL DEFAULT 'off'
        CHECK(auto_reply_mode IN ('off', 'semi', 'full')),
    is_active BOOLEAN NOT NULL DEFAULT 1,
    context_message_count INTEGER NOT NULL DEFAULT 20,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    chat_jid TEXT NOT NULL,
    trigger_message_id TEXT,
    trigger_message_text TEXT,
    trigger_sender TEXT,
    draft_reply TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'approved', 'rejected', 'edited')),
    final_reply TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_state (
    chat_jid TEXT PRIMARY KEY,
    last_seen_message_id TEXT,
    last_seen_timestamp DATETIME
);

CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
