# Ollama JavaScript Client with Web Interface

This project demonstrates how to interact with Ollama and other AI APIs using JavaScript, featuring a **full-featured web interface** with syntax highlighting, math rendering, and MCP integration.

## Features

- **Ollama API** - Local language model support
- **OpenAI-compatible API** - Cloud-based AI models
- **Web Interface** - Modern chat UI with:
  - **Persistent sessions** - Save and load conversations (SQLite)
  - Syntax-highlighted code blocks (22+ languages)
  - Mathematical notation rendering (LaTeX/KaTeX)
  - Copy-to-clipboard for code
  - Streaming responses
  - Multi-provider support (Ollama, OpenAI)
  - Session sidebar for managing chats
- **MCP Integration** - Model Context Protocol for tool calling
- **Search Integration** - DuckDuckGo, Tavily, SerpAPI support

## Project Structure

### Core Files

| File | Description |
|------|-------------|
| `interface.js` | Basic Ollama chat completion |
| `streaming.js` | Ollama streaming example |
| `chat-interface.js` | CLI chat for Ollama |
| `hybrid-chat-interface.js` | CLI chat with Ollama + OpenAI |
| `web-interface.js` | **Web server with WebSocket chat** |
| `multi-agent-chat.js` | Multi-agent conversations |

### Web Interface

| File | Description |
|------|-------------|
| `public/index.html` | Main web interface HTML |
| `public/script.js` | Frontend JavaScript logic |
| `public/styles.css` | Styling and layout |
| `public/test-math.html` | Math rendering test page |
| `public/test-code-highlight.html` | Code highlighting test page |
| `public/test-highlight-standalone.html` | Standalone Highlight.js test |

### Configuration

| File | Description |
|------|-------------|
| `package.json` | Dependencies and scripts |
| `mcp-config.json` | MCP server configuration |
| `.env` | Environment variables (API keys) |

### Documentation

| File | Description |
|------|-------------|
| `MATH_RENDERING.md` | Math notation support guide |
| `plans/CODE_HIGHLIGHTING.md` | Code highlighting user guide |
| `plans/MATH_RENDERING_FINAL.md` | Math rendering technical docs |
| `plans/PERSISTENT_CHAT_SESSIONS.md` | Session storage analysis |
| `plans/PERSISTENT_SESSIONS_IMPLEMENTATION.md` | Session implementation guide |
| `PUTER_INTEGRATION.md` | Puter API integration docs |
| `MULTI_AGENT_CHAT.md` | Multi-agent chat docs |

### Session Management

| File | Description |
|------|-------------|
| `lib/session-manager.js` | SQLite session storage class |
| `chat-sessions.db` | SQLite database (auto-created) |

## Setup and Installation

### Prerequisites

- **Node.js** - ES module support required
- **Ollama** - For local model access (optional)
- **OpenAI API Key** - For cloud model access (optional)

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file (optional):

```bash
# OpenAI API
OPENAI_API_KEY=your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# Search API (optional)
SEARCH_PROVIDER=duckduckgo
SEARCH_API_KEY=your-key-here

# MCP (optional)
ENABLE_MCP=true
MCP_CONFIG_PATH=./mcp-config.json
```

## Running the Application

### CLI Examples

```bash
# Basic Ollama chat
node interface.js

# Streaming chat
node streaming.js

# Interactive CLI chat
node chat-interface.js

# Hybrid chat (Ollama + OpenAI)
node hybrid-chat-interface.js

# Multi-agent mode
node multi-agent-chat.js --interactive
```

### Web Interface

```bash
# Start the web server
node web-interface.js

# Or using npm
npm start
```

Then open: **http://localhost:3075**

### Web Interface Features

#### Persistent Sessions
- **Auto-save** - Every message saved to SQLite
- **Session sidebar** - Browse and load previous conversations
- **Collapsible** - Toggle sidebar with ☰ button
- **Multi-session** - Create and switch between sessions
- **Statistics** - View session counts and activity
- **Persistence** - Survives browser refresh/close

#### Code Syntax Highlighting
- **22 languages** supported
- GitHub Dark theme
- Copy-to-clipboard button
- Language labels

**Supported languages:**
JavaScript, TypeScript, Python, Bash, Shell, JSON, CSS, XML, SQL, Java, C++, C, C#, Go, Rust, Ruby, PHP, YAML, Markdown, Plaintext, HTTP, Dockerfile

#### Math Rendering
- LaTeX notation: `\[...\]` (block), `\(...\)` (inline)
- Dollar notation: `$$...$$` (block), `$...$` (inline)
- KaTeX rendering engine
- All common LaTeX environments

#### Chat Commands
- `/provider ollama` - Switch to Ollama
- `/provider openai` - Switch to OpenAI
- `/select <model>` - Choose a model
- `/models` - List available models
- `/clear` - Clear chat history
- `/search <query>` - Web search

## Web Interface Architecture

### Technologies Used

| Library | Purpose | Version |
|---------|---------|---------|
| Marked.js | Markdown parsing | Latest |
| Highlight.js | Code syntax highlighting | 11.9.0 |
| KaTeX | Math rendering | 0.16.9 |
| Express.js | Web server | 5.x |
| WebSocket | Real-time communication | 8.x |

### Message Processing Flow

```
User sends message
       ↓
WebSocket to server
       ↓
LLM generates response (with optional MCP tool calls)
       ↓
Server streams response back
       ↓
Client processes markdown
       ↓
Highlight.js highlights code blocks
       ↓
KaTeX renders math expressions
       ↓
Beautiful formatted message displayed
```

### Code Block Enhancement

Code blocks are wrapped with:
- Language label (top-left)
- Copy button (top-right)
- Dark theme container
- Syntax highlighting via Highlight.js

### Math Protection Flow

Math delimiters are protected before markdown processing:
1. Wrap math in HTML elements (`<div>`, `<span>`)
2. Process markdown (HTML passes through unchanged)
3. Render math with KaTeX
4. Display beautifully formatted equations

## MCP Integration

MCP (Model Context Protocol) allows LLMs to use external tools.

### Configuration

Edit `mcp-config.json`:

```json
{
  "mcpServers": {
    "time-server": {
      "command": "node",
      "args": ["/path/to/time-server/build/index.js"],
      "type": "stdio"
    }
  }
}
```

### Supported Transports

- **Stdio** - Local servers (stdin/stdout)
- **SSE** - Remote servers (Server-Sent Events)
- **StreamableHTTP** - Remote servers (streaming HTTP)

### Tool Calling Flow

1. LLM decides to call a tool
2. Tool executes on MCP server
3. Result returned to LLM
4. LLM incorporates results into response

## Testing

### Quick Tests

1. **Code highlighting**: Open `http://localhost:3075/test-code-highlight.html`
2. **Math rendering**: Open `http://localhost:3075/test-math.html`
3. **Highlight.js standalone**: Open `http://localhost:3075/test-highlight-standalone.html`

### Live Chat Tests

Open `http://localhost:3075` and try:

```
Write a JavaScript function to calculate Fibonacci numbers
```

```
Explain the quadratic formula with equations
```

```
Show me a Python script to read a CSV file
```

## Browser Console Debugging

Open browser console (F12) to see:

```
Highlight.js loaded with 22 languages
Marked.js configured with Highlight.js
KaTeX loaded
✅ SessionManager initialized for persistent chat sessions
```

Check Highlight.js status:

```javascript
// List available languages
hljs.listLanguages()

// Test highlighting
hljs.highlight('function test() { return 42; }', { language: 'javascript' })
```

Check session manager:

```javascript
// View database file
// chat-sessions.db in project root

// List sessions via WebSocket
// Click "Stats" button in sidebar
```

## Troubleshooting

### Code not highlighted?

1. Open browser console (F12)
2. Check for "Highlight.js loaded" message
3. Verify language module is loaded
4. Check if language is in `hljs.listLanguages()`

### Math not rendering?

1. Check console for KaTeX errors
2. Verify delimiters are properly paired
3. Check Network tab for KaTeX CDN loading
4. Test with simple: `$E = mc^2$`

### Copy button not working?

1. Clipboard API requires HTTPS or localhost
2. Check browser console for errors
3. Verify browser supports Clipboard API

### Server won't start?

```bash
# Check if port is in use
lsof -i :3075

# Kill existing process
pkill -f "web-interface.js"

# Restart
node web-interface.js
```

### Sessions Not Saving?

1. Check console for "SessionManager initialized" message
2. Verify `chat-sessions.db` exists in project root
3. Check file permissions on project directory
4. Verify SQLite module: `npm list better-sqlite3`

### Sidebar Not Showing?

1. Click the ☰ button in the header to toggle sidebar
2. Check browser console for JavaScript errors
3. Hard refresh: Ctrl+Shift+R or Cmd+Shift+R

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^5.2.1 | Web server |
| ws | ^8.18.3 | WebSocket server |
| ollama | ^0.5.11 | Ollama API client |
| openai | ^4.0.0 | OpenAI API client |
| axios | ^1.13.2 | HTTP client |
| dotenv | ^17.2.3 | Environment variables |
| better-sqlite3 | Latest | SQLite session storage |

### CDN (Frontend)

| Library | Version | Purpose |
|---------|---------|---------|
| marked | latest | Markdown parsing |
| highlight.js | 11.9.0 | Syntax highlighting |
| katex | 0.16.9 | Math rendering |

## License

ISC

## Contributing

Feel free to submit issues and enhancement requests!
