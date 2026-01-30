#!/usr/bin/env node

/**
 * Example MCP Server
 *
 * This is a simple example server that demonstrates MCP functionality.
 * It responds to basic tool requests and can be used for testing.
 */

import { createReadStream } from 'fs';
import { stdin, stdout } from 'process';
import readline from 'readline/promises';

// Simple counter for request IDs
let requestIdCounter = 0;

// Supported tools
const tools = [
  {
    name: "get_current_time",
    description: "Get the current time in ISO format",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "echo_message",
    description: "Echo back a message provided by the user",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message to echo back"
        }
      },
      required: ["message"]
    }
  },
  {
    name: "calculate_sum",
    description: "Calculate the sum of two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: {
          type: "number",
          description: "The first number"
        },
        b: {
          type: "number",
          description: "The second number"
        }
      },
      required: ["a", "b"]
    }
  }
];

// Send a response back to the MCP client
function sendResponse(id, result) {
  const response = {
    jsonrpc: "2.0",
    id: id,
    result: result
  };
  stdout.write(JSON.stringify(response) + "\n");
}

// Send an error response back to the MCP client
function sendError(id, code, message) {
  const response = {
    jsonrpc: "2.0",
    id: id,
    error: {
      code: code,
      message: message
    }
  };
  stdout.write(JSON.stringify(response) + "\n");
}

// Handle an incoming request
async function handleRequest(request) {
  if (request.method === "tools/list") {
    // Return the list of available tools
    return {
      tools: tools
    };
  } else if (request.method === "tools/call") {
    // Handle a tool call
    const { name, arguments: args } = request.params;
    
    switch (name) {
      case "get_current_time":
        return { time: new Date().toISOString() };
      
      case "echo_message":
        return { echoed: args.message };
      
      case "calculate_sum":
        return { sum: args.a + args.b, calculation: `${args.a} + ${args.b} = ${args.a + args.b}` };
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } else {
    throw new Error(`Unknown method: ${request.method}`);
  }
}

// Main loop to read and process requests
async function main() {
  console.error("Example MCP Server started"); // Using stderr for server logs
  
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: false
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const request = JSON.parse(line);
      
      if (request.jsonrpc !== "2.0") {
        sendError(request.id, -32600, "Invalid JSON-RPC version");
        continue;
      }
      
      if (!request.id) {
        // This is a notification, not a request
        continue;
      }
      
      try {
        const result = await handleRequest(request);
        sendResponse(request.id, result);
      } catch (error) {
        sendError(request.id, -32601, error.message);
      }
    } catch (error) {
      console.error("Error processing request:", error.message);
    }
  }
}

// Start the server
main().catch(console.error);