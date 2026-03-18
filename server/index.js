const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const config = require('./config');
const errorHandler = require('./middleware/error-handler');
const { handleIncomingMessage } = require('./services/webhook.service');
const { mcpClient } = require('./services/mcp-client');
const eventBus = require('./lib/eventBus');
const { PIPELINE_STEPS } = require('./lib/constants');

const app = express();
const server = http.createServer(app);

// WebSocket server for live dashboard updates
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  console.log(`[WS] Client connected (${wsClients.size} total)`);
  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WS] Client disconnected (${wsClients.size} total)`);
  });
});

function wsBroadcast(event, data) {
  const message = JSON.stringify({ event, data });
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

// Pipeline events → WebSocket broadcast
eventBus.on('pipeline:progress', (data) => {
  // Map pipeline steps to WS events
  if (data.step === PIPELINE_STEPS.MESSAGE_RECEIVED) {
    wsBroadcast('generating', {
      agent_id: data.agent_id,
      agent_name: data.agent_name,
      chat_jid: data.chat_jid,
      trigger_sender: data.trigger_sender,
      trigger_text: data.trigger_text,
      step: data.step,
    });
  } else {
    // Send granular progress updates
    wsBroadcast('pipeline_progress', {
      agent_id: data.agent_id,
      chat_jid: data.chat_jid,
      step: data.step,
      agent_name: data.agent_name,
    });
  }
});

eventBus.on('pipeline:new_approval', (data) => {
  wsBroadcast('new_approval', data);
});

eventBus.on('pipeline:reply_sent', (data) => {
  wsBroadcast('reply_sent', data);
});

// Middleware
app.use(cors());
app.use(express.json());

// Static files (frontend)
app.use(express.static(path.join(__dirname, '..', 'client')));

// Webhook endpoint (receives from Go bridge)
app.post('/webhook/message', async (req, res) => {
  try {
    console.log('[Webhook] Received:', JSON.stringify({
      id: req.body.id?.substring(0, 12),
      chat_jid: req.body.chat_jid,
      sender: req.body.sender,
      is_from_me: req.body.is_from_me,
      content: (req.body.content || '').substring(0, 30),
      media_type: req.body.media_type,
    }));
    res.json({ received: true });
    await handleIncomingMessage(req.body);
  } catch (err) {
    console.error('[Webhook] Error:', err.message);
  }
});

// API routes
app.use('/api/agents', require('./routes/agents.routes'));
app.use('/api/chats', require('./routes/chats.routes'));
app.use('/api/approvals', require('./routes/approvals.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/reminders', require('./routes/reminders.routes'));

// Health check
app.get('/api/status', async (req, res) => {
  let mcpConnected = false;
  try {
    mcpConnected = mcpClient.connected;
  } catch {}
  res.json({
    status: 'running',
    mcp_connected: mcpConnected,
    ws_clients: wsClients.size,
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.use(errorHandler);

// Start server
server.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   WhatsApp Agents Manager               ║
  ║   Dashboard: http://localhost:${config.port}      ║
  ║   Webhook:   POST /webhook/message       ║
  ║   WebSocket: ws://localhost:${config.port}/ws     ║
  ╚══════════════════════════════════════════╝
  `);
});

// Connect to MCP on startup
mcpClient.connect().catch(err => {
  console.warn('[MCP] Initial connection failed (will retry on first request):', err.message);
});
