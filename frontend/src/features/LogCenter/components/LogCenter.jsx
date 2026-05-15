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
import ConfirmDialog from '../../../components/ConfirmDialog';
import {
  findRelatedLogs,
  getRangeParams,
  LEVEL_META,
  MODULE_LABELS,
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

// Hooks
import { 
  useLogProjects, 
  useEventLogs, 
  useLogSummary, 
  useRelatedLogs, 
  useCleanupLogs 
} from '../hooks/useLogs';

export default function LogCenter() {
  // 筛选状态
  const [projectId, setProjectId] = React.useState('');
  const [moduleFilter, setModuleFilter] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState('');
  const [timeRange, setTimeRange] = React.useState('7d');
  const [keyword, setKeyword] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(20);
  
  // 清理逻辑状态
  const [cleanupDays, setCleanupDays] = React.useState(90);
  const [cleanupLevel, setCleanupLevel] = React.useState('non_error');
  const [cleanupDialogOpen, setCleanupDialogOpen] = React.useState(false);
  
  // 详情状态
  const [selectedLog, setSelectedLog] = React.useState(null);

  const rangeParams = React.useMemo(() => getRangeParams(timeRange), [timeRange]);

  // 使用 TanStack Query 钩子
  const { data: projects = [] } = useLogProjects();
  
  const logParams = React.useMemo(() => ({
    limit: rowsPerPage,
    offset: page * rowsPerPage,
    projectId,
    module: moduleFilter,
    level: levelFilter,
    keyword,
    startAt: rangeParams.startAt,
    endAt: rangeParams.endAt,
  }), [rowsPerPage, page, projectId, moduleFilter, levelFilter, keyword, rangeParams]);

  const { 
    data: logData, 
    isLoading: isLogsLoading, 
    isFetching: isLogsFetching,
    error: logError,
    refetch: refetchLogs 
  } = useEventLogs(logParams);

  const { data: summary } = useLogSummary(logParams);
  const { data: relatedLogs = [] } = useRelatedLogs(selectedLog?.id);
  const cleanupMutation = useCleanupLogs();

  const logs = logData?.items || [];
  const totalLogs = logData?.total || 0;
  const usingFallback = logData?.usingFallback || false;

  // 这里的过滤逻辑主要针对 fallback 模式（因为后端接口此时不可用）
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

  // 统计信息计算
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
    const targetLogs = usingFallback ? filteredLogs : logs;
    const errorCount = targetLogs.filter((log) => log.level === 'error').length;
    const warningCount = targetLogs.filter((log) => log.level === 'warning').length;
    const latestError = targetLogs.find((log) => log.level === 'error');
    return {
      total: totalLogs,
      errorCount,
      warningCount,
      failedRuns: targetLogs.filter((log) => log.module === 'api_execution' && log.level === 'error').length,
      pendingTasks: targetLogs.filter((log) => log.module === 'task_center' && log.payload?.status === 'pending').length,
      latestErrorAt: latestError?.time || '',
    };
  }, [filteredLogs, summary, usingFallback, logs, totalLogs]);

  // 筛选条件变化时重置页码
  React.useEffect(() => {
    setPage(0);
  }, [keyword, levelFilter, moduleFilter, projectId, timeRange]);

  const pagedLogs = React.useMemo(() => {
    if (!usingFallback) return logs;
    const start = page * rowsPerPage;
    return filteredLogs.slice(start, start + rowsPerPage);
  }, [filteredLogs, page, rowsPerPage, usingFallback, logs]);

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number.parseInt(event.target.value, 10));
    setPage(0);
  };

  const cleanupLevelLabel = cleanupLevel === 'all'
    ? '全部等级'
    : cleanupLevel === 'non_error'
      ? '非 Error'
      : LEVEL_META[cleanupLevel]?.label || cleanupLevel;

  const handleCleanup = async () => {
    await cleanupMutation.mutateAsync({
      olderThanDays: cleanupDays,
      level: cleanupLevel,
      projectId,
      module: moduleFilter,
    });
    setCleanupDialogOpen(false);
    setPage(0);
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
            <IconButton onClick={() => refetchLogs()} disabled={isLogsFetching}>
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
        loadLogs={() => refetchLogs()}
      />
      <LogCleanupControls
        cleanupDays={cleanupDays}
        setCleanupDays={setCleanupDays}
        cleanupLevel={cleanupLevel}
        setCleanupLevel={setCleanupLevel}
        setCleanupDialogOpen={setCleanupDialogOpen}
        loading={isLogsLoading || cleanupMutation.isPending}
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
        openLogDetail={setSelectedLog}
        loadError={logError?.message || ''}
        retry={() => refetchLogs()}
        loading={isLogsFetching}
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
        onConfirm={handleCleanup}
        onCancel={() => setCleanupDialogOpen(false)}
      />
    </Box>
  );
}
