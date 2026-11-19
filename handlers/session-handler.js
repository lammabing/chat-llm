export function createSessionHandler(ctx) {
  const { config, sessionManager } = ctx;
  function handleCreateSession(ws, message) {
    if (!sessionManager) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session manager not available' }));
      return;
    }

    try {
      const { title, provider, model } = message || {};
      const session = sessionManager.createSession({
        title: title || 'New Chat',
        provider: provider || config.provider,
        model: model || (config.models[config.provider] || config.models['ollama'])
      });

      ws.send(JSON.stringify({
        type: 'session_created',
        session: {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          provider: session.provider,
          model: session.model,
          messageCount: session.messageCount
        }
      }));

      console.log(`📝 New session created: ${session.id} - "${session.title}"`);
    } catch (error) {
      console.error('Error creating session:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to create session: ${error.message}` }));
    }
  }

  function handleLoadSession(ws, message) {
    if (!sessionManager) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session manager not available' }));
      return;
    }

    try {
      const { sessionId } = message;
      if (!sessionId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session ID is required' }));
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: `Session not found: ${sessionId}` }));
        return;
      }

      const chatHistory = session.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      ws.send(JSON.stringify({
        type: 'session_loaded',
        session: {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          provider: session.provider,
          model: session.model,
          messageCount: session.messageCount
        },
        chatHistory: chatHistory
      }));

      console.log(`📂 Session loaded: ${session.id} - "${session.title}" (${session.messageCount} messages)`);
    } catch (error) {
      console.error('Error loading session:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to load session: ${error.message}` }));
    }
  }

  function handleListSessions(ws, message) {
    if (!sessionManager) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session manager not available' }));
      return;
    }

    try {
      const { limit = 50, offset = 0 } = message || {};
      const sessions = sessionManager.listSessions({ limit, offset });

      ws.send(JSON.stringify({
        type: 'sessions_list',
        sessions: sessions,
        count: sessions.length
      }));
    } catch (error) {
      console.error('Error listing sessions:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to list sessions: ${error.message}` }));
    }
  }

  function handleDeleteSession(ws, message) {
    if (!sessionManager) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session manager not available' }));
      return;
    }

    try {
      const { sessionId } = message;
      if (!sessionId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session ID is required' }));
        return;
      }

      const deleted = sessionManager.deleteSession(sessionId);
      if (deleted) {
        ws.send(JSON.stringify({ type: 'session_deleted', sessionId: sessionId }));
        console.log(`🗑️  Session deleted: ${sessionId}`);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: `Session not found: ${sessionId}` }));
      }
    } catch (error) {
      console.error('Error deleting session:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to delete session: ${error.message}` }));
    }
  }

  function handleUpdateSession(ws, message) {
    if (!sessionManager) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session manager not available' }));
      return;
    }

    try {
      const { sessionId, updates } = message;
      if (!sessionId || !updates) {
        ws.send(JSON.stringify({ type: 'error', message: 'Session ID and updates are required' }));
        return;
      }

      const session = sessionManager.updateSession(sessionId, updates);
      ws.send(JSON.stringify({
        type: 'session_updated',
        session: {
          id: session.id,
          title: session.title,
          provider: session.provider,
          model: session.model,
          updatedAt: session.updatedAt
        }
      }));

      console.log(`✏️  Session updated: ${sessionId}`);
    } catch (error) {
      console.error('Error updating session:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to update session: ${error.message}` }));
    }
  }

  function handleSessionStats(ws, message) {
    if (!sessionManager) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session manager not available' }));
      return;
    }

    try {
      const stats = sessionManager.getStats();
      ws.send(JSON.stringify({ type: 'session_stats', stats: stats }));
    } catch (error) {
      console.error('Error getting session stats:', error.message);
      ws.send(JSON.stringify({ type: 'error', message: `Failed to get stats: ${error.message}` }));
    }
  }

  return { handleCreateSession, handleLoadSession, handleListSessions, handleDeleteSession, handleUpdateSession, handleSessionStats };
}
