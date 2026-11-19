# Code Review Fixes - Change Log

## 🔴 Blocker Fixes

### 1. SSE Handler: Replaced browser-only EventSource with Node.js `fetch`
**File:** `lib/utils/sse-handler.js`
- Removed `new EventSource()` (browser-only API that would crash in Node.js)
- Replaced with `fetch()` + `ReadableStream.getReader()` SSE parsing
- Uses `AbortController` for timeout/cancellation instead of `EventSource.close()`
- Properly parses SSE `data:` lines from the stream

### 2. XSS Vulnerability: Added DOMPurify sanitization
**Files:** `public/index.html`, `public/script.js`
- Added DOMPurify CDN script to `index.html`
- Removed deprecated `sanitize: false` option from marked config
- Wrapped `marked.parse()` output in `DOMPurify.sanitize()` with explicit allowlist of HTML tags and attributes
- User messages can no longer inject arbitrary HTML/JavaScript

### 3. Exposed API Key: Removed from .env
**File:** `.env`
- Replaced real API key with placeholder `your-openai-api-key-here`

### 4. Session Race Condition: Replaced setTimeout with deferred message queue
**File:** `public/script.js`
- Removed hardcoded `setTimeout(100ms)` that raced with session creation
- Added `pendingSessionMessage` queue variable
- When `session_created` event arrives, any pending message is automatically sent

### 5. OpenAI Tool Definition Double-Wrapping
**File:** `lib/mcp/llm-integration.js`
- `formatToolsForOpenAI()` now detects tools already in OpenAI format (`{type:'function', function:{...}}`)
- Returns them as-is instead of double-wrapping, which would produce malformed definitions

## 🐛 Bug Fix: Handler Closure Reference Issue

### 5b. Shared mutable context object for handler dependencies
**Files:** `web-interface.js`, `handlers/*.js`
- **Root cause**: When splitting `web-interface.js`, module-level `let` variables (like `llmIntegration`, `openaiClient`) were passed **by value** to handler factory functions at creation time. When `initializeMCP()` later assigned `llmIntegration = createLLMIntegration(...)`, the handler never saw the update because it had captured `null` at creation. Same issue for `openaiClient` returned from `createProviderHandler()` — `handleProviderSwitch` reassigned the local variable but the returned property was stale.
- **Fix**: Introduced a shared mutable `ctx` object (`ctx.llmIntegration`, `ctx.openaiClient`, etc.) passed by reference to all handler factories. Handlers read from `ctx.properties` at call time, seeing the latest values. Provider handler exposes `getOpenAIClient()` and also updates `ctx.openaiClient` on switch.
- This was the cause of "no response" — when MCP was enabled, `llmIntegration` was always `null` in the handler, and the OpenAI client reference was stale.

## 🟡 Structural Improvements

### 6. Connection Pool Refactoring: Eliminated 400 lines of duplication
**Files:** `lib/mcp/base-connection-pool.js` (NEW), `lib/mcp/stdio-connection-pool.js`, `lib/mcp/sse-connection-pool.js`, `lib/mcp/streamable-http-connection-pool.js`
- Created `BaseConnectionPool` class with all shared logic
- Three pool files now extend from base with just constructor + export
- Eliminated ~400 lines of nearly identical code

### 7. Split web-interface.js (1564 lines) into handler modules
**New files:**
- `handlers/chat-handler.js` - Chat message processing + tool calling
- `handlers/session-handler.js` - Session CRUD operations
- `handlers/search-handler.js` - Search (DuckDuckGo/Tavily/SerpAPI)
- `handlers/mcp-handler.js` - MCP server/tool management
- `handlers/provider-handler.js` - Provider/model switching
- `web-interface.js` now imports all handlers (~200 lines)

### 8. Graceful Shutdown
**File:** `web-interface.js`
- Added `gracefulShutdown()` function handling SIGINT/SIGTERM
- Closes all WebSocket connections
- Shuts down MCP client manager
- Closes SQLite session database
- Closes HTTP server before exit

### 9. WebSocket Heartbeat
**File:** `web-interface.js`
- Added periodic ping/pong every 30 seconds
- Unresponsive clients are terminated after missing one heartbeat

### 10. Docker Sandbox: Consistent dockerode usage
**File:** `lib/mcp/code-sandbox/index.js`
- Replaced `spawn('docker', ['exec', ...])` calls with `container.exec()` from dockerode SDK
- Removed unused `spawn` import from child_process

## 💭 Minor Improvements

### 11. ESLint Configuration
**File:** `.eslintrc.json` (NEW)
- Basic ESLint config for Node.js + browser environments
- ES2022, module syntax, recommended rules

### 12. Prettier Configuration
**File:** `.prettierrc` (NEW)
- Consistent formatting rules

### 13. npm start script
**File:** `package.json`
- Added `"start": "node web-interface.js"` script

## Provider Additions

### NanoGPT Provider
**Files:** `providers.json`, `README.md`
- Added `nano-gpt` entry to `providers.json` (openai-compatible, resolves `NANO-GPT_API_KEY` / `NANO-GPT_BASE_URL` env vars)
- Verified API connectivity (`/models` endpoint returned HTTP 200)
- Documented the new env vars in README
- Note: variable name contains a hyphen, so it's only accessible as `process.env['NANO-GPT_API_KEY']` — the provider registry already uses bracket access, so no code change needed

### Fixed: "Session manager not available" error
**Cause:** `better-sqlite3` native module was compiled for a different Node.js version (NODE_MODULE_VERSION 115 vs 137 required by Node v24).
**Fix:** Ran `npm rebuild better-sqlite3`. SessionManager now initializes and creates sessions successfully.
