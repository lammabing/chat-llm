/**
 * LLM Integration
 * 
 * This module integrates MCP tool calling with LLM chat flows.
 * It handles tool call detection, execution, and result formatting.
 */

/**
 * LLM integration for tool calling
 */
export class LLMIntegration {
  constructor(mcpClientManager) {
    this.mcpClientManager = mcpClientManager;
    this.toolCallHistory = [];
  }

  /**
   * Process a message with tool support
   * @param {Array<object>} messages - Chat messages
   * @param {boolean} [enableTools] - Whether to enable tool calling
   * @param {object} [options] - Processing options
   * @returns {Promise<object>} Processing result
   */
  async processMessageWithTools(messages, enableTools = true, options = {}) {
    const {
      maxToolCalls = 10,
      allowedTools = null,
      blockedTools = null,
      onToolCall = null,
      onToolResult = null
    } = options;

    if (!enableTools) {
      return {
        messages,
        toolCalls: [],
        needsToolExecution: false
      };
    }

    // Get available tools
    const availableTools = this.mcpClientManager.getToolsForLLM(allowedTools, blockedTools);

    // Check if last message contains tool calls
    const lastMessage = messages[messages.length - 1];
    const toolCalls = this.detectToolCalls(lastMessage);

    if (toolCalls.length === 0) {
      return {
        messages,
        toolCalls: [],
        needsToolExecution: false
      };
    }

    // Execute tools
    const toolResults = [];
    for (const toolCall of toolCalls) {
      try {
        const result = await this.executeToolCall(toolCall, availableTools);
        toolResults.push({
          toolCall,
          result,
          success: true
        });

        if (onToolCall) {
          onToolCall(toolCall);
        }

        if (onToolResult) {
          onToolResult(toolCall, result);
        }
      } catch (error) {
        toolResults.push({
          toolCall,
          error: error.message,
          success: false
        });

        console.error(`[LLMIntegration] Tool execution failed:`, error);
      }
    }

    // Format tool results for LLM
    const toolResultMessages = this.formatToolResults(toolResults);

    // Add tool results to message history
    const updatedMessages = [
      ...messages,
      ...toolResultMessages
    ];

    // Track tool calls
    this.trackToolCalls(toolCalls, toolResults);

    return {
      messages: updatedMessages,
      toolCalls,
      toolResults,
      needsToolExecution: true
    };
  }

  /**
   * Detect tool calls in an LLM response
   * @param {object} message - LLM message
   * @returns {Array<object>} Array of tool calls
   */
  detectToolCalls(message) {
    const toolCalls = [];

    // OpenAI function calling format
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        toolCalls.push({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments
          }
        });
      }
    }

    // Anthropic tool use format
    if (message.content && Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === 'tool_use') {
          toolCalls.push({
            id: content.id,
            type: 'tool',
            tool: {
              name: content.name,
              input: content.input
            }
          });
        }
      }
    }

    // Generic tool call format (text-based)
    if (message.content && typeof message.content === 'string') {
      const text = message.content;
      const toolCallPattern = /<tool_call>\s*name:\s*"([^"]+)"\s*arguments:\s*({[^}]+})\s*<\/tool_call>/g;
      const matches = text.matchAll(toolCallPattern);

      for (const match of matches) {
        try {
          const name = match[1];
          const args = JSON.parse(`{${match[2]}}`);
          
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'tool',
            tool: {
              name,
              input: args
            }
          });
        } catch (error) {
          console.error('[LLMIntegration] Failed to parse tool call:', error);
        }
      }
    }

    return toolCalls;
  }

  /**
   * Execute a tool call
   * @param {object} toolCall - Tool call object
   * @param {Array<object>} availableTools - Available tools
   * @returns {Promise<any>} Tool execution result
   */
  async executeToolCall(toolCall, availableTools) {
    // Determine tool name and arguments
    let toolName, arguments;

    if (toolCall.function) {
      // OpenAI format
      toolName = toolCall.function.name;
      arguments = toolCall.function.arguments;
    } else if (toolCall.tool) {
      // Anthropic format
      toolName = toolCall.tool.name;
      arguments = toolCall.tool.input;
    } else {
      throw new Error('Unknown tool call format');
    }

    // Find tool in available tools
    const tool = availableTools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found in available tools`);
    }

    // Determine server name from tool
    const serverName = tool.serverName || this.findServerForTool(toolName);
    if (!serverName) {
      throw new Error(`Cannot determine server for tool ${toolName}`);
    }

    // Execute tool
    return await this.mcpClientManager.executeTool(serverName, toolName, arguments);
  }

  /**
   * Find the server for a tool
   * @param {string} toolName - Name of the tool
   * @returns {string|null} Server name or null
   */
  findServerForTool(toolName) {
    const tool = this.mcpClientManager.listTools().find(t => t.name === toolName);
    return tool ? tool.serverName : null;
  }

  /**
   * Format tool results for LLM consumption
   * @param {Array<object>} toolResults - Tool execution results
   * @returns {Array<object>} Formatted result messages
   */
  formatToolResults(toolResults) {
    const messages = [];

    for (const { toolCall, result, success, error } of toolResults) {
      if (success) {
        // OpenAI format
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });

        // Anthropic format
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: JSON.stringify(result)
            }
          ]
        });
      } else {
        // Error message
        messages.push({
          role: 'system',
          content: `Tool ${toolCall.function?.name || toolCall.tool?.name} failed: ${error}`
        });
      }
    }

    return messages;
  }

  /**
   * Track tool calls in history
   * @param {Array<object>} toolCalls - Tool calls made
   * @param {Array<object>} toolResults - Tool execution results
   */
  trackToolCalls(toolCalls, toolResults) {
    const entry = {
      timestamp: new Date().toISOString(),
      toolCalls: toolCalls.map(tc => ({
        name: tc.function?.name || tc.tool?.name,
        arguments: tc.function?.arguments || tc.tool?.input
      })),
      results: toolResults.map(tr => ({
        success: tr.success,
        error: tr.error
      }))
    };

    this.toolCallHistory.push(entry);

    // Keep only last 1000 entries
    if (this.toolCallHistory.length > 1000) {
      this.toolCallHistory.shift();
    }
  }

  /**
   * Get tool call history
   * @param {number} [limit] - Maximum number of entries to return
   * @returns {Array<object>} Tool call history
   */
  getToolCallHistory(limit = 100) {
    return this.toolCallHistory.slice(-limit);
  }

  /**
   * Get tool call statistics
   * @returns {object} Statistics object
   */
  getToolCallStatistics() {
    const total = this.toolCallHistory.length;
    const successful = this.toolCallHistory.filter(e => 
      e.results.every(r => r.success)
    ).length;

    const toolCounts = {};
    for (const entry of this.toolCallHistory) {
      for (const tc of entry.toolCalls) {
        const name = tc.name;
        toolCounts[name] = (toolCounts[name] || 0) + 1;
      }
    }

    return {
      totalToolCalls: total,
      successfulToolCalls: successful,
      failedToolCalls: total - successful,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) : 0,
      toolCounts
    };
  }

  /**
   * Clear tool call history
   */
  clearHistory() {
    this.toolCallHistory = [];
    console.log('[LLMIntegration] Tool call history cleared');
  }

  /**
   * Create a system prompt with tool information
   * @param {Array<object>} [tools] - Available tools
   * @returns {string} System prompt
   */
  createToolSystemPrompt(tools = null) {
    if (!tools) {
      tools = this.mcpClientManager.getToolsForLLM();
    }

    if (tools.length === 0) {
      return 'You are a helpful AI assistant.';
    }

    const toolDescriptions = tools.map(tool => 
      `- ${tool.name}: ${tool.description || 'No description'}`
    ).join('\n');

    return `You are a helpful AI assistant with access to the following tools:\n\n${toolDescriptions}\n\nWhen the user requests something that requires using a tool, use the appropriate tool and provide the results.`;
  }

  /**
   * Format tools for OpenAI function calling
   * @param {Array<object>} [tools] - Available tools
   * @returns {Array<object>} Formatted tools
   */
  formatToolsForOpenAI(tools = null) {
    if (!tools) {
      tools = this.mcpClientManager.getToolsForLLM();
    }

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {}
        }
      }
    }));
  }

  /**
   * Format tools for Anthropic tool use
   * @param {Array<object>} [tools] - Available tools
   * @returns {Array<object>} Formatted tools
   */
  formatToolsForAnthropic(tools = null) {
    if (!tools) {
      tools = this.mcpClientManager.getToolsForLLM();
    }

    return tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema || {
        type: 'object',
        properties: {}
      }
    }));
  }

  /**
   * Check if a message contains tool calls
   * @param {object} message - LLM message
   * @returns {boolean}
   */
  hasToolCalls(message) {
    return this.detectToolCalls(message).length > 0;
  }

  /**
   * Extract tool call IDs from a message
   * @param {object} message - LLM message
   * @returns {Array<string>} Array of tool call IDs
   */
  extractToolCallIds(message) {
    const toolCalls = this.detectToolCalls(message);
    return toolCalls.map(tc => tc.id);
  }
}

/**
 * Create a new LLM integration
 * @param {object} mcpClientManager - MCP client manager
 * @returns {LLMIntegration}
 */
export function createLLMIntegration(mcpClientManager) {
  return new LLMIntegration(mcpClientManager);
}
