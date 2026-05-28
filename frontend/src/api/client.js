const rawApiBase = import.meta.env.VITE_API_BASE_URL || '/api';
export const API_BASE = rawApiBase.endsWith('/') ? rawApiBase.slice(0, -1) : rawApiBase;
export const DEFAULT_API_TIMEOUT_MS = 90000;

export class APIError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', requestId = '', url = '', method = 'GET', details = null, response = null } = {}) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.url = url;
    this.method = method;
    this.details = details;
    this.response = response;
  }
}

const createRequestId = () => {
  if (globalThis.crypto?.randomUUID) return `req_${globalThis.crypto.randomUUID()}`;
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const emitAPIError = (error) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('openmelon:api-error', { detail: error }));
  if (error.status === 401) {
    window.dispatchEvent(new CustomEvent('openmelon:auth-expired', { detail: error }));
  }
};

const buildHeaders = (options, requestId) => {
  const headers = { ...options.headers };
  headers['X-Request-ID'] = headers['X-Request-ID'] || requestId;
  if (typeof options.body === 'string') {
    headers['Content-Type'] = 'Content-Type' in headers ? headers['Content-Type'] : 'application/json';
  }
  return headers;
};

const parseErrorBody = async (response) => {
  const text = await response.text().catch(() => '');
  if (!text) return { detail: `HTTP ${response.status}` };
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
};

const messageForStatus = (status) => {
  if (status === 401) return '登录状态已失效，请重新登录';
  if (status === 403) return '当前账号无权限执行该操作';
  if (status === 404) return '请求的资源不存在';
  if (status >= 500) return '服务暂时不可用，请稍后重试';
  return '';
};

const toAPIError = ({ response, body, requestId, url, method }) => {
  const serverMessage = body?.error?.message || body?.detail || body?.message || '';
  const message = serverMessage || messageForStatus(response.status) || `API Error: ${response.status}`;
  return new APIError(message, {
    status: response.status,
    code: body?.error?.code || body?.code || (response.status === 401 ? 'UNAUTHORIZED' : response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR'),
    requestId: response.headers.get('X-Request-ID') || requestId,
    url,
    method,
    details: body?.error?.details || body?.details || body,
    response,
  });
};

const mergeSignals = (signalA, signalB) => {
  if (!signalA) return signalB;
  if (!signalB) return signalA;
  const controller = new AbortController();
  const abort = () => controller.abort(signalA.reason || signalB.reason);
  signalA.addEventListener('abort', abort, { once: true });
  signalB.addEventListener('abort', abort, { once: true });
  return controller.signal;
};

const request = async (url, options = {}, { responseType = 'json', timeoutMs = DEFAULT_API_TIMEOUT_MS } = {}) => {
  const requestId = options.requestId || createRequestId();
  const method = String(options.method || 'GET').toUpperCase();
  const { requestId: _requestId, timeoutMs: _timeoutMs, signal: userSignal, ...fetchOptions } = options;
  const timeoutController = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => timeoutController.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs) : null;
  // 用户显式传递的信号直接挂到 fetch，中止时抛出原生 AbortError（name='AbortError'），
  // 与超时抛出的 APIError（code='TIMEOUT'）可区分，便于上层分别处理。
  const signal = userSignal || timeoutController.signal;
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      method,
      headers: buildHeaders(options, requestId),
      signal,
    });
    if (!response.ok) {
      const body = await parseErrorBody(response);
      const error = toAPIError({ response, body, requestId, url, method });
      emitAPIError(error);
      throw error;
    }
    if (responseType === 'response') return response;
    if (responseType === 'blob') return response.blob();
    if (response.status === 204) return null;
    return response.json();
  } catch (error) {
    // 超时信号抛出的 AbortError 包装为 TIMEOUT；用户显式取消抛出原生 AbortError 直接透传。
    if (error.name === 'TimeoutError' || (error.name === 'AbortError' && !userSignal)) {
      const timeoutError = new APIError('请求超时，请稍后重试', {
        status: 0,
        code: 'TIMEOUT',
        requestId,
        url,
        method,
      });
      emitAPIError(timeoutError);
      throw timeoutError;
    }
    if (error instanceof APIError) throw error;
    const networkError = new APIError(error.message || '网络请求失败，请检查服务是否可用', {
      status: 0,
      code: 'NETWORK_ERROR',
      requestId,
      url,
      method,
      details: error,
    });
    emitAPIError(networkError);
    throw networkError;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const fetchJSON = async (url, options = {}) => {
  return request(url, options, { responseType: 'json', timeoutMs: options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS });
};

export const fetchJSONWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS) => {
  return request(url, options, { responseType: 'json', timeoutMs });
};

export const OPENAPI_PARSE_TIMEOUT_MS = 45000;

export const fetchStream = async (url, options = {}) => {
  return request(url, options, { responseType: 'response', timeoutMs: options.timeoutMs ?? 0 });
};

export const fetchBlob = async (url, options = {}) => {
  return request(url, options, { responseType: 'blob', timeoutMs: options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS });
};

export const fetchFormData = async (url, formData, { timeoutMs = 0 } = {}) => {
  const requestId = createRequestId();
  const timeoutController = new AbortController();
  const signal = timeoutMs > 0
    ? mergeSignals(null, timeoutController.signal)
    : timeoutController.signal;
  const timer = timeoutMs > 0
    ? setTimeout(() => timeoutController.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
    : null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: { 'X-Request-ID': requestId },
      signal,
    });
    if (!response.ok) {
      const body = await parseErrorBody(response);
      const error = toAPIError({ response, body, requestId, url, method: 'POST' });
      emitAPIError(error);
      throw error;
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const timeoutError = new APIError('请求超时', { status: 0, code: 'TIMEOUT', requestId, url, method: 'POST' });
      emitAPIError(timeoutError);
      throw timeoutError;
    }
    if (error instanceof APIError) throw error;
    const networkError = new APIError(error.message || '网络请求失败', { status: 0, code: 'NETWORK_ERROR', requestId, url, method: 'POST', details: error });
    emitAPIError(networkError);
    throw networkError;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
