import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import {
  BATCH_STEP_TIMEOUT_MS,
  BATCH_REQUEST_TIMEOUT_CEILING_MS,
  BATCH_REQUEST_TIMEOUT_FLOOR_MS,
  BATCH_REQUEST_TIMEOUT_OVERHEAD_MS,
  BACKGROUND_STEP_TIMEOUT_MS,
  BACKGROUND_RUN_TIMEOUT_MS,
} from '../constants';
import {
  mergeScriptVariables,
  toRunRequestOptions,
  normalizeTimeoutMs,
} from '../utils';
import { useUIContext } from './UIContext';
import { API_EXECUTION_DASHBOARD_REFRESH_EVENT } from '../../../constants/events';

const ExecutionContext = createContext();

export const useExecutionContext = () => {
  const ctx = useContext(ExecutionContext);
  if (!ctx) throw new Error('useExecutionContext must be used within an ExecutionProvider');
  return ctx;
};

const RUN_POLL_INTERVAL_MS = 1800;
const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

const notifyDashboardRefresh = () => {
  window.dispatchEvent(new CustomEvent(API_EXECUTION_DASHBOARD_REFRESH_EVENT));
};

const parseSSEPayload = (event) => {
  try {
    return JSON.parse(event.data || '{}');
  } catch {
    return {};
  }
};

const mergeRunProgress = (report, progress) => {
  if (!report) return report;
  return {
    ...report,
    status: progress.status || report.status,
    progress_total: progress.progress_total ?? report.progress_total,
    progress_completed: progress.progress_completed ?? report.progress_completed,
    current_step_id: progress.current_step_id ?? null,
    current_step_name: progress.current_step_name ?? null,
    total: progress.total ?? report.total,
    passed: progress.passed ?? report.passed,
    failed: progress.failed ?? report.failed,
  };
};

const estimateBatchRequestTimeoutMs = (stepCount, stepTimeoutMs) => Math.min(
  BATCH_REQUEST_TIMEOUT_CEILING_MS,
  Math.max(
    BATCH_REQUEST_TIMEOUT_FLOOR_MS,
    normalizeTimeoutMs(stepTimeoutMs, BATCH_STEP_TIMEOUT_MS) * Math.max(1, stepCount || 1) + BATCH_REQUEST_TIMEOUT_OVERHEAD_MS,
  ),
);

const buildSingleStepRunReport = (script, result, runOptions) => {
  const passed = result.status === 'passed' ? 1 : 0;
  return {
    run_at: new Date().toISOString(),
    case_id: script.case_id || '',
    target_project: script.target_project || '',
    case_name: script.name || '单步执行报告',
    mode: 'single',
    script,
    execution_options: toRunRequestOptions(runOptions),
    status: result.status || 'failed',
    failure_reason: result.error || null,
    failure_diagnostics: [],
    repair_suggestions: [],
    automation_summary: {},
    repair_history: [],
    duration_ms: result.duration_ms || 0,
    total: 1,
    passed,
    failed: passed ? 0 : 1,
    skipped: 0,
    progress_total: 1,
    progress_completed: 1,
    current_step_id: null,
    current_step_name: null,
    results: [result],
  };
};

export const ExecutionProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const { setLoading, setLoadingMessage, setActiveStep } = useUIContext();

  const [runResult, setRunResult] = useState(null);
  const [runReport, setRunReport] = useState(null);
  const [backgroundRunId, setBackgroundRunId] = useState('');
  const [backgroundRunStatus, setBackgroundRunStatus] = useState('');
  const [continueOnFailure] = useState(true);

  // Callback for fetchHistory -- set by RunHistoryContext
  const fetchHistoryRef = useRef(null);
  const registerFetchHistory = (fn) => { fetchHistoryRef.current = fn; };

  useEffect(() => {
    if (!backgroundRunId || !ACTIVE_RUN_STATUSES.has(backgroundRunStatus)) return undefined;
    let cancelled = false;
    let eventSource = null;
    let pollTimer = null;
    let queuedWarningTimer = null;
    let queuedWarned = false;
    const startedAt = Date.now();
    const QUEUED_TIMEOUT_MS = 90_000;

    const finalizeRun = async (status = '') => {
      if (cancelled) return;
      try {
        const data = await apiExecutionAPI.getRun(backgroundRunId);
        if (cancelled) return;
        setBackgroundRunStatus(data.status || status);
        setRunReport(data);
        fetchHistoryRef.current?.();
        notifyDashboardRefresh();
      } catch (error) {
        if (!cancelled) {
          setBackgroundRunStatus(status || backgroundRunStatus);
          showSnackbar(error.message || '后台执行最终状态查询失败', 'error');
        }
      }
    };

    const pollRun = async () => {
      try {
        const data = await apiExecutionAPI.getRun(backgroundRunId);
        if (cancelled) return;
        setBackgroundRunStatus(data.status);
        setRunReport(data);
        if (!ACTIVE_RUN_STATUSES.has(data.status)) {
          fetchHistoryRef.current?.();
          notifyDashboardRefresh();
        }
        // 排队超时提醒
        if (data.status === 'queued' && !queuedWarned && Date.now() - startedAt > QUEUED_TIMEOUT_MS) {
          queuedWarned = true;
          showSnackbar('任务排队时间过长，可能后台并发槽位已满或服务异常，建议取消后重试或重启后端服务', 'warning');
        }
      } catch (error) {
        if (!cancelled) {
          showSnackbar(error.message || '后台执行状态查询失败', 'error');
        }
      }
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      pollTimer = setInterval(pollRun, RUN_POLL_INTERVAL_MS);
      pollRun();
    };

    queuedWarningTimer = setTimeout(() => {
      if (cancelled || queuedWarned) return;
      queuedWarned = true;
      showSnackbar('任务排队时间过长，可能后台并发槽位已满或服务异常，建议取消后重试或重启后端服务', 'warning');
    }, QUEUED_TIMEOUT_MS);

    if (typeof window !== 'undefined' && 'EventSource' in window) {
      try {
        eventSource = new EventSource(apiExecutionAPI.getRunProgressStreamUrl(backgroundRunId), { withCredentials: true });
        eventSource.addEventListener('progress', (event) => {
          if (cancelled) return;
          const progress = parseSSEPayload(event);
          setRunReport((current) => mergeRunProgress(current, progress));
          if (progress.current_step_id || progress.current_step_name) {
            setBackgroundRunStatus('running');
            if (queuedWarningTimer) {
              clearTimeout(queuedWarningTimer);
              queuedWarningTimer = null;
            }
          }
          if (!queuedWarned && Date.now() - startedAt > QUEUED_TIMEOUT_MS) {
            queuedWarned = true;
            showSnackbar('任务排队时间过长，可能后台并发槽位已满或服务异常，建议取消后重试或重启后端服务', 'warning');
          }
        });
        eventSource.addEventListener('finished', (event) => {
          if (cancelled) return;
          const payload = parseSSEPayload(event);
          eventSource?.close();
          eventSource = null;
          finalizeRun(payload.status);
        });
        eventSource.onerror = () => {
          if (cancelled) return;
          eventSource?.close();
          eventSource = null;
          startPolling();
        };
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      if (eventSource) eventSource.close();
      if (pollTimer) clearInterval(pollTimer);
      if (queuedWarningTimer) clearTimeout(queuedWarningTimer);
    };
  }, [backgroundRunId, backgroundRunStatus]);

  // buildRunOptions comes from ProjectEnvContext, passed as param
  const runSelectedStep = async (parsedScript, runStepId, buildRunOptions, disabledStepIds = []) => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    const targetStepId = runStepId || parsedScript.steps?.[0]?.id;
    if (disabledStepIds.includes(targetStepId)) {
      showSnackbar('当前步骤已禁用，请先启用后再单步执行', 'warning');
      return;
    }
    const runOptions = buildRunOptions(parsedScript, { step_id: targetStepId });
    if (!runOptions) return;
    setLoadingMessage('正在执行接口...');
    setLoading(true);
    setActiveStep(3);
    try {
      const executableScript = mergeScriptVariables(parsedScript, runOptions.environment_variables);
      const data = await apiExecutionAPI.runSingleStep(executableScript, toRunRequestOptions(runOptions));
      setBackgroundRunId('');
      setBackgroundRunStatus('');
      setRunResult(null);
      setRunReport(buildSingleStepRunReport(executableScript, data, runOptions));
      showSnackbar(data.status === 'passed' ? '接口执行通过' : '接口执行失败', data.status === 'passed' ? 'success' : 'error');
      fetchHistoryRef.current?.();
      notifyDashboardRefresh();
    } catch (error) {
      showSnackbar(error.message || '接口执行失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const runAllSteps = async (parsedScript, buildRunOptions) => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    const runOptions = buildRunOptions(parsedScript, {
      timeout_ms: BACKGROUND_STEP_TIMEOUT_MS,
      run_timeout_ms: BACKGROUND_RUN_TIMEOUT_MS,
      max_steps: parsedScript.steps?.length || undefined,
    });
    if (!runOptions) return;
    setLoading(true);
    setActiveStep(3);
    try {
      const executableScript = mergeScriptVariables(parsedScript, runOptions.environment_variables);
      const data = await apiExecutionAPI.createBackgroundRun(executableScript, toRunRequestOptions(runOptions));
      setBackgroundRunId(data.run_id);
      setBackgroundRunStatus(data.status);
      const queuedRun = await apiExecutionAPI.getRun(data.run_id);
      setBackgroundRunStatus(queuedRun.status || data.status);
      setRunReport(queuedRun);
      setRunResult(null);
      showSnackbar('执行已提交，正在后台运行', 'success');
      fetchHistoryRef.current?.();
      notifyDashboardRefresh();
    } catch (error) {
      showSnackbar(error.message || '执行提交失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const refreshBackgroundRun = async () => {
    if (!backgroundRunId) return;
    try {
      const data = await apiExecutionAPI.getRun(backgroundRunId);
      setBackgroundRunStatus(data.status);
      setRunReport(data);
      fetchHistoryRef.current?.();
      notifyDashboardRefresh();
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
      fetchHistoryRef.current?.();
      notifyDashboardRefresh();
      showSnackbar(data.status === 'cancelled' ? '后台执行已取消' : '后台执行已结束', data.status === 'cancelled' ? 'info' : 'warning');
    } catch (error) {
      showSnackbar(error.message || '取消后台执行失败', 'error');
    }
  };

  const rerunFailedSteps = async (parsedScript, buildRunOptions) => {
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
    const runOptions = buildRunOptions(parsedScript, {
      timeout_ms: BATCH_STEP_TIMEOUT_MS,
      step_ids: failedStepIds,
      replace_run_id: activeReport.run_id,
      requestTimeoutMs: estimateBatchRequestTimeoutMs(failedStepIds.length, BATCH_STEP_TIMEOUT_MS),
    });
    if (!runOptions) return;
    setLoading(true);
    setActiveStep(3);
    try {
      const executableScript = mergeScriptVariables(parsedScript, runOptions.environment_variables);
      const data = await apiExecutionAPI.runAllSteps(executableScript, toRunRequestOptions(runOptions));
      setRunReport(data);
      setRunResult(null);
      fetchHistoryRef.current?.();
      notifyDashboardRefresh();
      showSnackbar(`失败步骤重跑完成：${data.passed} 通过 / ${data.failed} 失败`, data.status === 'passed' ? 'success' : 'error');
    } catch (error) {
      showSnackbar(error.message || '失败步骤重跑失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const value = {
    runResult, setRunResult,
    runReport, setRunReport,
    backgroundRunId, setBackgroundRunId,
    backgroundRunStatus, setBackgroundRunStatus,
    continueOnFailure,
    runSelectedStep,
    runAllSteps,
    refreshBackgroundRun,
    cancelBackgroundRun,
    rerunFailedSteps,
    registerFetchHistory,
  };

  return (
    <ExecutionContext.Provider value={value}>
      {children}
    </ExecutionContext.Provider>
  );
};
