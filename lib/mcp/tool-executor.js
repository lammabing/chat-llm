/**
 * Tool Executor
 * 
 * This module handles tool execution on MCP servers.
 * It manages timeout, retry logic, and result formatting.
 */

/**
 * Tool executor for running MCP tools
 */
export class ToolExecutor {
  constructor(stdioPool, ssePool, streamableHTTPPool, toolRegistry) {
    this.stdioPool = stdioPool;
    this.ssePool = ssePool;
    this.streamableHTTPPool = streamableHTTPPool;
    this.toolRegistry = toolRegistry;
    this.executionHistory = [];
  }

  /**
   * Execute a tool on a specific server
   * @param {string} serverName - Name of the MCP server
   * @param {string} toolName - Name of the tool to execute
   * @param {object} args - Tool arguments
   * @param {object} [options] - Execution options
   * @returns {Promise<object>} Execution result
   */
  async executeTool(serverName, toolName, args = {}, options = {}) {
    const {
      timeout = 30000,
      maxRetries = 3,
      logExecution = true
    } = options;

    // Get tool metadata
    const tool = this.toolRegistry.getToolByServer(serverName, toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${serverName}`);
    }

    // Get connection pool based on server type
    const connectionPool = this.getConnectionPool(serverName);
    if (!connectionPool) {
      throw new Error(`No connection pool available for server ${serverName}`);
    }

    // Acquire connection
    const connection = await connectionPool.acquireConnection(serverName);

    // Execute with retry logic
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeWithConnection(
          connection,
          toolName,
          args,
          timeout
        );

        // Log successful execution
        if (logExecution) {
          this.logExecution(serverName, toolName, args, result, null);
        }

        return result;
      } catch (error) {
        lastError = error;
        console.error(`[ToolExecutor] Attempt ${attempt} failed for ${toolName}:`, error.message);

        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          break;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          await this.delay(1000 * attempt);
        }
      }
    }

    // Log failed execution
    if (logExecution) {
      this.logExecution(serverName, toolName, args, null, lastError);
    }

    throw new Error(`Tool execution failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Execute a tool with retry logic
   * @param {string} serverName - Name of the MCP server
   * @param {string} toolName - Name of the tool to execute
   * @param {object} toolArguments - Tool arguments
   * @param {object} [options] - Execution options
   * @returns {Promise<object>} Execution result
   */
  async executeToolWithRetry(serverName, toolName, toolArguments = {}, options = {}) {
    const {
      maxRetries = 3,
      backoffMultiplier = 2,
      initialDelay = 1000
    } = options;

    let lastError = null;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeTool(serverName, toolName, toolArguments, {
          ...options,
          logExecution: attempt === 1 // Only log first attempt
        });
        return result;
      } catch (error) {
        lastError = error;

        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          break;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          console.log(`[ToolExecutor] Retrying ${toolName} in ${delay}ms (attempt ${attempt}/${maxRetries})`);
          await this.delay(delay);
          delay *= backoffMultiplier;
        }
      }
    }

    throw lastError || new Error(`Tool execution failed after ${maxRetries} attempts`);
  }

  /**
   * Execute a tool using a specific connection
   * @param {object} connection - Connection object
   * @param {string} toolName - Name of the tool
   * @param {object} toolArguments - Tool arguments
   * @param {number} timeout - Request timeout
   * @returns {Promise<any>} Tool result
   */
  async executeWithConnection(connection, toolName, toolArguments, timeout) {
    return await connection.sendRequest('tools/call', {
      name: toolName,
      arguments: toolArguments
    }, timeout);
  }

  /**
   * Execute multiple tools in parallel
   * @param {Array<object>} toolCalls - Array of tool call objects
   * @param {object} [options] - Execution options
   * @returns {Promise<Array<object>>} Array of execution results
   */
  async executeToolsParallel(toolCalls, options = {}) {
    const {
      timeout = 30000,
      logExecution = true
    } = options;

    const promises = toolCalls.map(({ serverName, toolName, arguments: toolArgs }) =>
      this.executeTool(serverName, toolName, toolArgs, { timeout, logExecution })
    );

    try {
      const results = await Promise.all(promises);
      return results;
    } catch (error) {
      // Some tools failed, return partial results
      console.error('[ToolExecutor] Parallel execution error:', error);
      throw error;
    }
  }

  /**
   * Execute multiple tools in sequence
   * @param {Array<object>} toolCalls - Array of tool call objects
   * @param {object} [options] - Execution options
   * @returns {Promise<Array<object>>} Array of execution results
   */
  async executeToolsSequential(toolCalls, options = {}) {
    const {
      timeout = 30000,
      logExecution = true
    } = options;

    const results = [];

    for (const { serverName, toolName, arguments: toolArgs } of toolCalls) {
      try {
        const result = await this.executeTool(serverName, toolName, toolArgs, { timeout, logExecution });
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
        console.error(`[ToolExecutor] Sequential execution failed for ${toolName}:`, error);
      }
    }

    return results;
  }

  /**
   * Format tool result for LLM consumption
   * @param {string} toolName - Name of the tool
   * @param {any} result - Tool execution result
   * @returns {object} Formatted result
   */
  formatToolResult(toolName, result) {
    return {
      tool: toolName,
      result: result,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format tool error for LLM consumption
   * @param {string} toolName - Name of the tool
   * @param {Error} error - Tool execution error
   * @returns {object} Formatted error
   */
  formatToolError(toolName, error) {
    return {
      tool: toolName,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get the appropriate connection pool for a server
   * @param {string} serverName - Name of the server
   * @returns {object|null} Connection pool or null
   */
  getConnectionPool(serverName) {
    // Try stdio pool first
    if (this.stdioPool && this.stdioPool.isRegistered(serverName)) {
      return this.stdioPool;
    }

    // Try SSE pool
    if (this.ssePool && this.ssePool.isRegistered(serverName)) {
      return this.ssePool;
    }

    // Try StreamableHTTP pool
    if (this.streamableHTTPPool && this.streamableHTTPPool.isRegistered(serverName)) {
      return this.streamableHTTPPool;
    }

    return null;
  }

  /**
   * Check if an error should not be retried
   * @param {Error} error - The error to check
   * @returns {boolean}
   */
  shouldNotRetry(error) {
    const noRetryMessages = [
      'Tool not found',
      'Invalid params',
      'Authentication failed',
      'Permission denied'
    ];

    return noRetryMessages.some(msg => 
      error.message && error.message.includes(msg)
    );
  }

  /**
   * Delay for a specified time
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log tool execution
   * @param {string} serverName - Name of the server
   * @param {string} toolName - Name of the tool
   * @param {object} toolArguments - Tool arguments
   * @param {any} result - Tool result
   * @param {Error} error - Tool error
   */
  logExecution(serverName, toolName, toolArguments, result, error) {
    const entry = {
      serverName,
      toolName,
      toolArguments,
      result,
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    };

    this.executionHistory.push(entry);

    // Keep only last 1000 executions
    if (this.executionHistory.length > 1000) {
      this.executionHistory.shift();
    }

    if (error) {
      console.error(`[ToolExecutor] Execution failed: ${serverName}:${toolName}`, error);
    } else {
      console.log(`[ToolExecutor] Execution succeeded: ${serverName}:${toolName}`);
    }
  }

  /**
   * Get execution history
   * @param {number} [limit] - Maximum number of entries to return
   * @returns {Array<object>} Execution history
   */
  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get execution statistics
   * @returns {object} Statistics object
   */
  getStatistics() {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => !e.error).length;
    const failed = total - successful;

    // Count by tool
    const toolCounts = {};
    for (const entry of this.executionHistory) {
      const key = `${entry.serverName}:${entry.toolName}`;
      toolCounts[key] = (toolCounts[key] || 0) + 1;
    }

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) : 0,
      toolCounts
    };
  }

  /**
   * Clear execution history
   */
  clearHistory() {
    this.executionHistory = [];
    console.log('[ToolExecutor] Execution history cleared');
  }
}

/**
 * Create a new tool executor
 * @param {object} stdioPool - Stdio connection pool
 * @param {object} ssePool - SSE connection pool
 * @param {object} streamableHTTPPool - StreamableHTTP connection pool
 * @param {object} toolRegistry - Tool registry
 * @returns {ToolExecutor}
 */
export function createToolExecutor(stdioPool, ssePool, streamableHTTPPool, toolRegistry) {
  return new ToolExecutor(stdioPool, ssePool, streamableHTTPPool, toolRegistry);
}
