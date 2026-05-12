import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CloseOutlined,
  RefreshOutlined,
  SearchOutlined,
} from '@mui/icons-material';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import {
  findRelatedLogs,
  getRangeParams,
  getRelatedCount,
  Info,
  LEVEL_META,
  loadFallbackLogs,
  Metric,
  MODULE_LABELS,
  normalizeUnifiedLog,
  parseLogTime,
  TIME_RANGE_OPTIONS,
} from './LogCenterParts';
export default function LogCenter() {
  const showSnackbar = useSnackbar();
  const [projectId, setProjectId] = React.useState('');
  const [moduleFilter, setModuleFilter] = React.useState('');
  const [levelFilter, setLevelFilter] = React.useState('');
  const [timeRange, setTimeRange] = React.useState('all');
  const [keyword, setKeyword] = React.useState('');
  const [projects, setProjects] = React.useState([]);
  const [logs, setLogs] = React.useState([]);
  const [totalLogs, setTotalLogs] = React.useState(0);
  const [summary, setSummary] = React.useState(null);
  const [usingFallback, setUsingFallback] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
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
    } catch (error) {
      try {
        const fallback = await loadFallbackLogs(projectId);
        setProjects(fallback.projects);
        setLogs(fallback.logs);
        setTotalLogs(fallback.logs.length);
        setSummary(null);
        setUsingFallback(true);
        showSnackbar('统一日志接口暂不可用，已切换为聚合日志模式', 'warning');
      } catch (fallbackError) {
        showSnackbar(fallbackError.message || error.message || '加载日志中心失败', 'error');
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

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>项目</InputLabel>
          <Select label="项目" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <MenuItem value="">全部项目</MenuItem>
            {projects.map((project) => (
              <MenuItem key={project.project_id} value={project.project_id}>{project.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>模块</InputLabel>
          <Select label="模块" value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
            <MenuItem value="">全部模块</MenuItem>
            {Object.entries(MODULE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>等级</InputLabel>
          <Select label="等级" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <MenuItem value="">全部等级</MenuItem>
            {Object.entries(LEVEL_META).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>时间范围</InputLabel>
          <Select label="时间范围" value={timeRange} onChange={(event) => setTimeRange(event.target.value)}>
            {TIME_RANGE_OPTIONS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="关键词"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          InputProps={{ endAdornment: <SearchOutlined fontSize="small" color="action" /> }}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={loadLogs}>刷新</Button>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, mb: 2 }}>
        <Metric label="日志总数" value={logStats.total} tone="info" />
        <Metric label="Error" value={logStats.errorCount} tone={logStats.errorCount ? 'error' : 'success'} />
        <Metric label="Warning" value={logStats.warningCount} tone={logStats.warningCount ? 'warning' : 'success'} />
        <Metric label="API 失败" value={logStats.failedRuns} tone={logStats.failedRuns ? 'error' : 'success'} />
        <Metric label="待处理任务" value={logStats.pendingTasks} tone={logStats.pendingTasks ? 'warning' : 'success'} />
        <Metric label="最近错误" value={logStats.latestErrorAt ? formatRunTime(logStats.latestErrorAt) : '无'} tone={logStats.latestErrorAt ? 'error' : 'success'} compact />
      </Box>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" gap={1}>
        <Typography variant="caption" color="text.secondary">
          当前显示 {usingFallback ? filteredLogs.length : totalLogs} 条，已加载 {logs.length} 条事件
        </Typography>
        <Typography variant="caption" color="text.secondary">
          第 {(usingFallback ? filteredLogs.length : totalLogs) ? page + 1 : 0} / {Math.max(1, Math.ceil((usingFallback ? filteredLogs.length : totalLogs) / rowsPerPage))} 页
        </Typography>
      </Stack>

      <Paper variant="outlined" sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.52)', overflow: 'hidden' }}>
        {filteredLogs.length ? (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>时间</TableCell>
                    <TableCell>等级</TableCell>
                    <TableCell>模块</TableCell>
                    <TableCell>事件</TableCell>
                    <TableCell>摘要</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedLogs.map((log) => {
                    const level = LEVEL_META[log.level] || LEVEL_META.info;
                    return (
                      <TableRow key={log.id} hover>
                        <TableCell>{formatRunTime(log.time) || '未记录'}</TableCell>
                        <TableCell><Chip size="small" color={level.color} label={level.label} variant="outlined" /></TableCell>
                        <TableCell>{log.moduleLabel}</TableCell>
                        <TableCell>{log.type}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{log.title}</Typography>
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                            <Typography variant="caption" color="text.secondary">{log.detail}</Typography>
                            {usingFallback && getRelatedCount(log, logs) > 0 && <Chip size="small" label={`关联 ${getRelatedCount(log, logs)}`} variant="outlined" />}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => openLogDetail(log)}>详情</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={usingFallback ? filteredLogs.length : totalLogs}
              page={page}
              onPageChange={(_event, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 20, 50, 100]}
              labelRowsPerPage="每页"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
            />
          </>
        ) : (
          <Box sx={{ p: 2 }}>
            <Alert severity="info">当前筛选下暂无日志。</Alert>
          </Box>
        )}
      </Paper>

      <Drawer anchor="right" open={Boolean(selectedLog)} onClose={() => setSelectedLog(null)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 2 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>日志详情</Typography>
            <Typography variant="caption" color="text.secondary">{selectedLog?.id}</Typography>
          </Box>
          <IconButton onClick={() => setSelectedLog(null)}><CloseOutlined /></IconButton>
        </Stack>
        {selectedLog && (
          <Stack spacing={1.5}>
            <Info label="时间" value={formatRunTime(selectedLog.time) || selectedLog.time} />
            <Info label="模块" value={selectedLog.moduleLabel} />
            <Info label="事件" value={selectedLog.type} />
            <Info label="摘要" value={selectedLog.title} />
            <Info label="说明" value={selectedLog.detail || '无'} />
            <Box>
              <Typography variant="caption" color="text.secondary">关联标识</Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                {(selectedLog.refs || []).map((ref) => <Chip key={ref} size="small" label={ref} />)}
                {!selectedLog.refs?.length && <Typography variant="body2">无</Typography>}
              </Stack>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">相关事件</Typography>
              <Stack spacing={1} sx={{ mt: 0.5 }}>
                {relatedLogs.length ? relatedLogs.map((log) => {
                  const level = LEVEL_META[log.level] || LEVEL_META.info;
                  return (
                    <Box key={log.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Chip size="small" color={level.color} label={level.label} variant="outlined" />
                        <Typography variant="caption" color="text.secondary">{formatRunTime(log.time) || '未记录'}</Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{log.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{log.moduleLabel} · {log.type}</Typography>
                    </Box>
                  );
                }) : <Typography variant="body2">暂无相关事件</Typography>}
              </Stack>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">原始数据</Typography>
              <Box component="pre" sx={{ mt: 0.5, p: 1.5, bgcolor: 'rgba(15,23,42,0.05)', borderRadius: 2, overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(selectedLog.payload, null, 2)}
              </Box>
            </Box>
          </Stack>
        )}
      </Drawer>
    </Box>
  );
}
