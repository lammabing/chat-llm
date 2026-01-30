/**
 * Tool Registry
 * 
 * This module manages tool discovery, caching, and metadata
 * for all connected MCP servers.
 */

/**
 * Tool registry for managing MCP tools
 */
export class ToolRegistry {
  constructor() {
    this.tools = new Map(); // toolName -> tool metadata
    this.serverTools = new Map(); // serverName -> Set of tool names
    this.lastRefresh = null;
  }

  /**
   * Register a tool from a server
   * @param {string} serverName - Name of the server
   * @param {object} tool - Tool metadata
   */
  registerTool(serverName, tool) {
    const toolKey = `${serverName}:${tool.name}`;
    
    this.tools.set(toolKey, {
      ...tool,
      serverName,
      registeredAt: new Date().toISOString()
    });

    // Track tools by server
    if (!this.serverTools.has(serverName)) {
      this.serverTools.set(serverName, new Set());
    }
    this.serverTools.get(serverName).add(tool.name);
    
    console.log(`[ToolRegistry] Registered tool: ${tool.name} from ${serverName}`);
  }

  /**
   * Register multiple tools from a server
   * @param {string} serverName - Name of the server
   * @param {Array<object>} tools - Array of tool metadata
   */
  registerTools(serverName, tools) {
    for (const tool of tools) {
      this.registerTool(serverName, tool);
    }
  }

  /**
   * Get a tool by name
   * @param {string} toolName - Name of the tool
   * @returns {object|null} Tool metadata or null
   */
  getTool(toolName) {
    // Search for tool across all servers
    for (const [key, tool] of this.tools.entries()) {
      if (tool.name === toolName) {
        return tool;
      }
    }
    return null;
  }

  /**
   * Get a tool by server and name
   * @param {string} serverName - Name of the server
   * @param {string} toolName - Name of the tool
   * @returns {object|null} Tool metadata or null
   */
  getToolByServer(serverName, toolName) {
    const toolKey = `${serverName}:${toolName}`;
    return this.tools.get(toolKey) || null;
  }

  /**
   * Get all tools
   * @returns {Array<object>} Array of all tool metadata
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools from a specific server
   * @param {string} serverName - Name of the server
   * @returns {Array<object>} Array of tool metadata
   */
  getToolsByServer(serverName) {
    const tools = [];
    
    for (const [key, tool] of this.tools.entries()) {
      if (tool.serverName === serverName) {
        tools.push(tool);
      }
    }
    
    return tools;
  }

  /**
   * Search tools by query
   * @param {string} query - Search query
   * @returns {Array<object>} Array of matching tools
   */
  searchTools(query) {
    const lowerQuery = query.toLowerCase();
    const results = [];
    
    for (const tool of this.tools.values()) {
      const matchName = tool.name.toLowerCase().includes(lowerQuery);
      const matchDesc = tool.description && tool.description.toLowerCase().includes(lowerQuery);
      
      if (matchName || matchDesc) {
        results.push(tool);
      }
    }
    
    return results;
  }

  /**
   * Remove a tool
   * @param {string} serverName - Name of the server
   * @param {string} toolName - Name of the tool
   */
  removeTool(serverName, toolName) {
    const toolKey = `${serverName}:${toolName}`;
    this.tools.delete(toolKey);
    
    // Remove from server tracking
    if (this.serverTools.has(serverName)) {
      this.serverTools.get(serverName).delete(toolName);
    }
    
    console.log(`[ToolRegistry] Removed tool: ${toolName} from ${serverName}`);
  }

  /**
   * Remove all tools from a server
   * @param {string} serverName - Name of the server
   */
  removeServerTools(serverName) {
    if (!this.serverTools.has(serverName)) {
      return;
    }

    const toolNames = this.serverTools.get(serverName);
    
    for (const toolName of toolNames) {
      const toolKey = `${serverName}:${toolName}`;
      this.tools.delete(toolKey);
    }
    
    this.serverTools.delete(serverName);
    console.log(`[ToolRegistry] Removed all tools from ${serverName}`);
  }

  /**
   * Clear all tools
   */
  clearAll() {
    this.tools.clear();
    this.serverTools.clear();
    this.lastRefresh = null;
    console.log('[ToolRegistry] Cleared all tools');
  }

  /**
   * Get tool count
   * @returns {number} Total number of tools
   */
  getToolCount() {
    return this.tools.size;
  }

  /**
   * Get tool count by server
   * @param {string} serverName - Name of the server
   * @returns {number} Number of tools from server
   */
  getToolCountByServer(serverName) {
    if (!this.serverTools.has(serverName)) {
      return 0;
    }
    return this.serverTools.get(serverName).size;
  }

  /**
   * Get servers with tools
   * @returns {Array<string>} Array of server names
   */
  getServersWithTools() {
    return Array.from(this.serverTools.keys());
  }

  /**
   * Check if a tool exists
   * @param {string} toolName - Name of the tool
   * @returns {boolean}
   */
  hasTool(toolName) {
    return this.getTool(toolName) !== null;
  }

  /**
   * Check if a server has a specific tool
   * @param {string} serverName - Name of the server
   * @param {string} toolName - Name of the tool
   * @returns {boolean}
   */
  serverHasTool(serverName, toolName) {
    if (!this.serverTools.has(serverName)) {
      return false;
    }
    return this.serverTools.get(serverName).has(toolName);
  }

  /**
   * Get tool statistics
   * @returns {object} Statistics object
   */
  getStatistics() {
    const stats = {
      totalTools: this.tools.size,
      totalServers: this.serverTools.size,
      toolsByServer: {},
      lastRefresh: this.lastRefresh
    };

    for (const [serverName, toolSet] of this.serverTools.entries()) {
      stats.toolsByServer[serverName] = toolSet.size;
    }

    return stats;
  }

  /**
   * Set last refresh timestamp
   */
  markRefreshed() {
    this.lastRefresh = new Date().toISOString();
  }

  /**
   * Get tools formatted for LLM consumption
   * @param {Array<string>} [allowedTools] - Optional list of allowed tool names
   * @param {Array<string>} [blockedTools] - Optional list of blocked tool names
   * @returns {Array<object>} Formatted tools
   */
  getToolsForLLM(allowedTools = null, blockedTools = null) {
    let tools = this.getAllTools();

    // Filter by allowed tools
    if (allowedTools && allowedTools.length > 0 && !allowedTools.includes('*')) {
      tools = tools.filter(tool => allowedTools.includes(tool.name));
    }

    // Filter by blocked tools
    if (blockedTools && blockedTools.length > 0) {
      tools = tools.filter(tool => !blockedTools.includes(tool.name));
    }

    // Format for LLM
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || {}
      }
    }));
  }

  /**
   * Get tools formatted for display
   * @returns {Array<object>} Formatted tools for display
   */
  getToolsForDisplay() {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description || 'No description',
      server: tool.serverName,
      registeredAt: tool.registeredAt
    }));
  }
}

/**
 * Create a new tool registry
 * @returns {ToolRegistry}
 */
export function createToolRegistry() {
  return new ToolRegistry();
}
