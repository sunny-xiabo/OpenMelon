import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, Typography, Paper, Box, Button, TextField, FormControl, InputLabel, Select, MenuItem, Checkbox, Alert, Chip, Divider, CircularProgress, Tabs, Tab } from '@mui/material';
import { CloudUploadOutlined, ContentPasteOutlined, AutoAwesome, RocketLaunch, SyncAltOutlined, SettingsOutlined, VpnKeyOutlined, SaveOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { NEW_PROJECT_VALUE, NEW_ENVIRONMENT_VALUE } from '../constants';
import { EXEC_KEYS, useProjectAssets } from '../hooks/useAPIExecutionQueries';
import StageHeader from './StageHeader';

const ENVIRONMENT_VARIABLES_EXAMPLE = JSON.stringify({
  user_id: '10001',
  tenant_id: 'demo-tenant',
  access_token: 'paste-token-here',
}, null, 2);

const RISK_OVERRIDES_EXAMPLE = JSON.stringify({
  'DELETE /users/{id}': 'high',
  'POST /payments': 'high',
  'GET /admin/audit': 'medium',
}, null, 2);

const AUTH_CONFIG_EXAMPLE = JSON.stringify({
  type: 'bearer',
  token_variable: 'access_token',
  prefix: 'Bearer',
  header_name: 'Authorization',
}, null, 2);

const SETUP_STEPS_EXAMPLE = JSON.stringify([
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

const CLEANUP_STEPS_EXAMPLE = JSON.stringify([
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

const ACTIVE_INTERFACE_STATUSES = new Set(['active', 'changed']);

const AI_BOUNDARY_OPTIONS = [
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

const AUTH_TYPE_OPTIONS = [
  { value: 'none', label: '无认证' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'api_key_header', label: 'API Key Header' },
  { value: 'api_key_query', label: 'API Key Query' },
  { value: 'basic', label: 'Basic Auth' },
];

const CONFIG_SECTION_META = [
  { value: 'project', label: '项目环境', icon: <SettingsOutlined fontSize="small" /> },
  { value: 'import', label: '规范导入', icon: <CloudUploadOutlined fontSize="small" /> },
  { value: 'policy', label: 'AI 策略', icon: <AutoAwesome fontSize="small" /> },
  { value: 'dependencies', label: '认证依赖', icon: <VpnKeyOutlined fontSize="small" /> },
];

const PANEL_SX = {
  p: { xs: 2, md: 2.5 },
  borderRadius: 1,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  bgcolor: '#ffffff',
  boxShadow: 'none',
};

const OUTLINED_BLOCK_SX = {
  p: 2,
  borderRadius: 1,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  bgcolor: '#f8fafc',
};

const CODE_FIELD_SX = { '& .MuiInputBase-input': { fontFamily: 'monospace' } };

const parseConfigText = (text, fallback) => {
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

const stringifyConfig = (value) => JSON.stringify(value, null, 2);

const collectTemplateRefs = (value) => {
  const refs = new Set();
  const text = JSON.stringify(value || {});
  for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)) {
    refs.add(match[1]);
  }
  return [...refs];
};

const collectExtractions = (steps = []) => {
  const names = new Set();
  for (const step of steps || []) {
    for (const extraction of step?.extractions || []) {
      if (extraction?.name) names.add(extraction.name);
    }
  }
  return [...names];
};

const collectAuthVariableRefs = (authConfig = {}) => {
  const type = String(authConfig.type || '').toLowerCase();
  const refs = [];
  if (type === 'bearer' && authConfig.token_variable) refs.push(authConfig.token_variable);
  if (type === 'api_key' && authConfig.value_variable) refs.push(authConfig.value_variable);
  if (type === 'basic' && authConfig.encoded_variable) refs.push(authConfig.encoded_variable);
  return refs;
};

const upsertStepById = (steps, nextStep) => {
  const current = Array.isArray(steps) ? [...steps] : [];
  const index = current.findIndex((item) => item?.id === nextStep.id);
  if (index >= 0) current[index] = nextStep;
  else current.unshift(nextStep);
  return current;
};

const buildAuthConfigFromWizard = (wizard) => {
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

const buildDependencyConfigInsight = ({
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

export default function StepImport() {
  const {
    fileInputRef, setSelectedFile, selectedFile, parseFile, sourceUrl, setSourceUrl, parseUrl,
    spec, clearSpec, projects, selectedProjectId, applyProjectValues, loadDemoOpenApi, resetAfterSpecChange,
    environments, selectedEnvironmentId, applyEnvironmentValues,
    baseUrl, setBaseUrl, environmentVariablesText, setEnvironmentVariablesText,
    allowAiGenerateDsl, setAllowAiGenerateDsl, allowAiExecution, setAllowAiExecution,
    allowAiRepair, setAllowAiRepair, allowScheduledExecution, setAllowScheduledExecution,
    allowOverwriteHistory, setAllowOverwriteHistory, maxAutoRepairs, setMaxAutoRepairs,
    maxReruns, setMaxReruns, maxRequestsPerRun, setMaxRequestsPerRun,
    operationAllowlistText, setOperationAllowlistText, operationBlocklistText, setOperationBlocklistText,
    riskOverridesText, setRiskOverridesText, authConfigText, setAuthConfigText,
    setupStepsText, setSetupStepsText, cleanupStepsText, setCleanupStepsText,
    saveCurrentEnvironment,
    setLoading, setLoadingMessage,
  } = useAPIExecution();
  const showSnackbar = useSnackbar();
  const queryClient = useQueryClient();
  const requestedSpecRef = React.useRef('');
  const [assetPreview, setAssetPreview] = React.useState(null);
  const [assetPreviewLoading, setAssetPreviewLoading] = React.useState(false);
  const [assetSyncing, setAssetSyncing] = React.useState(false);
  const [configSection, setConfigSection] = React.useState('project');
  const [authWizard, setAuthWizard] = React.useState({
    type: 'bearer',
    tokenVariable: 'access_token',
    prefix: 'Bearer',
    headerName: 'Authorization',
    apiKeyName: 'x-api-key',
    apiKeyVariable: 'api_key',
    basicVariable: 'basic_token',
  });
  const [setupWizard, setSetupWizard] = React.useState({
    id: 'login',
    name: '登录获取 Token',
    method: 'POST',
    path: '/auth/login',
    tokenPath: 'data.token',
    usernameVariable: 'username',
    passwordVariable: 'password',
  });
  const [cleanupWizard, setCleanupWizard] = React.useState({
    id: 'cleanup_created_resource',
    name: '清理测试数据',
    method: 'DELETE',
    path: '/orders/{{order_id}}',
    operationId: 'cleanupCreatedResource',
  });
  const { data: projectAssets } = useProjectAssets(selectedProjectId);
  const latestDiff = projectAssets?.latest_diff_summary || {};
  const activeInterfaceCount = (projectAssets?.interfaces || []).filter((item) => ACTIVE_INTERFACE_STATUSES.has(item.status) && !item.hidden).length;
  const selectedProject = React.useMemo(
    () => projects.find((item) => item.project_id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );
  const shouldPreviewAssetSync = Boolean(selectedProjectId && spec?.spec_id && selectedProject?.spec_id !== spec.spec_id);
  const previewDiff = assetPreview?.diff_summary || {};
  const dependencyConfigInsight = React.useMemo(
    () => buildDependencyConfigInsight({
      authConfigText,
      setupStepsText,
      cleanupStepsText,
      environmentVariablesText,
    }),
    [authConfigText, cleanupStepsText, environmentVariablesText, setupStepsText],
  );

  React.useEffect(() => {
    const parsedAuth = parseConfigText(authConfigText, {});
    if (!parsedAuth.valid) return;
    const parsed = parsedAuth.value;
    const type = String(parsed.type || 'none').toLowerCase();
    const nextType = type === 'api_key'
      ? (String(parsed.in || parsed.api_key_in || 'header').toLowerCase() === 'query' ? 'api_key_query' : 'api_key_header')
      : type;
    setAuthWizard((current) => ({
      ...current,
      type: AUTH_TYPE_OPTIONS.some((option) => option.value === nextType) ? nextType : 'none',
      tokenVariable: parsed.token_variable || current.tokenVariable,
      prefix: parsed.prefix ?? current.prefix,
      headerName: parsed.header_name || current.headerName,
      apiKeyName: parsed.name || parsed.api_key_name || current.apiKeyName,
      apiKeyVariable: parsed.value_variable || current.apiKeyVariable,
      basicVariable: parsed.encoded_variable || current.basicVariable,
    }));
  }, [authConfigText, selectedProjectId]);

  const loadProjectSpec = React.useCallback(async (project, { silent = false } = {}) => {
    const specId = project?.spec_id;
    if (!specId) {
      requestedSpecRef.current = '';
      clearSpec();
      if (!silent) {
        showSnackbar('当前项目还未绑定接口资产，请先导入或拉取 API 规范', { severity: 'info' });
      }
      return;
    }
    if (spec?.spec_id === specId) return;

    requestedSpecRef.current = specId;
    setLoadingMessage('项目接口资产同步中...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.getSpec(specId);
      resetAfterSpecChange(data, { advanceStep: !silent });
      setAssetPreview(null);
      queryClient.invalidateQueries({ queryKey: EXEC_KEYS.assets(project.project_id) });
      queryClient.invalidateQueries({ queryKey: EXEC_KEYS.agentContext(project.project_id) });
      if (!silent) {
        showSnackbar(`已加载项目接口资产，共 ${data.operation_count || 0} 个接口`, { severity: 'success' });
      }
    } catch (error) {
      showSnackbar(error.message || '项目接口资产加载失败，请重新导入或刷新', { severity: silent ? 'warning' : 'error' });
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, [clearSpec, queryClient, resetAfterSpecChange, setLoading, setLoadingMessage, showSnackbar, spec?.spec_id]);

  React.useEffect(() => {
    const project = projects.find((item) => item.project_id === selectedProjectId);
    if (!project?.spec_id || spec?.spec_id === project.spec_id || requestedSpecRef.current === project.spec_id) return;
    loadProjectSpec(project, { silent: true });
  }, [loadProjectSpec, projects, selectedProjectId, spec?.spec_id]);

  const bootstrapDemoProject = async () => {
    setLoadingMessage('正在初始化 Demo 项目...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.bootstrapDemoProject();
      resetAfterSpecChange(data.spec);
      setAssetPreview(null);
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.projects });
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.environments(data.project.project_id) });
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.assets(data.project.project_id) });
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.agentContext(data.project.project_id) });
      applyProjectValues(data.project);
      applyEnvironmentValues(data.environment);
      showSnackbar(
        `Demo 项目已初始化：${data.seeded_run_ids?.length || 0} 条执行样例，${data.knowledge_item_count || 0} 条知识`,
        'success',
      );
    } catch (error) {
      showSnackbar(error.message || 'Demo 项目初始化失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    if (!shouldPreviewAssetSync) {
      setAssetPreview(null);
      return () => {
        cancelled = true;
      };
    }
    setAssetPreviewLoading(true);
    apiExecutionAPI.previewProjectAssets(selectedProjectId, spec.spec_id)
      .then((data) => {
        if (!cancelled) setAssetPreview(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setAssetPreview(null);
          showSnackbar(error.message || '接口资产变更预览失败', { severity: 'warning' });
        }
      })
      .finally(() => {
        if (!cancelled) setAssetPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, shouldPreviewAssetSync, showSnackbar, spec?.spec_id]);

  const confirmAssetSync = async () => {
    if (!selectedProjectId || !spec?.spec_id) return;
    setAssetSyncing(true);
    try {
      const data = await apiExecutionAPI.syncProjectAssets(selectedProjectId, spec.spec_id);
      setAssetPreview(data);
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.assets(selectedProjectId) });
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.agentContext(selectedProjectId) });
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.projects });
      const updatedProject = await apiExecutionAPI.getProject(selectedProjectId);
      applyProjectValues(updatedProject);
      setAssetPreview(null);
      showSnackbar(
        `已同步到项目台账：新增 ${data.diff_summary?.added || 0}，变更 ${data.diff_summary?.changed || 0}，移除 ${data.diff_summary?.removed || 0}`,
        { severity: 'success' },
      );
    } catch (error) {
      showSnackbar(error.message || '接口资产同步失败', { severity: 'error' });
    } finally {
      setAssetSyncing(false);
    }
  };

  const saveConfig = async () => {
    await saveCurrentEnvironment();
    await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.projects });
    if (selectedProjectId) {
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.environments(selectedProjectId) });
      await queryClient.invalidateQueries({ queryKey: EXEC_KEYS.agentContext(selectedProjectId) });
    }
  };

  const applyAuthWizard = () => {
    const nextAuthConfig = buildAuthConfigFromWizard(authWizard);
    setAuthConfigText(stringifyConfig(nextAuthConfig));
    showSnackbar(authWizard.type === 'none' ? '已清空项目认证配置' : '认证配置已生成，请保存当前配置', { severity: 'success' });
  };

  const applyLoginSetupWizard = () => {
    const setup = parseConfigText(setupStepsText, []).value;
    const loginStep = {
      id: setupWizard.id || 'login',
      name: setupWizard.name || '登录获取 Token',
      method: setupWizard.method || 'POST',
      path: setupWizard.path || '/auth/login',
      operation_id: setupWizard.id || 'login',
      body: {
        username: `{{${setupWizard.usernameVariable || 'username'}}}`,
        password: `{{${setupWizard.passwordVariable || 'password'}}}`,
      },
      assertions: [{ type: 'status_code', expected: 200 }],
      extractions: [
        { name: authWizard.tokenVariable || 'access_token', source: 'body', path: setupWizard.tokenPath || 'data.token' },
      ],
    };
    setSetupStepsText(stringifyConfig(upsertStepById(setup, loginStep)));
    setAuthConfigText(stringifyConfig(buildAuthConfigFromWizard({ ...authWizard, type: 'bearer' })));
    showSnackbar('登录前置步骤和 Bearer 认证已生成，请确认响应路径后保存', { severity: 'success' });
  };

  const applyCleanupWizard = () => {
    const cleanup = parseConfigText(cleanupStepsText, []).value;
    const cleanupStep = {
      id: cleanupWizard.id || 'cleanup_created_resource',
      name: cleanupWizard.name || '清理测试数据',
      method: cleanupWizard.method || 'DELETE',
      path: cleanupWizard.path || '/orders/{{order_id}}',
      operation_id: cleanupWizard.operationId || cleanupWizard.id || 'cleanupCreatedResource',
      assertions: [{ type: 'status_code_in', expected: [200, 204, 404] }],
    };
    setCleanupStepsText(stringifyConfig(upsertStepById(cleanup, cleanupStep)));
    showSnackbar('清理步骤已生成，请保存当前配置', { severity: 'success' });
  };

  const fillMissingVariables = () => {
    const variables = parseConfigText(environmentVariablesText, {}).value;
    const nextVariables = { ...variables };
    dependencyConfigInsight.missingRefs.forEach((name) => {
      nextVariables[name] = '';
    });
    setEnvironmentVariablesText(stringifyConfig(nextVariables));
    showSnackbar('缺失变量已补到环境变量草稿中', { severity: 'success' });
  };

  const aiBoundaryValues = {
    allowAiGenerateDsl,
    allowAiExecution,
    allowAiRepair,
    allowScheduledExecution,
    allowOverwriteHistory,
  };
  const aiBoundarySetters = {
    allowAiGenerateDsl: setAllowAiGenerateDsl,
    allowAiExecution: setAllowAiExecution,
    allowAiRepair: setAllowAiRepair,
    allowScheduledExecution: setAllowScheduledExecution,
    allowOverwriteHistory: setAllowOverwriteHistory,
  };

  return (
    <Stack spacing={2.5}>
      <StageHeader title="项目配置" />

      <Paper sx={PANEL_SX}>
        <Stack spacing={1.5}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={800}>项目上下文</Typography>
              <Typography variant="caption" color="text.secondary">
                管理项目和环境请前往 设置 页面
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`项目：${selectedProject?.name || '未选择'}`} color={selectedProjectId ? 'primary' : 'default'} variant="outlined" />
              <Chip size="small" label={`环境：${environments.find((item) => item.environment_id === selectedEnvironmentId)?.name || '未选择'}`} variant="outlined" />
              <Chip size="small" label={`${projectAssets?.modules?.length || 0} 个模块`} />
              <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} color={activeInterfaceCount ? 'success' : 'default'} variant="outlined" />
              {spec?.spec_id && (
                <Chip size="small" label={`规范：${spec.operation_count || spec.operations?.length || 0} 个接口`} variant="outlined" />
              )}
              <Button
                size="small"
                variant="contained"
                startIcon={<SaveOutlined fontSize="small" />}
                onClick={saveConfig}
                disabled={!selectedProjectId}
              >
                保存当前配置
              </Button>
            </Stack>
          </Stack>
          <Divider />
          <Tabs
            value={configSection}
            onChange={(_event, value) => setConfigSection(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="项目配置分区"
            sx={{
              minHeight: 44,
              '& .MuiTab-root': {
                minHeight: 44,
                px: { xs: 1.25, md: 2 },
                fontWeight: 750,
                textTransform: 'none',
              },
            }}
          >
            {CONFIG_SECTION_META.map((section) => (
              <Tab
                key={section.value}
                value={section.value}
                icon={section.icon}
                iconPosition="start"
                label={section.label}
              />
            ))}
          </Tabs>
        </Stack>
      </Paper>

      {configSection === 'project' && (
        <Paper sx={PANEL_SX}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={800}>项目环境</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <FormControl size="small">
                <InputLabel>选择项目</InputLabel>
                <Select
                  label="选择项目"
                  value={selectedProjectId || NEW_PROJECT_VALUE}
                  onChange={(event) => {
                    const projectId = event.target.value;
                    if (projectId === NEW_PROJECT_VALUE) {
                      showSnackbar('请前往"设置"页面创建新项目', 'info');
                      return;
                    }
                    const project = projects.find((item) => item.project_id === projectId);
                    if (project) {
                      applyProjectValues(project);
                      loadProjectSpec(project);
                    }
                  }}
                >
                  <MenuItem value={NEW_PROJECT_VALUE}>新建项目...</MenuItem>
                  {projects.map((project) => (
                    <MenuItem key={project.project_id} value={project.project_id}>{project.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" disabled={!selectedProjectId}>
                <InputLabel>选择环境</InputLabel>
                <Select
                  label="选择环境"
                  value={selectedEnvironmentId || NEW_ENVIRONMENT_VALUE}
                  onChange={(event) => {
                    const environmentId = event.target.value;
                    if (environmentId === NEW_ENVIRONMENT_VALUE) {
                      showSnackbar('请前往"设置"页面创建新环境', 'info');
                      return;
                    }
                    const environment = environments.find((item) => item.environment_id === environmentId);
                    if (environment) applyEnvironmentValues(environment);
                  }}
                >
                  <MenuItem value={NEW_ENVIRONMENT_VALUE}>新建环境...</MenuItem>
                  {environments.map((environment) => (
                    <MenuItem key={environment.environment_id} value={environment.environment_id}>{environment.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            {selectedProjectId && (
              <Alert severity={projectAssets?.modules?.length ? 'success' : 'info'}>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={700}>项目 API 资产台账</Typography>
                    <Chip size="small" label={`${projectAssets?.modules?.length || 0} 个模块`} />
                    <Chip size="small" label={`${activeInterfaceCount} 个有效接口`} color={activeInterfaceCount ? 'success' : 'default'} variant="outlined" />
                    {!!latestDiff.changed && <Chip size="small" label={`${latestDiff.changed} 个变更`} color="warning" />}
                    {!!latestDiff.removed && <Chip size="small" label={`${latestDiff.removed} 个移除`} color="error" />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    已绑定项目会自动加载接口资产；刷新规范后先预览差异，再同步进台账。
                  </Typography>
                </Stack>
              </Alert>
            )}
            <Divider />
            <TextField size="small" label="Base URL" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:8000" helperText="执行时会和步骤 path 拼成完整请求地址。" />
            <TextField
              size="small"
              label="环境变量 JSON"
              multiline
              minRows={6}
              value={environmentVariablesText}
              onChange={e => setEnvironmentVariablesText(e.target.value)}
              placeholder={ENVIRONMENT_VARIABLES_EXAMPLE}
              helperText="可在脚本中用 {{user_id}}、{{access_token}} 引用；敏感字段在报告中会自动掩码。"
              sx={CODE_FIELD_SX}
            />
            <Button
              size="small"
              variant="text"
              startIcon={<ContentPasteOutlined fontSize="small" />}
              onClick={() => setEnvironmentVariablesText(ENVIRONMENT_VARIABLES_EXAMPLE)}
              sx={{ alignSelf: 'flex-start' }}
            >
              填入环境变量示例
            </Button>
          </Stack>
        </Paper>
      )}

      {configSection === 'import' && (
        <Paper sx={PANEL_SX}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>规范导入与资产同步</Typography>
                <Typography variant="caption" color="text.secondary">
                  支持 OpenAPI/Swagger JSON、YAML，也支持文档格式解析。
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip size="small" label={spec?.spec_id ? '规范已加载' : '规范未加载'} color={spec?.spec_id ? 'success' : 'default'} variant="outlined" />
                {shouldPreviewAssetSync && <Chip size="small" label="待同步" color="warning" />}
              </Stack>
            </Stack>

            <Box
              sx={{
                ...OUTLINED_BLOCK_SX,
                minHeight: 160,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                borderStyle: 'dashed',
                borderColor: 'rgba(99, 102, 241, 0.35)',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: '#eef2ff' },
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                setSelectedFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <Stack spacing={1} alignItems="center">
                <CloudUploadOutlined color="primary" sx={{ fontSize: 38 }} />
                <Typography variant="subtitle1" fontWeight={800}>拖拽规范文件或点击选择</Typography>
                <Typography variant="caption" color="text.secondary">JSON / YAML / HAR / Markdown / Office 文档</Typography>
                <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,.har,.md,.txt,.csv,.html,.htm,.docx,.xlsx,.xls" hidden onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
              </Stack>
            </Box>

            {selectedFile && (
              <Alert
                severity="success"
                action={<Button variant="contained" color="success" size="small" onClick={parseFile}>解析文件</Button>}
              >
                {selectedFile.name}
              </Alert>
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
              <Button
                variant="outlined"
                startIcon={<AutoAwesome fontSize="small" />}
                onClick={loadDemoOpenApi}
                sx={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 1, p: 2 }}
              >
                仅加载演示接口资产
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<RocketLaunch fontSize="small" />}
                onClick={bootstrapDemoProject}
                sx={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 1, p: 2 }}
              >
                初始化完整演示项目
              </Button>
            </Box>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField fullWidth size="small" label="OpenAPI URL" placeholder="https://api.example.com/openapi.json" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
              <Button variant="outlined" onClick={() => parseUrl(false)} sx={{ minWidth: 96 }}>拉取</Button>
            </Stack>

            {shouldPreviewAssetSync && (
              <Alert severity="warning">
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
                    <Box>
                      <Typography variant="body2" fontWeight={700}>检测到新的接口规范</Typography>
                      <Typography variant="caption" color="text.secondary">
                        当前规范尚未写入项目台账，请确认差异后同步。
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={assetSyncing ? <CircularProgress size={14} color="inherit" /> : <SyncAltOutlined fontSize="small" />}
                      disabled={assetPreviewLoading || assetSyncing}
                      onClick={confirmAssetSync}
                    >
                      确认同步
                    </Button>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    {assetPreviewLoading && <Chip size="small" label="正在预览差异..." />}
                    {!assetPreviewLoading && (
                      <>
                        <Chip size="small" label={`新增 ${previewDiff.added || 0}`} color={(previewDiff.added || 0) ? 'success' : 'default'} variant="outlined" />
                        <Chip size="small" label={`变更 ${previewDiff.changed || 0}`} color={(previewDiff.changed || 0) ? 'warning' : 'default'} variant="outlined" />
                        <Chip size="small" label={`移除 ${previewDiff.removed || 0}`} color={(previewDiff.removed || 0) ? 'error' : 'default'} variant="outlined" />
                        <Chip size="small" label={`不变 ${previewDiff.unchanged || 0}`} variant="outlined" />
                      </>
                    )}
                  </Stack>
                </Stack>
              </Alert>
            )}
          </Stack>
        </Paper>
      )}

      {configSection === 'policy' && (
        <Paper sx={PANEL_SX}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={800}>AI 策略</Typography>
            <Alert severity="info">
              推荐默认：允许生成 DSL、允许修复；自动执行和定时执行按项目风险再开启。
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.25 }}>
              {AI_BOUNDARY_OPTIONS.map((item) => (
                <Box key={item.checkedKey} sx={{ display: 'flex', alignItems: 'flex-start', p: 1.5, border: '1px solid rgba(15, 23, 42, 0.08)', borderRadius: 1, bgcolor: '#f8fafc' }}>
                  <Checkbox size="small" checked={Boolean(aiBoundaryValues[item.checkedKey])} onChange={e => aiBoundarySetters[item.checkedKey](e.target.checked)} sx={{ mt: -0.5 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{item.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.description}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
              <TextField size="small" label="最大自动修复次数" type="number" value={maxAutoRepairs} onChange={e => setMaxAutoRepairs(e.target.value)} helperText="建议 1-3；0 表示不限。" />
              <TextField size="small" label="最大重跑次数" type="number" value={maxReruns} onChange={e => setMaxReruns(e.target.value)} helperText="建议 1-2；0 表示不限。" />
              <TextField size="small" label="单次最大请求数" type="number" value={maxRequestsPerRun} onChange={e => setMaxRequestsPerRun(e.target.value)} helperText="限制批量执行规模，0 表示不限。" />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField size="small" label="接口白名单" multiline minRows={3} value={operationAllowlistText} onChange={e => setOperationAllowlistText(e.target.value)} placeholder={'GET /health\nGET /users'} helperText="每行一个 METHOD path。" />
              <TextField size="small" label="接口黑名单" multiline minRows={3} value={operationBlocklistText} onChange={e => setOperationBlocklistText(e.target.value)} placeholder={'DELETE /users/{id}\nPOST /payments'} helperText="每行一个 METHOD path。" />
            </Box>
            <TextField
              size="small"
              label="接口风险覆盖 JSON"
              multiline
              minRows={5}
              value={riskOverridesText}
              onChange={e => setRiskOverridesText(e.target.value)}
              placeholder={RISK_OVERRIDES_EXAMPLE}
              helperText="用于人工指定接口风险等级：low / medium / high / blocked。"
              sx={CODE_FIELD_SX}
            />
            <Button
              size="small"
              variant="text"
              startIcon={<ContentPasteOutlined fontSize="small" />}
              onClick={() => setRiskOverridesText(RISK_OVERRIDES_EXAMPLE)}
              sx={{ alignSelf: 'flex-start' }}
            >
              填入风险覆盖示例
            </Button>
          </Stack>
        </Paper>
      )}

      {configSection === 'dependencies' && (
        <Paper sx={PANEL_SX}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" fontWeight={800}>认证与前后置依赖</Typography>
              <Typography variant="caption" color="text.secondary">
                Agent 生成模块/接口测试 DSL 时，会把前置步骤、认证配置和清理步骤写入脚本。
              </Typography>
            </Box>
            <Alert severity={dependencyConfigInsight.invalid ? 'error' : dependencyConfigInsight.missingRefs.length ? 'warning' : 'success'}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  <Chip size="small" label={`认证：${dependencyConfigInsight.auth.value.type || '未配置'}`} variant="outlined" />
                  <Chip size="small" label={`前置步骤 ${dependencyConfigInsight.setup.value.length}`} variant="outlined" />
                  <Chip size="small" label={`清理步骤 ${dependencyConfigInsight.cleanup.value.length}`} variant="outlined" />
                  <Chip size="small" label={`环境变量 ${Object.keys(dependencyConfigInsight.variables.value || {}).length}`} variant="outlined" />
                  <Chip size="small" label={`提取变量 ${dependencyConfigInsight.extracted.length}`} variant="outlined" />
                </Stack>
                {dependencyConfigInsight.invalid && (
                  <Typography variant="caption">认证、前置、清理或环境变量 JSON 存在格式错误，请先修正后保存。</Typography>
                )}
                {!dependencyConfigInsight.invalid && !!dependencyConfigInsight.missingRefs.length && (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                    <Typography variant="caption">
                      缺少环境变量：{dependencyConfigInsight.missingRefs.join('、')}。这些变量会影响执行时的模板替换。
                    </Typography>
                    <Button size="small" variant="outlined" onClick={fillMissingVariables}>补齐缺失变量</Button>
                  </Stack>
                )}
                {!dependencyConfigInsight.invalid && !dependencyConfigInsight.missingRefs.length && (
                  <Typography variant="caption">变量引用已能从环境变量或前置步骤提取中解析。</Typography>
                )}
              </Stack>
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              <Box sx={OUTLINED_BLOCK_SX}>
                <Stack spacing={1.25}>
                  <Typography variant="body2" fontWeight={800}>认证向导</Typography>
                  <FormControl size="small">
                    <InputLabel>认证方式</InputLabel>
                    <Select
                      label="认证方式"
                      value={authWizard.type}
                      onChange={(event) => setAuthWizard((current) => ({ ...current, type: event.target.value }))}
                    >
                      {AUTH_TYPE_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {authWizard.type === 'bearer' && (
                    <>
                      <TextField size="small" label="Token 变量名" value={authWizard.tokenVariable} onChange={(event) => setAuthWizard((current) => ({ ...current, tokenVariable: event.target.value }))} />
                      <TextField size="small" label="Header 名称" value={authWizard.headerName} onChange={(event) => setAuthWizard((current) => ({ ...current, headerName: event.target.value }))} />
                    </>
                  )}
                  {authWizard.type.startsWith('api_key') && (
                    <>
                      <TextField size="small" label="Key 名称" value={authWizard.apiKeyName} onChange={(event) => setAuthWizard((current) => ({ ...current, apiKeyName: event.target.value }))} />
                      <TextField size="small" label="值变量名" value={authWizard.apiKeyVariable} onChange={(event) => setAuthWizard((current) => ({ ...current, apiKeyVariable: event.target.value }))} />
                    </>
                  )}
                  {authWizard.type === 'basic' && (
                    <TextField size="small" label="Basic 编码变量名" value={authWizard.basicVariable} onChange={(event) => setAuthWizard((current) => ({ ...current, basicVariable: event.target.value }))} />
                  )}
                  <Button size="small" variant="contained" onClick={applyAuthWizard}>应用认证配置</Button>
                </Stack>
              </Box>
              <Box sx={OUTLINED_BLOCK_SX}>
                <Stack spacing={1.25}>
                  <Typography variant="body2" fontWeight={800}>登录前置模板</Typography>
                  <TextField size="small" label="登录接口 Path" value={setupWizard.path} onChange={(event) => setSetupWizard((current) => ({ ...current, path: event.target.value }))} />
                  <TextField size="small" label="Token JSON 路径" value={setupWizard.tokenPath} onChange={(event) => setSetupWizard((current) => ({ ...current, tokenPath: event.target.value }))} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <TextField size="small" label="用户名变量" value={setupWizard.usernameVariable} onChange={(event) => setSetupWizard((current) => ({ ...current, usernameVariable: event.target.value }))} />
                    <TextField size="small" label="密码变量" value={setupWizard.passwordVariable} onChange={(event) => setSetupWizard((current) => ({ ...current, passwordVariable: event.target.value }))} />
                  </Box>
                  <Button size="small" variant="contained" onClick={applyLoginSetupWizard}>生成登录前置</Button>
                </Stack>
              </Box>
              <Box sx={OUTLINED_BLOCK_SX}>
                <Stack spacing={1.25}>
                  <Typography variant="body2" fontWeight={800}>清理步骤模板</Typography>
                  <TextField size="small" label="步骤名称" value={cleanupWizard.name} onChange={(event) => setCleanupWizard((current) => ({ ...current, name: event.target.value }))} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 1 }}>
                    <FormControl size="small">
                      <InputLabel>方法</InputLabel>
                      <Select
                        label="方法"
                        value={cleanupWizard.method}
                        onChange={(event) => setCleanupWizard((current) => ({ ...current, method: event.target.value }))}
                      >
                        {['DELETE', 'POST', 'PATCH', 'PUT'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <TextField size="small" label="清理 Path" value={cleanupWizard.path} onChange={(event) => setCleanupWizard((current) => ({ ...current, path: event.target.value }))} />
                  </Box>
                  <Button size="small" variant="contained" onClick={applyCleanupWizard}>生成清理步骤</Button>
                </Stack>
              </Box>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField
                size="small"
                label="认证配置 JSON"
                multiline
                minRows={10}
                value={authConfigText}
                onChange={e => setAuthConfigText(e.target.value)}
                placeholder={AUTH_CONFIG_EXAMPLE}
                helperText="支持 none / bearer / api_key / basic。"
                sx={CODE_FIELD_SX}
              />
              <TextField
                size="small"
                label="前置步骤 JSON"
                multiline
                minRows={10}
                value={setupStepsText}
                onChange={e => setSetupStepsText(e.target.value)}
                placeholder={SETUP_STEPS_EXAMPLE}
                helperText="用于登录、初始化数据、变量提取。"
                sx={CODE_FIELD_SX}
              />
            </Box>
            <TextField
              size="small"
              label="清理步骤 JSON"
              multiline
              minRows={7}
              value={cleanupStepsText}
              onChange={e => setCleanupStepsText(e.target.value)}
              placeholder={CLEANUP_STEPS_EXAMPLE}
              helperText="用于测试后清理数据；主流程失败时仍会尽量执行。"
              sx={CODE_FIELD_SX}
            />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="text"
                startIcon={<ContentPasteOutlined fontSize="small" />}
                onClick={() => setAuthConfigText(AUTH_CONFIG_EXAMPLE)}
              >
                填入认证示例
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<ContentPasteOutlined fontSize="small" />}
                onClick={() => setSetupStepsText(SETUP_STEPS_EXAMPLE)}
              >
                填入前置步骤示例
              </Button>
              <Button
                size="small"
                variant="text"
                startIcon={<ContentPasteOutlined fontSize="small" />}
                onClick={() => setCleanupStepsText(CLEANUP_STEPS_EXAMPLE)}
              >
                填入清理步骤示例
              </Button>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
