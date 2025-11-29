# Ollama JavaScript Client

This is a JavaScript client project that provides examples and interfaces for interacting with local language models using the Ollama library. The project demonstrates how to use the official Ollama JavaScript client to perform chat completions and streaming responses.

## Project Overview

**Main Technologies:**
- Node.js (ES Modules)
- Ollama JavaScript client library (`ollama` package)
- JavaScript (ES2022+)

**Architecture:**
- Main entry point: `interface.js` - Demonstrates basic chat completion
- Streaming functionality: `streaming.js` - Shows how to handle streaming responses
- Multi-agent functionality: `multi-agent-chat.js` - Demonstrates interactions between different AI models

## Key Files

- `interface.js` - Basic chat completion example with a single response
- `streaming.js` - Streaming chat completion example
- `chat-interface.js` - Interactive chat interface
- `multi-agent-chat.js` - Multi-agent chat with different models
- `package.json` - Project dependencies and metadata
- `node_modules/` - NPM dependencies including the ollama client
- `chat-logs/` - Directory for storing conversation logs

## Setup and Installation

1. Ensure you have Node.js installed (version compatible with ES modules)
2. Make sure Ollama is installed and running on your system
3. Install project dependencies:

```bash
npm install
```

## Building and Running

### Running Examples

To run the basic chat example:
```bash
node interface.js
```

To run the streaming chat example:
```bash
node streaming.js
```

To run the interactive chat interface:
```bash
node chat-interface.js
```

To run the multi-agent chat examples:
```bash
node multi-agent-chat.js
```

For multi-agent chat with logging:
```bash
node multi-agent-chat.js --log
```

For interactive multi-agent chat:
```bash
node multi-agent-chat.js --interactive
```

For interactive multi-agent chat with logging:
```bash
node multi-agent-chat.js --interactive --log
```

### Available Scripts

- `npm run basic` - Run the basic chat example
- `npm run stream` - Run the streaming chat example
- `npm run chat` - Run the interactive chat interface
- `npm run multi-agent` - Run the multi-agent chat example

### Prerequisites

- Ollama must be installed and running locally
- A compatible model must be available

## Multi-Agent Chat Examples

The `multi-agent-chat.js` file includes three different examples of models chatting with each other:

### 1. Multi-Agent Discussion
Multiple models take turns discussing a topic, each bringing their own perspective to the conversation.

### 2. Model Debate
Two models engage in a structured debate on a controversial topic, with each model taking opposing viewpoints.

### 3. Role-Playing Scenario
Models take on different roles in a scenario and respond accordingly to the situation.

## Available Models

Based on your Ollama installation, the following models are available:

- `gpt-oss:120b-cloud`
- `qwen3-coder:480b-cloud`
- `glm-4.6:cloud`
- `kimi-k2:1t-cloud`
- `deepseek-v3.1:671b-cloud`
- `nomic-embed-text:latest`

## How It Works

The multi-agent chat works by:

1. Creating a conversation history array to maintain context
2. Cycling through different models for each turn in the conversation
3. Using system prompts to help models understand they're participating with other models
4. Handling errors gracefully when a model is not available
5. Displaying responses in an easy-to-read format

## Conversation Logs

When using the logging feature (`--log` flag), conversation logs are saved in JSON format:
- Saves to: `chat-logs/` directory (created automatically)
- Filename pattern: `{type}_{timestamp}.json`
- Contains the full conversation history
- Includes metadata like total message count and models used
- Timestamp of when the conversation occurred

## Development Conventions

- Uses ES modules (`"type": "module"` in package.json)
- Async/await for handling promises
- Modern JavaScript syntax with top-level await
- Direct import from the 'ollama' package

## Project Purpose

This project serves as a minimal example of how to integrate with Ollama's API using JavaScript. It demonstrates:
- Basic chat completion requests
- Streaming responses
- Interactive chat interfaces
- Multi-agent interactions between different models
- Error handling (implicitly through the Ollama client)
- Usage of different models

## Testing

Currently, no dedicated tests are specified in the package.json. The scripts section shows a placeholder test command.

## Dependencies

- `ollama`: Official JavaScript client for Ollama (version ^0.5.11)