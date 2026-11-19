export class BaseConnectionPool {
  constructor(poolName, createConnectionFn) {
    this.poolName = poolName;
    this.createConnectionFn = createConnectionFn;
    this.connections = new Map();
    this.connectionConfigs = new Map();
  }

  registerServer(serverName, config) {
    this.connectionConfigs.set(serverName, config);
    console.log(`[${this.poolName}] Registered server: ${serverName}`);
  }

  async acquireConnection(serverName) {
    if (this.connections.has(serverName)) {
      const connection = this.connections.get(serverName);
      if (connection.isActive()) {
        return connection;
      } else {
        this.connections.delete(serverName);
      }
    }

    if (!this.connectionConfigs.has(serverName)) {
      throw new Error(`Server ${serverName} is not registered`);
    }

    const config = this.connectionConfigs.get(serverName);
    const connection = this.createConnectionFn(serverName, config);

    try {
      await connection.connect();
      this.connections.set(serverName, connection);
      return connection;
    } catch (error) {
      console.error(`[${this.poolName}] Failed to connect to ${serverName}:`, error);
      throw error;
    }
  }

  releaseConnection(serverName) {
    console.log(`[${this.poolName}] Released connection to ${serverName}`);
  }

  getConnectionStatus(serverName) {
    if (!this.connections.has(serverName)) {
      return {
        serverName,
        connected: false,
        status: 'not_connected'
      };
    }

    const connection = this.connections.get(serverName);
    return {
      serverName,
      connected: connection.isActive(),
      status: connection.isActive() ? 'active' : 'inactive'
    };
  }

  getAllStatuses() {
    const statuses = [];
    for (const serverName of this.connectionConfigs.keys()) {
      statuses.push(this.getConnectionStatus(serverName));
    }
    return statuses;
  }

  async disconnect(serverName) {
    if (!this.connections.has(serverName)) {
      return;
    }

    const connection = this.connections.get(serverName);
    await connection.disconnect();
    this.connections.delete(serverName);
    console.log(`[${this.poolName}] Disconnected from ${serverName}`);
  }

  async closeAllConnections() {
    const disconnectPromises = [];
    for (const [serverName, connection] of this.connections.entries()) {
      disconnectPromises.push(
        connection.disconnect().catch(error => {
          console.error(`[${this.poolName}] Error disconnecting ${serverName}:`, error);
        })
      );
    }
    await Promise.all(disconnectPromises);
    this.connections.clear();
    console.log(`[${this.poolName}] All connections closed`);
  }

  getConnection(serverName) {
    return this.connections.get(serverName) || null;
  }

  isRegistered(serverName) {
    return this.connectionConfigs.has(serverName);
  }

  getRegisteredServers() {
    return Array.from(this.connectionConfigs.keys());
  }

  getConnectedServers() {
    const connected = [];
    for (const [serverName, connection] of this.connections.entries()) {
      if (connection.isActive()) {
        connected.push(serverName);
      }
    }
    return connected;
  }
}
