import { API_BASE, fetchJSON } from './client';

export const getExecutionRun = (runId) =>
  fetchJSON(`${API_BASE}/api-execution/runs/${encodeURIComponent(runId)}`);
