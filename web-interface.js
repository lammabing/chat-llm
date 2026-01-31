import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import ollama from 'ollama';
import { OpenAI } from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';
import { createMCPClientManager } from './lib/mcp/client-manager.js';
import { createLLMIntegration } from './lib/mcp/llm-integration.js';
dotenv.config();

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const server = http.createServer(app);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Define port
const PORT = process.env.PORT || 3075;

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Initialize MCP client manager
let mcpClientManager = null;
let llmIntegration = null;

// Configuration object to store current settings
const config = {
  provider: 'ollama', // 'ollama' or 'openai'
  ollamaModel: 'gpt-oss:120b-cloud',
  openaiModel: 'gpt-3.5-turbo',
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', // Allows custom OpenAI-compatible endpoints
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION, // For Azure OpenAI compatibility
  searchProvider: process.env.SEARCH_PROVIDER || 'duckduckgo', // 'duckduckgo', 'tavily', 'serpapi', etc.
  searchApiKey: process.env.SEARCH_API_KEY, // For APIs that require an API key
  enableMCP: process.env.ENABLE_MCP === 'true' || true, // Enable MCP integration by default
  mcpConfigPath: process.env.MCP_CONFIG_PATH || './mcp-config.json' // Path to MCP config file
};

let openaiClient = null;

// Initialize OpenAI client if API key is provided
if (config.openaiApiKey) {
  if (config.azureOpenAIApiVersion) {
    // Configure for Azure OpenAI
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
      defaultQuery: { 'api-version': config.azureOpenAIApiVersion },
      defaultHeaders: { 'api-key': config.openaiApiKey }
    });
    console.log('Azure OpenAI client initialized');
  } else {
    // Standard OpenAI or OpenAI-compatible endpoint
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl
    });
    console.log('OpenAI client initialized');
  }
} else {
  console.log('⚠️  OpenAI API key not found. Set OPENAI_API_KEY environment variable to use OpenAI provider.');
  if (config.openaiBaseUrl !== 'https://api.openai.com/v1') {
    console.log(`Custom endpoint configured: ${config.openaiBaseUrl}`);
  }
}

// Initialize MCP client manager if enabled
if (config.enableMCP) {
  try {
    mcpClientManager = createMCPClientManager(config.mcpConfigPath);
    // Note: We'll initialize MCP after the server starts to avoid blocking startup
    console.log('ℹ️  MCP client manager created, initializing asynchronously...');
  } catch (error) {
    console.error('❌ Failed to create MCP client manager:', error.message);
    console.log('MCP functionality will be disabled');
    config.enableMCP = false;
  }
} else {
  console.log('ℹ️  MCP integration is disabled');
}

// Initialize MCP client manager asynchronously after server starts
async function initializeMCP() {
  if (!config.enableMCP || !mcpClientManager) {
    return;
  }

  try {
    await mcpClientManager.initialize();

    // Create LLM integration for tool calling
    llmIntegration = createLLMIntegration(mcpClientManager);

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

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New client connected');

  // Send welcome message to the new client
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to chat server'
  }));

  // Send MCP status if MCP is enabled
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

  // Handle incoming messages from client
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'chat':
          await handleChatMessage(ws, message);
          break;
        case 'switch_provider':
          await handleProviderSwitch(ws, message);
          break;
        case 'select_model':
          await handleModelSelect(ws, message);
          break;
        case 'list_models':
          await handleListModels(ws, message);
          break;
        case 'search':
          await handleSearchRequest(ws, message);
          break;
        case 'clear_history':
          handleClearHistory(ws, message);
          break;
        // MCP-related message handlers
        case 'mcp_connect':
          await handleMCPConnect(ws, message);
          break;
        case 'mcp_disconnect':
          await handleMCPDisconnect(ws, message);
          break;
        case 'mcp_list_servers':
          await handleMCPListServers(ws, message);
          break;
        case 'mcp_list_tools':
          await handleMCPListTools(ws, message);
          break;
        case 'mcp_execute_tool':
          await handleMCPExecuteTool(ws, message);
          break;
        case 'mcp_get_status':
          await handleMCPGetStatus(ws, message);
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type'
          }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Function to handle chat messages
async function handleChatMessage(ws, message) {
  const { userMessage, chatHistory } = message;

  // Add user message to chat history
  const updatedChatHistory = [...chatHistory, { role: 'user', content: userMessage }];

  // Send message to client indicating response is starting
  ws.send(JSON.stringify({
    type: 'response_start',
    userMessage: userMessage
  }));

  try {
    let fullResponse = '';

    // Prepare messages for LLM with potential tool integration
    let currentMessages = [...updatedChatHistory];

    // Process with potential tool calling if MCP is enabled
    if (config.enableMCP && llmIntegration) {
      try {
        // First, check if we need to process with tools
        const toolProcessingResult = await llmIntegration.processMessageWithTools(
          currentMessages,
          true, // Enable tools
          {
            maxToolCalls: 5, // Limit recursive tool calls
            onToolCall: (toolCall) => {
              console.log(`Tool called: ${toolCall.function?.name || toolCall.tool?.name}`);
            },
            onToolResult: (toolCall, result) => {
              console.log(`Tool result: ${toolCall.function?.name || toolCall.tool?.name}`);
            }
          }
        );

        // Check if tools were executed
        if (toolProcessingResult.needsToolExecution) {
          currentMessages = toolProcessingResult.messages;

          // Send tool results to client
          ws.send(JSON.stringify({
            type: 'tool_results',
            results: toolProcessingResult.toolResults
          }));

          // Check if the LLM integration has already generated a final response
          // by comparing message lengths before and after tool processing
          const lastMessage = toolProcessingResult.messages[toolProcessingResult.messages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
            fullResponse = lastMessage.content;

            // Send the final response to the client
            ws.send(JSON.stringify({
              type: 'response_complete',
              content: fullResponse
            }));

            // End here since the LLM integration has already processed the full conversation
            return;
          }
        }
      } catch (error) {
        console.error('Error in LLM tool processing:', error);
        // Continue with normal processing if tool processing fails
      }
    }

    // If no tools were executed or we need to continue with direct LLM call
    if (config.provider === 'ollama') {
      // Process potentially multiple turns if tools are involved
      let messagesForLLM = [...currentMessages];
      let hasToolCalls = false;

      // Loop to handle multiple turns if tools are called
      do {
        hasToolCalls = false;

        // Check if we should use tools with Ollama
        const tools = config.enableMCP ? mcpClientManager.getToolsForLLM() : [];

        const chatOptions = {
          model: config.ollamaModel,
          messages: messagesForLLM,
          stream: true
        };

        // Add tools if available and enabled
        if (tools.length > 0) {
          // Format tools appropriately for Ollama
          chatOptions.tools = tools.map(tool => ({
            name: tool.name,
            description: tool.description || '',
            parameters: tool.inputSchema || {
              type: 'object',
              properties: {}
            }
          }));
        }

        const response = await ollama.chat(chatOptions);

        for await (const part of response) {
          const content = part.message.content;
          if (content) {
            fullResponse += content;

            // Send incremental response to client
            ws.send(JSON.stringify({
              type: 'response_chunk',
              content: content
            }));
          }

          // Handle tool calls if present in the response
          if (part.message.tool_calls && config.enableMCP) {
            hasToolCalls = true;

            for (const toolCall of part.message.tool_calls) {
              try {
                // Safely parse arguments - they might already be an object
                let args = toolCall.function.arguments;
                if (typeof args === 'string') {
                  args = JSON.parse(args);
                }

                // Find the server for this tool
                const tools = mcpClientManager.listTools();
                const tool = tools.find(t => t.name === toolCall.function.name);

                if (!tool) {
                  throw new Error(`Tool ${toolCall.function.name} not found`);
                }

                const result = await mcpClientManager.executeTool(
                  tool.serverName,
                  toolCall.function.name,
                  args
                );

                // Add tool result to messages
                messagesForLLM.push({
                  role: 'tool',
                  content: JSON.stringify(result),
                  tool_call_id: toolCall.id
                });

                // Send tool result to client
                ws.send(JSON.stringify({
                  type: 'tool_result',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  result: result
                }));

                // Clear previous response since we need to get a new one with tool results
                fullResponse = '';
              } catch (error) {
                console.error('Error executing tool:', error);

                // Add error to messages
                messagesForLLM.push({
                  role: 'system',
                  content: `Error executing tool ${toolCall.function.name}: ${error.message}`
                });

                // Send error to client
                ws.send(JSON.stringify({
                  type: 'tool_error',
                  toolName: toolCall.function.name,
                  error: error.message
                }));
              }
            }
          }
        }
      } while (hasToolCalls); // Continue if tools were called

    } else {
      if (!openaiClient) {
        throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.');
      }

      let openaiMessages = currentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      let hasToolCalls = false;

      // Loop to handle multiple turns if tools are called
      do {
        hasToolCalls = false;

        // Prepare tools for OpenAI if MCP is enabled
        const tools = config.enableMCP ? mcpClientManager.getToolsForLLM() : [];
        const openAITools = tools.length > 0 ? llmIntegration.formatToolsForOpenAI(tools) : undefined;

        const chatOptions = {
          model: config.openaiModel,
          messages: openaiMessages,
          stream: true,
        };

        // Add tools if available and enabled
        if (openAITools && openAITools.length > 0) {
          chatOptions.tools = openAITools;
        }

        const response = await openaiClient.chat.completions.create(chatOptions);

        for await (const part of response) {
          const content = part.choices[0]?.delta?.content || '';
          if (content) {
            fullResponse += content;

            // Send incremental response to client
            ws.send(JSON.stringify({
              type: 'response_chunk',
              content: content
            }));
          }

          // Handle tool calls if present in the response
          const toolCallChunk = part.choices[0]?.delta?.tool_calls;
          if (toolCallChunk && config.enableMCP) {
            hasToolCalls = true;

            for (const toolCall of toolCallChunk) {
              try {
                // Safely parse arguments - they might already be an object
                let args = toolCall.function.arguments;
                if (typeof args === 'string') {
                  args = JSON.parse(args);
                }

                // Find the server for this tool
                const tools = mcpClientManager.listTools();
                const tool = tools.find(t => t.name === toolCall.function.name);

                if (!tool) {
                  throw new Error(`Tool ${toolCall.function.name} not found`);
                }

                const result = await mcpClientManager.executeTool(
                  tool.serverName,
                  toolCall.function.name,
                  args
                );

                // Add tool result to messages
                openaiMessages.push({
                  role: 'tool',
                  content: JSON.stringify(result),
                  tool_call_id: toolCall.id
                });

                // Send tool result to client
                ws.send(JSON.stringify({
                  type: 'tool_result',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  result: result
                }));

                // Clear previous response since we need to get a new one with tool results
                fullResponse = '';
              } catch (error) {
                console.error('Error executing tool:', error);

                // Add error to messages
                openaiMessages.push({
                  role: 'system',
                  content: `Error executing tool ${toolCall.function.name}: ${error.message}`
                });

                // Send error to client
                ws.send(JSON.stringify({
                  type: 'tool_error',
                  toolName: toolCall.function.name,
                  error: error.message
                }));
              }
            }
          }
        }
      } while (hasToolCalls); // Continue if tools were called
    }

    // Send final response to client
    ws.send(JSON.stringify({
      type: 'response_complete',
      content: fullResponse
    }));

  } catch (error) {
    console.error('Error in chat processing:', error);

    // Send error message to client
    ws.send(JSON.stringify({
      type: 'error',
      message: error.message
    }));
  }
}

// Function to handle provider switching
async function handleProviderSwitch(ws, message) {
  const { provider, endpoint } = message;
  
  if (provider === 'ollama') {
    config.provider = 'ollama';
    ws.send(JSON.stringify({
      type: 'provider_switched',
      provider: 'ollama',
      model: config.ollamaModel
    }));
  } else if (provider === 'openai') {
    config.provider = 'openai';

    // If an endpoint is provided, update it
    if (endpoint) {
      config.openaiBaseUrl = endpoint;
      // Reinitialize OpenAI client with new endpoint
      if (config.openaiApiKey) {
        if (config.azureOpenAIApiVersion) {
          // Configure for Azure OpenAI
          openaiClient = new OpenAI({
            apiKey: config.openaiApiKey,
            baseURL: config.openaiBaseUrl,
            defaultQuery: { 'api-version': config.azureOpenAIApiVersion },
            defaultHeaders: { 'api-key': config.openaiApiKey }
          });
        } else {
          // Standard OpenAI or OpenAI-compatible endpoint
          openaiClient = new OpenAI({
            apiKey: config.openaiApiKey,
            baseURL: config.openaiBaseUrl
          });
        }
      }
      ws.send(JSON.stringify({
        type: 'provider_switched',
        provider: 'openai',
        model: config.openaiModel,
        endpoint: config.openaiBaseUrl
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'provider_switched',
        provider: 'openai',
        model: config.openaiModel,
        endpoint: config.openaiBaseUrl
      }));
      if (!config.openaiApiKey) {
        ws.send(JSON.stringify({
          type: 'warning',
          message: 'OpenAI API key not set. Please set OPENAI_API_KEY environment variable.'
        }));
      }
    }
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid provider. Available providers: ollama, openai'
    }));
  }
}

// Function to handle model selection
async function handleModelSelect(ws, message) {
  const { model } = message;
  
  if (!model) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Please specify a model name'
    }));
    return;
  }

  if (config.provider === 'ollama') {
    config.ollamaModel = model;
    ws.send(JSON.stringify({
      type: 'model_selected',
      provider: 'ollama',
      model: config.ollamaModel
    }));
  } else if (config.provider === 'openai') {
    // Verify the model exists if possible
    try {
      if (openaiClient) {
        const modelResult = await openaiClient.models.retrieve(model);
        config.openaiModel = modelResult.id;
      } else {
        // If we can't verify, just set it
        config.openaiModel = model;
      }
      ws.send(JSON.stringify({
        type: 'model_selected',
        provider: 'openai',
        model: config.openaiModel
      }));
    } catch (error) {
      // If the endpoint doesn't support model verification, just set the model
      config.openaiModel = model;
      ws.send(JSON.stringify({
        type: 'model_selected',
        provider: 'openai',
        model: config.openaiModel,
        message: 'Model verification skipped'
      }));
    }
  }
}

// Function to handle listing available models
async function handleListModels(ws) {
  if (config.provider === 'ollama') {
    try {
      // Fetch models from Ollama API
      const response = await fetch('http://localhost:11434/v1/models');
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      const models = data.data.map(m => m.id);

      ws.send(JSON.stringify({
        type: 'models_list',
        provider: 'ollama',
        models: models
      }));
    } catch (error) {
      console.error('Error listing Ollama models:', error.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Failed to fetch Ollama models: ${error.message}. Make sure Ollama is running on localhost:11434`
      }));
    }
  } else if (config.provider === 'openai') {
    try {
      if (!openaiClient) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.'
        }));
        return;
      }

      // Get available models from the OpenAI-compatible endpoint
      const models = await openaiClient.models.list();
      ws.send(JSON.stringify({
        type: 'models_list',
        provider: 'openai',
        models: models.data.map(m => m.id)
      }));
    } catch (error) {
      console.error('Error listing models:', error.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Error listing models: ${error.message}. This endpoint might not support the models list API.`
      }));
    }
  }
}

// Function to handle clearing chat history
function handleClearHistory(ws) {
  ws.send(JSON.stringify({
    type: 'history_cleared',
    message: 'Conversation history cleared'
  }));
}

// Function to handle search requests
async function handleSearchRequest(ws, message) {
  const { query } = message;

  if (!query) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Please provide a search query'
    }));
    return;
  }

  try {
    // Send search started message
    ws.send(JSON.stringify({
      type: 'search_started',
      query: query
    }));

    let searchResults;

    // Determine which search provider to use based on configuration
    switch (config.searchProvider.toLowerCase()) {
      case 'duckduckgo':
        searchResults = await searchDuckDuckGo(query);
        break;
      case 'tavily':
        if (!config.searchApiKey) {
          throw new Error('Tavily API key not configured. Please set SEARCH_API_KEY environment variable.');
        }
        searchResults = await searchTavily(query, config.searchApiKey);
        break;
      case 'serpapi':
        if (!config.searchApiKey) {
          throw new Error('SerpAPI key not configured. Please set SEARCH_API_KEY environment variable.');
        }
        searchResults = await searchSerpAPI(query, config.searchApiKey);
        break;
      default:
        throw new Error(`Unsupported search provider: ${config.searchProvider}`);
    }

    // Send search results
    ws.send(JSON.stringify({
      type: 'search_results',
      results: searchResults,
      provider: config.searchProvider
    }));

  } catch (error) {
    console.error('Search error:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Search failed: ${error.message}`
    }));
  }
}

// Function to search using DuckDuckGo API (no API key required)
async function searchDuckDuckGo(query) {
  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      }
    });

    const results = [];

    // Extract results from DuckDuckGo API
    if (response.data.RelatedTopics && response.data.RelatedTopics.length > 0) {
      response.data.RelatedTopics.slice(0, 5).forEach(topic => {
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text,
            url: topic.FirstURL,
            content: topic.Text
          });
        }
      });
    } else {
      // If no related topics, use abstract if available
      if (response.data.AbstractText) {
        results.push({
          title: response.data.Heading || query,
          url: response.data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          content: response.data.AbstractText
        });
      }
    }

    return results;
  } catch (error) {
    console.error('DuckDuckGo search error:', error.message);
    throw error;
  }
}

// Function to search using Tavily API
async function searchTavily(query, apiKey) {
  try {
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query: query,
      include_answer: true,
      include_sources: true,
      max_results: 3
    });

    return response.data.results;
  } catch (error) {
    console.error('Tavily search error:', error.message);
    throw error;
  }
}

// Function to search using SerpAPI
async function searchSerpAPI(query, apiKey) {
  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        api_key: apiKey,
        q: query,
        google_domain: 'google.com',
        gl: 'us',
        hl: 'en'
      }
    });

    const results = [];
    if (response.data.organic_results) {
      response.data.organic_results.slice(0, 5).forEach(result => {
        results.push({
          title: result.title,
          url: result.link,
          content: result.snippet || result.title
        });
      });
    }

    return results;
  } catch (error) {
    console.error('SerpAPI search error:', error.message);
    throw error;
  }
}

// MCP-related handler functions
async function handleMCPConnect(ws, message) {
  if (!config.enableMCP) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'MCP integration is disabled'
    }));
    return;
  }

  const { serverName } = message;

  if (!serverName) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Server name is required'
    }));
    return;
  }

  try {
    await mcpClientManager.connectToServer(serverName);

    ws.send(JSON.stringify({
      type: 'mcp_connected',
      serverName: serverName,
      message: `Connected to ${serverName}`
    }));

    // Also send updated status
    ws.send(JSON.stringify({
      type: 'mcp_status',
      configuredServers: mcpClientManager.getConfiguredServers(),
      connectedServers: mcpClientManager.getConnectedServers(),
      availableTools: mcpClientManager.listTools().length,
      enabled: true
    }));
  } catch (error) {
    console.error('MCP connect error:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to connect to ${serverName}: ${error.message}`
    }));
  }
}

async function handleMCPDisconnect(ws, message) {
  if (!config.enableMCP) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'MCP integration is disabled'
    }));
    return;
  }

  const { serverName } = message;

  if (!serverName) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Server name is required'
    }));
    return;
  }

  try {
    await mcpClientManager.disconnectFromServer(serverName);

    ws.send(JSON.stringify({
      type: 'mcp_disconnected',
      serverName: serverName,
      message: `Disconnected from ${serverName}`
    }));

    // Also send updated status
    ws.send(JSON.stringify({
      type: 'mcp_status',
      configuredServers: mcpClientManager.getConfiguredServers(),
      connectedServers: mcpClientManager.getConnectedServers(),
      availableTools: mcpClientManager.listTools().length,
      enabled: true
    }));
  } catch (error) {
    console.error('MCP disconnect error:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to disconnect from ${serverName}: ${error.message}`
    }));
  }
}

async function handleMCPListServers(ws) {
  if (!config.enableMCP) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'MCP integration is disabled'
    }));
    return;
  }

  try {
    const configuredServers = mcpClientManager.getConfiguredServers();
    const connectionStatuses = mcpClientManager.getAllConnectionStatuses();

    ws.send(JSON.stringify({
      type: 'mcp_servers_list',
      configuredServers: configuredServers,
      connectionStatuses: connectionStatuses
    }));
  } catch (error) {
    console.error('MCP list servers error:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to list servers: ${error.message}`
    }));
  }
}

async function handleMCPListTools(ws, message) {
  if (!config.enableMCP) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'MCP integration is disabled'
    }));
    return;
  }

  try {
    let tools;
    if (message && message.serverName) {
      // List tools for specific server
      tools = mcpClientManager.listTools(message.serverName);
    } else {
      // List all tools
      tools = mcpClientManager.listTools();
    }

    ws.send(JSON.stringify({
      type: 'mcp_tools_list',
      tools: tools,
      count: tools.length
    }));
  } catch (error) {
    console.error('MCP list tools error:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to list tools: ${error.message}`
    }));
  }
}

async function handleMCPExecuteTool(ws, message) {
  if (!config.enableMCP) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'MCP integration is disabled'
    }));
    return;
  }

  const { serverName, toolName, arguments: toolArgs } = message;

  if (!serverName || !toolName) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Server name and tool name are required'
    }));
    return;
  }

  try {
    // Send tool execution started message
    ws.send(JSON.stringify({
      type: 'mcp_tool_execution_started',
      serverName,
      toolName,
      arguments: toolArgs
    }));

    const result = await mcpClientManager.executeTool(serverName, toolName, toolArgs || {});

    ws.send(JSON.stringify({
      type: 'mcp_tool_executed',
      serverName,
      toolName,
      result,
      success: true
    }));
  } catch (error) {
    console.error('MCP execute tool error:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to execute tool ${toolName}: ${error.message}`,
      serverName,
      toolName
    }));
  }
}

async function handleMCPGetStatus(ws) {
  if (!config.enableMCP) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'MCP integration is disabled'
    }));
    return;
  }

  try {
    const configuredServers = mcpClientManager.getConfiguredServers();
    const connectedServers = mcpClientManager.getConnectedServers();
    const connectionStatuses = mcpClientManager.getAllConnectionStatuses();
    const availableTools = mcpClientManager.listTools();
    const toolCallStats = mcpClientManager.getToolStatistics();
    const registryStats = mcpClientManager.getRegistryStatistics();

    ws.send(JSON.stringify({
      type: 'mcp_full_status',
      configuredServers,
      connectedServers,
      connectionStatuses,
      availableToolsCount: availableTools.length,
      toolCallStats,
      registryStats,
      enabled: true
    }));
  } catch (error) {
    console.error('MCP get status error:', error.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to get MCP status: ${error.message}`
    }));
  }
}

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to get MCP configuration
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
    res.json({
      enabled: false,
      message: 'MCP integration is disabled'
    });
  }
});

// Start the server
server.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Supported environment variables:');
  console.log('  - OPENAI_API_KEY: Your API key for OpenAI provider');
  console.log('  - OPENAI_BASE_URL: Custom API endpoint (defaults to OpenAI)');
  console.log('  - AZURE_OPENAI_API_VERSION: API version for Azure OpenAI');
  console.log('  - ENABLE_MCP: Enable MCP integration (defaults to true)');
  console.log('  - MCP_CONFIG_PATH: Path to MCP config file (defaults to ./mcp-config.json)');

  // Initialize MCP after server starts
  await initializeMCP();

  if (config.enableMCP) {
    console.log('\nMCP Integration:');
    console.log(`  - Config file: ${config.mcpConfigPath}`);
    console.log(`  - Configured servers: ${mcpClientManager?.getConfiguredServers().join(', ') || 'None'}`);
    console.log(`  - Connected servers: ${mcpClientManager?.getConnectedServers().join(', ') || 'None'}`);
    console.log(`  - Available tools: ${mcpClientManager?.listTools().length || 0}`);
  }
});