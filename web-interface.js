import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

import { createMCPClientManager } from './lib/mcp/client-manager.js';
import { createLLMIntegration } from './lib/mcp/llm-integration.js';
import { getSessionManager } from './lib/session-manager.js';
import { createChatHandler, stripHtmlForLLM } from './handlers/chat-handler.js';
import { createSessionHandler } from './handlers/session-handler.js';
import { createSearchHandler } from './handlers/search-handler.js';
import { createMCPHandler } from './handlers/mcp-handler.js';
import { createProviderHandler } from './handlers/provider-handler.js';
import { loadProviders, getProviderList } from './lib/provider-registry.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3075;

const wss = new WebSocketServer({ server });

let mcpClientManager = null;
let llmIntegration = null;

// Shared mutable context for handler closures (passed by reference, not value)
const ctx = {
  config: null,
  mcpClientManager: null,
  llmIntegration: null,
  openaiClient: null,
  sessionManager: null,
  wss: null
};

const config = {
  provider: 'ollama',
  models: {
    ollama: process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud',
    openai: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
  },
  searchProvider: process.env.SEARCH_PROVIDER || 'duckduckgo',
  searchApiKey: process.env.SEARCH_API_KEY,
  enableMCP: process.env.ENABLE_MCP === 'true' || true,
  mcpConfigPath: process.env.MCP_CONFIG_PATH || './mcp-config.json',
  systemPromptPath: process.env.SYSTEM_PROMPT_PATH || './system-prompt-default.md',
  systemPrompt: null
};

try {
  if (fs.existsSync(config.systemPromptPath)) {
    config.systemPrompt = fs.readFileSync(config.systemPromptPath, 'utf-8').trim();
    console.log(`✅ Loaded default system prompt from ${config.systemPromptPath}`);
  }
} catch (error) {
  console.error('⚠️  Failed to load system prompt file:', error.message);
}

let sessionManager = null;
try {
  sessionManager = getSessionManager();
  console.log('✅ SessionManager initialized for persistent chat sessions');
} catch (error) {
  console.error('⚠️  Failed to initialize SessionManager:', error.message);
  console.log('Chat sessions will not be persisted');
  sessionManager = null;
}

// Initialize MCP client manager if enabled
if (config.enableMCP) {
  try {
    mcpClientManager = createMCPClientManager(config.mcpConfigPath);
    console.log('ℹ️  MCP client manager created, initializing asynchronously...');
  } catch (error) {
    console.error('❌ Failed to create MCP client manager:', error.message);
    console.log('MCP functionality will be disabled');
    config.enableMCP = false;
  }
} else {
  console.log('ℹ️  MCP integration is disabled');
}

async function initializeMCP() {
  if (!config.enableMCP || !mcpClientManager) {
    return;
  }

  try {
    await mcpClientManager.initialize();
    ctx.llmIntegration = createLLMIntegration(mcpClientManager);
    llmIntegration = ctx.llmIntegration;
    console.log('✅ MCP client manager initialized');
    console.log(`📋 Configured servers: ${mcpClientManager.getConfiguredServers().join(', ')}`);
    console.log(`🔌 Connected servers: ${mcpClientManager.getConnectedServers().join(', ')}`);
    console.log(`🛠️  Available tools: ${mcpClientManager.listTools().length}`);
  } catch (error) {
    console.error('❌ Failed to initialize MCP client manager:', error.message);
    console.log('MCP functionality will be disabled');
    config.enableMCP = false;
  }
}

// Populate shared context
ctx.config = config;
ctx.mcpClientManager = mcpClientManager;
ctx.llmIntegration = llmIntegration;
ctx.sessionManager = sessionManager;
ctx.wss = wss;

const providerHandler = createProviderHandler(ctx);
// Initialize client for the default provider
providerHandler.initClientForProvider(config.provider).then(() => {
  ctx.openaiClient = providerHandler.getClient(config.provider);
});

const chatHandler = createChatHandler(ctx);
const sessionHandler = createSessionHandler(ctx);
const searchHandler = createSearchHandler(ctx);
const mcpHandler = createMCPHandler(ctx);

wss.on('connection', (ws) => {
  console.log('New client connected');
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to chat server',
    providers: getProviderList()
  }));

  ws.send(JSON.stringify({
    type: 'providers_list',
    providers: getProviderList()
  }));

  if (config.enableMCP) {
    ws.send(JSON.stringify({
      type: 'mcp_status',
      configuredServers: mcpClientManager.getConfiguredServers(),
      connectedServers: mcpClientManager.getConnectedServers(),
      availableTools: mcpClientManager.listTools().length,
      enabled: true
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'mcp_status',
      enabled: false,
      message: 'MCP integration is disabled'
    }));
  }

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'chat':
          await chatHandler(ws, message);
          break;
        case 'switch_provider':
          await providerHandler.handleProviderSwitch(ws, message);
          break;
        case 'select_model':
          await providerHandler.handleModelSelect(ws, message);
          break;
        case 'list_models':
          await providerHandler.handleListModels(ws);
          break;
        case 'search':
          await searchHandler.handleSearchRequest(ws, message);
          break;
        case 'clear_history':
          providerHandler.handleClearHistory(ws);
          break;
        case 'create_session':
          sessionHandler.handleCreateSession(ws, message);
          break;
        case 'load_session':
          sessionHandler.handleLoadSession(ws, message);
          break;
        case 'list_sessions':
          sessionHandler.handleListSessions(ws, message);
          break;
        case 'delete_session':
          sessionHandler.handleDeleteSession(ws, message);
          break;
        case 'update_session':
          sessionHandler.handleUpdateSession(ws, message);
          break;
        case 'session_stats':
          sessionHandler.handleSessionStats(ws, message);
          break;
        case 'mcp_connect':
          await mcpHandler.handleMCPConnect(ws, message);
          break;
        case 'mcp_disconnect':
          await mcpHandler.handleMCPDisconnect(ws, message);
          break;
        case 'mcp_list_servers':
          await mcpHandler.handleMCPListServers(ws);
          break;
        case 'mcp_list_tools':
          await mcpHandler.handleMCPListTools(ws, message);
          break;
        case 'mcp_execute_tool':
          await mcpHandler.handleMCPExecuteTool(ws, message);
          break;
        case 'mcp_get_status':
          await mcpHandler.handleMCPGetStatus(ws);
          break;
        case 'mcp_toggle_servers':
          await mcpHandler.handleMCPToggleServers(ws, message);
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// WebSocket heartbeat interval
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating unresponsive client');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`\n📴 Received ${signal}. Starting graceful shutdown...`);

  clearInterval(heartbeatInterval);

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    client.close();
  });

  // Close WebSocket server
  await new Promise((resolve) => wss.close(resolve));

  // Shutdown MCP client manager
  if (mcpClientManager) {
    try {
      await mcpClientManager.shutdown();
      console.log('✅ MCP client manager shut down');
    } catch (error) {
      console.error('Error shutting down MCP:', error.message);
    }
  }

  // Close SQLite database
  if (sessionManager) {
    try {
      sessionManager.close();
      console.log('✅ Session manager database closed');
    } catch (error) {
      console.error('Error closing session manager:', error.message);
    }
  }

  // Close HTTP server
  await new Promise((resolve) => server.close(resolve));

  console.log('✅ Server shut down gracefully');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/mcp/config', (req, res) => {
  if (config.enableMCP && mcpClientManager) {
    res.json({
      enabled: true,
      configuredServers: mcpClientManager.getConfiguredServers(),
      connectedServers: mcpClientManager.getConnectedServers(),
      availableTools: mcpClientManager.listTools().length,
      settings: mcpClientManager.getSettings()
    });
  } else {
    res.json({ enabled: false, message: 'MCP integration is disabled' });
  }
});

app.get('/api/system-prompt', (req, res) => {
  res.json({ defaultPrompt: config.systemPrompt || '', customPrompt: null });
});

app.post('/api/system-prompt', (req, res) => {
  const { systemPrompt } = req.body;
  config.systemPrompt = systemPrompt || '';
  res.json({ success: true, message: 'System prompt updated' });
});

server.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Supported environment variables:');
  console.log('  - OPENAI_API_KEY: Your API key for OpenAI provider');
  console.log('  - OPENAI_BASE_URL: Custom API endpoint (defaults to OpenAI)');
  console.log('  - OPENAI_MODEL: Model name for OpenAI provider');
  console.log('  - OLLAMA_MODEL: Model name for Ollama provider');
  console.log('  - ENABLE_MCP: Enable MCP integration (defaults to true)');
  console.log('  - MCP_CONFIG_PATH: Path to MCP config file (defaults to ./mcp-config.json)');

  await loadProviders();
  const providerList = getProviderList();
  console.log(`Registered providers: ${Object.values(providerList).map(p => p.name).join(', ')}`);

  await initializeMCP();

  if (config.enableMCP) {
    console.log('\nMCP Integration:');
    console.log(`  - Config file: ${config.mcpConfigPath}`);
    console.log(`  - Configured servers: ${mcpClientManager?.getConfiguredServers().join(', ') || 'None'}`);
    console.log(`  - Connected servers: ${mcpClientManager?.getConnectedServers().join(', ') || 'None'}`);
    console.log(`  - Available tools: ${mcpClientManager?.listTools().length || 0}`);
  }
});
