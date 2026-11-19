import { createStdioConnection } from '../utils/stdio-handler.js';
import { BaseConnectionPool } from './base-connection-pool.js';

export class StdioConnectionPool extends BaseConnectionPool {
  constructor() {
    super('StdioPool', createStdioConnection);
  }
}

export function createStdioConnectionPool() {
  return new StdioConnectionPool();
}
