import { OpenAI } from 'openai';
import { loadProviders, getProviderList } from '../lib/provider-registry.js';

export function createProviderHandler(ctx) {
  const { config } = ctx;
  const clients = {};

  async function initClientForProvider(providerId) {
    const providers = await loadProviders();
    const def = providers[providerId];
    if (!def || def.type !== 'openai-compatible') {
      delete clients[providerId];
      ctx.openaiClient = null;
      return;
    }
    if (!def.apiKey) {
      delete clients[providerId];
      ctx.openaiClient = null;
      return;
    }
    const client = new OpenAI({ apiKey: def.apiKey, baseURL: def.baseUrl });
    clients[providerId] = client;
    ctx.openaiClient = client;
  }

  function getClient(providerId) {
    return clients[providerId] || null;
  }

  async function handleProviderSwitch(ws, message) {
    const { provider } = message;
    const providers = getProviderList();
    const def = providers[provider];

    if (!def) {
      const available = Object.keys(providers).join(', ');
      ws.send(JSON.stringify({ type: 'error', message: `Invalid provider. Available providers: ${available}` }));
      return;
    }

    config.provider = provider;

    if (def.type === 'ollama') {
      const model = config.models[provider] || 'gpt-oss:120b-cloud';
      ws.send(JSON.stringify({ type: 'provider_switched', provider, model }));
    } else {
      await initClientForProvider(provider);
      const endpoint = (await loadProviders())[provider]?.baseUrl || '';
      const model = config.models[provider] || '';
      ws.send(JSON.stringify({ type: 'provider_switched', provider, model, endpoint }));
      if (!(await loadProviders())[provider]?.apiKey) {
        ws.send(JSON.stringify({ type: 'warning', message: `API key not set for ${provider}. Set the ${provider.toUpperCase()}_API_KEY environment variable.` }));
      }
    }
  }

  async function handleModelSelect(ws, message) {
    const { model } = message;
    if (!model) {
      ws.send(JSON.stringify({ type: 'error', message: 'Please specify a model name' }));
      return;
    }

    const provider = config.provider;
    const providers = await loadProviders();
    const def = providers[provider];

    if (def && def.type !== 'ollama') {
      const client = getClient(provider);
      if (client) {
        try {
          const modelResult = await client.models.retrieve(model);
          config.models[provider] = modelResult.id;
          ws.send(JSON.stringify({ type: 'model_selected', provider, model: modelResult.id }));
          return;
        } catch {
          // fall through
        }
      }
    }

    config.models[provider] = model;
    ws.send(JSON.stringify({ type: 'model_selected', provider, model, message: 'Model verification skipped' }));
  }

  async function handleListModels(ws) {
    const provider = config.provider;
    const providers = await loadProviders();
    const def = providers[provider];

    if (!def) {
      ws.send(JSON.stringify({ type: 'error', message: 'No provider selected' }));
      return;
    }

    if (def.type === 'ollama') {
      try {
        const response = await fetch('http://localhost:11434/v1/models');
        if (!response.ok) throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
        const data = await response.json();
        ws.send(JSON.stringify({ type: 'models_list', provider, models: data.data.map(m => m.id) }));
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: `Failed to fetch Ollama models: ${error.message}. Make sure Ollama is running on localhost:11434` }));
      }
    } else {
      const client = getClient(provider);
      if (!client) {
        ws.send(JSON.stringify({ type: 'error', message: `${provider} client not initialized. Set the API key in .env.` }));
        return;
      }
      try {
        const models = await client.models.list();
        ws.send(JSON.stringify({ type: 'models_list', provider, models: models.data.map(m => m.id) }));
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', message: `Error listing models: ${error.message}. This endpoint might not support the models list API.` }));
      }
    }
  }

  function handleClearHistory(ws) {
    ws.send(JSON.stringify({ type: 'history_cleared', message: 'Conversation history cleared' }));
  }

  return { handleProviderSwitch, handleModelSelect, handleListModels, handleClearHistory, getClient, initClientForProvider };
}
