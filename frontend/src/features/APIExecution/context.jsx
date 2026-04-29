import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSnackbar } from '../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../api/execution';
import {
  BATCH_RUN_MAX_STEPS,
  BATCH_STEP_TIMEOUT_MS,
  BATCH_REQUEST_TIMEOUT_MS,
  BACKGROUND_STEP_TIMEOUT_MS,
  BACKGROUND_RUN_TIMEOUT_MS,
  NEW_PROJECT_VALUE,
  NEW_ENVIRONMENT_VALUE
} from './constants';
import {
  getTagNames,
  buildReportFilename,
  buildDownloadTimestamp,
  validateBaseUrl,
  downloadBlob,
  mergeScriptVariables,
  toRunRequestOptions,
  formatLineList,
  parseJsonObjectText,
  parseLineList,
  normalizeTimeoutMs,
  normalizeNonNegativeInt,
  maskSensitiveConfig
} from './utils';

const APIExecutionContext = createContext();

export const useAPIExecution = () => {
  const context = useContext(APIExecutionContext);
  if (!context) {
    throw new Error('useAPIExecution must be used within an APIExecutionProvider');
  }
  return context;
};

export const APIExecutionProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const fileInputRef = useRef(null);
  const [activeStep, setActiveStep] = useState(0);
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [spec, setSpec] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [selectedOperationIds, setSelectedOperationIds] = useState(new Set());
  const [dslText, setDslText] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [bearerToken, setBearerToken] = useState('');
  const [globalHeadersText, setGlobalHeadersText] = useState('{\n  "Accept": "application/json"\n}');
  const [continueOnFailure] = useState(true);
  const [runResult, setRunResult] = useState(null);
  const [runReport, setRunReport] = useState(null);
  const [projects, setProjects] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState('');
  const [projectName, setProjectName] = useState('OpenMelon');
  const [environmentName, setEnvironmentName] = useState('本地测试');
  const [environmentType, setEnvironmentType] = useState('test');
  const [environmentVariablesText, setEnvironmentVariablesText] = useState('{}');
  const [environmentTimeoutMs, setEnvironmentTimeoutMs] = useState('30000');
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
  const [assertionStepId, setAssertionStepId] = useState('');
  const [runStepId, setRunStepId] = useState('');
  const [assertionType, setAssertionType] = useState('status_code_in');
  const [assertionExpected, setAssertionExpected] = useState('200');
  const [runHistory, setRunHistory] = useState([]);
  const [automationTasks, setAutomationTasks] = useState([]);
  const [runHistoryProjectId, setRunHistoryProjectId] = useState('');
  const [runHistoryStatus, setRunHistoryStatus] = useState('');
  const [runHistoryKeyword, setRunHistoryKeyword] = useState('');
  const [backgroundRunId, setBackgroundRunId] = useState('');
  const [backgroundRunStatus, setBackgroundRunStatus] = useState('');
  const [aiPatch, setAiPatch] = useState(null);

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
    if (!window.confirm(`确认删除「${projectLabel}」？该项目下的环境配置也会一并删除。`)) return;
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
        setProjectName(spec?.info?.title || 'OpenMelon');
        setEnvironmentName('本地测试');
        setEnvironmentType('test');
        setBaseUrl('');
        setGlobalHeadersText('{\n  "Accept": "application/json"\n}');
        setEnvironmentVariablesText('{}');
        setEnvironmentTimeoutMs('30000');
      }
      showSnackbar('项目已删除', 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '删除项目失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEnvironment = async () => {
    if (!selectedEnvironmentId) return;
    const environmentLabel = environmentName.trim() || '当前环境';
    if (!window.confirm(`确认删除「${environmentLabel}」？历史执行记录不会被删除。`)) return;
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
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '删除环境失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await apiExecutionAPI.listRuns({
        limit: 10,
        status: runHistoryStatus,
        keyword: runHistoryKeyword.trim(),
        projectId: runHistoryProjectId,
      });
      setRunHistory(data.runs || []);
      const tasksData = await apiExecutionAPI.listAutomationTasks({
        limit: 10,
        status: 'pending',
        projectId: runHistoryProjectId,
      });
      setAutomationTasks(tasksData.tasks || []);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [runHistoryProjectId, runHistoryStatus]);

  const handleDeleteRun = async (runId) => {
    try {
      await apiExecutionAPI.deleteRun(runId);
      showSnackbar('执行记录已删除', 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar('删除失败', 'error');
    }
  };

  const handleReplayRun = async (run) => {
    if (!run || !run.script) {
      showSnackbar('该历史记录没有脚本数据，无法重跑', 'warning');
      return;
    }
    setLoading(true);
    try {
      const options = run.execution_options || {};
      const data = await apiExecutionAPI.runAllSteps(run.script, {
        project_id: options.project_id,
        environment_id: options.environment_id,
        environment_snapshot: options.environment_snapshot || {},
        project_policy_snapshot: options.project_policy_snapshot || {},
        base_url: options.base_url || run.script.base_url,
        timeout_ms: options.timeout_ms || 30000,
        max_steps: options.max_steps || run.script.steps?.length,
        continue_on_failure: options.continue_on_failure ?? true,
        replace_run_id: run.run_id,
        requestTimeoutMs: BATCH_REQUEST_TIMEOUT_MS,
      });
      setRunReport(data);
      setRunResult(null);
      showSnackbar(`重跑完成：${data.passed} 通过 / ${data.failed} 失败`, data.status === 'passed' ? 'success' : 'error');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '重跑失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRepairRun = async (runId = runReport?.run_id) => {
    if (!runId) {
      showSnackbar('请先选择一条失败执行记录', 'warning');
      return;
    }
    setLoading(true);
    try {
      const data = await apiExecutionAPI.autoRepairRun(runId);
      setRunReport(data);
      setRunResult(null);
      setDslText(JSON.stringify(data.script || parsedScript, null, 2));
      showSnackbar(
        data.status === 'passed' ? '受控自动修复重跑已通过，并更新原记录' : '自动修复已重跑，仍需人工确认失败项',
        data.status === 'passed' ? 'success' : 'warning',
      );
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '受控自动修复重跑失败，已进入人工待处理', 'error');
      fetchHistory();
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAutomationTask = async (taskId) => {
    try {
      await apiExecutionAPI.resolveAutomationTask(taskId);
      showSnackbar('待处理项已标记完成', 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '更新待处理项失败', 'error');
    }
  };

  const handleTriggerSpecSync = async () => {
    setLoading(true);
    try {
      const data = await apiExecutionAPI.triggerSpecSync();
      const updated = (data.items || []).filter((item) => item.status === 'updated').length;
      const blocked = (data.items || []).filter((item) => item.status === 'blocked').length;
      showSnackbar(`文档同步完成：${updated} 个项目已更新 DSL${blocked ? `，${blocked} 个需处理` : ''}`, blocked ? 'warning' : 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '文档变化同步失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerScheduledRuns = async () => {
    setLoading(true);
    try {
      const data = await apiExecutionAPI.triggerScheduledRuns();
      const queued = (data.items || []).filter((item) => item.status === 'queued').length;
      const blocked = (data.items || []).filter((item) => item.status === 'blocked').length;
      showSnackbar(`白名单执行触发完成：${queued} 个项目已入队${blocked ? `，${blocked} 个被策略阻断` : ''}`, queued ? 'success' : 'info');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '触发定时执行失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleIngestRunKnowledge = async () => {
    setLoading(true);
    try {
      const data = await apiExecutionAPI.ingestRunKnowledge(20);
      showSnackbar(
        `知识沉淀完成：${data.run_count} 条执行，${data.knowledge_count} 条知识，向量写入 ${data.vector_written || 0}${data.graph_available ? `，图谱写入 ${data.graph_written}` : '，Neo4j 当前不可用仅保存本地知识'}`,
        data.errors?.length ? 'warning' : 'success',
      );
    } catch (error) {
      showSnackbar(error.message || '执行知识沉淀失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveKnowledgeCandidate = async (taskId) => {
    setLoading(true);
    try {
      const data = await apiExecutionAPI.approveKnowledgeCandidate(taskId);
      showSnackbar(`已确认沉淀：${data.knowledge_count} 条知识，向量写入 ${data.vector_written || 0}`, data.errors?.length ? 'warning' : 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '确认沉淀失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRunIntoEditor = (run) => {
    if (!run?.script) {
      showSnackbar('该历史记录没有脚本数据，无法载入', 'warning');
      return;
    }
    const options = run.execution_options || {};
    const environmentSnapshot = options.environment_snapshot || {};
    const projectSnapshot = options.project_policy_snapshot || {};
    if (options.project_id) setSelectedProjectId(options.project_id);
    if (options.environment_id) setSelectedEnvironmentId(options.environment_id);
    if (projectSnapshot.name) setProjectName(projectSnapshot.name);
    if (projectSnapshot.allow_ai_execution !== undefined) setAllowAiExecution(Boolean(projectSnapshot.allow_ai_execution));
    if (projectSnapshot.allow_ai_repair !== undefined) setAllowAiRepair(Boolean(projectSnapshot.allow_ai_repair));
    if (projectSnapshot.allow_scheduled_execution !== undefined) setAllowScheduledExecution(Boolean(projectSnapshot.allow_scheduled_execution));
    if (projectSnapshot.allow_ai_generate_dsl !== undefined) setAllowAiGenerateDsl(Boolean(projectSnapshot.allow_ai_generate_dsl));
    if (projectSnapshot.allow_overwrite_history !== undefined) setAllowOverwriteHistory(Boolean(projectSnapshot.allow_overwrite_history));
    setMaxAutoRepairs(String(projectSnapshot.max_auto_repairs || 0));
    setMaxReruns(String(projectSnapshot.max_reruns || 0));
    setMaxRequestsPerRun(String(projectSnapshot.max_requests_per_run || 0));
    setRiskOverridesText(JSON.stringify(projectSnapshot.risk_overrides || {}, null, 2));
    setOperationAllowlistText(formatLineList(projectSnapshot.operation_allowlist));
    setOperationBlocklistText(formatLineList(projectSnapshot.operation_blocklist));
    if (environmentSnapshot.name) setEnvironmentName(environmentSnapshot.name);
    if (environmentSnapshot.environment_type) setEnvironmentType(environmentSnapshot.environment_type);
    if (environmentSnapshot.headers) setGlobalHeadersText(JSON.stringify(environmentSnapshot.headers || {}, null, 2));
    if (environmentSnapshot.variables) setEnvironmentVariablesText(JSON.stringify(environmentSnapshot.variables || {}, null, 2));
    if (environmentSnapshot.timeout_ms) setEnvironmentTimeoutMs(String(environmentSnapshot.timeout_ms));
    setBaseUrl(options.base_url || environmentSnapshot.base_url || run.script.base_url || '');
    setDslText(JSON.stringify(run.script, null, 2));
    setRunReport(run);
    setRunResult(null);
    setAssertionStepId(run.script.steps?.[0]?.id || '');
    setRunStepId(run.script.steps?.[0]?.id || '');
    setActiveStep(2);
    showSnackbar('已载入历史脚本，可以编辑后重跑', 'success');
  };


  const tagOptions = useMemo(() => {
    const names = new Set(getTagNames(spec?.tags || []));
    for (const operation of spec?.operations || []) {
      for (const tag of operation.tags || []) names.add(tag);
    }
    return Array.from(names).sort();
  }, [spec]);

  const filteredOperations = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return (spec?.operations || []).filter((operation) => {
      if (!keyword) return true;
      return [operation.path, operation.summary, operation.operation_id, operation.method]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [spec, searchText]);

  const parsedScript = useMemo(() => {
    if (!dslText) return null;
    try {
      return JSON.parse(dslText);
    } catch {
      return null;
    }
  }, [dslText]);

  const visibleOperationIds = filteredOperations.map((operation) => operation.id);

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
      .catch(() => setProjects([]));
  }, []);

  const toggleOperation = (operationId) => {
    setSelectedOperationIds((prev) => {
      const next = new Set(prev);
      if (next.has(operationId)) next.delete(operationId);
      else next.add(operationId);
      return next;
    });
  };

  const toggleVisibleOperations = () => {
    setSelectedOperationIds((prev) => {
      const next = new Set(prev);
      const allSelected = visibleOperationIds.length > 0 && visibleOperationIds.every((id) => next.has(id));
      if (allSelected) visibleOperationIds.forEach((id) => next.delete(id));
      else visibleOperationIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const resetAfterSpecChange = (data) => {
    setSpec(data);
    setSearchText('');
    setSelectedOperationIds(new Set());
    setDslText('');
    setBaseUrl(prev => prev || data.servers?.[0]?.url || '');
    setRunResult(null);
    setRunReport(null);
    setAssertionStepId('');
    setActiveStep(1);
  };

  const parseFile = async () => {
    if (!selectedFile) {
      showSnackbar('请先选择 API 文档文件', 'warning');
      return;
    }
    setLoadingMessage('正在解析 API 文档...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.parseOpenApiFile(selectedFile);
      resetAfterSpecChange(data);
      showSnackbar(`解析成功，共 ${data.operation_count || 0} 个接口`, 'success');
    } catch (error) {
      showSnackbar(error.message || 'API 文档解析失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const parseUrl = async (forceRefresh = false) => {
    const url = sourceUrl.trim();
    if (!url) {
      showSnackbar('请输入 API 文档 URL', 'warning');
      return;
    }
    setLoadingMessage('正在获取并解析 API 文档...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.parseOpenApiUrl(url, forceRefresh);
      resetAfterSpecChange(data);
      showSnackbar(`解析成功，共 ${data.operation_count || 0} 个接口`, 'success');
    } catch (error) {
      showSnackbar(error.message || 'API 文档 URL 解析失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
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

  const buildProjectPayload = (projectId, name) => ({
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
      ...restOptions,
    };
  };

  const saveCurrentEnvironment = async () => {
    const headers = parseGlobalHeaders();
    if (headers === null) return;
    const nextProjectName = projectName.trim() || spec?.info?.title || 'OpenMelon';
    setLoading(true);
    try {
      let projectId = selectedProjectId;
      if (!projectId) {
        const project = await apiExecutionAPI.saveProject(buildProjectPayload('', nextProjectName));
        projectId = project.project_id;
        applyProjectValues(project);
        setProjects((prev) => [project, ...prev.filter((item) => item.project_id !== project.project_id)]);
      } else {
        const project = await apiExecutionAPI.saveProject(buildProjectPayload(projectId, nextProjectName));
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
        ...buildProjectPayload(projectId, nextProjectName),
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

  const generateDsl = async () => {
    if (!spec) return;
    const operationIds = Array.from(selectedOperationIds);
    if (!operationIds.length) {
      showSnackbar('请先选择接口', 'warning');
      return;
    }
    setLoadingMessage('正在生成测试脚本...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.generateDsl(spec.spec_id, operationIds);
      const nextScript = {
        ...data,
        target_project: projectName.trim() || data.target_project,
        environment: environmentName.trim() || data.environment,
        base_url: baseUrl.trim() || data.base_url,
      };
      setDslText(JSON.stringify(nextScript, null, 2));
      setAssertionStepId(nextScript.steps?.[0]?.id || '');
      setRunStepId(nextScript.steps?.[0]?.id || '');
      setActiveStep(2);
      showSnackbar(`已生成 ${nextScript.steps?.length || 0} 个步骤`, 'success');
    } catch (error) {
      showSnackbar(error.message || '测试脚本生成失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const insertAssertion = () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'error');
      return;
    }
    const stepId = assertionStepId || parsedScript.steps?.[0]?.id;
    if (!stepId) return;
    const expected = assertionType === 'status_code_in'
      ? assertionExpected.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item))
      : Number.isFinite(Number(assertionExpected)) ? Number(assertionExpected) : assertionExpected;
    const assertion = { type: assertionType, expected };
    const nextScript = {
      ...parsedScript,
      steps: (parsedScript.steps || []).map((step) => (
        step.id === stepId ? { ...step, assertions: [...(step.assertions || []), assertion] } : step
      )),
    };
    setDslText(JSON.stringify(nextScript, null, 2));
    showSnackbar('已插入断言', 'success');
  };

  const runSelectedStep = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    setLoadingMessage('正在执行接口...');
    setLoading(true);
    try {
      const runOptions = buildRunOptions(parsedScript, { step_id: runStepId || parsedScript.steps?.[0]?.id });
      if (!runOptions) return;
      const executableScript = mergeScriptVariables(parsedScript, runOptions.environment_variables);
      const data = await apiExecutionAPI.runSingleStep(executableScript, toRunRequestOptions(runOptions));
      setRunResult(data);
      setRunReport(null);
      setActiveStep(3);
      showSnackbar(data.status === 'passed' ? '接口执行通过' : '接口执行失败', data.status === 'passed' ? 'success' : 'error');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '接口执行失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const runAllSteps = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    setLoading(true);
    try {
      const runOptions = buildRunOptions(parsedScript, {
        timeout_ms: BATCH_STEP_TIMEOUT_MS,
        max_steps: BATCH_RUN_MAX_STEPS,
        requestTimeoutMs: BATCH_REQUEST_TIMEOUT_MS,
      });
      if (!runOptions) return;
      const executableScript = mergeScriptVariables(parsedScript, runOptions.environment_variables);
      const data = await apiExecutionAPI.runAllSteps(executableScript, toRunRequestOptions(runOptions));
      setRunReport(data);
      setRunResult(null);
      setActiveStep(3);
      showSnackbar(`执行完成：${data.passed} 通过 / ${data.failed} 失败`, data.status === 'passed' ? 'success' : 'error');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '批量执行失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runAllStepsInBackground = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    try {
      const runOptions = buildRunOptions(parsedScript, {
        timeout_ms: BACKGROUND_STEP_TIMEOUT_MS,
        run_timeout_ms: BACKGROUND_RUN_TIMEOUT_MS,
        max_steps: parsedScript.steps?.length || undefined,
      });
      if (!runOptions) return;
      const executableScript = mergeScriptVariables(parsedScript, runOptions.environment_variables);
      const data = await apiExecutionAPI.createBackgroundRun(executableScript, toRunRequestOptions(runOptions));
      setBackgroundRunId(data.run_id);
      setBackgroundRunStatus(data.status);
      setActiveStep(3);
      showSnackbar('后台执行已提交，可稍后刷新历史查看结果', 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '后台执行提交失败', 'error');
    }
  };

  const refreshBackgroundRun = async () => {
    if (!backgroundRunId) return;
    try {
      const data = await apiExecutionAPI.getRun(backgroundRunId);
      setBackgroundRunStatus(data.status);
      setRunReport(data);
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '后台执行状态查询失败', 'error');
    }
  };

  const cancelBackgroundRun = async () => {
    if (!backgroundRunId) return;
    try {
      const data = await apiExecutionAPI.cancelRun(backgroundRunId);
      setBackgroundRunStatus(data.status);
      setRunReport(data);
      fetchHistory();
      showSnackbar(data.status === 'cancelled' ? '后台执行已取消' : '后台执行已结束', data.status === 'cancelled' ? 'info' : 'warning');
    } catch (error) {
      showSnackbar(error.message || '取消后台执行失败', 'error');
    }
  };

  const rerunFailedSteps = async () => {
    const activeReport = runReport;
    if (!activeReport?.results?.length || !parsedScript?.steps?.length) {
      showSnackbar('请先载入包含脚本的执行报告', 'warning');
      return;
    }
    const failedStepIds = (activeReport.results || []).filter((result) => result.status !== 'passed').map((result) => result.step_id);
    if (!failedStepIds.length) {
      showSnackbar('当前报告没有失败步骤', 'info');
      return;
    }
    setLoading(true);
    try {
      const runOptions = buildRunOptions(parsedScript, {
        timeout_ms: BATCH_STEP_TIMEOUT_MS,
        step_ids: failedStepIds,
        replace_run_id: activeReport.run_id,
        requestTimeoutMs: BATCH_REQUEST_TIMEOUT_MS,
      });
      if (!runOptions) return;
      const executableScript = mergeScriptVariables(parsedScript, runOptions.environment_variables);
      const data = await apiExecutionAPI.runAllSteps(executableScript, toRunRequestOptions(runOptions));
      setRunReport(data);
      setRunResult(null);
      setActiveStep(3);
      fetchHistory();
      showSnackbar(`失败步骤重跑完成：${data.passed} 通过 / ${data.failed} 失败`, data.status === 'passed' ? 'success' : 'error');
    } catch (error) {
      showSnackbar(error.message || '失败步骤重跑失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const enhanceDslWithAi = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    setLoading(true);
    try {
      const data = await apiExecutionAPI.enhanceDsl(parsedScript, buildProjectPolicySnapshot());
      setAiPatch(data);
      if (data.patch_operations?.length) {
        showSnackbar(`AI 已生成 ${data.patch_operations.length} 条补全建议，可查看后应用`, 'success');
      } else {
        showSnackbar('当前脚本暂无可补全项', 'info');
      }
    } catch (error) {
      showSnackbar(error.message || 'AI DSL 补全失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const generateAiRepairPatch = async () => {
    if (!parsedScript || !runReport) {
      showSnackbar('请先载入脚本并生成执行报告', 'warning');
      return;
    }
    setLoading(true);
    try {
      const data = await apiExecutionAPI.generateRepairPatch(parsedScript, runReport, buildProjectPolicySnapshot());
      setAiPatch(data);
      showSnackbar(data.patch_operations?.length ? 'AI 修复补丁已生成，请确认后应用' : '暂未找到可自动修复的补丁', data.patch_operations?.length ? 'success' : 'info');
    } catch (error) {
      showSnackbar(error.message || '生成 AI 修复补丁失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyAiPatch = () => {
    if (!aiPatch?.patched_script) return;
    setDslText(JSON.stringify(aiPatch.patched_script, null, 2));
    setAssertionStepId(aiPatch.patched_script.steps?.[0]?.id || '');
    setRunStepId(aiPatch.patched_script.steps?.[0]?.id || '');
    setActiveStep(2);
    showSnackbar('已应用 AI 补丁，请确认脚本后再执行', 'success');
  };

  const exportRunReport = (report) => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, buildReportFilename());
  };

  const exportPytestScript = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    const blob = await apiExecutionAPI.exportPytest(parsedScript);
    downloadBlob(blob, `api-test-script-${buildDownloadTimestamp()}.py`);
  };

  const exportPostmanCollection = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    const blob = await apiExecutionAPI.exportPostman(parsedScript);
    downloadBlob(blob, `api-postman-collection-${buildDownloadTimestamp()}.json`);
  };


  const value = {
    activeStep,
    setActiveStep,
    sourceUrl,
    setSourceUrl,
    selectedFile,
    setSelectedFile,
    loading,
    setLoading,
    loadingMessage,
    setLoadingMessage,
    spec,
    setSpec,
    searchText,
    setSearchText,
    selectedOperationIds,
    setSelectedOperationIds,
    dslText,
    setDslText,
    baseUrl,
    setBaseUrl,
    bearerToken,
    setBearerToken,
    globalHeadersText,
    setGlobalHeadersText,
    runResult,
    setRunResult,
    runReport,
    setRunReport,
    projects,
    setProjects,
    environments,
    setEnvironments,
    selectedProjectId,
    setSelectedProjectId,
    selectedEnvironmentId,
    setSelectedEnvironmentId,
    projectName,
    setProjectName,
    environmentName,
    setEnvironmentName,
    environmentType,
    setEnvironmentType,
    environmentVariablesText,
    setEnvironmentVariablesText,
    environmentTimeoutMs,
    setEnvironmentTimeoutMs,
    allowAiExecution,
    setAllowAiExecution,
    allowAiRepair,
    setAllowAiRepair,
    allowScheduledExecution,
    setAllowScheduledExecution,
    allowAiGenerateDsl,
    setAllowAiGenerateDsl,
    allowOverwriteHistory,
    setAllowOverwriteHistory,
    maxAutoRepairs,
    setMaxAutoRepairs,
    maxReruns,
    setMaxReruns,
    maxRequestsPerRun,
    setMaxRequestsPerRun,
    riskOverridesText,
    setRiskOverridesText,
    operationAllowlistText,
    setOperationAllowlistText,
    operationBlocklistText,
    setOperationBlocklistText,
    assertionStepId,
    setAssertionStepId,
    runStepId,
    setRunStepId,
    assertionType,
    setAssertionType,
    assertionExpected,
    setAssertionExpected,
    runHistory,
    setRunHistory,
    automationTasks,
    setAutomationTasks,
    runHistoryProjectId,
    setRunHistoryProjectId,
    runHistoryStatus,
    setRunHistoryStatus,
    runHistoryKeyword,
    setRunHistoryKeyword,
    backgroundRunId,
    setBackgroundRunId,
    backgroundRunStatus,
    setBackgroundRunStatus,
    aiPatch,
    setAiPatch,
    fileInputRef,
    applyProjectValues,
    applyEnvironmentValues,
    loadEnvironments,
    handleDeleteProject,
    handleDeleteEnvironment,
    fetchHistory,
    handleDeleteRun,
    handleReplayRun,
    handleAutoRepairRun,
    handleResolveAutomationTask,
    handleTriggerSpecSync,
    handleTriggerScheduledRuns,
    handleIngestRunKnowledge,
    handleApproveKnowledgeCandidate,
    loadRunIntoEditor,
    toggleOperation,
    toggleVisibleOperations,
    resetAfterSpecChange,
    parseFile,
    parseUrl,
    parseGlobalHeaders,
    parseEnvironmentVariables,
    buildEnvironmentSnapshot,
    buildProjectPolicySnapshot,
    buildProjectPayload,
    buildRunOptions,
    saveCurrentEnvironment,
    generateDsl,
    insertAssertion,
    runSelectedStep,
    runAllSteps,
    runAllStepsInBackground,
    refreshBackgroundRun,
    cancelBackgroundRun,
    rerunFailedSteps,
    enhanceDslWithAi,
    generateAiRepairPatch,
    applyAiPatch,
    exportRunReport,
    exportPytestScript,
    exportPostmanCollection,
    tagOptions,
    filteredOperations,
    parsedScript,
    visibleOperationIds,
    showSnackbar
  };

  return (
    <APIExecutionContext.Provider value={value}>
      {children}
    </APIExecutionContext.Provider>
  );
};
