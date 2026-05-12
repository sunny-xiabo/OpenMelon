import { RUN_STATUS_META, ENVIRONMENT_TYPE_OPTIONS } from '../constants';

export const getTagNames = (tags = []) => tags.map((tag) => (typeof tag === 'string' ? tag : tag.name)).filter(Boolean);

export const formatRunTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

export const getRunStatusMeta = (status) => RUN_STATUS_META[status] || { label: status || '未知', color: 'default' };

export const getRunModeLabel = (mode) => {
  if (mode === 'single') return '单步';
  if (mode === 'background') return '后台';
  return '批量';
};

export const getEnvironmentTypeLabel = (value) => ENVIRONMENT_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '未指定';

export const getPolicyRiskLabel = (riskLevel) => ({
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  blocked: '已阻断',
}[riskLevel] || '未评估');

export const getPolicyRiskColor = (riskLevel) => {
  if (riskLevel === 'blocked' || riskLevel === 'high') return 'error';
  if (riskLevel === 'medium') return 'warning';
  if (riskLevel === 'low') return 'success';
  return 'default';
};

export const normalizeTimeoutMs = (value, fallback = 30000) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.max(500, Math.round(numberValue));
};

export const mergeScriptVariables = (script, environmentVariables) => ({
  ...script,
  variables: {
    ...(environmentVariables || {}),
    ...(script.variables || {}),
  },
});

export const getRunEnvironmentSnapshot = (run) => run?.execution_options?.environment_snapshot || {};

export const toRunRequestOptions = ({ environment_variables: _environmentVariables, ...options }) => options;

export const parseLineList = (value) => (value || '')
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

export const formatLineList = (value = []) => (Array.isArray(value) ? value : []).join('\n');

export const parseJsonObjectText = (value, fallback = {}) => {
  const raw = (value || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const normalizeNonNegativeInt = (value, fallback = 0) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return fallback;
  return Math.round(numberValue);
};

export const maskSensitiveConfig = (data = {}) => Object.fromEntries(
  Object.entries(data || {}).map(([key, value]) => {
    const lowerKey = String(key).toLowerCase();
    if (['authorization', 'token', 'password', 'secret', 'apikey', 'api-key', 'key'].some((item) => lowerKey.includes(item))) {
      return [key, '******'];
    }
    return [key, value];
  }),
);

export const getSeverityColor = (severity) => {
  if (severity === 'high') return 'error';
  if (severity === 'low') return 'info';
  return 'warning';
};

export const buildDownloadTimestamp = () => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

export const buildReportFilename = (extension = 'html') => `api-run-report-${buildDownloadTimestamp()}.${extension}`;

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const formatDuration = (durationMs) => {
  const value = Number(durationMs || 0);
  if (!Number.isFinite(value) || value <= 0) return '0 ms';
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60000) return `${(value / 1000).toFixed(2)} s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round((value % 60000) / 1000);
  return `${minutes} min ${seconds} s`;
};

export { buildRunReportHtml } from './reportHtml';

export const validateBaseUrl = (value) => {
  const baseUrl = (value || '').trim();
  if (!baseUrl) return { ok: true, value: '' };
  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname === 'locahost') {
      return { ok: false, message: 'Base URL 写成了 locahost，请改为 localhost 后再执行。' };
    }
    return { ok: true, value: baseUrl };
  } catch {
    return { ok: false, message: 'Base URL 格式不正确，请填写类似 http://localhost:8000 的完整地址。' };
  }
};

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
