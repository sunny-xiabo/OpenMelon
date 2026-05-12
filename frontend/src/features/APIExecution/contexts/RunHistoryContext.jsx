import { createContext, useContext, useEffect, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { useUIContext } from './UIContext';

const RunHistoryContext = createContext();

export const useRunHistoryContext = () => {
  const ctx = useContext(RunHistoryContext);
  if (!ctx) throw new Error('useRunHistoryContext must be used within a RunHistoryProvider');
  return ctx;
};

export const RunHistoryProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const { setLoading } = useUIContext();

  const [runHistory, setRunHistory] = useState([]);
  const [automationTasks, setAutomationTasks] = useState([]);
  const [runHistoryProjectId, setRunHistoryProjectId] = useState('');
  const [runHistoryStatus, setRunHistoryStatus] = useState('');
  const [runHistoryKeyword, setRunHistoryKeyword] = useState('');

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

  useEffect(() => {
    const pendingRunId = sessionStorage.getItem('openmelon_api_execution_run_id');
    if (pendingRunId) {
      setRunHistoryKeyword(pendingRunId);
    }
  }, []);

  const handleDeleteRun = async (runId) => {
    try {
      await apiExecutionAPI.deleteRun(runId);
      showSnackbar('执行记录已删除', 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar('删除失败', 'error');
    }
  };

  const handleBatchDeleteRuns = async (runIds) => {
    if (!runIds || runIds.length === 0) return;
    try {
      const res = await apiExecutionAPI.batchDeleteRuns(runIds);
      showSnackbar(`已成功删除 ${res.deleted_count} 条执行记录`, 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '批量删除失败', 'error');
    }
  };

  const handleClearAllRuns = async () => {
    try {
      const res = await apiExecutionAPI.clearAllRuns();
      showSnackbar(`已成功清空所有执行记录（共 ${res.deleted_count} 条）`, 'success');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '清空历史失败', 'error');
    }
  };

  // handleReplayRun needs runAllSteps from ExecutionContext + buildRunOptions from ProjectEnvContext
  // These are passed as params by the coordinating hook
  const replayRun = async (run, runAllStepsFn, buildRunOptionsFn) => {
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
      });
      showSnackbar(`重跑完成：${data.passed} 通过 / ${data.failed} 失败`, data.status === 'passed' ? 'success' : 'error');
      fetchHistory();
    } catch (error) {
      showSnackbar(error.message || '重跑失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRepairRun = async (runId, runReport, setRunReport, setDslText, parsedScript) => {
    if (!runId) {
      showSnackbar('请先选择一条失败执行记录', 'warning');
      return;
    }
    setLoading(true);
    try {
      const data = await apiExecutionAPI.autoRepairRun(runId);
      setRunReport(data);
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

  const value = {
    runHistory, setRunHistory,
    automationTasks, setAutomationTasks,
    runHistoryProjectId, setRunHistoryProjectId,
    runHistoryStatus, setRunHistoryStatus,
    runHistoryKeyword, setRunHistoryKeyword,
    fetchHistory,
    handleDeleteRun,
    handleBatchDeleteRuns,
    handleClearAllRuns,
    replayRun,
    handleAutoRepairRun,
    handleResolveAutomationTask,
    handleTriggerSpecSync,
    handleTriggerScheduledRuns,
    handleIngestRunKnowledge,
    handleApproveKnowledgeCandidate,
  };

  return (
    <RunHistoryContext.Provider value={value}>
      {children}
    </RunHistoryContext.Provider>
  );
};
