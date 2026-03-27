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

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_jid TEXT NOT NULL,
    chat_name TEXT,
    message_id TEXT,
    message_sender TEXT,
    message_text TEXT NOT NULL,
    message_timestamp DATETIME,
    reminder_type TEXT NOT NULL CHECK(reminder_type IN ('meeting', 'deadline', 'follow_up', 'task', 'unanswered', 'other')),
    summary TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('low', 'normal', 'high')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'sent', 'dismissed')),
    sent_to TEXT,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    chat_jid TEXT NOT NULL,
    memory_type TEXT NOT NULL CHECK(memory_type IN ('daily_log', 'fact')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    chat_jid TEXT NOT NULL,
    chat_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, chat_jid)
);

CREATE TABLE IF NOT EXISTS client_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    chat_jid TEXT NOT NULL,
    chat_name TEXT,
    stage TEXT NOT NULL,
    confidence REAL,
    reasoning TEXT,
    previous_stage TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, chat_jid)
);

CREATE TABLE IF NOT EXISTS stage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    chat_jid TEXT NOT NULL,
    from_stage TEXT,
    to_stage TEXT NOT NULL,
    reasoning TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_names (
    sender TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    chat_jid TEXT NOT NULL,
    chat_name TEXT,
    summary TEXT NOT NULL,
    needs TEXT,
    blockers TEXT,
    follow_ups TEXT NOT NULL,
    sent_to TEXT,
    sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
