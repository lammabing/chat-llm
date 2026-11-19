import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROVIDERS_PATH = join(__dirname, '..', 'providers.json');

let providersCache = null;

export async function loadProviders() {
  if (providersCache) return providersCache;
  const raw = await readFile(PROVIDERS_PATH, 'utf-8');
  const config = JSON.parse(raw);
  providersCache = {};
  for (const [id, def] of Object.entries(config)) {
    const resolved = { id, name: def.name, type: def.type };
    if (def.type === 'openai-compatible') {
      resolved.apiKey = process.env[def.apiKeyEnv] || '';
      resolved.baseUrl = process.env[def.baseUrlEnv] || def.defaultBaseUrl || '';
    }
    providersCache[id] = resolved;
  }
  return providersCache;
}

export function getProviderList() {
  if (!providersCache) return {};
  const list = {};
  for (const [id, def] of Object.entries(providersCache)) {
    list[id] = { id: def.id, name: def.name, type: def.type };
  }
  return list;
}
