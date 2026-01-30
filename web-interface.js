import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import ollama from 'ollama';
import { OpenAI } from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';
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

// Configuration object to store current settings
const config = {
  provider: 'ollama', // 'ollama' or 'openai'
  ollamaModel: 'gpt-oss:120b-cloud',
  openaiModel: 'gpt-3.5-turbo',
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', // Allows custom OpenAI-compatible endpoints
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION, // For Azure OpenAI compatibility
  searchProvider: process.env.SEARCH_PROVIDER || 'duckduckgo', // 'duckduckgo', 'tavily', 'serpapi', etc.
  searchApiKey: process.env.SEARCH_API_KEY // For APIs that require an API key
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

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Send welcome message to the new client
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to chat server'
  }));

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

    if (config.provider === 'ollama') {
      const response = await ollama.chat({
        model: config.ollamaModel,
        messages: updatedChatHistory,
        stream: true
      });

      for await (const part of response) {
        const content = part.message.content;
        fullResponse += content;
        
        // Send incremental response to client
        ws.send(JSON.stringify({
          type: 'response_chunk',
          content: content
        }));
      }
    } else {
      if (!openaiClient) {
        throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.');
      }

      const openaiMessages = updatedChatHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await openaiClient.chat.completions.create({
        model: config.openaiModel,
        messages: openaiMessages,
        stream: true,
      });

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
      }
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

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('Supported environment variables:');
  console.log('  - OPENAI_API_KEY: Your API key for OpenAI provider');
  console.log('  - OPENAI_BASE_URL: Custom API endpoint (defaults to OpenAI)');
  console.log('  - AZURE_OPENAI_API_VERSION: API version for Azure OpenAI');
});