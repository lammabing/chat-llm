export function createMCPHandler(ctx) {
  const { config, mcpClientManager } = ctx;
  async function handleMCPConnect(ws, message) {
    if (!config.enableMCP) {
      ws.send(JSON.stringify({ type: 'error', message: 'MCP integration is disabled' }));
      return;
    }

    const { serverName } = message;
    if (!serverName) {
      ws.send(JSON.stringify({ type: 'error', message: 'Server name is required' }));
      return;
    }

    try {
      await mcpClientManager.connectToServer(serverName);
      ws.send(JSON.stringify({ type: 'mcp_connected', serverName, message: `Connected to ${serverName}` }));
      ws.send(JSON.stringify({
        type: 'mcp_status',
        configuredServers: mcpClientManager.getConfiguredServers(),
        connectedServers: mcpClientManager.getConnectedServers(),
        availableTools: mcpClientManager.listTools().length,
        enabled: true
      }));
    } catch (error) {
      console.error('MCP connect error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to connect to ${serverName}: ${error.message}` }));
    }
  }

  async function handleMCPDisconnect(ws, message) {
    if (!config.enableMCP) {
      ws.send(JSON.stringify({ type: 'error', message: 'MCP integration is disabled' }));
      return;
    }

    const { serverName } = message;
    if (!serverName) {
      ws.send(JSON.stringify({ type: 'error', message: 'Server name is required' }));
      return;
    }

    try {
      await mcpClientManager.disconnectFromServer(serverName);
      ws.send(JSON.stringify({ type: 'mcp_disconnected', serverName, message: `Disconnected from ${serverName}` }));
      ws.send(JSON.stringify({
        type: 'mcp_status',
        configuredServers: mcpClientManager.getConfiguredServers(),
        connectedServers: mcpClientManager.getConnectedServers(),
        availableTools: mcpClientManager.listTools().length,
        enabled: true
      }));
    } catch (error) {
      console.error('MCP disconnect error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to disconnect from ${serverName}: ${error.message}` }));
    }
  }

  async function handleMCPListServers(ws) {
    if (!config.enableMCP) {
      ws.send(JSON.stringify({ type: 'error', message: 'MCP integration is disabled' }));
      return;
    }

    try {
      const configuredServers = mcpClientManager.getConfiguredServers();
      const connectionStatuses = mcpClientManager.getAllConnectionStatuses();
      ws.send(JSON.stringify({ type: 'mcp_servers_list', configuredServers, connectionStatuses }));
    } catch (error) {
      console.error('MCP list servers error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to list servers: ${error.message}` }));
    }
  }

  async function handleMCPListTools(ws, message) {
    if (!config.enableMCP) {
      ws.send(JSON.stringify({ type: 'error', message: 'MCP integration is disabled' }));
      return;
    }

    try {
      let tools;
      if (message && message.serverName) {
        tools = mcpClientManager.listTools(message.serverName);
      } else {
        tools = mcpClientManager.listTools();
      }
      ws.send(JSON.stringify({ type: 'mcp_tools_list', tools, count: tools.length }));
    } catch (error) {
      console.error('MCP list tools error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to list tools: ${error.message}` }));
    }
  }

  async function handleMCPExecuteTool(ws, message) {
    if (!config.enableMCP) {
      ws.send(JSON.stringify({ type: 'error', message: 'MCP integration is disabled' }));
      return;
    }

    const { serverName, toolName, arguments: toolArgs } = message;
    if (!serverName || !toolName) {
      ws.send(JSON.stringify({ type: 'error', message: 'Server name and tool name are required' }));
      return;
    }

    try {
      ws.send(JSON.stringify({ type: 'mcp_tool_execution_started', serverName, toolName, arguments: toolArgs }));
      const result = await mcpClientManager.executeTool(serverName, toolName, toolArgs || {});
      ws.send(JSON.stringify({ type: 'mcp_tool_executed', serverName, toolName, result, success: true }));
    } catch (error) {
      console.error('MCP execute tool error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to execute tool ${toolName}: ${error.message}`, serverName, toolName }));
    }
  }

  async function handleMCPGetStatus(ws) {
    if (!config.enableMCP) {
      ws.send(JSON.stringify({ type: 'error', message: 'MCP integration is disabled' }));
      return;
    }

    try {
      ws.send(JSON.stringify({
        type: 'mcp_full_status',
        configuredServers: mcpClientManager.getConfiguredServers(),
        connectedServers: mcpClientManager.getConnectedServers(),
        connectionStatuses: mcpClientManager.getAllConnectionStatuses(),
        availableToolsCount: mcpClientManager.listTools().length,
        toolCallStats: mcpClientManager.getToolStatistics(),
        registryStats: mcpClientManager.getRegistryStatistics(),
        enabled: true
      }));
    } catch (error) {
      console.error('MCP get status error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to get MCP status: ${error.message}` }));
    }
  }

  async function handleMCPToggleServers(ws, message) {
    if (!config.enableMCP || !mcpClientManager) {
      ws.send(JSON.stringify({ type: 'error', message: 'MCP integration is disabled' }));
      return;
    }

    const { enable = [], disable = [] } = message;

    try {
      const results = { enabled: [], disabled: [], errors: [] };

      for (const serverName of disable) {
        try {
          const connectedServers = mcpClientManager.getConnectedServers();
          if (connectedServers.includes(serverName)) {
            await mcpClientManager.disconnectFromServer(serverName);
            results.disabled.push(serverName);
          }
        } catch (error) {
          results.errors.push({ server: serverName, error: error.message });
        }
      }

      for (const serverName of enable) {
        try {
          const connectedServers = mcpClientManager.getConnectedServers();
          if (!connectedServers.includes(serverName)) {
            await mcpClientManager.connectToServer(serverName);
            results.enabled.push(serverName);
          }
        } catch (error) {
          results.errors.push({ server: serverName, error: error.message });
        }
      }

      ws.send(JSON.stringify({
        type: 'mcp_toggle_result',
        results,
        configuredServers: mcpClientManager.getConfiguredServers(),
        connectedServers: mcpClientManager.getConnectedServers(),
        availableTools: mcpClientManager.listTools().length
      }));

      console.log(`MCP servers toggled - enabled: ${results.enabled.join(', ')}, disabled: ${results.disabled.join(', ')}`);
    } catch (error) {
      console.error('MCP toggle error:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to toggle MCP servers: ${error.message}` }));
    }
  }

  return { handleMCPConnect, handleMCPDisconnect, handleMCPListServers, handleMCPListTools, handleMCPExecuteTool, handleMCPGetStatus, handleMCPToggleServers };
}
