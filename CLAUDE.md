# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sales/Customer Success AI Agent Platform — an LLM-powered WhatsApp monitoring system with a web dashboard. Creates AI agents with Sales or Customer Success roles that monitor multiple client chats, track pipeline stages via AI, provide semi/full/manual reply modes, and generate structured summaries with follow-up actions.

## Architecture

- **Backend**: Node.js + Express (`server/`)
- **Frontend**: React 18 via CDN, Tailwind CSS via CDN (`client/`) — no build step
- **Database**: SQLite via `better-sqlite3` (app data only, stored at `./data/app.db`)
- **LLM Providers**: OpenAI (`openai` npm) + Google Gemini (`@google/generative-ai` npm)
- **WhatsApp Integration**: MCP client (`@modelcontextprotocol/sdk`) connects to remote WhatsApp MCP server over SSE
- **Real-time**: WebSocket (`ws` npm) pushes live updates to dashboard; Go bridge webhook pushes new messages to `POST /webhook/message`
- **Scheduling**: `node-cron` for scheduled daily digest

## Key Design Decisions

- **1 agent = many chats**: Agents use `agent_targets` table for multi-chat assignment. Legacy `target_jid` on agents table kept for backward compat.
- **Per-chat auto-reply mode**: `agent_targets.auto_reply_mode` overrides agent-level mode per chat. `NULL` = use agent default.
- **Role-based pipeline stages**: Agents have a `role` (sales/customer_success/general). Sales: lead→qualified→proposal→negotiation→closed_won/closed_lost. CS: onboarding→active→at_risk→churned/renewal.
- **Unified stage detection**: `autoDetectStages` in `pipeline.js` runs once per incoming message for ALL role agents on that chat (including off-mode). Context is fetched once and shared. Do NOT duplicate detection inside the per-agent loop.
- **Webhook-driven, no polling**: The Go bridge (`whatsapp-mcp`) POSTs new messages to `/webhook/message`.
- **MCP for reads, webhook for events**: Chat/message history is fetched via MCP tools; incoming message detection uses the bridge webhook.
- **WebSocket instant + polling fallback**: New messages are pushed via WebSocket `new_message` event for instant display. A 5-second polling interval serves as fallback (deduplicated by message ID).
- **Sender name resolution**: Multi-layer: (1) `contact-cache.js` in-memory (capped at 5000), (2) `contact_names` DB table (persisted PushName from webhooks), (3) bridge SQLite DB batch query, (4) MCP `search_contacts` fallback. Numbers-only names are filtered out.
- **Deduplication**: `pipeline.js` uses an in-memory Map with TTL to prevent double-processing messages.
- **Gemini thinking budget**: `json-call.js` sets `thinkingBudget: 0` for Gemini 2.5 flash JSON calls. Without this, thinking tokens consume most of `maxOutputTokens` and truncate the JSON output.
- **Gemini chat format**: Gemini requires the first message in history to have role `user`. The LLM service skips leading assistant messages.
- **Shared constants**: Client-side shared constants (STAGE_COLORS, MODE_LABELS, MODE_COLORS, ROLE_LABELS, utility functions) live in `client/lib/shared.js` (loaded as plain script before components). Server-side shared transcript building is in `server/lib/transcript.js`. Do NOT duplicate these in component files.
- **Parallel stage detection**: `autoDetectStages` in `pipeline.js` runs LLM calls for multiple agents in parallel via `Promise.all`, not sequentially.

## UI Design

- **SleekFlow-style layout**: Dark left icon sidebar (56px) for navigation, conversation list panel (340px), main chat area (flex), optional right detail panel (300px).
- **Brand color**: Purple (`#7C3AED` / Tailwind `brand-500`), not WhatsApp green.
- **Agent selector**: Dropdown with All/Active/Inactive filter tabs.
- **Chat list items**: Show avatar with mode indicator dot (green=full, amber=semi, gray=off), pipeline stage badge, and per-chat mode override label.
- **Right panel**: Contact details, pipeline stage with re-detect, summary with follow-ups, agent info. Toggled via icon button.
- **Agent form**: Multi-select chat list with checkboxes, "AI Detect" button (LLM analyzes chats to recommend relevant ones for the role), per-chat auto-reply mode dropdown override.

## Commands

```bash
npm run dev    # Start with nodemon (auto-reload)
npm start      # Production start
```

## Starting the Local MCP Bridge

The WhatsApp MCP bridge is in a sibling project. Both processes must be running:

```bash
# 1. Go bridge (port 8080) — provides WhatsApp connection + webhook
cd "../WhatsApp Project/whatsapp-mcp/whatsapp-bridge"
WEBHOOK_URL=http://localhost:3000/webhook/message WEBHOOK_SECRET=localhost ./whatsapp-client

# 2. Python MCP server (port 8000) — provides MCP SSE for chat/message reads
cd "../WhatsApp Project/whatsapp-mcp/whatsapp-mcp-server"
MCP_TRANSPORT=sse uv run python main.py
```

**Important**: The Go binary must be rebuilt (`go build -o whatsapp-client .`) after code changes. `MCP_TRANSPORT=sse` is required — default is stdio mode.

## MCP URL Configuration

The MCP SSE URL is stored in **both** `.env` AND the `settings` SQLite table. The DB value takes priority at runtime (read by `mcp-client.js`). To change it:
- Update in dashboard Settings page, OR
- Update directly: `UPDATE settings SET value = '...' WHERE key = 'mcp_sse_url'`
- `.env` value only seeds the DB on first run.

## Available Gemini Models

Only these model IDs work with the `@google/generative-ai` SDK (as of March 2026):
- `gemini-2.5-flash`
- `gemini-2.5-pro`

Preview/versioned names like `gemini-2.5-pro-preview-05-06` or `gemini-2.0-flash` are deprecated and return 404.

## Available OpenAI Models

- `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`

## WhatsApp MCP Bridge

- **Repo**: `github.com/chanchilun2004/whatsapp-mcp`
- **Local path**: `../WhatsApp Project/whatsapp-mcp/`
- **Deployed on Zeabur**: `https://alanworkphone.zeabur.app`
- **MCP SSE endpoint**: `/sse` (port 8000 locally)
- **Bridge REST API**: `/api/send`, `/api/status` (port 8080 locally)
- **Webhook env var**: Set `WEBHOOK_URL=http://<this-server>:3000/webhook/message` on the bridge
- **Bridge webhook payload**: Includes `sender_name` (WhatsApp PushName) since custom build

## Environment Variables (.env)

```
PORT=3000
APP_DB_PATH=./data/app.db
MCP_SSE_URL=http://localhost:8000/sse   # or https://alanworkphone.zeabur.app/sse
OPENAI_API_KEY=
GEMINI_API_KEY=
WEBHOOK_SECRET=localhost
```

## Route Ordering

Express routes with named segments (`:id`, `:jid`) must come AFTER literal routes to avoid capture. Examples:
- `POST /api/agents/detect-chats` must be before `POST /api/agents/:id/targets`
- `POST /api/pipeline/detect-all` must be before `POST /api/pipeline/:agentId/detect`
- `GET /api/chats/search` and `GET /api/chats/media/:chatJid/:messageId` must be before `GET /api/chats/:jid`

## File Structure

```
server/
  index.js                # Express + WebSocket entry point
  config.js               # Env config
  db/app-db.js            # SQLite connection + migrations
  db/app-schema.sql       # Schema (agents, agent_targets, client_stages, stage_history, client_summaries, contact_names, approvals, settings, agent_logs, agent_memory)
  lib/
    constants.js          # Pipeline steps enum
    eventBus.js           # Shared event emitter
    transcript.js         # buildTranscript() — shared chat-to-text conversion
  services/
    mcp-client.js         # MCP SSE client (singleton)
    whatsapp.service.js   # WhatsApp operations (wraps MCP client)
    pipeline.js           # Message processing pipeline + parallel stage detection
    webhook.service.js    # Incoming message handler
    agent.service.js      # Agent CRUD + target management + per-chat mode
    approval.service.js   # Approval queue (semi-auto mode)
    stage.service.js      # Stage detection, tracking, and pipeline queries
    summary.service.js    # Client summaries, daily digest, scheduling
    memory.service.js     # Agent memory extraction
    contact-cache.js      # Shared sender name cache (LRU, max 5000)
    llm/
      index.js            # Unified LLM interface
      openai.js           # OpenAI adapter
      gemini.js           # Gemini adapter
      tools.js            # Tool definitions (MCP + web)
      json-call.js        # Shared LLM-for-JSON utility (thinkingBudget: 0 for Gemini)
  routes/
    agents.routes.js      # Agent CRUD + target management + AI detect chats
    chats.routes.js       # Chat listing, messages, media, sender name resolution
    approvals.routes.js   # Approval queue APIs
    pipeline.routes.js    # Pipeline/stage APIs (kanban data, stage override, detect-all)
    summaries.routes.js   # Summary generation, digest, send-to-WhatsApp
    settings.routes.js    # Configuration APIs
client/
  index.html              # SPA shell (React + Tailwind via CDN)
  style.css               # Custom styles (chat bubbles, scrollbar, sidebar tooltip)
  app.js                  # Main React app (WebSocket handler, routing)
  lib/
    shared.js             # Shared constants (STAGE_COLORS, MODE_LABELS, etc.) and utilities
  components/
    Header.js             # Left icon sidebar navigation (SleekFlow-style)
    AgentList.js          # Agent dropdown + chat list with stage/mode badges
    AgentForm.js          # Agent create/edit with AI detect + multi-select chats + per-chat mode
    ChatBrowser.js        # Chat search/selection (used by general agent form)
    ConversationViewer.js # Chat interface + right detail panel + sender name resolution
    ApprovalQueue.js      # Semi-auto approval review
    PipelineView.js       # Kanban + list pipeline dashboard
    SummariesPage.js      # Client summaries with follow-ups
    SettingsPage.js       # Configuration + digest settings
```
