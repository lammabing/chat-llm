/**
 * MCP Client Manager
 * 
 * This is the main entry point for MCP integration.
 * It manages connections, tool discovery, and provides a unified API.
 */

import { createStdioConnectionPool } from '../mcp/stdio-connection-pool.js';
import { createSSEConnectionPool } from '../mcp/sse-connection-pool.js';
import { createStreamableHTTPConnectionPool } from '../mcp/streamable-http-connection-pool.js';
import { createToolRegistry } from '../mcp/tool-registry.js';
import { createToolExecutor } from '../mcp/tool-executor.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Main MCP client manager
 */
export class MCPClientManager {
  constructor(configPath = './mcp-config.json') {
    this.configPath = configPath;
    this.config = null;
    this.settings = null;
    
    // Connection pools for each transport type
    this.stdioPool = createStdioConnectionPool();
    this.ssePool = createSSEConnectionPool();
    this.streamableHTTPPool = createStreamableHTTPConnectionPool();
    
    // Tool management
    this.toolRegistry = createToolRegistry();
    this.toolExecutor = null;
    
    // State
    this.isInitialized = false;
  }

  /**
   * Initialize the MCP client manager
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[MCPClientManager] Already initialized');
      return;
    }

    try {
      // Load configuration
      await this.loadConfig();
      
      // Register servers in appropriate pools
      this.registerServers();
      
      // Initialize tool executor
      this.toolExecutor = createToolExecutor(
        this.stdioPool,
        this.ssePool,
        this.streamableHTTPPool,
        this.toolRegistry
      );
      
      // Auto-connect to enabled servers
      await this.autoConnectServers();
      
      // Discover tools from connected servers
      await this.discoverTools();
      
      this.isInitialized = true;
      console.log('[MCPClientManager] Initialized successfully');
    } catch (error) {
      console.error('[MCPClientManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load MCP configuration from file
   * @returns {Promise<void>}
   */
  async loadConfig() {
    try {
      const configContent = readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(configContent);
      this.settings = this.config.mcpSettings || {};
      
      console.log(`[MCPClientManager] Loaded config from ${this.configPath}`);
      console.log(`[MCPClientManager] Found ${Object.keys(this.config.mcpServers || {}).length} MCP servers`);
    } catch (error) {
      throw new Error(`Failed to load MCP config: ${error.message}`);
    }
  }

  /**
   * Register servers in appropriate connection pools
   */
  registerServers() {
    if (!this.config || !this.config.mcpServers) {
      return;
    }

    for (const [serverName, serverConfig] of Object.entries(this.config.mcpServers)) {
      // Skip disabled servers
      if (serverConfig.enabled === false) {
        console.log(`[MCPClientManager] Skipping disabled server: ${serverName}`);
        continue;
      }

      // Register in appropriate pool based on transport type
      switch (serverConfig.type) {
        case 'stdio':
          this.stdioPool.registerServer(serverName, serverConfig);
          break;
        case 'sse':
          this.ssePool.registerServer(serverName, serverConfig);
          break;
        case 'streamableHTTP':
          this.streamableHTTPPool.registerServer(serverName, serverConfig);
          break;
        default:
          console.warn(`[MCPClientManager] Unknown transport type for ${serverName}: ${serverConfig.type}`);
      }
    }
  }

  /**
   * Auto-connect to servers with autoConnect enabled
   * @returns {Promise<void>}
   */
  async autoConnectServers() {
    if (!this.config || !this.config.mcpServers) {
      return;
    }

    const connectPromises = [];

    for (const [serverName, serverConfig] of Object.entries(this.config.mcpServers)) {
      if (serverConfig.enabled === false) {
        continue;
      }

      if (serverConfig.autoConnect !== false) {
        connectPromises.push(
          this.connectToServer(serverName).catch(error => {
            console.error(`[MCPClientManager] Auto-connect failed for ${serverName}:`, error.message);
          })
        );
      }
    }

    await Promise.allSettled(connectPromises);
  }

  /**
   * Connect to a specific MCP server
   * @param {string} serverName - Name of the server
   * @returns {Promise<void>}
   */
  async connectToServer(serverName) {
    if (!this.isInitialized) {
      throw new Error('MCP client manager not initialized. Call initialize() first.');
    }

    // Get server config
    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      throw new Error(`Server ${serverName} not found in configuration`);
    }

    if (serverConfig.enabled === false) {
      throw new Error(`Server ${serverName} is disabled`);
    }

    // Connect using appropriate pool
    switch (serverConfig.type) {
      case 'stdio':
        await this.stdioPool.acquireConnection(serverName);
        break;
      case 'sse':
        await this.ssePool.acquireConnection(serverName);
        break;
      case 'streamableHTTP':
        await this.streamableHTTPPool.acquireConnection(serverName);
        break;
      default:
        throw new Error(`Unknown transport type: ${serverConfig.type}`);
    }

    console.log(`[MCPClientManager] Connected to ${serverName}`);
  }

  /**
   * Disconnect from a specific MCP server
   * @param {string} serverName - Name of the server
   * @returns {Promise<void>}
   */
  async disconnectFromServer(serverName) {
    if (!this.isInitialized) {
      return;
    }

    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      throw new Error(`Server ${serverName} not found in configuration`);
    }

    // Disconnect using appropriate pool
    switch (serverConfig.type) {
      case 'stdio':
        await this.stdioPool.disconnect(serverName);
        break;
      case 'sse':
        await this.ssePool.disconnect(serverName);
        break;
      case 'streamableHTTP':
        await this.streamableHTTPPool.disconnect(serverName);
        break;
      default:
        throw new Error(`Unknown transport type: ${serverConfig.type}`);
    }

    // Remove tools from registry
    this.toolRegistry.removeServerTools(serverName);
    console.log(`[MCPClientManager] Disconnected from ${serverName}`);
  }

  /**
   * Discover tools from all connected servers
   * @returns {Promise<void>}
   */
  async discoverTools() {
    if (!this.isInitialized) {
      throw new Error('MCP client manager not initialized. Call initialize() first.');
    }

    const connectedServers = this.getConnectedServers();
    
    for (const serverName of connectedServers) {
      try {
        await this.discoverToolsFromServer(serverName);
      } catch (error) {
        console.error(`[MCPClientManager] Failed to discover tools from ${serverName}:`, error);
      }
    }

    this.toolRegistry.markRefreshed();
    console.log(`[MCPClientManager] Tool discovery completed. Total tools: ${this.toolRegistry.getToolCount()}`);
  }

  /**
   * Discover tools from a specific server
   * @param {string} serverName - Name of the server
   * @returns {Promise<void>}
   */
  async discoverToolsFromServer(serverName) {
    const connection = this.getConnection(serverName);
    if (!connection) {
      throw new Error(`No active connection to ${serverName}`);
    }

    // List tools using MCP protocol
    const result = await connection.sendRequest('tools/list');
    
    if (result && result.tools) {
      this.toolRegistry.registerTools(serverName, result.tools);
    }
  }

  /**
   * List all available tools
   * @param {string} [serverName] - Optional server name filter
   * @returns {Array<object>} Array of tool metadata
   */
  listTools(serverName = null) {
    if (serverName) {
      return this.toolRegistry.getToolsByServer(serverName);
    }
    return this.toolRegistry.getAllTools();
  }

  /**
   * Search for tools
   * @param {string} query - Search query
   * @returns {Array<object>} Array of matching tools
   */
  searchTools(query) {
    return this.toolRegistry.searchTools(query);
  }

  /**
   * Execute a tool
   * @param {string} serverName - Name of the server
   * @param {string} toolName - Name of the tool
   * @param {object} arguments - Tool arguments
   * @param {object} [options] - Execution options
   * @returns {Promise<any>} Tool execution result
   */
  async executeTool(serverName, toolName, toolArgs = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('MCP client manager not initialized. Call initialize() first.');
    }

    if (!this.toolExecutor) {
      throw new Error('Tool executor not initialized');
    }

    return await this.toolExecutor.executeTool(serverName, toolName, toolArgs, options);
  }

  /**
   * Get connection for a server
   * @param {string} serverName - Name of the server
   * @returns {object|null} Connection object or null
   */
  getConnection(serverName) {
    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      return null;
    }

    switch (serverConfig.type) {
      case 'stdio':
        return this.stdioPool.getConnection(serverName);
      case 'sse':
        return this.ssePool.getConnection(serverName);
      case 'streamableHTTP':
        return this.streamableHTTPPool.getConnection(serverName);
      default:
        return null;
    }
  }

  /**
   * Get connection status for a server
   * @param {string} serverName - Name of the server
   * @returns {object} Status object
   */
  getConnectionStatus(serverName) {
    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      return {
        serverName,
        connected: false,
        status: 'not_found'
      };
    }

    switch (serverConfig.type) {
      case 'stdio':
        return this.stdioPool.getConnectionStatus(serverName);
      case 'sse':
        return this.ssePool.getConnectionStatus(serverName);
      case 'streamableHTTP':
        return this.streamableHTTPPool.getConnectionStatus(serverName);
      default:
        return {
          serverName,
          connected: false,
          status: 'unknown_transport'
        };
    }
  }

  /**
   * Get all connection statuses
   * @returns {Array<object>} Array of status objects
   */
  getAllConnectionStatuses() {
    const statuses = [];
    
    if (!this.config || !this.config.mcpServers) {
      return statuses;
    }

    for (const serverName of Object.keys(this.config.mcpServers)) {
      statuses.push(this.getConnectionStatus(serverName));
    }

    return statuses;
  }

  /**
   * Get all configured servers
   * @returns {Array<string>} Array of server names
   */
  getConfiguredServers() {
    if (!this.config || !this.config.mcpServers) {
      return [];
    }
    return Object.keys(this.config.mcpServers);
  }

  /**
   * Get connected servers
   * @returns {Array<string>} Array of connected server names
   */
  getConnectedServers() {
    const servers = [];
    
    if (this.config && this.config.mcpServers) {
      for (const [serverName, serverConfig] of Object.entries(this.config.mcpServers)) {
        if (serverConfig.enabled === false) {
          continue;
        }

        const status = this.getConnectionStatus(serverName);
        if (status.connected) {
          servers.push(serverName);
        }
      }
    }

    return servers;
  }

  /**
   * Get tools formatted for LLM consumption
   * @param {Array<string>} [allowedTools] - Optional list of allowed tool names
   * @param {Array<string>} [blockedTools] - Optional list of blocked tool names
   * @returns {Array<object>} Formatted tools
   */
  getToolsForLLM(allowedTools = null, blockedTools = null) {
    // Apply global settings
    const globalAllowed = this.settings.allowedTools;
    const globalBlocked = this.settings.blockedTools || [];

    if (allowedTools === null && globalAllowed) {
      allowedTools = globalAllowed;
    }

    if (blockedTools === null && globalBlocked.length > 0) {
      blockedTools = globalBlocked;
    }

    return this.toolRegistry.getToolsForLLM(allowedTools, blockedTools);
  }

  /**
   * Get tool execution statistics
   * @returns {object} Statistics object
   */
  getToolStatistics() {
    if (!this.toolExecutor) {
      return null;
    }
    return this.toolExecutor.getStatistics();
  }

  /**
   * Get tool registry statistics
   * @returns {object} Statistics object
   */
  getRegistryStatistics() {
    return this.toolRegistry.getStatistics();
  }

  /**
   * Reload configuration
   * @returns {Promise<void>}
   */
  async reloadConfig() {
    console.log('[MCPClientManager] Reloading configuration...');
    
    // Disconnect from all servers
    await this.shutdown();
    
    // Clear tool registry
    this.toolRegistry.clearAll();
    
    // Reload configuration
    await this.loadConfig();
    
    // Re-register servers
    this.registerServers();
    
    // Re-initialize
    await this.autoConnectServers();
    await this.discoverTools();
    
    this.isInitialized = true;
    console.log('[MCPClientManager] Configuration reloaded');
  }

  /**
   * Shutdown the MCP client manager
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    console.log('[MCPClientManager] Shutting down...');
    
    // Close all connections
    await this.stdioPool.closeAllConnections();
    await this.ssePool.closeAllConnections();
    await this.streamableHTTPPool.closeAllConnections();
    
    // Clear tool registry
    this.toolRegistry.clearAll();
    
    this.isInitialized = false;
    console.log('[MCPClientManager] Shutdown complete');
  }

  /**
   * Check if initialized
   * @returns {boolean}
   */
  isActive() {
    return this.isInitialized;
  }

  /**
   * Get settings
   * @returns {object} MCP settings
   */
  getSettings() {
    return this.settings || {};
  }

  /**
   * Check if tool calling is enabled
   * @returns {boolean}
   */
  isToolCallingEnabled() {
    return this.settings.enableToolCalling !== false;
  }

  /**
   * Check if tool call logging is enabled
   * @returns {boolean}
   */
  isToolCallLoggingEnabled() {
    return this.settings.logToolCalls !== false;
  }
}

/**
 * Create a new MCP client manager
 * @param {string} [configPath] - Path to MCP config file
 * @returns {MCPClientManager}
 */
export function createMCPClientManager(configPath = './mcp-config.json') {
  return new MCPClientManager(configPath);
}
