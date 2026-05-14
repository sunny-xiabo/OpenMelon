import { createContext, useContext, useEffect, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { useUIContext } from './UIContext';

// Hooks
import { 
  useExecHistory, 
  usePendingTasks, 
  useDeleteRunMutation, 
  useBatchDeleteRunsMutation 
} from '../hooks/useAPIExecutionQueries';

const RunHistoryContext = createContext();

export const useRunHistoryContext = () => {
  const ctx = useContext(RunHistoryContext);
  if (!ctx) throw new Error('useRunHistoryContext must be used within a RunHistoryProvider');
  return ctx;
};

export const RunHistoryProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const { setLoading: setGlobalLoading } = useUIContext();

  const [runHistoryProjectId, setRunHistoryProjectId] = useState('');
  const [runHistoryStatus, setRunHistoryStatus] = useState('');
  const [runHistoryKeyword, setRunHistoryKeyword] = useState('');

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
      fetchHistory(); // 这种全局清空的操作可以直接强制刷一次
    } catch (error) {
      showSnackbar(error.message || '清空历史失败', { severity: 'error' });
    }
  };

  const replayRun = async (run, _unused, buildRunOptionsFn) => {
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
      showSnackbar(`文档同步完成：${updated} 个项目已更新 DSL`, { severity: 'success' });
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '同步失败', { severity: 'error' });
    } finally {
      setGlobalLoading(false);
    }
  };

  const value = {
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
  };

  return (
    <RunHistoryContext.Provider value={value}>
      {children}
    </RunHistoryContext.Provider>
  );
};
