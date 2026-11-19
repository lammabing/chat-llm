import { parseMessage, createRequest, generateId } from './json-rpc.js';

export class SSEConnection {
  constructor(serverName, config) {
    this.serverName = serverName;
    this.config = config;
    this.abortController = null;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.messageHandlers = new Map();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  async connect() {
    if (this.isConnected) {
      throw new Error(`Already connected to ${this.serverName}`);
    }

    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.config.url);
        url.searchParams.append('method', 'initialize');

        this.abortController = new AbortController();
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.abortController.abort();
            reject(new Error(`Connection timeout after ${this.config.timeout || 30000}ms`));
          }
        }, this.config.timeout || 30000);

        fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            ...this.config.headers
          },
          signal: this.abortController.signal
        }).then(async (response) => {
          if (!response.ok) {
            clearTimeout(timeout);
            reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          this.isConnected = true;
          this.reconnectAttempts = 0;
          clearTimeout(timeout);
          resolve();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';

            for (const part of parts) {
              const data = this.parseSSEEvent(part);
              if (data) {
                this.handleMessage(data);
              }
            }
          }
        }).catch((error) => {
          clearTimeout(timeout);
          if (error.name === 'AbortError') {
            return;
          }
          if (!this.isConnected) {
            reject(new Error(`Failed to connect to ${this.serverName} via SSE: ${error.message}`));
          } else {
            this.isConnected = false;
            this.rejectAllPendingRequests(new Error('SSE connection lost'));
            this.scheduleReconnect();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  parseSSEEvent(text) {
    let data = null;
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        data = line.slice(6);
      } else if (line.startsWith('data:')) {
        data = line.slice(5);
      }
    }
    return data;
  }

  async sendRequest(method, params = {}, timeout = this.config.timeout || 30000) {
    if (!this.isConnected) {
      throw new Error(`Not connected to ${this.serverName}`);
    }

    const requestId = generateId();
    const request = createRequest(method, params, requestId);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      this.sendHttpPost(request)
        .then(response => {
          if (response) {
            const { resolve, reject } = this.pendingRequests.get(requestId);
            this.pendingRequests.delete(requestId);

            if (response.error) {
              reject(new Error(`MCP Error: ${response.error.message} (code: ${response.error.code})`));
            } else {
              resolve(response.result);
            }
          }
        })
        .catch(error => {
          const { reject } = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  async sendHttpPost(request) {
    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  async sendNotification(method, params = {}) {
    if (!this.isConnected) {
      throw new Error(`Not connected to ${this.serverName}`);
    }

    const notification = { jsonrpc: '2.0', method, params };

    try {
      await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(notification)
      });
    } catch (error) {
      throw new Error(`Failed to send notification: ${error.message}`);
    }
  }

  handleMessage(data) {
    try {
      const message = parseMessage(data);

      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);

        if (message.error) {
          reject(new Error(`MCP Error: ${message.error.message} (code: ${message.error.code})`));
        } else {
          resolve(message.result);
        }
      }

      else if (message.method) {
        this.handleServerNotification(message);
      }
    } catch (error) {
      console.error(`[${this.serverName}] Error handling message:`, error);
    }
  }

  handleServerNotification(message) {
    const handlers = this.messageHandlers.get(message.method) || [];
    for (const handler of handlers) {
      try {
        handler(message.params);
      } catch (error) {
        console.error(`[${this.serverName}] Handler error for ${message.method}:`, error);
      }
    }
  }

  on(method, handler) {
    if (!this.messageHandlers.has(method)) {
      this.messageHandlers.set(method, []);
    }
    this.messageHandlers.get(method).push(handler);
  }

  scheduleReconnect() {
    const maxAttempts = this.config.retryAttempts || 3;

    if (this.reconnectAttempts >= maxAttempts) {
      console.error(`[${this.serverName}] Max reconnection attempts reached`);
      return;
    }

    const interval = this.config.reconnectInterval || 5000;
    this.reconnectAttempts++;

    console.log(`[${this.serverName}] Scheduling reconnection attempt ${this.reconnectAttempts} in ${interval}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error(`[${this.serverName}] Reconnection failed:`, error);
        this.scheduleReconnect();
      });
    }, interval);
  }

  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      await this.sendNotification('notifications/shutdown');
    } catch (error) {
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.isConnected = false;
    console.log(`[${this.serverName}] Disconnected`);
  }

  rejectAllPendingRequests(error) {
    this.pendingRequests.forEach(({ reject }) => {
      reject(error);
    });
    this.pendingRequests.clear();
  }

  isActive() {
    return this.isConnected;
  }
}

export function createSSEConnection(serverName, config) {
  return new SSEConnection(serverName, config);
}
