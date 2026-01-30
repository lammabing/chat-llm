/**
 * SSE Connection Pool
 * 
 * This module manages a pool of SSE connections to MCP servers.
 * It handles connection lifecycle, pooling, and error recovery.
 */

import { createSSEConnection } from '../utils/sse-handler.js';

/**
 * Connection pool for SSE-based MCP servers
 */
export class SSEConnectionPool {
  constructor() {
    this.connections = new Map();
    this.connectionConfigs = new Map();
  }

  /**
   * Register a server configuration
   * @param {string} serverName - Name of the server
   * @param {object} config - Server configuration
   */
  registerServer(serverName, config) {
    this.connectionConfigs.set(serverName, config);
    console.log(`[SSEPool] Registered server: ${serverName}`);
  }

  /**
   * Acquire a connection to a server
   * @param {string} serverName - Name of the server
   * @returns {Promise<object>} Connection object
   */
  async acquireConnection(serverName) {
    // Check if connection already exists and is active
    if (this.connections.has(serverName)) {
      const connection = this.connections.get(serverName);
      if (connection.isActive()) {
        return connection;
      } else {
        // Remove inactive connection
        this.connections.delete(serverName);
      }
    }

    // Check if server is registered
    if (!this.connectionConfigs.has(serverName)) {
      throw new Error(`Server ${serverName} is not registered`);
    }

    // Create new connection
    const config = this.connectionConfigs.get(serverName);
    const connection = createSSEConnection(serverName, config);
    
    try {
      await connection.connect();
      this.connections.set(serverName, connection);
      return connection;
    } catch (error) {
      console.error(`[SSEPool] Failed to connect to ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   * @param {string} serverName - Name of the server
   */
  releaseConnection(serverName) {
    // For SSE, we keep connections alive in the pool
    // No action needed, just log
    console.log(`[SSEPool] Released connection to ${serverName}`);
  }

  /**
   * Get connection status
   * @param {string} serverName - Name of the server
   * @returns {object} Status object
   */
  getConnectionStatus(serverName) {
    if (!this.connections.has(serverName)) {
      return {
        serverName,
        connected: false,
        status: 'not_connected'
      };
    }

    const connection = this.connections.get(serverName);
    return {
      serverName,
      connected: connection.isActive(),
      status: connection.isActive() ? 'active' : 'inactive'
    };
  }

  /**
   * Get all connection statuses
   * @returns {Array<object>} Array of status objects
   */
  getAllStatuses() {
    const statuses = [];
    
    // Include registered servers
    for (const serverName of this.connectionConfigs.keys()) {
      statuses.push(this.getConnectionStatus(serverName));
    }
    
    return statuses;
  }

  /**
   * Disconnect from a specific server
   * @param {string} serverName - Name of the server
   * @returns {Promise<void>}
   */
  async disconnect(serverName) {
    if (!this.connections.has(serverName)) {
      return;
    }

    const connection = this.connections.get(serverName);
    await connection.disconnect();
    this.connections.delete(serverName);
    console.log(`[SSEPool] Disconnected from ${serverName}`);
  }

  /**
   * Close all connections
   * @returns {Promise<void>}
   */
  async closeAllConnections() {
    const disconnectPromises = [];
    
    for (const [serverName, connection] of this.connections.entries()) {
      disconnectPromises.push(
        connection.disconnect().catch(error => {
          console.error(`[SSEPool] Error disconnecting ${serverName}:`, error);
        })
      );
    }
    
    await Promise.all(disconnectPromises);
    this.connections.clear();
    console.log('[SSEPool] All connections closed');
  }

  /**
   * Get a connection without acquiring (for internal use)
   * @param {string} serverName - Name of the server
   * @returns {object|null} Connection object or null
   */
  getConnection(serverName) {
    return this.connections.get(serverName) || null;
  }

  /**
   * Check if a server is registered
   * @param {string} serverName - Name of the server
   * @returns {boolean}
   */
  isRegistered(serverName) {
    return this.connectionConfigs.has(serverName);
  }

  /**
   * Get all registered server names
   * @returns {Array<string>} Array of server names
   */
  getRegisteredServers() {
    return Array.from(this.connectionConfigs.keys());
  }

  /**
   * Get all connected server names
   * @returns {Array<string>} Array of connected server names
   */
  getConnectedServers() {
    const connected = [];
    
    for (const [serverName, connection] of this.connections.entries()) {
      if (connection.isActive()) {
        connected.push(serverName);
      }
    }
    
    return connected;
  }
}

/**
 * Create a new SSE connection pool
 * @returns {SSEConnectionPool}
 */
export function createSSEConnectionPool() {
  return new SSEConnectionPool();
}
