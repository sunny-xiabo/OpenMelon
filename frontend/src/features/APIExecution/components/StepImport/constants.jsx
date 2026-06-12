import React from 'react';
import { SettingsOutlined, CloudUploadOutlined, AutoAwesome, VpnKeyOutlined } from '@mui/icons-material';

export const ENVIRONMENT_VARIABLES_EXAMPLE = JSON.stringify({
  user_id: '10001',
  tenant_id: 'demo-tenant',
  access_token: 'paste-token-here',
}, null, 2);

export const RISK_OVERRIDES_EXAMPLE = JSON.stringify({
  'DELETE /users/{id}': 'high',
  'POST /payments': 'high',
  'GET /admin/audit': 'medium',
}, null, 2);

export const AUTH_CONFIG_EXAMPLE = JSON.stringify({
  type: 'bearer',
  token_variable: 'access_token',
  prefix: 'Bearer',
  header_name: 'Authorization',
}, null, 2);

export const SETUP_STEPS_EXAMPLE = JSON.stringify([
  {
    id: 'login',
    name: '登录获取 Token',
    method: 'POST',
    path: '/auth/login',
    operation_id: 'login',
    body: {
      username: '{{username}}',
      password: '{{password}}',
    },
    assertions: [
      { type: 'status_code', expected: 200 },
    ],
    extractions: [
      { name: 'access_token', source: 'body', path: 'data.token' },
    ],
  },
], null, 2);

export const CLEANUP_STEPS_EXAMPLE = JSON.stringify([
  {
    id: 'cleanup_order',
    name: '清理订单',
    method: 'DELETE',
    path: '/orders/{{order_id}}',
    operation_id: 'cleanupOrder',
    assertions: [
      { type: 'status_code_in', expected: [200, 204, 404] },
    ],
  },
], null, 2);

export const ACTIVE_INTERFACE_STATUSES = new Set(['active', 'changed']);

export const AI_BOUNDARY_OPTIONS = [
  {
    checkedKey: 'allowAiGenerateDsl',
    label: '允许 AI 生成 DSL',
    description: '允许根据 OpenAPI 自动生成测试脚本草稿。',
  },
  {
    checkedKey: 'allowAiExecution',
    label: '允许 AI 自动执行',
    description: '开启后，AI/自动化任务可以直接提交执行。生产环境建议关闭。',
  },
  {
    checkedKey: 'allowAiRepair',
    label: '允许 AI 自动修复',
    description: '允许根据失败结果生成修复补丁或受控重跑。',
  },
  {
    checkedKey: 'allowScheduledExecution',
    label: '允许定时执行',
    description: '允许该项目被定时任务触发执行。',
  },
  {
    checkedKey: 'allowOverwriteHistory',
    label: '允许覆盖原记录',
    description: '重跑失败步骤时可合并更新原执行记录。',
  },
];

export const AUTH_TYPE_OPTIONS = [
  { value: 'none', label: '无认证' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api_key_header', label: 'API Key Header' },
  { value: 'api_key_query', label: 'API Key Query' },
  { value: 'basic', label: 'Basic Auth' },
];

export const CONFIG_SECTION_META = [
  { value: 'project', label: '项目环境', icon: <SettingsOutlined fontSize="small" /> },
  { value: 'import', label: '规范导入', icon: <CloudUploadOutlined fontSize="small" /> },
  { value: 'policy', label: 'AI 策略', icon: <AutoAwesome fontSize="small" /> },
  { value: 'dependencies', label: '认证依赖', icon: <VpnKeyOutlined fontSize="small" /> },
];

export const PANEL_SX = {
  p: { xs: 2.5, md: 3 },
  borderRadius: 4.5,
  border: '1px solid rgba(255, 255, 255, 0.45)',
  bgcolor: 'rgba(255, 255, 255, 0.45)',
  backdropFilter: 'blur(20px)',
  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
};

export const OUTLINED_BLOCK_SX = {
  p: 2.5,
  borderRadius: 3.5,
  border: '1px solid rgba(0, 0, 0, 0.03)',
  bgcolor: 'rgba(255, 255, 255, 0.45)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
};

export const CODE_FIELD_SX = { '& .MuiInputBase-input': { fontFamily: 'monospace' } };

export const parseConfigText = (text, fallback) => {
  const raw = String(text || '').trim();
  if (!raw) return { value: fallback, valid: true };
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(fallback)) return { value: Array.isArray(value) ? value : fallback, valid: Array.isArray(value) };
    return { value: value && typeof value === 'object' && !Array.isArray(value) ? value : fallback, valid: Boolean(value && typeof value === 'object' && !Array.isArray(value)) };
  } catch {
    return { value: fallback, valid: false };
  }
};

export const stringifyConfig = (value) => JSON.stringify(value, null, 2);

export const collectTemplateRefs = (value) => {
  const refs = new Set();
  const text = JSON.stringify(value || {});
  for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
    refs.add(match[1]);
  }
  return [...refs];
};

export const collectExtractions = (steps = []) => {
  const names = new Set();
  for (const step of steps || []) {
    for (const extraction of step?.extractions || []) {
      if (extraction?.name) names.add(extraction.name);
    }
  }
  return [...names];
};

export const collectAuthVariableRefs = (authConfig = {}) => {
  const type = String(authConfig.type || '').toLowerCase();
  const refs = [];
  if (type === 'bearer' && authConfig.token_variable) refs.push(authConfig.token_variable);
  if (type === 'api_key' && authConfig.value_variable) refs.push(authConfig.value_variable);
  if (type === 'basic' && authConfig.encoded_variable) refs.push(authConfig.encoded_variable);
  return refs;
};

export const upsertStepById = (steps, nextStep) => {
  const current = Array.isArray(steps) ? [...steps] : [];
  const index = current.findIndex((item) => item?.id === nextStep.id);
  if (index >= 0) current[index] = nextStep;
  else current.unshift(nextStep);
  return current;
};

export const buildAuthConfigFromWizard = (wizard) => {
  if (wizard.type === 'none') return {};
  if (wizard.type === 'bearer') {
    return {
      type: 'bearer',
      token_variable: wizard.tokenVariable || 'access_token',
      prefix: wizard.prefix || 'Bearer',
      header_name: wizard.headerName || 'Authorization',
    };
  }
  if (wizard.type === 'api_key_query') {
    return {
      type: 'api_key',
      in: 'query',
      name: wizard.apiKeyName || 'api_key',
      value_variable: wizard.apiKeyVariable || 'api_key',
    };
  }
  if (wizard.type === 'basic') {
    return {
      type: 'basic',
      encoded_variable: wizard.basicVariable || 'basic_token',
      header_name: wizard.headerName || 'Authorization',
    };
  }
  return {
    type: 'api_key',
    in: 'header',
    name: wizard.apiKeyName || 'x-api-key',
    value_variable: wizard.apiKeyVariable || 'api_key',
  };
};

export const buildDependencyConfigInsight = ({
  authConfigText,
  setupStepsText,
  cleanupStepsText,
  environmentVariablesText,
}) => {
  const auth = parseConfigText(authConfigText, {});
  const setup = parseConfigText(setupStepsText, []);
  const cleanup = parseConfigText(cleanupStepsText, []);
  const variables = parseConfigText(environmentVariablesText, {});
  const refs = [...new Set([
    ...collectTemplateRefs(auth.value),
    ...collectAuthVariableRefs(auth.value),
    ...collectTemplateRefs(setup.value),
    ...collectTemplateRefs(cleanup.value),
  ])];
  const extracted = collectExtractions(setup.value);
  const known = new Set([...Object.keys(variables.value || {}), ...extracted]);
  const missingRefs = refs.filter((name) => !known.has(name));
  return {
    auth,
    setup,
    cleanup,
    variables,
    refs,
    extracted,
    missingRefs,
    invalid: !auth.valid || !setup.valid || !cleanup.valid || !variables.valid,
  };
};
