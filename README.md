# WhatsApp Agents Manager

LLM-powered WhatsApp auto-reply system with a web dashboard. Create AI agents with custom personalities for any WhatsApp chat or group, powered by OpenAI or Google Gemini.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **AI Agents with Personalities** — Create agents with custom system prompts, each assigned to a specific WhatsApp chat or group
- **Multi-LLM Support** — Choose between OpenAI (GPT-4o, GPT-4.1) or Google Gemini (2.0 Flash, 2.5 Pro, 3.0 Pro) per agent
- **Auto-Reply Modes**
  - **Full-Auto** — Agent replies instantly to incoming messages
  - **Semi-Auto** — Agent drafts a reply for your approval before sending
  - **Off** — Agent monitors but doesn't reply
- **Web Dashboard** — Manage agents, browse chats, review conversations, and approve/reject draft replies
- **Real-Time Updates** — Webhook-driven message detection + WebSocket live dashboard updates with browser notifications
- **Approval Queue** — Review, edit, approve, or reject AI-generated drafts before they're sent

## Architecture

```
┌──────────────────────────────────────────┐
│         Web Dashboard (React)            │
│  Agents │ Approvals │ Conversations │ ⚙  │
└─────────────────┬────────────────────────┘
                  │ REST API + WebSocket
┌─────────────────▼────────────────────────┐
│          Node.js + Express               │
│                                          │
│  /webhook/message ← bridge pushes here   │
│                                          │
│  Services: Webhook Handler → LLM → MCP   │
└──────┬──────────────────────────┬────────┘
       │                          │
  ┌────▼────┐        ┌────────────▼─────────────┐
  │ App DB  │        │ WhatsApp MCP (Remote)     │
  │ SQLite  │        │ MCP Server (SSE) + Bridge │
  └─────────┘        └─────────────────────────┘
```

## Prerequisites

- **Node.js** 18+
- **WhatsApp MCP Bridge** — deployed and running ([whatsapp-mcp](https://github.com/chanchilun2004/whatsapp-mcp))
- **API Key** for at least one LLM provider (OpenAI or Google Gemini)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/chanchilun2004/whatsapp-agents-manager.git
cd whatsapp-agents-manager
npm install
```

### 2. Configure environment

Create a `.env` file:

```env
PORT=3000
APP_DB_PATH=./data/app.db
MCP_SSE_URL=https://your-bridge.zeabur.app/sse
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...
```

### 3. Start the server

```bash
npm run dev    # development (auto-reload)
npm start      # production
```

### 4. Open the dashboard

Navigate to **http://localhost:3000**

### 5. Configure webhook (for real-time message detection)

Add the `WEBHOOK_URL` environment variable to your [whatsapp-mcp](https://github.com/chanchilun2004/whatsapp-mcp) bridge deployment:

```env
WEBHOOK_URL=http://your-server-ip:3000/webhook/message
```

When the bridge receives a new WhatsApp message, it will POST to your agents manager instantly.

## Dashboard Pages

### Agents

Create and manage AI agents. Each agent has:
- **Name** and **system prompt** (personality)
- **Target chat** — select any WhatsApp chat or group
- **LLM provider & model** — OpenAI or Gemini
- **Auto-reply mode** — Off / Semi-Auto / Full-Auto
- **Context window** — how many prior messages to include (5–50)

### Approval Queue

When an agent is in **Semi-Auto** mode, draft replies appear here for review. You can:
- **Approve & Send** — send the draft as-is
- **Edit** — modify the reply before sending
- **Reject** — discard the draft

### Settings

Configure API keys, MCP server URL, and polling interval from the dashboard UI.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/api/agents` | List / Create agents |
| `GET/PUT/DELETE` | `/api/agents/:id` | Get / Update / Delete agent |
| `PATCH` | `/api/agents/:id/toggle` | Toggle agent active/inactive |
| `GET` | `/api/chats` | List WhatsApp chats |
| `GET` | `/api/chats/search?q=` | Search chats |
| `GET` | `/api/chats/:jid/messages` | Get messages for a chat |
| `GET` | `/api/approvals?status=pending` | List approvals by status |
| `POST` | `/api/approvals/:id/approve` | Approve and send draft |
| `POST` | `/api/approvals/:id/edit` | Edit and send draft |
| `POST` | `/api/approvals/:id/reject` | Reject draft |
| `GET/PUT` | `/api/settings` | Get / Update settings |
| `POST` | `/webhook/message` | Webhook receiver (from bridge) |
| `GET` | `/api/status` | Health check |
| `ws://` | `/ws` | WebSocket for live updates |

## Tech Stack

- **Backend**: Node.js, Express, better-sqlite3
- **Frontend**: React 18 (CDN), Tailwind CSS (CDN)
- **LLM**: OpenAI SDK, Google Generative AI SDK
- **Bridge**: [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (MCP client over SSE)
- **Real-time**: WebSocket (ws), Bridge webhook

## Project Structure

```
├── server/
│   ├── index.js                # Express + WebSocket entry point
│   ├── config.js               # Environment configuration
│   ├── db/
│   │   ├── app-db.js           # SQLite connection + migrations
│   │   └── app-schema.sql      # Database schema
│   ├── services/
│   │   ├── mcp-client.js       # MCP SSE client
│   │   ├── whatsapp.service.js # WhatsApp operations
│   │   ├── llm.service.js      # OpenAI + Gemini abstraction
│   │   ├── webhook.service.js  # Incoming message handler
│   │   ├── agent.service.js    # Agent CRUD
│   │   └── approval.service.js # Approval queue
│   ├── routes/                 # REST API routes
│   └── middleware/             # Error handling
├── client/
│   ├── index.html              # SPA shell
│   ├── app.js                  # Main React app
│   └── components/             # React components
└── data/                       # SQLite database (gitignored)
```

## Related

- [whatsapp-mcp](https://github.com/chanchilun2004/whatsapp-mcp) — WhatsApp Bridge + MCP Server (required)

## License

MIT
