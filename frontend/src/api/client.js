const rawApiBase = import.meta.env.VITE_API_BASE_URL || '/api';
export const API_BASE = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase;

export const fetchJSON = async (url, options = {}) => {
  const headers = { ...options.headers };
  if (typeof options.body === 'string') {
    headers['Content-Type'] = 'Content-Type' in headers ? headers['Content-Type'] : 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(err.detail || `API Error: ${response.status}`);
  }
  return response.json();
};

export const fetchJSONWithTimeout = async (url, options = {}, timeoutMs = 90000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchJSON(url, { ...options, signal: options.signal || controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请减少执行步骤或稍后重试');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const OPENAPI_PARSE_TIMEOUT_MS = 45000;

export const fetchStream = async (url, options = {}) => {
  const headers = { ...options.headers };
  if (typeof options.body === 'string') {
    headers['Content-Type'] = 'Content-Type' in headers ? headers['Content-Type'] : 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(err.detail || `API Error: ${response.status}`);
  }
  return response;
};

export const fetchBlob = async (url, options = {}) => {
  const headers = { ...options.headers };
  if (typeof options.body === 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    throw new Error(err.detail || `API Error: ${response.status}`);
  }
  return response.blob();
};
