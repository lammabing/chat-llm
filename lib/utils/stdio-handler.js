/**
 * Stdio Transport Handler
 * 
 * This module handles stdio-based communication with MCP servers.
 * It spawns child processes and manages their lifecycle.
 */

import { spawn } from 'child_process';
import { parseMessage, createRequest, generateId } from './json-rpc.js';

/**
 * Stdio connection class for managing a single MCP server connection
 */
export class StdioConnection {
  constructor(serverName, config) {
    this.serverName = serverName;
    this.config = config;
    this.process = null;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.messageHandlers = new Map();
    this.requestIdCounter = 0;
  }

  /**
   * Connect to the MCP server by spawning a child process
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      throw new Error(`Already connected to ${this.serverName}`);
    }

    return new Promise((resolve, reject) => {
      try {
        // Spawn the child process
        this.process = spawn(
          this.config.command,
          this.config.args || [],
          {
            env: { ...process.env, ...this.config.env },
            cwd: this.config.cwd || process.cwd(),
            stdio: ['pipe', 'pipe', 'pipe']
          }
        );

        // Handle stdout (responses from server)
        this.process.stdout.on('data', (data) => {
          this.handleMessage(data.toString());
        });

        // Handle stderr (error output)
        this.process.stderr.on('data', (data) => {
          console.error(`[${this.serverName} stderr]:`, data.toString());
        });

        // Handle process exit
        this.process.on('close', (code, signal) => {
          this.isConnected = false;
          console.log(`[${this.serverName}] Process closed with code ${code}, signal ${signal}`);
          
          // Reject all pending requests
          this.pendingRequests.forEach((reject) => {
            reject(new Error(`Connection closed: ${signal || code}`));
          });
          this.pendingRequests.clear();
        });

        // Handle process errors
        this.process.on('error', (error) => {
          this.isConnected = false;
          console.error(`[${this.serverName}] Process error:`, error);
          reject(error);
        });

        // Wait a bit for the process to start
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.isConnected = true;
            console.log(`[${this.serverName}] Connected successfully`);
            resolve();
          } else {
            reject(new Error(`Failed to start process for ${this.serverName}`));
          }
        }, 500);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a JSON-RPC request and wait for response
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

      // Send the request
      try {
        this.process.stdin.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected)
   * @param {string} method - The method name
   * @param {object} params - The parameters
   */
  sendNotification(method, params = {}) {
    if (!this.isConnected) {
      throw new Error(`Not connected to ${this.serverName}`);
    }

    const notification = { jsonrpc: '2.0', method, params };
    this.process.stdin.write(JSON.stringify(notification) + '\n');
  }

  /**
   * Handle incoming messages from the MCP server
   * @param {string} data - Raw message data
   */
  handleMessage(data) {
    try {
      // Split by newlines (MCP servers send one JSON-RPC message per line)
      const lines = data.trim().split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
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
        
        // Handle notification or server-initiated message
        else if (message.method) {
          this.handleServerNotification(message);
        }
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
    // Call registered handlers for this method
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
   * Disconnect from the MCP server
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected) {
      return;
    }

    // Send shutdown notification if connected
    try {
      this.sendNotification('notifications/shutdown');
    } catch (error) {
      // Ignore errors during shutdown
    }

    // Kill the process
    if (this.process) {
      this.process.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if it doesn't exit gracefully
          this.process.kill('SIGKILL');
          resolve();
        }, 5000);
        
        this.process.once('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    this.isConnected = false;
    this.process = null;
    console.log(`[${this.serverName}] Disconnected`);
  }

  /**
   * Check if the connection is active
   * @returns {boolean}
   */
  isActive() {
    return this.isConnected && this.process && !this.process.killed;
  }
}

/**
 * Create a new stdio connection
 * @param {string} serverName - Name of the server
 * @param {object} config - Server configuration
 * @returns {StdioConnection}
 */
export function createStdioConnection(serverName, config) {
  return new StdioConnection(serverName, config);
}
