import { createContext, useContext, useEffect, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import {
  formatLineList,
  parseJsonObjectText,
  parseLineList,
  normalizeTimeoutMs,
  normalizeNonNegativeInt,
  maskSensitiveConfig,
  validateBaseUrl,
} from '../utils';
import { useUIContext } from './UIContext';

const ProjectEnvContext = createContext();

export const useProjectEnvContext = () => {
  const ctx = useContext(ProjectEnvContext);
  if (!ctx) throw new Error('useProjectEnvContext must be used within a ProjectEnvProvider');
  return ctx;
};

export const ProjectEnvProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const { setLoading, requestConfirm } = useUIContext();

  const [projects, setProjects] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
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

  const applyProjectValues = (project) => {
    setSelectedProjectId(project.project_id || '');
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
  };

  const applyEnvironmentValues = (environment) => {
    setSelectedEnvironmentId(environment.environment_id || '');
    setEnvironmentName(environment.name || '本地测试');
    setEnvironmentType(environment.environment_type || 'test');
    setBaseUrl(environment.base_url || '');
    setGlobalHeadersText(JSON.stringify(environment.headers || {}, null, 2));
    setEnvironmentVariablesText(JSON.stringify(environment.variables || {}, null, 2));
    setEnvironmentTimeoutMs(String(environment.timeout_ms || 30000));
  };

  const loadEnvironments = async (projectId, projectList = projects) => {
    if (!projectId) {
      setEnvironments([]);
      setSelectedEnvironmentId('');
      return;
    }
    try {
      const data = await apiExecutionAPI.listEnvironments(projectId);
      const nextEnvironments = data.environments || [];
      setEnvironments(nextEnvironments);
      const project = projectList.find((item) => item.project_id === projectId);
      const preferred = nextEnvironments.find((item) => item.environment_id === project?.default_environment_id) || nextEnvironments[0];
      if (preferred) applyEnvironmentValues(preferred);
      else setSelectedEnvironmentId('');
    } catch {
      setEnvironments([]);
      setSelectedEnvironmentId('');
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;
    const projectLabel = projectName.trim() || '当前项目';
    if (!await requestConfirm(`确认删除「${projectLabel}」？该项目下的环境配置也会一并删除。`)) return;
    setLoading(true);
    try {
      await apiExecutionAPI.deleteProject(selectedProjectId);
      const nextProjects = projects.filter((item) => item.project_id !== selectedProjectId);
      setProjects(nextProjects);
      setEnvironments([]);
      setSelectedEnvironmentId('');
      if (nextProjects.length) {
        applyProjectValues(nextProjects[0]);
        await loadEnvironments(nextProjects[0].project_id, nextProjects);
      } else {
        setSelectedProjectId('');
        setProjectName('OpenMelon');
        setEnvironmentName('本地测试');
        setEnvironmentType('test');
        setBaseUrl('');
        setGlobalHeadersText('{\n  "Accept": "application/json"\n}');
        setEnvironmentVariablesText('{}');
        setEnvironmentTimeoutMs('30000');
      }
      showSnackbar('项目已删除', 'success');
    } catch (error) {
      showSnackbar(error.message || '删除项目失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEnvironment = async () => {
    if (!selectedEnvironmentId) return;
    const environmentLabel = environmentName.trim() || '当前环境';
    if (!await requestConfirm(`确认删除「${environmentLabel}」？历史执行记录不会被删除。`)) return;
    setLoading(true);
    try {
      await apiExecutionAPI.deleteEnvironment(selectedEnvironmentId);
      const nextEnvironments = environments.filter((item) => item.environment_id !== selectedEnvironmentId);
      setEnvironments(nextEnvironments);
      if (nextEnvironments.length) applyEnvironmentValues(nextEnvironments[0]);
      else {
        setSelectedEnvironmentId('');
        setEnvironmentName('本地测试');
        setEnvironmentType('test');
        setEnvironmentVariablesText('{}');
        setEnvironmentTimeoutMs('30000');
      }
      showSnackbar('环境已删除', 'success');
    } catch (error) {
      showSnackbar(error.message || '删除环境失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const parseGlobalHeaders = () => {
    const raw = globalHeadersText.trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        showSnackbar('全局请求头需要是 JSON 对象', 'warning');
        return null;
      }
      return parsed;
    } catch {
      showSnackbar('全局请求头 JSON 格式不正确', 'error');
      return null;
    }
  };

  const parseEnvironmentVariables = () => {
    const raw = environmentVariablesText.trim();
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  const buildEnvironmentSnapshot = (headers = {}, variables = {}) => ({
    environment_id: selectedEnvironmentId || '',
    project_id: selectedProjectId || '',
    name: environmentName.trim() || '本地测试',
    environment_type: environmentType,
    base_url: baseUrl.trim(),
    headers: maskSensitiveConfig(headers),
    variables: maskSensitiveConfig(variables),
    timeout_ms: normalizeTimeoutMs(environmentTimeoutMs),
    continue_on_failure: continueOnFailure,
  });

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
  });

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
  });

  const buildRunOptions = (script, extraOptions = {}) => {
    const globalHeaders = parseGlobalHeaders();
    if (globalHeaders === null) return null;
    const environmentVariables = parseEnvironmentVariables();
    const resolvedBaseUrl = extraOptions.base_url || baseUrl.trim() || script.base_url;
    const baseUrlCheck = validateBaseUrl(resolvedBaseUrl);
    if (!baseUrlCheck.ok) {
      showSnackbar(baseUrlCheck.message, 'warning');
      return null;
    }
    const environmentSnapshot = buildEnvironmentSnapshot(globalHeaders, environmentVariables);
    const token = bearerToken.trim();
    if (token) {
      globalHeaders.Authorization = token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`;
    }
    const { base_url: _baseUrl, ...restOptions } = extraOptions;
    return {
      project_id: selectedProjectId || undefined,
      environment_id: selectedEnvironmentId || undefined,
      environment_snapshot: environmentSnapshot,
      project_policy_snapshot: buildProjectPolicySnapshot(),
      environment_variables: environmentVariables,
      base_url: baseUrlCheck.value,
      global_headers: globalHeaders,
      continue_on_failure: continueOnFailure,
      timeout_ms: normalizeTimeoutMs(environmentTimeoutMs),
      flow_template_id: script.flow_template_id || '',
      flow_template_name: script.flow_template_name || '',
      flow_template_tags: script.flow_template_tags || [],
      ...restOptions,
    };
  };

  const saveCurrentEnvironment = async (spec) => {
    const headers = parseGlobalHeaders();
    if (headers === null) return;
    const nextProjectName = projectName.trim() || spec?.info?.title || 'OpenMelon';
    setLoading(true);
    try {
      let projectId = selectedProjectId;
      if (!projectId) {
        const project = await apiExecutionAPI.saveProject(buildProjectPayload('', nextProjectName, spec));
        projectId = project.project_id;
        applyProjectValues(project);
        setProjects((prev) => [project, ...prev.filter((item) => item.project_id !== project.project_id)]);
      } else {
        const project = await apiExecutionAPI.saveProject(buildProjectPayload(projectId, nextProjectName, spec));
        applyProjectValues(project);
        setProjects((prev) => [project, ...prev.filter((item) => item.project_id !== project.project_id)]);
      }
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
      const environment = selectedEnvironmentId
        ? await apiExecutionAPI.updateEnvironment(selectedEnvironmentId, environmentPayload)
        : await apiExecutionAPI.saveEnvironment(projectId, environmentPayload);
      setSelectedEnvironmentId(environment.environment_id);
      const savedProject = await apiExecutionAPI.saveProject({
        ...buildProjectPayload(projectId, nextProjectName, spec),
        default_environment_id: environment.environment_id,
      });
      applyProjectValues(savedProject);
      const nextProjects = [savedProject, ...projects.filter((item) => item.project_id !== savedProject.project_id)];
      setProjects(nextProjects);
      await loadEnvironments(projectId, nextProjects);
      showSnackbar('当前运行配置已保存为环境', 'success');
    } catch (error) {
      showSnackbar(error.message || '保存环境失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Restore from a snapshot (used by loadRunIntoEditor)
  const restoreProjectSnapshot = (snapshot) => {
    if (snapshot.name) setProjectName(snapshot.name);
    if (snapshot.allow_ai_execution !== undefined) setAllowAiExecution(Boolean(snapshot.allow_ai_execution));
    if (snapshot.allow_ai_repair !== undefined) setAllowAiRepair(Boolean(snapshot.allow_ai_repair));
    if (snapshot.allow_scheduled_execution !== undefined) setAllowScheduledExecution(Boolean(snapshot.allow_scheduled_execution));
    if (snapshot.allow_ai_generate_dsl !== undefined) setAllowAiGenerateDsl(Boolean(snapshot.allow_ai_generate_dsl));
    if (snapshot.allow_overwrite_history !== undefined) setAllowOverwriteHistory(Boolean(snapshot.allow_overwrite_history));
    setMaxAutoRepairs(String(snapshot.max_auto_repairs || 0));
    setMaxReruns(String(snapshot.max_reruns || 0));
    setMaxRequestsPerRun(String(snapshot.max_requests_per_run || 0));
    setRiskOverridesText(JSON.stringify(snapshot.risk_overrides || {}, null, 2));
    setOperationAllowlistText(formatLineList(snapshot.operation_allowlist));
    setOperationBlocklistText(formatLineList(snapshot.operation_blocklist));
  };

  const restoreEnvironmentSnapshot = (snapshot) => {
    if (snapshot.name) setEnvironmentName(snapshot.name);
    if (snapshot.environment_type) setEnvironmentType(snapshot.environment_type);
    if (snapshot.headers) setGlobalHeadersText(JSON.stringify(snapshot.headers || {}, null, 2));
    if (snapshot.variables) setEnvironmentVariablesText(JSON.stringify(snapshot.variables || {}, null, 2));
    if (snapshot.timeout_ms) setEnvironmentTimeoutMs(String(snapshot.timeout_ms));
  };

  // Initial project load
  useEffect(() => {
    apiExecutionAPI.listProjects()
      .then((data) => {
        const nextProjects = data.projects || [];
        setProjects(nextProjects);
        if (nextProjects.length) {
          applyProjectValues(nextProjects[0]);
          loadEnvironments(nextProjects[0].project_id, nextProjects);
        }
      })
      .catch((err) => { console.error('Failed to load projects:', err); setProjects([]); });
  }, []);

  const value = {
    projects, setProjects,
    environments, setEnvironments,
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
    applyProjectValues,
    applyEnvironmentValues,
    loadEnvironments,
    handleDeleteProject,
    handleDeleteEnvironment,
    parseGlobalHeaders,
    parseEnvironmentVariables,
    buildEnvironmentSnapshot,
    buildProjectPolicySnapshot,
    buildProjectPayload,
    buildRunOptions,
    saveCurrentEnvironment,
    restoreProjectSnapshot,
    restoreEnvironmentSnapshot,
  };

  return (
    <ProjectEnvContext.Provider value={value}>
      {children}
    </ProjectEnvContext.Provider>
  );
};
