import { createSSEConnection } from '../utils/sse-handler.js';
import { BaseConnectionPool } from './base-connection-pool.js';

export class SSEConnectionPool extends BaseConnectionPool {
  constructor() {
    super('SSEPool', createSSEConnection);
  }
}

export function createSSEConnectionPool() {
  return new SSEConnectionPool();
}
