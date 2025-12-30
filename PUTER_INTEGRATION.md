# Puter API Integration Guide

This document explains how the Puter API has been integrated into the existing Ollama JavaScript client project.

## About Puter

[Puter](https://puter.com) is a privacy-focused, open-source personal cloud platform that provides serverless cloud and AI capabilities directly in the browser. The Puter API allows access to various AI models (GPT, Claude, Gemini, etc.) without requiring backend code or API keys.

## Integration Approach

The integration maintains the same structure and functionality as the original Ollama implementation but adapts it to work with the Puter API:

### API Differences

1. **Ollama API**:
   ```javascript
   const response = await ollama.chat({
     model: 'gpt-oss:120b-cloud',
     messages: [{ role: 'user', content: 'Hello' }],
     stream: true
   });
   ```

2. **Puter API**:
   ```javascript
   const response = await puter.ai.chat({
     prompt: 'Hello',
     model: 'gpt-4',
     stream: true
   });
   ```

### Key Changes Made

1. **Authentication**:
   - Puter requires users to sign in to their Puter accounts
   - Usage follows a "user-pays" model where users cover their own cloud and AI usage

2. **API Call Format**:
   - Ollama uses `messages` array with role/content pairs
   - Puter uses a simpler `prompt` string parameter
   - Model names are different (e.g., "gpt-4" instead of "gpt-oss:120b-cloud")

3. **Response Handling**:
   - Both support streaming responses but with different structures
   - Response format varies between the two APIs

## Files Created

### `puter-chat-interface.js`
- Node.js implementation of the chat interface using Puter API
- Note: This is primarily for demonstration of code structure as Puter API works best in browsers

### `puter-chat-interface.html`
- Complete browser-based chat interface
- Includes user authentication handling
- Provides full functionality with real-time chat
- Responsive UI with message history and command support

### `puter-multi-agent-chat.js`
- Multi-agent conversation implementation using Puter API
- Supports debate, role-playing, and multi-party discussions
- Maintains the same functionality as the original but adapted for Puter

## Running the Puter Examples

### Browser Implementation (Recommended)
1. Open `puter-chat-interface.html` in a web browser
2. Sign in to your Puter account when prompted
3. Start chatting with AI models

### Node.js Implementation (Simulation)
```bash
node puter-chat-interface.js
node puter-multi-agent-chat.js
```
Note: These will only work in an environment where the Puter API is available, otherwise they will simulate responses.

## Authentication Requirements

Puter's usage model requires user authentication:
- Users must sign in to their Puter accounts
- API usage is billed to the individual user (user-pays model)
- This eliminates the need for developers to manage API keys or billing

## Available Models

The Puter API supports various AI models including:
- OpenAI GPT models
- Anthropic Claude models
- Google Gemini models
- And others

Use the `/models` command in the chat interface to see the full list of available models.

## Comparison with Ollama

| Aspect | Ollama | Puter API |
|--------|--------|-----------|
| Deployment | Local | Cloud-based |
| Models | Self-hosted | Pre-configured cloud models |
| Authentication | None required | User sign-in required |
| Cost | Free (local resources) | Pay-per-use |
| Setup | Requires installation | Just sign in |
| Privacy | Complete control | Subject to Puter's privacy policy |

## Migration Guide

To convert from Ollama to Puter API in your own code:

1. Replace Ollama imports with Puter API setup (in browser environment)
2. Change API calls from:
   ```javascript
   // Ollama
   ollama.chat({model, messages, stream: true})
   ```
   to:
   ```javascript
   // Puter
   puter.ai.chat({prompt, model, stream: true})
   ```
3. Handle user authentication requirements
4. Adapt response handling to Puter's format

## Security Considerations

- The Puter API follows a privacy-focused approach
- Users maintain control over their data
- No tracking technologies are used by Puter
- All functionality runs in the frontend without backend code required

## Getting Started

1. Sign up for a Puter account at https://puter.com
2. For browser implementation: Open `puter-chat-interface.html` and sign in
3. For Node.js simulation: Run with `node puter-chat-interface.js`

The integration maintains the same user experience as the Ollama version while connecting to Puter's AI models instead.