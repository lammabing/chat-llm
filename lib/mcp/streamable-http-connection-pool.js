import { createStreamableHTTPConnection } from '../utils/streamable-http-handler.js';
import { BaseConnectionPool } from './base-connection-pool.js';

export class StreamableHTTPConnectionPool extends BaseConnectionPool {
  constructor() {
    super('StreamableHTTPPool', createStreamableHTTPConnection);
  }
}

export function createStreamableHTTPConnectionPool() {
  return new StreamableHTTPConnectionPool();
}
