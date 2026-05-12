export const defaultAssertion = { type: 'status_code_in', expected: [200] };
export const defaultExtraction = { name: 'token', source: 'body', path: 'data.token' };
export const defaultRetry = { max_attempts: 1, delay_ms: 1000, backoff_factor: 1.0, retry_on: ['status_code'] };

export const variableInsertTargets = [
  { value: 'headersText', label: 'Headers' },
  { value: 'queryText', label: 'Query' },
  { value: 'pathParamsText', label: 'Path Params' },
  { value: 'bodyText', label: 'Body' },
];

export const safeJsonText = (value, fallback = '{}') => {
  if (value === undefined || value === null) return fallback;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
};

export const parseJsonText = (value, fallback, label) => {
  const raw = (value || '').trim();
  if (!raw) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, message: `${label} JSON 格式错误：${error.message}` };
  }
};

export const parseArrayDraft = (value) => {
  const parsed = parseJsonText(value, [], '列表');
  return Array.isArray(parsed.value) ? parsed.value : [];
};

export const parseRetryDraft = (value) => {
  const parsed = parseJsonText(value, null, 'Retry');
  return parsed.ok && parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)
    ? { ...defaultRetry, ...parsed.value }
    : null;
};

const toNumberOrText = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : value;
};

export const normalizeAssertionExpected = (type, value) => {
  if (['status_code_in', 'status_code_not_in'].includes(type)) {
    const source = Array.isArray(value) ? value : String(value ?? '').split(',');
    return source.map((item) => Number(String(item).trim())).filter((item) => Number.isFinite(item));
  }
  if (['status_code', 'status_code_not', 'response_time_lt'].includes(type)) return toNumberOrText(value);
  return value;
};
