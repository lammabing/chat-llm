# Ollama and Puter JavaScript Client

This project demonstrates how to interact with both Ollama and Puter AI APIs using JavaScript. The project includes examples for chat completions, streaming responses, and multi-agent conversations.

## Project Overview

This project contains examples for:

- **Ollama API**: Using local language models
- **Puter API**: Using cloud-based AI models with the Puter platform

## Key Files

- `interface.js` - Basic Ollama chat completion example
- `streaming.js` - Ollama streaming chat completion example
- `chat-interface.js` - Interactive Ollama chat interface
- `multi-agent-chat.js` - Multi-agent conversations using Ollama
- `puter-chat-interface.js` - Interactive chat interface using Puter API (Node.js)
- `puter-chat-interface.html` - Interactive chat interface using Puter API (Browser)
- `puter-multi-agent-chat.js` - Multi-agent conversations using Puter API

## Setup and Installation

1. Ensure you have Node.js installed (version compatible with ES modules)
2. For Ollama examples:
   - Make sure Ollama is installed and running on your system
3. For Puter examples:
   - Access to the Puter API requires signing into a Puter account (https://puter.com)
4. Install project dependencies:

```bash
npm install
```

## Running Examples

### Ollama Examples

To run the basic Ollama chat example:
```bash
node interface.js
```

To run the Ollama streaming chat example:
```bash
node streaming.js
```

To run the interactive Ollama chat interface:
```bash
node chat-interface.js
```

To run Ollama multi-agent examples:
```bash
node multi-agent-chat.js
```

For interactive multi-agent mode:
```bash
node multi-agent-chat.js --interactive
```

### Puter Examples

To run the Puter chat interface (Node.js version - note: this is a simulation, see below):
```bash
node puter-chat-interface.js
```

To run the Puter multi-agent examples:
```bash
node puter-multi-agent-chat.js
```

For interactive Puter multi-agent mode:
```bash
node puter-multi-agent-chat.js --interactive
```

### Browser-based Puter Interface

The most effective way to use the Puter API is through the browser-based interface:

1. Open `puter-chat-interface.html` in a web browser
2. Sign in to your Puter account when prompted
3. Start chatting with AI models

## Important Notes about Puter API Integration

The Puter API is designed to work primarily in browser environments. The JavaScript library is loaded via:

```html
<script src="https://js.puter.com/v2/"></script>
```

This provides access to:
- AI chat capabilities with various models (GPT, Claude, Gemini, etc.)
- Cloud storage functionality
- Authentication and user management
- Serverless workers and other Puter services

The Node.js files (`puter-chat-interface.js` and `puter-multi-agent-chat.js`) are included to demonstrate how the code structure would change when moving from Ollama to Puter APIs, but they will only work in an environment where the Puter API is available (i.e., in the browser with the script loaded).

For a fully functional Puter AI integration, use the HTML version (`puter-chat-interface.html`) which includes the Puter.js library and handles authentication properly.

## Prerequisites

- For Ollama: Ollama must be installed and running locally with compatible models
- For Puter: A Puter account is required (free tier available at https://puter.com)

## Development Conventions

- Uses ES modules (`"type": "module"` in package.json)
- Async/await for handling promises
- Modern JavaScript syntax with top-level await
- Direct API calls to either Ollama or Puter based on the specific example

## Project Purpose

This project serves as an example of how to integrate with different AI APIs using JavaScript. It demonstrates:
- Basic chat completion requests
- Streaming responses
- Multi-agent conversations
- Error handling
- Usage of different models from different providers