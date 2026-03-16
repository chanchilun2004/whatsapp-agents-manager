const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const config = require('./config');
const errorHandler = require('./middleware/error-handler');
const { handleIncomingMessage, setWsBroadcast } = require('./services/webhook.service');
const { mcpClient } = require('./services/mcp-client');

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

setWsBroadcast((message) => {
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Static files (frontend)
app.use(express.static(path.join(__dirname, '..', 'client')));

// Webhook endpoint (receives from Go bridge)
app.post('/webhook/message', async (req, res) => {
  try {
    // Respond immediately so bridge doesn't wait
    res.json({ received: true });
    // Process asynchronously
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
