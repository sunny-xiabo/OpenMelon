import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { useUIContext } from './UIContext';

// Hooks
import { 
  useExecHistory, 
  usePendingTasks, 
  useDeleteRunMutation, 
  useBatchDeleteRunsMutation,
  EXEC_KEYS,
} from '../hooks/useAPIExecutionQueries';

const RunHistoryContext = createContext();

export const useRunHistoryContext = () => {
  const ctx = useContext(RunHistoryContext);
  if (!ctx) throw new Error('useRunHistoryContext must be used within a RunHistoryProvider');
  return ctx;
};

export const RunHistoryProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const queryClient = useQueryClient();
  const { setLoading: setGlobalLoading } = useUIContext();

  const [runHistoryProjectId, setRunHistoryProjectId] = useState('');
  const [runHistoryStatus, setRunHistoryStatus] = useState('');
  const [runHistoryKeyword, setRunHistoryKeyword] = useState('');
  const [automationTriggerResult, setAutomationTriggerResult] = useState(null);

  // 使用 TanStack Query
  const historyParams = {
    projectId: runHistoryProjectId,
    status: runHistoryStatus,
    keyword: runHistoryKeyword
  };

  const { data: runHistory = [], isLoading: isHistoryLoading, refetch: fetchHistory } = useExecHistory(historyParams);
  const { data: automationTasks = [] } = usePendingTasks(runHistoryProjectId);

  const deleteRunMutation = useDeleteRunMutation();
  const batchDeleteMutation = useBatchDeleteRunsMutation();

  const invalidateProjectRunState = (projectId) => {
    if (!projectId) return;
    queryClient.invalidateQueries({ queryKey: EXEC_KEYS.agentContext(projectId) });
    queryClient.invalidateQueries({ queryKey: EXEC_KEYS.assets(projectId) });
  };

  // 从会话中恢复搜索词（例如刚跑完一个任务跳回来）
  useEffect(() => {
    const pendingRunId = sessionStorage.getItem('openmelon_api_execution_run_id');
    if (pendingRunId) {
      setRunHistoryKeyword(pendingRunId);
    }
  }, []);

  const handleDeleteRun = (runId) => deleteRunMutation.mutate(runId);
  const handleBatchDeleteRuns = (runIds) => batchDeleteMutation.mutate(runIds);

  const handleClearAllRuns = async () => {
    try {
      const res = await apiExecutionAPI.clearAllRuns();
      showSnackbar(`已成功清空所有执行记录（共 ${res.deleted_count} 条）`, { severity: 'success' });
      queryClient.invalidateQueries({ queryKey: ['exec', 'agent-context'] });
      fetchHistory(); // 这种全局清空的操作可以直接强制刷一次
    } catch (error) {
      showSnackbar(error.message || '清空历史失败', { severity: 'error' });
    }
  };

  const replayRun = async (run, _unused, _buildRunOptionsFn) => {
    if (!run || !run.script) {
      showSnackbar('该历史记录没有脚本数据，无法重跑', { severity: 'warning' });
      return;
    }
    setGlobalLoading(true);
    try {
      const options = run.execution_options || {};
      const data = await apiExecutionAPI.runAllSteps(run.script, {
        ...options,
        replace_run_id: run.run_id,
      });
      showSnackbar(`重跑完成：${data.passed} 通过 / ${data.failed} 失败`, { severity: data.status === 'passed' ? 'success' : 'error' });
      invalidateProjectRunState(data.execution_options?.project_id || options.project_id);
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '重跑失败', { severity: 'error' });
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleAutoRepairRun = async (runId, runReport, setRunReport, setDslText, parsedScript) => {
    if (!runId) {
      showSnackbar('请先选择一条失败执行记录', { severity: 'warning' });
      return;
    }
    setGlobalLoading(true);
    try {
      const data = await apiExecutionAPI.autoRepairRun(runId);
      setRunReport(data);
      setDslText(JSON.stringify(data.script || parsedScript, null, 2));
      invalidateProjectRunState(data.execution_options?.project_id || runReport?.execution_options?.project_id);
      showSnackbar(
        data.status === 'passed' ? '受控自动修复重跑已通过，并更新原记录' : '自动修复已重跑，仍需人工确认失败项',
        { severity: data.status === 'passed' ? 'success' : 'warning' }
      );
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '修复重跑失败，已进入待处理', { severity: 'error' });
      fetchHistory();
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleTriggerSpecSync = async () => {
    setGlobalLoading(true);
    try {
      const data = await apiExecutionAPI.triggerSpecSync();
      const updated = (data.items || []).filter((i) => i.status === 'updated').length;
      setAutomationTriggerResult({ type: 'spec_sync', ...data });
      showSnackbar(`文档同步完成：${updated} 个项目已更新 DSL`, { severity: 'success' });
      (data.items || []).forEach((item) => invalidateProjectRunState(item.project_id));
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '同步失败', { severity: 'error' });
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleTriggerScheduledRuns = async () => {
    setGlobalLoading(true);
    try {
      const data = await apiExecutionAPI.triggerScheduledRuns();
      const queued = (data.items || []).filter((i) => i.status === 'queued').length;
      const blocked = (data.items || []).filter((i) => i.status === 'blocked').length;
      setAutomationTriggerResult({ type: 'scheduled_runs', ...data });
      showSnackbar(`定时触发完成：${queued} 个已入队${blocked ? `，${blocked} 个需处理` : ''}`, { severity: blocked ? 'warning' : 'success' });
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '触发定时执行失败', { severity: 'error' });
    } finally {
      setGlobalLoading(false);
    }
  };

  const value = useMemo(() => ({
    runHistory, isHistoryLoading,
    automationTasks,
    runHistoryProjectId, setRunHistoryProjectId,
    runHistoryStatus, setRunHistoryStatus,
    runHistoryKeyword, setRunHistoryKeyword,
    fetchHistory,
    handleDeleteRun,
    handleBatchDeleteRuns,
    handleClearAllRuns,
    replayRun,
    handleAutoRepairRun,
    handleTriggerSpecSync,
    handleTriggerScheduledRuns,
    automationTriggerResult,
  }), [runHistory, isHistoryLoading, automationTasks, runHistoryProjectId, runHistoryStatus, runHistoryKeyword, automationTriggerResult, fetchHistory]);

  return (
    <RunHistoryContext.Provider value={value}>
      {children}
    </RunHistoryContext.Provider>
  );
};
