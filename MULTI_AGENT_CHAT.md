# Multi-Agent Chat System Documentation

This project implements a multi-agent chat system that enables different AI models to interact with each other in various formats, including discussions, debates, and role-playing scenarios. The system supports both local models via Ollama and cloud models via Puter API.

## Features

- **Multi-Agent Discussion**: Multiple models take turns discussing a topic
- **Model Debate**: Structured debates between two models on specific topics
- **Role-Playing Scenarios**: Models assume different personas within a scenario
- **Interactive Chat**: Real-time user control of multi-model conversations
- **Dual API Support**: Compatible with both Ollama (local) and Puter API (cloud)

## Prerequisites

### For Ollama Implementation:
Make sure you have the required models available in your Ollama installation:

```bash
ollama list
```

### For Puter API Implementation:
- A Puter account (sign up at https://puter.com)
- Internet connection to access the Puter API
- The HTML interface works best in modern web browsers

## Usage

### Running Examples

To run Ollama-based examples:

```bash
node multi-agent-chat.js
```

To run Puter API-based examples:

```bash
node puter-multi-agent-chat.js
```

### Browser Implementation (Recommended for Puter API)

For the full Puter API experience, open `puter-chat-interface.html` in your web browser:
1. Sign in to your Puter account when prompted
2. Start chatting with AI models
3. Use the same commands as in the Node.js version

### Interactive Modes

To start the interactive multi-agent chat with Ollama:

```bash
node multi-agent-chat.js --interactive
```

To start the interactive multi-agent chat with Puter API:

```bash
node puter-multi-agent-chat.js --interactive
```

This will run:
1. Multi-agent discussion
2. Model debate
3. Role-playing scenario

To run examples with conversation logs saved to files:

```bash
node multi-agent-chat.js --log
```

### Interactive Mode

To start the interactive multi-agent chat:

```bash
node multi-agent-chat.js --interactive
```

To start the interactive multi-agent chat with conversation logs saved:

```bash
node multi-agent-chat.js --interactive --log
```

In interactive mode, you can:
- Enter your own topics for models to discuss
- Type 'exit' to quit
- Type 'new' to start a new topic

## Selecting Models

### Command-line Model Selection

You can specify models for the interactive mode using command-line arguments:

```bash
node multi-agent-chat.js --interactive --models "gpt-oss:120b-cloud,qwen3-coder:480b-cloud"
```

### Code-based Model Selection

You can modify the model configuration directly in the code:

#### For Interactive Mode:
```javascript
// In the interactiveMultiAgentChat call
interactiveMultiAgentChat({
  models: ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud'], // Specify your models here
  maxTokensPerResponse: 100,
  maxTurns: 10
})
```

#### For Multi-Agent Discussion:
```javascript
await multiAgentChat({
  models: ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud', 'your-third-model'],
  topic: "Your topic here",
  turns: 6
});
```

#### For Model Debate:
```javascript
await modelDebate(
  "Your debate topic",
  'gpt-oss:120b-cloud',  // First model
  'qwen3-coder:480b-cloud'  // Second model
);
```

#### For Role-Playing Scenario:
```javascript
await rolePlayScenario(
  "Your scenario",
  ['Role1', 'Role2', 'Role3'],
  ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud', 'your-third-model'],  // Model list
  5
);
```

## Available Functions

### multiAgentChat(config)
- `models`: Array of model names to use
- `topic`: The topic for discussion
- `turns`: Number of conversation turns
- `maxTokensPerResponse`: Maximum tokens per model response
- `saveLog`: Boolean to save conversation log to file

### modelDebate(topic, model1, model2, rounds, saveLog)
- `topic`: The debate topic
- `model1`, `model2`: The two models to debate
- `rounds`: Number of debate rounds
- `saveLog`: Boolean to save conversation log to file

### rolePlayScenario(scenario, roles, models, turns, saveLog)
- `scenario`: The role-playing scenario
- `roles`: Array of role names
- `models`: Array of model names
- `turns`: Number of role-playing turns
- `saveLog`: Boolean to save conversation log to file

### interactiveMultiAgentChat(config)
- `models`: Array of model names to use
- `maxTokensPerResponse`: Maximum tokens per model response
- `maxTurns`: Maximum turns before asking to continue
- `saveLog`: Boolean to save conversation log to file

## Requirements

### For Ollama Implementation:
- Node.js (ES Modules support required)
- Ollama running locally
- Required models installed in Ollama

### For Puter API Implementation:
- Node.js (ES Modules support required)
- Internet connection to access the Puter API
- A Puter account with sufficient credits for API usage
- For full functionality, use the HTML interface in a browser environment

## Model Management

Before selecting models, verify which models are available in your Ollama installation:

```bash
ollama list
```

Make sure to use exact model names as they appear in the list.

## Conversation Log Files

When using the logging feature (`--log` flag), conversation logs are saved in JSON format with the following structure:

- Saves to: `chat-logs/` directory (created automatically)
- Filename pattern: `{type}_{timestamp}.json`
- Contains the full conversation history
- Includes metadata like total message count and models used
- Timestamp of when the conversation occurred

## Examples of Use Cases

1. **Comparing Model Responses**: See how different models approach the same question
2. **Simulated Debates**: Watch models argue for different positions on controversial topics
3. **Collaborative Problem Solving**: Models work together to solve complex problems
4. **Role-playing Scenarios**: Models take on different personas to explore scenarios

## API Differences: Ollama vs Puter

### Model Selection
- **Ollama**: Uses locally installed models (e.g., `gpt-oss:120b-cloud`)
- **Puter**: Uses cloud-based models (e.g., `gpt-4`, `claude`)

### Authentication
- **Ollama**: No authentication required
- **Puter**: Requires user sign-in to Puter account

### Deployment
- **Ollama**: Runs locally on your machine
- **Puter**: Accesses cloud-based AI services

### Cost Model
- **Ollama**: Free (uses your local resources)
- **Puter**: Pay-per-use (billed to your Puter account)

### Performance
- **Ollama**: Performance depends on your local hardware
- **Puter**: Consistent performance based on Puter's infrastructure