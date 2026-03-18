# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WhatsApp Agents Manager — an LLM-powered auto-reply system for WhatsApp with a web dashboard. Creates AI agents with custom personalities assigned to specific WhatsApp chats or groups, using OpenAI or Google Gemini.

## Architecture

- **Backend**: Node.js + Express (`server/`)
- **Frontend**: React 18 via CDN, Tailwind CSS via CDN (`client/`) — no build step
- **Database**: SQLite via `better-sqlite3` (app data only, stored at `./data/app.db`)
- **LLM Providers**: OpenAI (`openai` npm) + Google Gemini (`@google/generative-ai` npm)
- **WhatsApp Integration**: MCP client (`@modelcontextprotocol/sdk`) connects to remote WhatsApp MCP server over SSE
- **Real-time**: WebSocket (`ws` npm) pushes live updates to dashboard; Go bridge webhook pushes new messages to `POST /webhook/message`

## Key Design Decisions

- **Webhook-driven, no polling**: The Go bridge (`whatsapp-mcp`) POSTs new messages to `/webhook/message`. No polling service.
- **MCP for reads, webhook for events**: Chat/message history is fetched via MCP tools; incoming message detection uses the bridge webhook.
- **Deduplication**: `webhook.service.js` uses an in-memory Map with TTL to prevent double-processing messages. Cleanup runs on a 60s interval, not on the hot path.
- **Gemini chat format**: Gemini requires the first message in history to have role `user`. The LLM service skips leading assistant messages.

## Commands

```bash
npm run dev    # Start with nodemon (auto-reload)
npm start      # Production start
```

## Available Gemini Models

Only these model IDs work with the `@google/generative-ai` SDK (as of March 2026):
- `gemini-2.5-flash`
- `gemini-2.5-pro`

Preview/versioned names like `gemini-2.5-pro-preview-05-06` or `gemini-2.0-flash` are deprecated and return 404.

## Available OpenAI Models

- `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`

## WhatsApp MCP Bridge

- **Repo**: `github.com/chanchilun2004/whatsapp-mcp`
- **Deployed on Zeabur**: `https://alanworkphone.zeabur.app`
- **MCP SSE endpoint**: `/sse` (port 8000 locally)
- **Bridge REST API**: `/api/send`, `/api/status` (port 8080 locally)
- **Webhook env var**: Set `WEBHOOK_URL=http://<this-server>:3000/webhook/message` on the bridge

## Environment Variables (.env)

```
PORT=3000
APP_DB_PATH=./data/app.db
MCP_SSE_URL=http://localhost:8000/sse   # or https://alanworkphone.zeabur.app/sse
OPENAI_API_KEY=
GEMINI_API_KEY=
```

## File Structure

```
server/
  index.js              # Express + WebSocket entry point
  config.js             # Env config
  db/app-db.js          # SQLite connection
  db/app-schema.sql     # Schema (agents, approvals, settings, agent_logs)
  services/
    mcp-client.js       # MCP SSE client (singleton)
    whatsapp.service.js # WhatsApp operations (wraps MCP client)
    llm.service.js      # OpenAI + Gemini unified interface
    webhook.service.js  # Incoming message handler + dedup
    agent.service.js    # Agent CRUD
    approval.service.js # Approval queue (semi-auto mode)
  routes/               # REST API routes
client/
  index.html            # SPA shell (React + Tailwind via CDN)
  app.js                # Main React app
  components/           # React components
```
