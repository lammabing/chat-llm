import readline from 'readline';
import ollama from 'ollama';
import { OpenAI } from 'openai';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Chat history array to store conversation
const chatHistory = [];

// Configuration object to store current settings
const config = {
  provider: 'ollama', // 'ollama' or 'openai'
  ollamaModel: 'gpt-oss:120b-cloud',
  openaiModel: 'gpt-3.5-turbo',
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', // Allows custom OpenAI-compatible endpoints
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION // For Azure OpenAI compatibility
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

// Function to get user input
function getUserInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to switch between providers
function switchProvider(input) {
  // Split the input to handle both provider and optional endpoint
  const parts = input.split(' ');
  const provider = parts[0];
  const endpoint = parts.length > 1 ? parts.slice(1).join(' ') : null;

  if (provider === 'ollama') {
    config.provider = 'ollama';
    console.log(`Provider switched to: ${provider}`);
    console.log(`Current Ollama model: ${config.ollamaModel}\n`);
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
      console.log(`Provider switched to: openai`);
      console.log(`API Endpoint: ${config.openaiBaseUrl}`);
      console.log(`Current OpenAI model: ${config.openaiModel}\n`);
    } else {
      console.log(`Provider switched to: openai`);
      console.log(`API Endpoint: ${config.openaiBaseUrl}`);
      console.log(`Current OpenAI model: ${config.openaiModel}\n`);
      if (!config.openaiApiKey) {
        console.log('⚠️  OpenAI API key not set. Please set OPENAI_API_KEY environment variable.\n');
      }
    }
  } else {
    console.log(`Invalid provider. Available providers: ollama, openai`);
    console.log(`Usage: /provider ollama`);
    console.log(`Usage: /provider openai [optional_endpoint_url]\n`);
  }
}

// Function to get response from Ollama
async function getOllamaResponse(messages) {
  const response = await ollama.chat({
    model: config.ollamaModel,
    messages: messages,
    stream: true
  });

  let fullResponse = '';
  console.log('Assistant: ');

  for await (const part of response) {
    const content = part.message.content;
    fullResponse += content;
    process.stdout.write(content);
  }

  return fullResponse;
}

// Function to get response from OpenAI-compatible endpoint
async function getOpenAIResponse(messages) {
  if (!openaiClient) {
    throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.');
  }

  const response = await openaiClient.chat.completions.create({
    model: config.openaiModel,
    messages: messages,
    stream: true,
  });

  let fullResponse = '';
  console.log('Assistant: ');

  for await (const part of response) {
    const content = part.choices[0]?.delta?.content || '';
    if (content) {
      fullResponse += content;
      process.stdout.write(content);
    }
  }

  return fullResponse;
}

// Function to list available models from the current provider
async function listModels() {
  if (config.provider === 'ollama') {
    try {
      // Fetch models from Ollama API
      const response = await fetch('http://localhost:11434/v1/models');
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      console.log('Available Ollama models:');
      data.data.forEach(model => {
        console.log(`- ${model.id}`);
      });
      console.log('');
    } catch (error) {
      console.error('Error listing Ollama models:', error.message);
      console.log('Failed to fetch Ollama models. Make sure Ollama is running on localhost:11434\n');
    }
  } else if (config.provider === 'openai') {
    try {
      if (!openaiClient) {
        console.log('OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.');
        return;
      }

      // Get available models from the OpenAI-compatible endpoint
      const models = await openaiClient.models.list();
      console.log('Available models:');
      models.data.forEach(model => {
        console.log(`- ${model.id}`);
      });
      console.log('');
    } catch (error) {
      console.error('Error listing models:', error.message);
      console.log('This endpoint might not support the models list API.\n');
    }
  }
}

// Function to select a model from the available ones
async function selectModel(modelName) {
  if (!modelName) {
    console.log('Please specify a model name. Use "/models" to see available options.\n');
    return;
  }

  if (config.provider === 'ollama') {
    config.ollamaModel = modelName;
    console.log(`Ollama model changed to: ${config.ollamaModel}\n`);
  } else if (config.provider === 'openai') {
    // Verify the model exists if possible
    try {
      if (openaiClient) {
        const model = await openaiClient.models.retrieve(modelName);
        config.openaiModel = model.id;
        console.log(`OpenAI model changed to: ${config.openaiModel}\n`);
      } else {
        // If we can't verify, just set it
        config.openaiModel = modelName;
        console.log(`OpenAI model changed to: ${config.openaiModel}\n`);
      }
    } catch (error) {
      // If the endpoint doesn't support model verification, just set the model
      config.openaiModel = modelName;
      console.log(`OpenAI model changed to: ${config.openaiModel} (verification skipped)\n`);
    }
  }
}

// Function to start the chat session
async function startChat() {
  console.log('Welcome to the Hybrid Chat Interface!');
  console.log('Supports both Ollama and OpenAI-compatible endpoints.');
  console.log('Environment variables for OpenAI configuration:');
  console.log('  - OPENAI_API_KEY: Your API key');
  console.log('  - OPENAI_BASE_URL: Custom API endpoint (defaults to OpenAI)');
  console.log('  - AZURE_OPENAI_API_VERSION: API version for Azure OpenAI');
  console.log('Commands:');
  console.log('  - Type your message and press Enter to chat');
  console.log('  - Type "/provider <ollama|openai> [endpoint_url]" to switch providers (optional endpoint for openai)');
  console.log('  - Type "/model <model_name>" to change the model for current provider (deprecated, use /select)');
  console.log('  - Type "/select <model_name>" to select a model after seeing available options');
  console.log('  - Type "/models" or "/list" to list available models from current provider/endpoint');
  console.log('  - Type "/endpoint <url>" to change the API endpoint (OpenAI provider only)');
  console.log('  - Type "/clear" to clear the conversation history');
  console.log('  - Type "/exit" or "/quit" to end the session\n');

  console.log(`Current provider: ${config.provider}`);
  if (config.provider === 'ollama') {
    console.log(`Using Ollama model: ${config.ollamaModel}\n`);
  } else {
    console.log(`Using OpenAI model: ${config.openaiModel}`);
    console.log(`API Endpoint: ${config.openaiBaseUrl}`);
    if (config.azureOpenAIApiVersion) {
      console.log(`Azure API Version: ${config.azureOpenAIApiVersion}`);
    }
    console.log('');
  }

  while (true) {
    // Get input from user
    const userInput = await getUserInput('You: ');

    // Check for special commands
    if (userInput.startsWith('/')) {
      const [command, ...args] = userInput.split(' ');

      if (command === '/exit' || command === '/quit') {
        console.log('Ending chat session. Goodbye!');
        rl.close();
        break;
      } else if (command === '/provider' && args.length > 0) {
        switchProvider(args[0]);
        continue;
      } else if (command === '/model' && args.length > 0) {
        console.log('⚠️  The /model command is deprecated. Use /models to list available models, then /select <model_name> to choose one.\n');
        continue;
      } else if (command === '/endpoint' && args.length > 0) {
        if (config.provider === 'openai') {
          config.openaiBaseUrl = args[0];
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
              console.log(`Azure OpenAI endpoint changed to: ${config.openaiBaseUrl}\n`);
            } else {
              // Standard OpenAI or OpenAI-compatible endpoint
              openaiClient = new OpenAI({
                apiKey: config.openaiApiKey,
                baseURL: config.openaiBaseUrl
              });
              console.log(`OpenAI endpoint changed to: ${config.openaiBaseUrl}\n`);
            }
          } else {
            console.log(`OpenAI endpoint changed to: ${config.openaiBaseUrl}`);
            console.log('⚠️  API key not set. Please set OPENAI_API_KEY environment variable.\n');
          }
        } else {
          console.log('Endpoint command only works with OpenAI provider.\n');
        }
        continue;
      } else if (command === '/models') {
        await listModels();
        continue;
      } else if (command === '/select' && args.length > 0) {
        await selectModel(args[0]);
        continue;
      } else if (command === '/provider' && args.length > 0) {
        switchProvider(args[0]);
        continue;
      } else if (command === '/clear') {
        chatHistory.length = 0; // Clear the array
        console.log('Conversation history cleared.\n');
        continue;
      } else if (command === '/list') {
        // Alias for /models
        await listModels();
        continue;
      } else {
        console.log('Unknown command. Available commands: /provider, /model, /select, /models, /endpoint, /clear, /exit, /quit, /list\n');
        continue;
      }
    }

    // Add user message to chat history
    chatHistory.push({ role: 'user', content: userInput });

    try {
      let fullResponse;
      
      if (config.provider === 'ollama') {
        fullResponse = await getOllamaResponse(chatHistory);
      } else {
        // Convert chatHistory format to match OpenAI expectations
        const openaiMessages = chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }));
        fullResponse = await getOpenAIResponse(openaiMessages);
      }

      // Add assistant response to chat history
      chatHistory.push({ role: 'assistant', content: fullResponse });
      console.log('\n'); // Add extra newline after response
    } catch (error) {
      console.error('\nError communicating with the model:', error.message);
      console.log('Please try again.\n');

      // Remove the user message from history since it wasn't processed
      chatHistory.pop();
    }
  }
}

// Start the chat session
startChat();

// Handle exit gracefully
rl.on('close', () => {
  console.log('\nChat session ended.');
  process.exit(0);
});