/**
 * JSON-RPC 2.0 Message Handler
 * 
 * This module provides utilities for creating and parsing JSON-RPC 2.0 messages
 * as used by the Model Context Protocol (MCP).
 * 
 * JSON-RPC 2.0 Specification: https://www.jsonrpc.org/specification
 */

/**
 * Generate a unique request ID
 * @returns {string} A unique ID string
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a JSON-RPC 2.0 request object
 * @param {string} method - The method name to invoke
 * @param {object} params - The parameters object
 * @param {string} [id] - Optional request ID (auto-generated if not provided)
 * @returns {object} JSON-RPC request object
 */
export function createRequest(method, params = {}, id = null) {
  return {
    jsonrpc: '2.0',
    id: id || generateId(),
    method,
    params
  };
}

/**
 * Create a JSON-RPC 2.0 notification object (no response expected)
 * @param {string} method - The method name to invoke
 * @param {object} params - The parameters object
 * @returns {object} JSON-RPC notification object
 */
export function createNotification(method, params = {}) {
  return {
    jsonrpc: '2.0',
    method,
    params
  };
}

/**
 * Create a JSON-RPC 2.0 success response object
 * @param {string} id - The request ID
 * @param {any} result - The result value
 * @returns {object} JSON-RPC success response object
 */
export function createSuccessResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * Create a JSON-RPC 2.0 error response object
 * @param {string} id - The request ID
 * @param {number} code - Error code
 * @param {string} message - Error message
 * @param {any} [data] - Optional error data
 * @returns {object} JSON-RPC error response object
 */
export function createErrorResponse(id, code, message, data = null) {
  const error = {
    code,
    message
  };
  
  if (data !== null) {
    error.data = data;
  }
  
  return {
    jsonrpc: '2.0',
    id,
    error
  };
}

/**
 * Parse a JSON-RPC message from a string
 * @param {string} message - The JSON string to parse
 * @returns {object} Parsed JSON-RPC object
 * @throws {Error} If the message is invalid JSON or not valid JSON-RPC
 */
export function parseMessage(message) {
  try {
    const parsed = JSON.parse(message);
    
    // Validate JSON-RPC 2.0 format
    if (parsed.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC version: must be 2.0');
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse JSON-RPC message: ${error.message}`);
  }
}

/**
 * Check if a message is a request
 * @param {object} message - The message to check
 * @returns {boolean} True if the message is a request
 */
export function isRequest(message) {
  return message.jsonrpc === '2.0' && 
         message.method && 
         message.id !== undefined;
}

/**
 * Check if a message is a notification
 * @param {object} message - The message to check
 * @returns {boolean} True if the message is a notification
 */
export function isNotification(message) {
  return message.jsonrpc === '2.0' && 
         message.method && 
         message.id === undefined;
}

/**
 * Check if a message is a response
 * @param {object} message - The message to check
 * @returns {boolean} True if the message is a response
 */
export function isResponse(message) {
  return message.jsonrpc === '2.0' && 
         message.id !== undefined && 
         (message.result !== undefined || message.error !== undefined);
}

/**
 * Check if a message is a success response
 * @param {object} message - The message to check
 * @returns {boolean} True if the message is a success response
 */
export function isSuccessResponse(message) {
  return isResponse(message) && message.result !== undefined;
}

/**
 * Check if a message is an error response
 * @param {object} message - The message to check
 * @returns {boolean} True if the message is an error response
 */
export function isErrorResponse(message) {
  return isResponse(message) && message.error !== undefined;
}

/**
 * Standard JSON-RPC 2.0 error codes
 */
export const ErrorCodes = {
  // JSON-RPC defined errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  
  // MCP specific errors
  SERVER_NOT_INITIALIZED: -32000,
  SERVER_ALREADY_INITIALIZED: -32001,
  TOOL_NOT_FOUND: -32002,
  RESOURCE_NOT_FOUND: -32003,
  PROMPT_NOT_FOUND: -32004
};

/**
 * Get error message for standard error codes
 * @param {number} code - Error code
 * @returns {string} Error message
 */
export function getErrorMessage(code) {
  const messages = {
    [ErrorCodes.PARSE_ERROR]: 'Parse error',
    [ErrorCodes.INVALID_REQUEST]: 'Invalid request',
    [ErrorCodes.METHOD_NOT_FOUND]: 'Method not found',
    [ErrorCodes.INVALID_PARAMS]: 'Invalid params',
    [ErrorCodes.INTERNAL_ERROR]: 'Internal error',
    [ErrorCodes.SERVER_NOT_INITIALIZED]: 'Server not initialized',
    [ErrorCodes.SERVER_ALREADY_INITIALIZED]: 'Server already initialized',
    [ErrorCodes.TOOL_NOT_FOUND]: 'Tool not found',
    [ErrorCodes.RESOURCE_NOT_FOUND]: 'Resource not found',
    [ErrorCodes.PROMPT_NOT_FOUND]: 'Prompt not found'
  };
  
  return messages[code] || 'Unknown error';
}
