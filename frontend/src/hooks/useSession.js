import { useState, useEffect, useCallback } from 'react';
import { chatAPI } from '../services/api';

export function useSession() {
  // sessions is now [{id, title, updated_at, message_count}, ...]
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await chatAPI.getSessions();
      const list = data.sessions || [];
      // Normalize: backend now returns objects with metadata
      if (list.length > 0 && typeof list[0] === 'string') {
        // Legacy fallback: convert plain IDs to objects
        setSessions(list.map(id => ({ id, title: id.slice(0, 8), updated_at: '', message_count: 0 })));
      } else {
        setSessions(list);
      }
    } catch (err) {
      console.error('Load sessions error:', err);
    }
  }, []);

  const createSession = useCallback(() => {
    const newId = crypto.randomUUID();
    setCurrentSession(newId);
    setSessions(prev => {
      if (prev.some(s => s.id === newId)) return prev;
      return [{ id: newId, title: '新会话', updated_at: new Date().toISOString(), message_count: 0 }, ...prev];
    });
    return newId;
  }, []);

  const switchSession = useCallback((sessionId) => {
    setCurrentSession(sessionId);
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    try {
      await chatAPI.deleteSession(sessionId);
      if (currentSession === sessionId) {
        setCurrentSession(null);
      }
      await loadSessions();
    } catch (err) {
      console.error('Delete session error:', err);
    }
  }, [currentSession, loadSessions]);

  const renameSession = useCallback(async (sessionId, title) => {
    try {
      await chatAPI.renameSession(sessionId, title);
      setSessions(prev =>
        prev.map(s => s.id === sessionId ? { ...s, title } : s)
      );
    } catch (err) {
      console.error('Rename session error:', err);
    }
  }, []);

  const updateSessionTitle = useCallback((sessionId, title) => {
    setSessions(prev =>
      prev.map(s => s.id === sessionId && !s._titleSet
        ? { ...s, title, _titleSet: true }
        : s
      )
    );
  }, []);

  const loadHistory = useCallback(async (sessionId) => {
    try {
      const data = await chatAPI.getHistory(sessionId);
      return data.history || [];
    } catch (err) {
      console.error('Load history error:', err);
      return [];
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    currentSession,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    updateSessionTitle,
    loadSessions,
    loadHistory,
  };
}
