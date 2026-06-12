import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Hook for managing workflow execution with SSE streaming.
 */
export function useWorkflowRun() {
  const [runStatus, setRunStatus] = useState('idle'); // idle | running | succeeded | failed | cancelled
  const [events, setEvents] = useState([]);
  const [nodeStates, setNodeStates] = useState({}); // nodeId -> { status, elapsed_ms, outputs, error }
  const [outputs, setOutputs] = useState(null);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);
  const abortRef = useRef(null);

  /**
   * Start a workflow run with SSE streaming.
   */
  const startRun = useCallback(async (workflowId, inputs = {}) => {
    // Reset state
    setRunStatus('running');
    setEvents([]);
    setNodeStates({});
    setOutputs(null);
    setError(null);

    try {
      // Use fetch + ReadableStream for SSE (more control than EventSource)
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(`/api/workflows/${workflowId}/run/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs, response_mode: 'streaming' }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7).trim();
            // Next line should be data
            continue;
          }
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              handleSSEEvent(data);
            } catch {
              // Skip malformed data
            }
          }
        }
      }

      setRunStatus(prev => prev === 'running' ? 'succeeded' : prev);
    } catch (err) {
      if (err.name === 'AbortError') {
        setRunStatus('cancelled');
      } else {
        setRunStatus('failed');
        setError(err.message);
      }
    }
  }, []);

  /**
   * Handle individual SSE events.
   */
  const handleSSEEvent = useCallback((data) => {
    const eventType = data.type || 'unknown';

    setEvents(prev => [...prev, data]);

    switch (eventType) {
      case 'node_started':
        setNodeStates(prev => ({
          ...prev,
          [data.node_id]: {
            ...prev[data.node_id],
            status: 'running',
            started_at: data.timestamp,
          },
        }));
        break;

      case 'node_finished':
        setNodeStates(prev => ({
          ...prev,
          [data.node_id]: {
            ...prev[data.node_id],
            status: data.status || 'succeeded',
            outputs: data.data?.outputs,
            elapsed_ms: data.data?.elapsed_ms,
          },
        }));
        break;

      case 'node_error':
        setNodeStates(prev => ({
          ...prev,
          [data.node_id || data.data?.node_id]: {
            ...prev[data.node_id || data.data?.node_id],
            status: 'failed',
            error: data.data?.error,
          },
        }));
        break;

      case 'workflow_finished':
        setRunStatus(data.data?.status || 'succeeded');
        setOutputs(data.data?.outputs);
        break;

      case 'workflow_error':
        setRunStatus('failed');
        setError(data.data?.error);
        break;

      default:
        break;
    }
  }, []);

  /**
   * Cancel the current run.
   */
  const cancelRun = useCallback(async (runId) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    if (runId) {
      try {
        await fetch(`/api/workflows/runs/${runId}/cancel`, { method: 'POST' });
      } catch {
        // Ignore cancel API errors
      }
    }
  }, []);

  /**
   * Reset the run state.
   */
  const resetRun = useCallback(() => {
    setRunStatus('idle');
    setEvents([]);
    setNodeStates({});
    setOutputs(null);
    setError(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return {
    runStatus,
    events,
    nodeStates,
    outputs,
    error,
    startRun,
    cancelRun,
    resetRun,
    isRunning: runStatus === 'running',
  };
}
