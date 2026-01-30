/**
 * SSE (Server-Sent Events) Transport Handler
 * 
 * This module handles SSE-based communication with remote MCP servers.
 * It manages HTTP connections and parses SSE event streams.
 */

import { parseMessage, createRequest, generateId } from './json-rpc.js';

/**
 * SSE connection class for managing a single MCP server connection
 */
export class SSEConnection {
  constructor(serverName, config) {
    this.serverName = serverName;
    this.config = config;
    this.eventSource = null;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.messageHandlers = new Map();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Connect to MCP server via SSE
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      throw new Error(`Already connected to ${this.serverName}`);
    }

    return new Promise((resolve, reject) => {
      try {
        // Create EventSource connection
        const url = new URL(this.config.url);
        
        // Add query parameters for initialization
        url.searchParams.append('method', 'initialize');
        
        this.eventSource = new EventSource(url.toString(), {
          withCredentials: true
        });

        // Handle connection open
        this.eventSource.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log(`[${this.serverName}] SSE connected successfully`);
          resolve();
        };

        // Handle incoming messages
        this.eventSource.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        // Handle errors
        this.eventSource.onerror = (error) => {
          console.error(`[${this.serverName}] SSE error:`, error);
          
          if (this.isConnected) {
            this.isConnected = false;
            this.rejectAllPendingRequests(new Error('SSE connection error'));
            
            // Attempt reconnection
            this.scheduleReconnect();
          } else {
            reject(new Error(`Failed to connect to ${this.serverName} via SSE`));
          }
        };

        // Set connection timeout
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.eventSource.close();
            reject(new Error(`Connection timeout after ${this.config.timeout || 30000}ms`));
          }
        }, this.config.timeout || 30000);

        // Clear timeout on successful connection
        this.eventSource.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log(`[${this.serverName}] SSE connected successfully`);
          resolve();
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a JSON-RPC request via HTTP POST
   * Note: SSE is typically one-way (server to client), so we use HTTP POST for requests
   * @param {string} method - The method name
   * @param {object} params - The parameters
   * @param {number} [timeout] - Request timeout in milliseconds
   * @returns {Promise<any>} The response result
   */
  async sendRequest(method, params = {}, timeout = this.config.timeout || 30000) {
    if (!this.isConnected) {
      throw new Error(`Not connected to ${this.serverName}`);
    }

    const requestId = generateId();
    const request = createRequest(method, params, requestId);

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // Store the promise resolver
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

      // Send request via HTTP POST
      this.sendHttpPost(request)
        .then(response => {
          // Response will be handled via SSE or direct HTTP response
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

  /**
   * Send HTTP POST request to MCP server
   * @param {object} request - JSON-RPC request object
   * @returns {Promise<object>} Response object
   */
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

  /**
   * Send a JSON-RPC notification (no response expected)
   * @param {string} method - The method name
   * @param {object} params - The parameters
   */
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

  /**
   * Handle incoming messages from SSE stream
   * @param {string} data - Raw message data
   */
  handleMessage(data) {
    try {
      const message = parseMessage(data);
      
      // Handle response to a request
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);
        
        if (message.error) {
          reject(new Error(`MCP Error: ${message.error.message} (code: ${message.error.code})`));
        } else {
          resolve(message.result);
        }
      }
      
      // Handle server-initiated notification
      else if (message.method) {
        this.handleServerNotification(message);
      }
    } catch (error) {
      console.error(`[${this.serverName}] Error handling message:`, error);
    }
  }

  /**
   * Handle server-initiated notifications
   * @param {object} message - The notification message
   */
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

  /**
   * Register a handler for server notifications
   * @param {string} method - The method name
   * @param {function} handler - The handler function
   */
  on(method, handler) {
    if (!this.messageHandlers.has(method)) {
      this.messageHandlers.set(method, []);
    }
    this.messageHandlers.get(method).push(handler);
  }

  /**
   * Schedule reconnection attempt
   */
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

  /**
   * Disconnect from MCP server
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Send shutdown notification
    try {
      await this.sendNotification('notifications/shutdown');
    } catch (error) {
      // Ignore errors during shutdown
    }

    // Close EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.isConnected = false;
    console.log(`[${this.serverName}] Disconnected`);
  }

  /**
   * Reject all pending requests
   * @param {Error} error - The error to reject with
   */
  rejectAllPendingRequests(error) {
    this.pendingRequests.forEach(({ reject }) => {
      reject(error);
    });
    this.pendingRequests.clear();
  }

  /**
   * Check if connection is active
   * @returns {boolean}
   */
  isActive() {
    return this.isConnected && this.eventSource && this.eventSource.readyState === EventSource.OPEN;
  }
}

/**
 * Create a new SSE connection
 * @param {string} serverName - Name of server
 * @param {object} config - Server configuration
 * @returns {SSEConnection}
 */
export function createSSEConnection(serverName, config) {
  return new SSEConnection(serverName, config);
}
