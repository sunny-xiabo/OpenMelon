import React from 'react';
import {
  Alert,
  Box,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { RefreshOutlined } from '@mui/icons-material';
import { useSnackbar } from '../../../components/SnackbarProvider';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { apiExecutionAPI } from '../../../api/execution';
import {
  findRelatedLogs,
  getRangeParams,
  LEVEL_META,
  loadFallbackLogs,
  MODULE_LABELS,
  normalizeUnifiedLog,
  parseLogTime,
  TIME_RANGE_OPTIONS,
} from './LogCenterParts';
import {
  LogCleanupControls,
  LogDetailDrawer,
  LogFilters,
  LogPagerInfo,
  LogStats,
  LogTable,
} from './LogCenterViews';

export default function LogCenter() {
  const showSnackbar = useSnackbar();
  const [projectId, setProjectId] = React.useState('');
  const [moduleFilter, setModuleFilter] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState('');
  const [timeRange, setTimeRange] = React.useState('7d');
  const [keyword, setKeyword] = React.useState('');
  const [cleanupDays, setCleanupDays] = React.useState(90);
  const [cleanupLevel, setCleanupLevel] = React.useState('non_error');
  const [cleanupDialogOpen, setCleanupDialogOpen] = React.useState(false);
  const [projects, setProjects] = React.useState([]);
  const [logs, setLogs] = React.useState([]);
  const [totalLogs, setTotalLogs] = React.useState(0);
  const [summary, setSummary] = React.useState(null);
  const [usingFallback, setUsingFallback] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [selectedLog, setSelectedLog] = React.useState(null);
  const [relatedLogs, setRelatedLogs] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(20);

  const rangeParams = React.useMemo(() => getRangeParams(timeRange), [timeRange]);

  const loadLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const [projectData, logData, summaryData] = await Promise.all([
        apiExecutionAPI.listProjects(),
        apiExecutionAPI.listEventLogs({
          limit: rowsPerPage,
          offset: page * rowsPerPage,
          projectId,
          module: moduleFilter,
          level: levelFilter,
          keyword,
          startAt: rangeParams.startAt,
          endAt: rangeParams.endAt,
        }),
        apiExecutionAPI.getEventLogSummary({
          projectId,
          module: moduleFilter,
          level: levelFilter,
          keyword,
          startAt: rangeParams.startAt,
          endAt: rangeParams.endAt,
        }),
      ]);
      setProjects(projectData.projects || []);
      setLogs((logData.items || []).map(normalizeUnifiedLog));
      setTotalLogs(logData.total || 0);
      setSummary(summaryData);
      setUsingFallback(false);
      setLoadError('');
    } catch (error) {
      try {
        const fallback = await loadFallbackLogs(projectId);
        setProjects(fallback.projects);
        setLogs(fallback.logs);
        setTotalLogs(fallback.logs.length);
        setSummary(null);
        setUsingFallback(true);
        setLoadError('');
        showSnackbar('统一日志接口暂不可用，已切换为聚合日志模式', 'warning');
      } catch (fallbackError) {
        const message = fallbackError.message || error.message || '加载日志中心失败';
        setLoadError(message);
        showSnackbar(message, 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [keyword, levelFilter, moduleFilter, page, projectId, rangeParams.endAt, rangeParams.startAt, rowsPerPage, showSnackbar]);

  React.useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = React.useMemo(() => {
    if (!usingFallback) return logs;
    const kw = keyword.trim().toLowerCase();
    const range = TIME_RANGE_OPTIONS.find((item) => item.value === timeRange);
    const minTime = range?.ms ? Date.now() - range.ms : 0;
    return logs.filter((log) => {
      if (moduleFilter && log.module !== moduleFilter) return false;
      if (levelFilter && log.level !== levelFilter) return false;
      if (minTime && parseLogTime(log.time) < minTime) return false;
      if (!kw) return true;
      return [log.title, log.detail, log.id, log.type, log.moduleLabel, ...(log.refs || [])].some((value) => String(value || '').toLowerCase().includes(kw));
    });
  }, [keyword, levelFilter, logs, moduleFilter, timeRange, usingFallback]);

  const logStats = React.useMemo(() => {
    if (!usingFallback && summary) {
      const failedRuns = (summary.event_type_counts || [])
        .filter((item) => item.label === 'run_failed')
        .reduce((sum, item) => sum + (item.count || 0), 0);
      const pendingTasks = (summary.event_type_counts || [])
        .filter((item) => ['task_created', 'knowledge_candidate_created', 'knowledge_write_failed'].includes(item.label))
        .reduce((sum, item) => sum + (item.count || 0), 0);
      return {
        total: summary.total || 0,
        errorCount: summary.error_count || 0,
        warningCount: summary.warning_count || 0,
        failedRuns,
        pendingTasks,
        latestErrorAt: summary.latest_error_at || '',
      };
    }
    const errorCount = filteredLogs.filter((log) => log.level === 'error').length;
    const warningCount = filteredLogs.filter((log) => log.level === 'warning').length;
    const failedRuns = filteredLogs.filter((log) => log.module === 'api_execution' && log.level === 'error').length;
    const pendingTasks = filteredLogs.filter((log) => log.module === 'task_center' && log.payload?.status === 'pending').length;
    const latestError = filteredLogs.find((log) => log.level === 'error');
    return {
      total: filteredLogs.length,
      errorCount,
      warningCount,
      failedRuns,
      pendingTasks,
      latestErrorAt: latestError?.time || '',
    };
  }, [filteredLogs, summary, usingFallback]);

  React.useEffect(() => {
    setPage(0);
  }, [keyword, levelFilter, moduleFilter, projectId, timeRange]);

  const pagedLogs = React.useMemo(() => {
    if (!usingFallback) return filteredLogs;
    const start = page * rowsPerPage;
    return filteredLogs.slice(start, start + rowsPerPage);
  }, [filteredLogs, page, rowsPerPage, usingFallback]);

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number.parseInt(event.target.value, 10));
    setPage(0);
  };

  const cleanupLevelLabel = cleanupLevel === 'all'
    ? '全部等级'
    : cleanupLevel === 'non_error'
      ? '非 Error'
      : LEVEL_META[cleanupLevel]?.label || cleanupLevel;

  const cleanupLogs = async () => {
    try {
      const data = await apiExecutionAPI.deleteEventLogs({
        olderThanDays: cleanupDays,
        level: cleanupLevel,
        projectId,
        module: moduleFilter,
      });
      setCleanupDialogOpen(false);
      if (data.deleted) {
        showSnackbar(`已清理 ${data.deleted || 0} 条日志，剩余 ${data.remaining || 0} 条`, 'success');
      } else {
        showSnackbar(`没有找到${cleanupDays ? `${cleanupDays} 天前的` : ''}${cleanupLevelLabel}日志，未删除记录`, 'info');
      }
      setPage(0);
      loadLogs();
    } catch (error) {
      showSnackbar(error.message || '清理日志失败', 'error');
    }
  };

  const openLogDetail = async (log) => {
    setSelectedLog(log);
    if (usingFallback) {
      setRelatedLogs(findRelatedLogs(log, logs));
      return;
    }
    try {
      const data = await apiExecutionAPI.listRelatedEventLogs(log.id, { limit: 8 });
      setRelatedLogs((data.items || []).map(normalizeUnifiedLog));
    } catch {
      setRelatedLogs([]);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>日志中心</Typography>
          <Typography variant="body2" color="text.secondary">查看执行、策略、任务和知识写入的关键事件。</Typography>
          {usingFallback && <Typography variant="caption" color="warning.main">当前为聚合日志 fallback 模式</Typography>}
        </Box>
        <Tooltip title="刷新日志">
          <span>
            <IconButton onClick={loadLogs} disabled={loading}>
              <RefreshOutlined />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        默认展示最近 7 天日志；后端会自动保留 Error 日志并裁剪过期非 Error 日志，历史排障可切换时间范围或按需清理。
      </Alert>

      <LogFilters
        projects={projects}
        projectId={projectId}
        setProjectId={setProjectId}
        moduleFilter={moduleFilter}
        setModuleFilter={setModuleFilter}
        levelFilter={levelFilter}
        setLevelFilter={setLevelFilter}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        keyword={keyword}
        setKeyword={setKeyword}
        loadLogs={loadLogs}
      />
      <LogCleanupControls
        cleanupDays={cleanupDays}
        setCleanupDays={setCleanupDays}
        cleanupLevel={cleanupLevel}
        setCleanupLevel={setCleanupLevel}
        setCleanupDialogOpen={setCleanupDialogOpen}
        loading={loading}
      />
      <LogStats logStats={logStats} />
      <LogPagerInfo
        usingFallback={usingFallback}
        filteredLogs={filteredLogs}
        totalLogs={totalLogs}
        logs={logs}
        page={page}
        rowsPerPage={rowsPerPage}
      />
      <LogTable
        filteredLogs={filteredLogs}
        pagedLogs={pagedLogs}
        usingFallback={usingFallback}
        logs={logs}
        totalLogs={totalLogs}
        page={page}
        setPage={setPage}
        rowsPerPage={rowsPerPage}
        handleRowsPerPageChange={handleRowsPerPageChange}
        openLogDetail={openLogDetail}
        loadError={loadError}
        retry={loadLogs}
        loading={loading}
      />
      <LogDetailDrawer
        selectedLog={selectedLog}
        relatedLogs={relatedLogs}
        onClose={() => setSelectedLog(null)}
      />
      <ConfirmDialog
        open={cleanupDialogOpen}
        title="清理历史日志"
        message={`将清理${projectId ? '当前项目' : '全部项目'}${moduleFilter ? ` / ${MODULE_LABELS[moduleFilter] || moduleFilter}` : ''}中 ${cleanupDays ? `${cleanupDays} 天前的` : '全部已记录的'} ${cleanupLevelLabel} 日志。\n\n此操作会从本地 SQLite 日志表删除记录，不能恢复。`}
        confirmText="清理日志"
        danger
        onConfirm={cleanupLogs}
        onCancel={() => setCleanupDialogOpen(false)}
      />
    </Box>
  );
}
