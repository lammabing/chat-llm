/**
 * StreamableHTTP Transport Handler
 * 
 * This module handles HTTP-based communication with MCP servers
 * using streaming responses (chunked transfer encoding).
 */

import { parseMessage, createRequest, generateId } from './json-rpc.js';

/**
 * StreamableHTTP connection class for managing a single MCP server connection
 */
export class StreamableHTTPConnection {
  constructor(serverName, config) {
    this.serverName = serverName;
    this.config = config;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.messageHandlers = new Map();
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Connect to MCP server via HTTP
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      throw new Error(`Already connected to ${this.serverName}`);
    }

    try {
      // Send initialize request to establish connection
      const initRequest = createRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'ollama-js',
          version: '1.0.0'
        }
      });

      const response = await this.sendHttpRequest(initRequest);
      
      if (response.error) {
        throw new Error(`Initialization failed: ${response.error.message}`);
      }

      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log(`[${this.serverName}] HTTP connected successfully`);
    } catch (error) {
      console.error(`[${this.serverName}] Connection failed:`, error);
      throw error;
    }
  }

  /**
   * Send a JSON-RPC request via HTTP POST
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

      // Store promise resolver
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
      this.sendHttpRequest(request, timeout)
        .then(response => {
          const { resolve, reject } = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          
          if (response.error) {
            reject(new Error(`MCP Error: ${response.error.message} (code: ${response.error.code})`));
          } else {
            resolve(response.result);
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
   * @param {number} [timeout] - Request timeout in milliseconds
   * @returns {Promise<object>} Response object
   */
  async sendHttpRequest(request, timeout = this.config.timeout || 30000) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check if response is streaming
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream') || contentType.includes('application/stream+json')) {
        // Handle streaming response
        return await this.handleStreamingResponse(response);
      } else {
        // Handle regular JSON response
        const data = await response.json();
        return data;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  /**
   * Handle streaming HTTP response
   * @param {Response} response - Fetch response object
   * @returns {Promise<object>} Parsed response
   */
  async handleStreamingResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete JSON objects
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const message = parseMessage(line);
          
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
          
          // Store result if this is the main response
          else if (message.result !== undefined) {
            result = message.result;
          }
        } catch (error) {
          console.error(`[${this.serverName}] Error parsing streaming message:`, error);
        }
      }
    }

    return result || {};
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
   * Send a streaming request with chunk callback
   * @param {string} method - The method name
   * @param {object} params - The parameters
   * @param {function} onChunk - Callback for each chunk
   * @param {number} [timeout] - Request timeout in milliseconds
   * @returns {Promise<any>} Final result
   */
  async sendStreamingRequest(method, params = {}, onChunk = null, timeout = this.config.timeout || 30000) {
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

      // Store promise resolver
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

      // Send streaming request
      this.sendHttpRequestWithStreaming(request, onChunk, timeout)
        .then(response => {
          const { resolve, reject } = this.pendingRequests.get(requestId);
          this.pendingRequests.delete(requestId);
          
          if (response.error) {
            reject(new Error(`MCP Error: ${response.error.message} (code: ${response.error.code})`));
          } else {
            resolve(response.result);
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
   * Send HTTP request with streaming response handling
   * @param {object} request - JSON-RPC request object
   * @param {function} onChunk - Callback for each chunk
   * @param {number} [timeout] - Request timeout in milliseconds
   * @returns {Promise<object>} Response object
   */
  async sendHttpRequestWithStreaming(request, onChunk = null, timeout = this.config.timeout || 30000) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/stream+json',
          ...this.config.headers
        },
        body: JSON.stringify(request),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = null;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete JSON objects
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const message = parseMessage(line);
            
            // Call chunk callback if provided
            if (onChunk) {
              onChunk(message);
            }
            
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
            
            // Store result if this is the main response
            else if (message.result !== undefined) {
              result = message.result;
            }
          } catch (error) {
            console.error(`[${this.serverName}] Error parsing streaming message:`, error);
          }
        }
      }

      return result || {};
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw new Error(`HTTP request failed: ${error.message}`);
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
    return this.isConnected;
  }
}

/**
 * Create a new StreamableHTTP connection
 * @param {string} serverName - Name of server
 * @param {object} config - Server configuration
 * @returns {StreamableHTTPConnection}
 */
export function createStreamableHTTPConnection(serverName, config) {
  return new StreamableHTTPConnection(serverName, config);
}
