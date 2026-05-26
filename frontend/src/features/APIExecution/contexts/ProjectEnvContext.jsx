import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import {
  formatLineList,
  parseJsonArrayText,
  parseJsonObjectText,
  parseLineList,
  normalizeTimeoutMs,
  normalizeNonNegativeInt,
  validateBaseUrl,
} from '../utils';
import { useUIContext } from './UIContext';

// Hooks
import { 
  useExecProjects, 
  useExecEnvironments,
  useSaveProjectMutation,
  useDeleteProjectMutation,
  useSaveEnvironmentMutation,
  useDeleteEnvironmentMutation
} from '../hooks/useAPIExecutionQueries';

const ProjectEnvContext = createContext();

export const useProjectEnvContext = () => {
  const ctx = useContext(ProjectEnvContext);
  if (!ctx) throw new Error('useProjectEnvContext must be used within a ProjectEnvProvider');
  return ctx;
};

export const ProjectEnvProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const { setLoading: setGlobalLoading, requestConfirm } = useUIContext();

  // 选中的 ID 依然作为组件状态
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  
  // 表单状态
  const [projectName, setProjectName] = useState('OpenMelon');
  const [environmentName, setEnvironmentName] = useState('本地测试');
  const [environmentType, setEnvironmentType] = useState('test');
  const [environmentVariablesText, setEnvironmentVariablesText] = useState('{}');
  const [environmentTimeoutMs, setEnvironmentTimeoutMs] = useState('30000');
  const [baseUrl, setBaseUrl] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [globalHeadersText, setGlobalHeadersText] = useState('{\n  "Accept": "application/json"\n}');
  const [continueOnFailure] = useState(true);
  const [allowAiExecution, setAllowAiExecution] = useState(false);
  const [allowAiRepair, setAllowAiRepair] = useState(false);
  const [allowScheduledExecution, setAllowScheduledExecution] = useState(false);
  const [allowAiGenerateDsl, setAllowAiGenerateDsl] = useState(true);
  const [allowOverwriteHistory, setAllowOverwriteHistory] = useState(true);
  const [maxAutoRepairs, setMaxAutoRepairs] = useState('0');
  const [maxReruns, setMaxReruns] = useState('0');
  const [maxRequestsPerRun, setMaxRequestsPerRun] = useState('0');
  const [riskOverridesText, setRiskOverridesText] = useState('{}');
  const [operationAllowlistText, setOperationAllowlistText] = useState('');
  const [operationBlocklistText, setOperationBlocklistText] = useState('');
  const [authConfigText, setAuthConfigText] = useState('{}');
  const [setupStepsText, setSetupStepsText] = useState('[]');
  const [cleanupStepsText, setCleanupStepsText] = useState('[]');

  // 使用 TanStack Query
  const { data: projects = [], isFetched: projectsFetched } = useExecProjects();
  const { data: environments = [] } = useExecEnvironments(selectedProjectId);
  
  const saveProjectMutation = useSaveProjectMutation();
  const deleteProjectMutation = useDeleteProjectMutation();
  const saveEnvMutation = useSaveEnvironmentMutation(selectedProjectId);
  const deleteEnvMutation = useDeleteEnvironmentMutation(selectedProjectId);

  const applyProjectValues = (project) => {
    if (!project) return;
    setSelectedProjectId(project.project_id || '');
    setSelectedEnvironmentId('');
    setProjectName(project.name || 'OpenMelon');
    setAllowAiExecution(Boolean(project.allow_ai_execution));
    setAllowAiRepair(Boolean(project.allow_ai_repair));
    setAllowScheduledExecution(Boolean(project.allow_scheduled_execution));
    setAllowAiGenerateDsl(project.allow_ai_generate_dsl !== false);
    setAllowOverwriteHistory(project.allow_overwrite_history !== false);
    setMaxAutoRepairs(String(project.max_auto_repairs || 0));
    setMaxReruns(String(project.max_reruns || 0));
    setMaxRequestsPerRun(String(project.max_requests_per_run || 0));
    setRiskOverridesText(JSON.stringify(project.risk_overrides || {}, null, 2));
    setOperationAllowlistText(formatLineList(project.operation_allowlist));
    setOperationBlocklistText(formatLineList(project.operation_blocklist));
    setAuthConfigText(JSON.stringify(project.auth_config || {}, null, 2));
    setSetupStepsText(JSON.stringify(project.setup_steps || [], null, 2));
    setCleanupStepsText(JSON.stringify(project.cleanup_steps || [], null, 2));
  };

  const applyEnvironmentValues = (environment) => {
    if (!environment) return;
    setSelectedEnvironmentId(environment.environment_id || '');
    setEnvironmentName(environment.name || '本地测试');
    setEnvironmentType(environment.environment_type || 'test');
    setBaseUrl(environment.base_url || '');
    setGlobalHeadersText(JSON.stringify(environment.headers || {}, null, 2));
    setEnvironmentVariablesText(JSON.stringify(environment.variables || {}, null, 2));
    setEnvironmentTimeoutMs(String(environment.timeout_ms || 30000));
  };

  // 初始化加载：默认选中第一个项目和首选环境
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      applyProjectValues(projects[0]);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (environments.length > 0) {
      const project = projects.find(p => p.project_id === selectedProjectId);
      const current = environments.find(e => e.environment_id === selectedEnvironmentId);
      if (!current) {
        const preferred = environments.find(e => e.environment_id === project?.default_environment_id) || environments[0];
        applyEnvironmentValues(preferred);
      }
    }
  }, [environments, selectedEnvironmentId, selectedProjectId, projects]);

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;
    const projectLabel = projectName.trim() || '当前项目';
    if (!await requestConfirm(`确认删除「${projectLabel}」？`)) return;
    
    await deleteProjectMutation.mutateAsync(selectedProjectId);
    setSelectedProjectId(''); // 重置选中，让 useEffect 自动去选下一个
  };

  const handleDeleteEnvironment = async () => {
    if (!selectedEnvironmentId) return;
    const envLabel = environmentName.trim() || '当前环境';
    if (!await requestConfirm(`确认删除「${envLabel}」？`)) return;
    
    await deleteEnvMutation.mutateAsync(selectedEnvironmentId);
    setSelectedEnvironmentId('');
  };

  const parseGlobalHeaders = () => {
    const raw = globalHeadersText.trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  };

  const parseEnvironmentVariables = () => {
    const raw = environmentVariablesText.trim();
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  };

  const parseAuthConfig = () => parseJsonObjectText(authConfigText, {});
  const parseSetupSteps = () => parseJsonArrayText(setupStepsText, []);
  const parseCleanupSteps = () => parseJsonArrayText(cleanupStepsText, []);

  const buildProjectPolicySnapshot = () => ({
    project_id: selectedProjectId || '',
    name: projectName.trim() || 'OpenMelon',
    allow_ai_execution: allowAiExecution,
    allow_ai_repair: allowAiRepair,
    allow_scheduled_execution: allowScheduledExecution,
    allow_ai_generate_dsl: allowAiGenerateDsl,
    allow_overwrite_history: allowOverwriteHistory,
    max_auto_repairs: normalizeNonNegativeInt(maxAutoRepairs),
    max_reruns: normalizeNonNegativeInt(maxReruns),
    max_requests_per_run: normalizeNonNegativeInt(maxRequestsPerRun),
    risk_overrides: parseJsonObjectText(riskOverridesText, {}),
    operation_allowlist: parseLineList(operationAllowlistText),
    operation_blocklist: parseLineList(operationBlocklistText),
    auth_config: parseAuthConfig(),
    setup_steps: parseSetupSteps(),
    cleanup_steps: parseCleanupSteps(),
  });

  const buildEnvironmentSnapshot = (headers, variables) => ({
    environment_id: selectedEnvironmentId || '',
    project_id: selectedProjectId || '',
    name: environmentName.trim() || '本地测试',
    environment_type: environmentType,
    base_url: baseUrl.trim(),
    headers,
    variables,
    timeout_ms: normalizeTimeoutMs(environmentTimeoutMs),
    continue_on_failure: continueOnFailure,
  });

  const applyAuthConfigToHeaders = (headers, variables) => {
    const authConfig = parseAuthConfig();
    const type = String(authConfig.type || 'none').toLowerCase();
    if (!type || type === 'none') return headers;
    const next = { ...headers };
    const tokenFrom = (valueKey, variableKey) => {
      const variableName = String(authConfig[variableKey] || '').trim();
      if (variableName) return variables[variableName] || `{{${variableName}}}`;
      return String(authConfig[valueKey] || '').trim();
    };
    if (type === 'bearer') {
      const token = tokenFrom('token', 'token_variable');
      if (token) {
        const prefix = authConfig.prefix === undefined ? 'Bearer' : String(authConfig.prefix || '').trim();
        next[authConfig.header_name || 'Authorization'] = `${prefix} ${token}`.trim();
      }
    } else if (type === 'api_key' && String(authConfig.in || authConfig.api_key_in || 'header').toLowerCase() !== 'query') {
      const name = String(authConfig.name || authConfig.api_key_name || '').trim();
      const value = tokenFrom('value', 'value_variable');
      if (name && value) next[name] = value;
    } else if (type === 'basic') {
      const encoded = tokenFrom('encoded', 'encoded_variable');
      if (encoded) next[authConfig.header_name || 'Authorization'] = `Basic ${encoded}`;
    }
    return next;
  };

  const buildProjectPayload = (projectId, name, spec) => ({
    project_id: projectId || undefined,
    name,
    description: spec?.info?.description || '',
    default_environment_id: selectedEnvironmentId,
    spec_id: spec?.spec_id || undefined,
    enabled: true,
    allow_ai_execution: allowAiExecution,
    allow_ai_repair: allowAiRepair,
    allow_scheduled_execution: allowScheduledExecution,
    allow_ai_generate_dsl: allowAiGenerateDsl,
    allow_overwrite_history: allowOverwriteHistory,
    max_auto_repairs: normalizeNonNegativeInt(maxAutoRepairs),
    max_reruns: normalizeNonNegativeInt(maxReruns),
    max_requests_per_run: normalizeNonNegativeInt(maxRequestsPerRun),
    risk_overrides: parseJsonObjectText(riskOverridesText, {}),
    operation_allowlist: parseLineList(operationAllowlistText),
    operation_blocklist: parseLineList(operationBlocklistText),
    auth_config: parseAuthConfig(),
    setup_steps: parseSetupSteps(),
    cleanup_steps: parseCleanupSteps(),
  });

  const saveCurrentEnvironment = async (spec) => {
    const headers = parseGlobalHeaders();
    if (headers === null) {
      showSnackbar('全局请求头格式不正确', { severity: 'error' });
      return;
    }
    const nextProjectName = projectName.trim() || spec?.info?.title || 'OpenMelon';
    setGlobalLoading(true);
    
    try {
      // 1. 保存/创建项目
      const project = await saveProjectMutation.mutateAsync(buildProjectPayload(selectedProjectId, nextProjectName, spec));
      const projectId = project.project_id;
      
      // 2. 保存/创建环境
      const environmentPayload = {
        environment_id: selectedEnvironmentId || undefined,
        name: environmentName.trim() || '本地测试',
        environment_type: environmentType,
        base_url: baseUrl.trim(),
        headers,
        variables: parseEnvironmentVariables(),
        timeout_ms: normalizeTimeoutMs(environmentTimeoutMs),
        continue_on_failure: continueOnFailure,
        enabled: true,
      };
      const env = await saveEnvMutation.mutateAsync({ envId: selectedEnvironmentId, payload: environmentPayload });
      
      // 3. 将环境设为项目默认
      await saveProjectMutation.mutateAsync({
        ...buildProjectPayload(projectId, nextProjectName, spec),
        default_environment_id: env.environment_id
      });
      
      showSnackbar('运行配置已保存', { severity: 'success' });
    } catch (error) {
      showSnackbar(error.message || '保存失败', { severity: 'error' });
    } finally {
      setGlobalLoading(false);
    }
  };

  const buildRunOptions = (script, extraOptions = {}) => {
    const globalHeaders = parseGlobalHeaders();
    if (globalHeaders === null) return null;
    const environmentVariables = parseEnvironmentVariables();
    const resolvedBaseUrl = extraOptions.base_url || baseUrl.trim() || script.base_url;
    const baseUrlCheck = validateBaseUrl(resolvedBaseUrl);
    if (!baseUrlCheck.ok) {
      showSnackbar(baseUrlCheck.message, { severity: 'warning' });
      return null;
    }
    const token = bearerToken.trim();
    if (token) {
      globalHeaders.Authorization = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
    }
    const authHeaders = applyAuthConfigToHeaders(globalHeaders, environmentVariables);
    return {
      project_id: selectedProjectId || undefined,
      environment_id: selectedEnvironmentId || undefined,
      environment_variables: environmentVariables,
      environment_snapshot: buildEnvironmentSnapshot(authHeaders, environmentVariables),
      project_policy_snapshot: buildProjectPolicySnapshot(),
      base_url: baseUrlCheck.value,
      global_headers: authHeaders,
      continue_on_failure: continueOnFailure,
      timeout_ms: normalizeTimeoutMs(environmentTimeoutMs),
      approved_high_risk: Boolean(script.agent_high_risk_approved),
      ...extraOptions,
    };
  };

  const restoreProjectSnapshot = useCallback((snapshot) => {
    if (snapshot) applyProjectValues(snapshot);
  }, [applyProjectValues]);

  const restoreEnvironmentSnapshot = useCallback((snapshot) => {
    if (snapshot) applyEnvironmentValues(snapshot);
  }, [applyEnvironmentValues]);

  const value = useMemo(() => ({
    projects, projectsFetched, environments,
    selectedProjectId, setSelectedProjectId,
    selectedEnvironmentId, setSelectedEnvironmentId,
    projectName, setProjectName,
    environmentName, setEnvironmentName,
    environmentType, setEnvironmentType,
    environmentVariablesText, setEnvironmentVariablesText,
    environmentTimeoutMs, setEnvironmentTimeoutMs,
    baseUrl, setBaseUrl,
    bearerToken, setBearerToken,
    globalHeadersText, setGlobalHeadersText,
    continueOnFailure,
    allowAiExecution, setAllowAiExecution,
    allowAiRepair, setAllowAiRepair,
    allowScheduledExecution, setAllowScheduledExecution,
    allowAiGenerateDsl, setAllowAiGenerateDsl,
    allowOverwriteHistory, setAllowOverwriteHistory,
    maxAutoRepairs, setMaxAutoRepairs,
    maxReruns, setMaxReruns,
    maxRequestsPerRun, setMaxRequestsPerRun,
    riskOverridesText, setRiskOverridesText,
    operationAllowlistText, setOperationAllowlistText,
    operationBlocklistText, setOperationBlocklistText,
    authConfigText, setAuthConfigText,
    setupStepsText, setSetupStepsText,
    cleanupStepsText, setCleanupStepsText,
    applyProjectValues,
    applyEnvironmentValues,
    restoreProjectSnapshot,
    restoreEnvironmentSnapshot,
    handleDeleteProject,
    handleDeleteEnvironment,
    buildProjectPayload,
    buildRunOptions,
    saveCurrentEnvironment,
    buildProjectPolicySnapshot,
  }), [projects, projectsFetched, environments, selectedProjectId, selectedEnvironmentId, projectName, environmentName, environmentType, environmentVariablesText, environmentTimeoutMs, baseUrl, bearerToken, globalHeadersText, allowAiExecution, allowAiRepair, allowScheduledExecution, allowAiGenerateDsl, allowOverwriteHistory, maxAutoRepairs, maxReruns, maxRequestsPerRun, riskOverridesText, operationAllowlistText, operationBlocklistText, authConfigText, setupStepsText, cleanupStepsText]);

  return (
    <ProjectEnvContext.Provider value={value}>
      {children}
    </ProjectEnvContext.Provider>
  );
};
