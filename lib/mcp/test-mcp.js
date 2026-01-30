/**
 * MCP Integration Test
 * 
 * This script tests the MCP integration with the existing mcp-config.json
 */

import { createMCPClientManager } from './client-manager.js';

/**
 * Test MCP integration
 */
async function testMCPIntegration() {
  console.log('=== MCP Integration Test ===\n');

  try {
    // Create MCP client manager
    const mcpManager = createMCPClientManager('./mcp-config.json');

    // Initialize
    console.log('Initializing MCP client manager...');
    await mcpManager.initialize();

    // Display configuration
    console.log('\n--- Configuration ---');
    console.log('Configured servers:', mcpManager.getConfiguredServers());
    console.log('Settings:', mcpManager.getSettings());

    // Display connection status
    console.log('\n--- Connection Status ---');
    const statuses = mcpManager.getAllConnectionStatuses();
    for (const status of statuses) {
      const statusIcon = status.connected ? '✓' : '✗';
      console.log(`${statusIcon} ${status.serverName}: ${status.status}`);
    }

    // Display connected servers
    const connectedServers = mcpManager.getConnectedServers();
    console.log(`\nConnected servers: ${connectedServers.length > 0 ? connectedServers.join(', ') : 'None'}`);

    // Display available tools
    console.log('\n--- Available Tools ---');
    const tools = mcpManager.listTools();
    if (tools.length === 0) {
      console.log('No tools available');
    } else {
      for (const tool of tools) {
        console.log(`  - ${tool.name} (${tool.serverName})`);
        console.log(`    Description: ${tool.description || 'No description'}`);
      }
      console.log(`\nTotal tools: ${tools.length}`);
    }

    // Display tool registry statistics
    console.log('\n--- Tool Registry Statistics ---');
    const registryStats = mcpManager.getRegistryStatistics();
    console.log(`Total tools: ${registryStats.totalTools}`);
    console.log(`Total servers: ${registryStats.totalServers}`);
    console.log(`Tools by server:`);
    for (const [server, count] of Object.entries(registryStats.toolsByServer)) {
      console.log(`  - ${server}: ${count} tools`);
    }

    // Test tool execution if tools are available
    if (tools.length > 0) {
      console.log('\n--- Tool Execution Test ---');
      const testTool = tools[0];
      console.log(`Testing tool: ${testTool.name} from ${testTool.serverName}`);
      
      try {
        const result = await mcpManager.executeTool(
          testTool.serverName,
          testTool.name,
          {} // No arguments for test
        );
        console.log('✓ Tool execution successful');
        console.log('Result:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('✗ Tool execution failed:', error.message);
      }
    }

    // Display tool executor statistics
    console.log('\n--- Tool Executor Statistics ---');
    const toolStats = mcpManager.getToolStatistics();
    if (toolStats) {
      console.log(`Total executions: ${toolStats.total}`);
      console.log(`Successful: ${toolStats.successful}`);
      console.log(`Failed: ${toolStats.failed}`);
      console.log(`Success rate: ${toolStats.successRate}%`);
    }

    // Shutdown
    console.log('\n--- Shutdown ---');
    await mcpManager.shutdown();
    console.log('✓ MCP client manager shut down successfully');

    console.log('\n=== Test Complete ===\n');
  } catch (error) {
    console.error('\n=== Test Failed ===\n');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testMCPIntegration();
