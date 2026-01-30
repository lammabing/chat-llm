/**
 * Stdio Connection Pool
 * 
 * This module manages a pool of stdio connections to MCP servers.
 * It handles connection lifecycle, pooling, and error recovery.
 */

import { createStdioConnection } from '../utils/stdio-handler.js';

/**
 * Connection pool for stdio-based MCP servers
 */
export class StdioConnectionPool {
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
    console.log(`[StdioPool] Registered server: ${serverName}`);
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
    const connection = createStdioConnection(serverName, config);
    
    try {
      await connection.connect();
      this.connections.set(serverName, connection);
      return connection;
    } catch (error) {
      console.error(`[StdioPool] Failed to connect to ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Release a connection back to the pool
   * @param {string} serverName - Name of the server
   */
  releaseConnection(serverName) {
    // For stdio, we keep connections alive in the pool
    // No action needed, just log
    console.log(`[StdioPool] Released connection to ${serverName}`);
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
    console.log(`[StdioPool] Disconnected from ${serverName}`);
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
          console.error(`[StdioPool] Error disconnecting ${serverName}:`, error);
        })
      );
    }
    
    await Promise.all(disconnectPromises);
    this.connections.clear();
    console.log('[StdioPool] All connections closed');
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
 * Create a new stdio connection pool
 * @returns {StdioConnectionPool}
 */
export function createStdioConnectionPool() {
  return new StdioConnectionPool();
}
