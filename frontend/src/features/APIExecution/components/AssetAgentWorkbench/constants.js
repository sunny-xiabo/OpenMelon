export const ACTIVE_STATUSES = new Set(['active', 'changed']);

export const RISK_META = {
  low: { label: '低风险', color: 'success' },
  medium: { label: '中风险', color: 'warning' },
  high: { label: '高风险', color: 'error' },
  blocked: { label: '阻断', color: 'error' },
};

export const STATUS_META = {
  active: { label: '有效', color: 'success' },
  changed: { label: '变更', color: 'warning' },
  removed: { label: '移除', color: 'error' },
  deprecated: { label: '废弃', color: 'default' },
  hidden: { label: '隐藏', color: 'default' },
  excluded: { label: '已排除', color: 'default' },
};

export const MODULE_STATUS_META = {
  active: { label: '有效', color: 'success' },
  hidden: { label: '隐藏', color: 'default' },
  excluded: { label: '已排除', color: 'default' },
  removed: { label: '移除', color: 'error' },
};

export const sourceLabel = (source) => (source === 'manual' ? '手动' : 'OpenAPI');

export const getInterfaceLabel = (item) => `${item.method || ''} ${item.path || ''}`.trim();

export const normalizeResource = (value = '') => {
  const cleaned = String(value).toLowerCase().replace(/[^0-9a-z]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleaned.endsWith('ies')) return `${cleaned.slice(0, -3)}y`;
  if (cleaned.endsWith('s') && cleaned.length > 3) return cleaned.slice(0, -1);
  return cleaned;
};

export const resourceFromPath = (path = '') => {
  const segments = String(path)
    .split('/')
    .map((item) => item.trim())
    .filter((item) => item && !/^\{[^}]+\}$/.test(item));
  const staticSegments = segments.filter((item) => !['api', 'v1', 'v2', 'v3'].includes(item.toLowerCase()) && !/^v\d+$/i.test(item));
  return normalizeResource(staticSegments.at(-1) || segments.at(-1) || '');
};

export const textTokens = (item) => `${item.operation_id || ''} ${item.summary || ''} ${item.description || ''} ${item.path || ''}`.toLowerCase();

export const looksLikeAuthInterface = (item) => /login|auth|token|signin|session|oauth/.test(textTokens(item));

export const looksLikeCreateInterface = (item) => {
  if (looksLikeAuthInterface(item)) return false;
  if ((item.method || '').toUpperCase() !== 'POST') return false;
  const text = textTokens(item);
  return /create|add|new|submit|register|创建|新增/.test(text) || !String(item.path || '').includes('{');
};

export const hasPathVariable = (item) => /\{[^}]+\}/.test(String(item.path || ''));

export const planInsightStorageKey = (projectId) => `api-execution:last-asset-plan-insight:${projectId || 'default'}`;

export const readStoredPlanInsight = (projectId) => {
  if (!projectId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(planInsightStorageKey(projectId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeStoredPlanInsight = (projectId, insight) => {
  if (!projectId || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(planInsightStorageKey(projectId), JSON.stringify(insight));
  } catch {
    // sessionStorage can be unavailable in private or locked-down browser modes.
  }
};
