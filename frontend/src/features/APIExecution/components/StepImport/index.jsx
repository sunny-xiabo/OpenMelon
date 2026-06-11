import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, Typography, Paper, Box, Button, TextField, Checkbox, Alert, Chip, Divider, CircularProgress, Tabs, Tab } from '@mui/material';
import { CloudUploadOutlined, ContentPasteOutlined, AutoAwesome, RocketLaunch, SyncAltOutlined, SaveOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../../context';
import { useSnackbar } from '../../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../../api/execution';
import { NEW_PROJECT_VALUE } from '../../constants';
import { EXEC_KEYS, useProjectAssets } from '../../hooks/useAPIExecutionQueries';
import StageHeader from '../StageHeader';
import {
  ACTIVE_INTERFACE_STATUSES, AI_BOUNDARY_OPTIONS, CONFIG_SECTION_META,
  PANEL_SX, RISK_OVERRIDES_EXAMPLE,
  parseConfigText, stringifyConfig, buildAuthConfigFromWizard, buildDependencyConfigInsight, upsertStepById,
} from './constants';
import EnvironmentConfig from './EnvironmentConfig';
import AuthConfig from './AuthConfig';
import SetupStepsConfig from './SetupStepsConfig';

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
    setLoading, setLoadingMessage, requestConfirm,
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
      type: nextType,
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
    const confirmed = await requestConfirm([
      '初始化/重置演示项目会写入固定 Demo 项目、Demo 环境和 3 条执行样例。',
      '系统只会生成待确认知识候选，不会自动沉淀到知识库。',
      '如果 Demo 项目已存在，项目和环境配置会按演示模板更新。是否继续？',
    ].join('\n\n'));
    if (!confirmed) return;
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
        `Demo 项目已初始化：${data.seeded_run_ids?.length || 0} 条执行样例，${data.knowledge_candidate_count || 0} 条知识候选待确认`,
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
              minHeight: 40,
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
                background: 'linear-gradient(90deg, #4f46e5 0%, #8b5cf6 100%)',
              },
              '& .MuiTab-root': {
                minHeight: 40,
                px: { xs: 1.25, md: 2.25 },
                fontWeight: 800,
                fontSize: '12px',
                textTransform: 'none',
                color: 'text.secondary',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                '&.Mui-selected': {
                  color: '#4f46e5',
                },
                '&:hover': {
                  color: 'text.primary',
                },
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
          <EnvironmentConfig
            projects={projects}
            selectedProjectId={selectedProjectId}
            applyProjectValues={applyProjectValues}
            loadProjectSpec={loadProjectSpec}
            environments={environments}
            selectedEnvironmentId={selectedEnvironmentId}
            applyEnvironmentValues={applyEnvironmentValues}
            projectAssets={projectAssets}
            activeInterfaceCount={activeInterfaceCount}
            latestDiff={latestDiff}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            environmentVariablesText={environmentVariablesText}
            setEnvironmentVariablesText={setEnvironmentVariablesText}
            showSnackbar={showSnackbar}
          />
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
                p: 4,
                borderRadius: 4.5,
                border: '2.5px dashed rgba(99, 102, 241, 0.35)',
                bgcolor: 'rgba(255, 255, 255, 0.45)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease-in-out',
                position: 'relative',
                overflow: 'hidden',
                '&:hover': {
                  borderColor: 'transparent',
                  bgcolor: 'rgba(99, 102, 241, 0.04)',
                  transform: 'translateY(-1.5px)',
                  boxShadow: '0 12px 40px rgba(99, 102, 241, 0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
                  '& .dash-border-svg': {
                    opacity: 1,
                  }
                },
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                setSelectedFile(event.dataTransfer.files?.[0] || null);
              }}
            >
              <svg className="dash-border-svg" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0, transition: 'opacity 0.3s' }}>
                <rect x="2" y="2" width="calc(100% - 4px)" height="calc(100% - 4px)" rx="18" fill="transparent" stroke="url(#blue-gradient)" strokeWidth="3" strokeDasharray="10 8" style={{ animation: 'borderDashMove 20s linear infinite' }} />
                <defs>
                  <linearGradient id="blue-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
              </svg>
              <style>{`
                @keyframes borderDashMove {
                  from { stroke-dashoffset: 0; }
                  to { stroke-dashoffset: 1000; }
                }
              `}</style>
              <Stack spacing={1.5} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
                <CloudUploadOutlined color="primary" sx={{ fontSize: 44, color: '#4f46e5', filter: 'drop-shadow(0 2px 8px rgba(79,70,229,0.15))' }} />
                <Typography variant="subtitle1" fontWeight={900} sx={{ color: 'text.primary', letterSpacing: '-0.01em' }}>拖拽规范文件或点击选择</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>JSON / YAML / HAR / Markdown / Office 文档</Typography>
                <input ref={fileInputRef} type="file" accept=".json,.yaml,.yml,.har,.md,.txt,.csv,.html,.htm,.docx,.xlsx,.xls" hidden onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
              </Stack>
            </Box>

            {selectedFile && (
              <Alert
                severity="success"
                sx={{ borderRadius: 3.5 }}
                action={<Button variant="contained" color="success" size="small" onClick={parseFile} sx={{ borderRadius: 2, fontWeight: 800 }}>解析文件</Button>}
              >
                {selectedFile.name}
              </Alert>
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<AutoAwesome fontSize="small" />}
                onClick={loadDemoOpenApi}
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  borderRadius: 3.5,
                  p: 2.2,
                  borderColor: 'rgba(0,0,0,0.06)',
                  bgcolor: '#ffffff',
                  color: 'text.primary',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
                  '&:hover': {
                    borderColor: '#4f46e5',
                    bgcolor: 'rgba(79, 70, 229, 0.02)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s'
                }}
              >
                仅加载演示接口资产
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<RocketLaunch fontSize="small" />}
                onClick={bootstrapDemoProject}
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  borderRadius: 3.5,
                  p: 2.2,
                  borderColor: 'rgba(0,0,0,0.06)',
                  bgcolor: '#ffffff',
                  color: 'secondary.main',
                  fontWeight: 800,
                  fontSize: '12.5px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
                  '&:hover': {
                    borderColor: 'secondary.main',
                    bgcolor: 'rgba(156, 39, 176, 0.02)',
                    transform: 'translateY(-1px)',
                  },
                  transition: 'all 0.2s'
                }}
              >
                初始化/重置演示项目
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
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
              {AI_BOUNDARY_OPTIONS.map((item) => {
                const isChecked = Boolean(aiBoundaryValues[item.checkedKey]);
                return (
                  <Box
                    key={item.checkedKey}
                    onClick={() => aiBoundarySetters[item.checkedKey](!isChecked)}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      p: 2,
                      border: isChecked ? '1px solid rgba(16, 185, 129, 0.45)' : '1px solid rgba(15, 23, 42, 0.08)',
                      borderRadius: 3.5,
                      bgcolor: isChecked ? 'rgba(16, 185, 129, 0.04)' : 'rgba(255, 255, 255, 0.45)',
                      backdropFilter: 'blur(10px)',
                      boxShadow: isChecked ? '0 6px 20px rgba(16, 185, 129, 0.06)' : 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer',
                      '&:hover': {
                        border: isChecked ? '1px solid rgba(16, 185, 129, 0.6)' : '1px solid rgba(79, 70, 229, 0.3)',
                        bgcolor: isChecked ? 'rgba(16, 185, 129, 0.08)' : 'rgba(79, 70, 229, 0.03)',
                        transform: 'translateY(-2px)',
                        boxShadow: isChecked ? '0 8px 24px rgba(16, 185, 129, 0.1)' : '0 6px 16px rgba(79, 70, 229, 0.04)',
                      }
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={isChecked}
                      onChange={e => {
                        e.stopPropagation();
                        aiBoundarySetters[item.checkedKey](e.target.checked);
                      }}
                      sx={{
                        mt: -0.5,
                        color: 'rgba(0,0,0,0.15)',
                        '&.Mui-checked': { color: '#10b981' }
                      }}
                    />
                    <Box>
                      <Typography variant="body2" fontWeight={800} sx={{ color: isChecked ? '#065f46' : 'text.primary', transition: 'color 0.2s' }}>{item.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.description}</Typography>
                    </Box>
                  </Box>
                );
              })}
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
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" fontWeight={850} sx={{ color: 'text.primary', mb: 0.5 }}>接口风险覆盖配置</Typography>
              <Box sx={{
                borderRadius: 3.5,
                border: '1px solid #1e293b',
                overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(15,23,42,0.18)',
              }}>
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1.25,
                  bgcolor: '#1e293b',
                  borderBottom: '1px solid #0f172a',
                }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444', opacity: 0.95 }} />
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b', opacity: 0.95 }} />
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', opacity: 0.95 }} />
                  <Typography variant="caption" sx={{ ml: 1.5, fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace', fontSize: '10px' }}>terminal - risk_overrides.json</Typography>
                </Box>
                <TextField
                  fullWidth
                  multiline
                  minRows={5}
                  value={riskOverridesText}
                  onChange={e => setRiskOverridesText(e.target.value)}
                  placeholder={RISK_OVERRIDES_EXAMPLE}
                  sx={{
                    '& .MuiInputBase-root': {
                      borderRadius: 0,
                      bgcolor: '#090d16',
                      color: '#fb7185',
                      fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                      fontSize: '12.5px',
                      p: 2,
                      boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.65)',
                      '& fieldset': { border: 'none' },
                      '&:hover fieldset': { border: 'none' },
                      '&.Mui-focused fieldset': { border: 'none' },
                    },
                    '& .MuiInputBase-input': {
                      color: '#fb7185',
                      fontFamily: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`,
                      lineHeight: 1.6,
                    }
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 0.5, mt: 0.5 }}>
                用于人工指定接口风险等级：low / medium / high / blocked。
              </Typography>
            </Box>
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
            <AuthConfig
              authWizard={authWizard}
              setAuthWizard={setAuthWizard}
              applyAuthWizard={applyAuthWizard}
              authConfigText={authConfigText}
              setAuthConfigText={setAuthConfigText}
            />
            <Divider />
            <SetupStepsConfig
              setupWizard={setupWizard}
              setSetupWizard={setSetupWizard}
              applyLoginSetupWizard={applyLoginSetupWizard}
              cleanupWizard={cleanupWizard}
              setCleanupWizard={setCleanupWizard}
              applyCleanupWizard={applyCleanupWizard}
              setupStepsText={setupStepsText}
              setSetupStepsText={setSetupStepsText}
              cleanupStepsText={cleanupStepsText}
              setCleanupStepsText={setCleanupStepsText}
            />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
