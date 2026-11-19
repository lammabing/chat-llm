# Adding a New Provider (Config-Driven)

Providers are defined in `providers.json`. No source code changes are needed.

## Steps

1. **Add environment variables to `.env`**:
```
MYPROVIDER_API_KEY=sk-your-key-here
MYPROVIDER_BASE_URL=https://api.myprovider.com/v1
```

2. **Add entry to `providers.json`**:
```json
"myprovider": {
  "name": "My Provider",
  "type": "openai-compatible",
  "apiKeyEnv": "MYPROVIDER_API_KEY",
  "baseUrlEnv": "MYPROVIDER_BASE_URL",
  "defaultBaseUrl": "https://api.myprovider.com/v1"
}
```

3. **Restart the server**.

That's it. The provider will appear in the dropdown on all connected clients automatically via the `providers_list` message.

## Provider Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name shown in the UI |
| `type` | Yes | `"ollama"` or `"openai-compatible"` |
| `apiKeyEnv` | For openai-compatible | Env var name for the API key |
| `baseUrlEnv` | For openai-compatible | Env var name for the base URL |
| `defaultBaseUrl` | No | Fallback base URL if env var not set |

## Ollama Providers

Ollama uses a local API and doesn't need API keys or base URLs:

```json
"ollama": {
  "name": "Ollama",
  "type": "ollama"
}
```

## How It Works

- `lib/provider-registry.js` reads `providers.json` at startup and resolves env vars.
- `handlers/provider-handler.js` dynamically creates OpenAI clients for any `openai-compatible` provider, no hardcoded branches.
- `web-interface.js` sends `providers_list` to each WebSocket client on connect.
- Client-side `script.js` populates the dropdown from that message.
