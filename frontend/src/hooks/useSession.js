import { useState, useEffect, useCallback } from 'react';
import { chatAPI } from '../services/api';

export function useSession() {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await chatAPI.getSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('Load sessions error:', err);
    }
  }, []);

  const createSession = useCallback(() => {
    const newId = crypto.randomUUID();
    setCurrentSession(newId);
    setSessions(prev => {
      if (prev.includes(newId)) return prev;
      return [newId, ...prev];
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
    loadSessions,
    loadHistory,
  };
}
