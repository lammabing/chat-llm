import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SessionManager - Manages persistent chat session storage using SQLite
 */
class SessionManager {
  constructor(dbPath = null) {
    // Default database path in project root
    if (!dbPath) {
      const projectRoot = path.resolve(__dirname, '..');
      dbPath = path.join(projectRoot, 'chat-sessions.db');
    }

    this.dbPath = dbPath;
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize the database and create tables if they don't exist
   */
  initialize() {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Open database
      this.db = new Database(this.dbPath);
      
      // Enable WAL mode for better concurrent read performance
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      // Create tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL DEFAULT 'New Chat',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          provider TEXT NOT NULL DEFAULT 'ollama',
          model TEXT NOT NULL DEFAULT 'gpt-oss:120b-cloud',
          message_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          provider TEXT,
          model TEXT,
          tool_calls TEXT,
          metadata TEXT,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_sessions_title ON sessions(title);
      `);

      this.initialized = true;
      console.log(`✅ SessionManager initialized: ${this.dbPath}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize SessionManager:', error.message);
      throw error;
    }
  }

  /**
   * Generate a UUID v4
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Generate a session title from the first user message
   */
  _generateTitle(content) {
    // Take first 50 characters and clean up
    let title = content.substring(0, 50).trim();
    // Remove newlines and extra spaces
    title = title.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    // Add ellipsis if truncated
    if (content.length > 50) {
      title += '...';
    }
    return title;
  }

  /**
   * Create a new chat session
   * @param {Object} options - Session options
   * @param {string} options.title - Session title (optional, auto-generated from first message)
   * @param {string} options.provider - Provider name (default: 'ollama')
   * @param {string} options.model - Model name
   * @returns {Object} Created session object
   */
  createSession({ title = 'New Chat', provider = 'ollama', model = 'gpt-oss:120b-cloud' } = {}) {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    const id = this._generateUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, title, provider, model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, title, provider, model, now, now);

    return {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      provider,
      model,
      messageCount: 0,
      messages: []
    };
  }

  /**
   * Get a session by ID with all its messages
   * @param {string} sessionId - Session ID
   * @returns {Object|null} Session object with messages, or null if not found
   */
  getSession(sessionId) {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    // Get session
    const sessionStmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = sessionStmt.get(sessionId);

    if (!session) {
      return null;
    }

    // Get messages
    const messagesStmt = this.db.prepare(`
      SELECT id, session_id, role, content, timestamp, provider, model, tool_calls, metadata
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);
    const messages = messagesStmt.all(sessionId).map(msg => ({
      id: msg.id,
      sessionId: msg.session_id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      provider: msg.provider,
      model: msg.model,
      toolCalls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null
    }));

    return {
      id: session.id,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      provider: session.provider,
      model: session.model,
      messageCount: session.message_count,
      messages
    };
  }

  /**
   * List all sessions, sorted by most recently updated
   * @param {Object} options - Query options
   * @param {number} options.limit - Maximum number of sessions to return
   * @param {number} options.offset - Offset for pagination
   * @returns {Array} Array of session summaries
   */
  listSessions({ limit = 50, offset = 0 } = {}) {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT 
        id, 
        title, 
        created_at as createdAt, 
        updated_at as updatedAt, 
        provider, 
        model, 
        message_count as messageCount
      FROM sessions
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);

    return stmt.all(limit, offset);
  }

  /**
   * Save a message to a session
   * @param {string} sessionId - Session ID
   * @param {Object} message - Message object
   * @param {string} message.role - Message role ('user', 'assistant', 'system')
   * @param {string} message.content - Message content
   * @param {string} [message.provider] - Provider name (optional)
   * @param {string} [message.model] - Model name (optional)
   * @param {Array} [message.toolCalls] - Tool calls if any (optional)
   * @returns {Object} Saved message with ID and timestamp
   */
  saveMessage(sessionId, { role, content, provider = null, model = null, toolCalls = null, metadata = null }) {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    const messageId = this._generateUUID();
    const now = new Date().toISOString();

    // Prepare statements
    const insertMessage = this.db.prepare(`
      INSERT INTO messages (id, session_id, role, content, timestamp, provider, model, tool_calls, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateSession = this.db.prepare(`
      UPDATE sessions 
      SET updated_at = ?, message_count = message_count + 1
      WHERE id = ?
    `);

    // Use transaction for atomicity
    const transaction = this.db.transaction(() => {
      insertMessage.run(
        messageId,
        sessionId,
        role,
        content,
        now,
        provider,
        model,
        toolCalls ? JSON.stringify(toolCalls) : null,
        metadata ? JSON.stringify(metadata) : null
      );

      updateSession.run(now, sessionId);
    });

    transaction();

    return {
      id: messageId,
      sessionId,
      role,
      content,
      timestamp: now,
      provider,
      model,
      toolCalls,
      metadata
    };
  }

  /**
   * Update session metadata (title, provider, model)
   * @param {string} sessionId - Session ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated session
   */
  updateSession(sessionId, updates) {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    const allowedFields = ['title', 'provider', 'model'];
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Always update the updated_at timestamp
    setClauses.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(sessionId);

    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.getSession(sessionId);
  }

  /**
   * Delete a session and all its messages
   * @param {string} sessionId - Session ID
   * @returns {boolean} True if session was deleted
   */
  deleteSession(sessionId) {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    const result = stmt.run(sessionId);

    return result.changes > 0;
  }

  /**
   * Search sessions by title
   * @param {string} query - Search query
   * @param {number} [limit=20] - Maximum results
   * @returns {Array} Matching session summaries
   */
  searchSessions(query, limit = 20) {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT 
        id, 
        title, 
        created_at as createdAt, 
        updated_at as updatedAt, 
        provider, 
        model, 
        message_count as messageCount
      FROM sessions
      WHERE title LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    return stmt.all(`%${query}%`, limit);
  }

  /**
   * Get session statistics
   * @returns {Object} Session statistics
   */
  getStats() {
    if (!this.initialized) {
      throw new Error('SessionManager not initialized');
    }

    const statsStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as totalSessions,
        COALESCE(SUM(message_count), 0) as totalMessages,
        MIN(created_at) as oldestSession,
        MAX(updated_at) as newestSession
      FROM sessions
    `);

    return statsStmt.get();
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('🔒 SessionManager database closed');
    }
  }
}

// Create singleton instance
let sessionManagerInstance = null;

/**
 * Get or create the SessionManager singleton
 * @param {string} [dbPath] - Optional database path
 * @returns {SessionManager} SessionManager instance
 */
export function getSessionManager(dbPath = null) {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(dbPath);
    sessionManagerInstance.initialize();
  }
  return sessionManagerInstance;
}

export { SessionManager };
export default SessionManager;
