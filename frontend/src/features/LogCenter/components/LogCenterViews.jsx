import React from 'react';
import {
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
  Typography,
} from '@mui/material';
import {
  CloseOutlined,
  DeleteSweepOutlined,
  RefreshOutlined,
  SearchOutlined,
} from '@mui/icons-material';
import { formatRunTime } from '../../APIExecution/utils';
import EmptyState from '../../../components/EmptyState';
import {
  getRelatedCount,
  Info,
  LEVEL_META,
  Metric,
  MODULE_LABELS,
  TIME_RANGE_OPTIONS,
} from './LogCenterParts';

export function LogFilters({
  projects,
  projectId,
  setProjectId,
  moduleFilter,
  setModuleFilter,
  levelFilter,
  setLevelFilter,
  timeRange,
  setTimeRange,
  keyword,
  setKeyword,
  loadLogs,
}) {
  return (
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
  );
}

export function LogCleanupControls({
  cleanupDays,
  setCleanupDays,
  cleanupLevel,
  setCleanupLevel,
  setCleanupDialogOpen,
  loading,
}) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 2 }}>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>清理范围</InputLabel>
        <Select label="清理范围" value={cleanupDays} onChange={(event) => setCleanupDays(Number(event.target.value))}>
          <MenuItem value={0}>全部已记录</MenuItem>
          <MenuItem value={30}>30 天前</MenuItem>
          <MenuItem value={90}>90 天前</MenuItem>
          <MenuItem value={180}>180 天前</MenuItem>
          <MenuItem value={365}>365 天前</MenuItem>
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>清理等级</InputLabel>
        <Select label="清理等级" value={cleanupLevel} onChange={(event) => setCleanupLevel(event.target.value)}>
          <MenuItem value="non_error">非 Error</MenuItem>
          <MenuItem value="info">仅信息</MenuItem>
          <MenuItem value="warning">仅警告</MenuItem>
          <MenuItem value="error">仅错误</MenuItem>
          <MenuItem value="all">全部等级</MenuItem>
        </Select>
      </FormControl>
      <Button
        variant="outlined"
        color="warning"
        startIcon={<DeleteSweepOutlined />}
        onClick={() => setCleanupDialogOpen(true)}
        disabled={loading}
      >
        清理历史日志
      </Button>
      <Typography variant="caption" color="text.secondary">
        清理会沿用当前项目和模块筛选；选择“全部已记录”会清理当前范围内所有已落库日志。
      </Typography>
    </Stack>
  );
}

export function LogStats({ logStats }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, mb: 2 }}>
      <Metric label="日志总数" value={logStats.total} tone="info" />
      <Metric label="Error" value={logStats.errorCount} tone={logStats.errorCount ? 'error' : 'success'} />
      <Metric label="Warning" value={logStats.warningCount} tone={logStats.warningCount ? 'warning' : 'success'} />
      <Metric label="API 失败" value={logStats.failedRuns} tone={logStats.failedRuns ? 'error' : 'success'} />
      <Metric label="待处理任务" value={logStats.pendingTasks} tone={logStats.pendingTasks ? 'warning' : 'success'} />
      <Metric label="最近错误" value={logStats.latestErrorAt ? formatRunTime(logStats.latestErrorAt) : '无'} tone={logStats.latestErrorAt ? 'error' : 'success'} compact />
    </Box>
  );
}

export function LogPagerInfo({ usingFallback, filteredLogs, totalLogs, logs, page, rowsPerPage }) {
  const visibleTotal = usingFallback ? filteredLogs.length : totalLogs;
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }} flexWrap="wrap" gap={1}>
      <Typography variant="caption" color="text.secondary">
        当前显示 {visibleTotal} 条，已加载 {logs.length} 条事件
      </Typography>
      <Typography variant="caption" color="text.secondary">
        第 {visibleTotal ? page + 1 : 0} / {Math.max(1, Math.ceil(visibleTotal / rowsPerPage))} 页
      </Typography>
    </Stack>
  );
}

export function LogTable({
  filteredLogs,
  pagedLogs,
  usingFallback,
  logs,
  totalLogs,
  page,
  setPage,
  rowsPerPage,
  handleRowsPerPageChange,
  openLogDetail,
  loadError,
  retry,
  loading,
}) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.52)', overflow: 'hidden' }}>
      {loadError ? (
        <Box sx={{ p: 2 }}>
          <EmptyState
            compact
            variant="error"
            title="日志加载失败"
            description={loadError}
            actionLabel="重试"
            onAction={retry}
          />
        </Box>
      ) : loading && !filteredLogs.length ? (
        <Box sx={{ p: 2 }}>
          <EmptyState compact variant="loading" title="正在加载日志" />
        </Box>
      ) : filteredLogs.length ? (
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
          <EmptyState compact title="当前筛选下暂无日志" description="可以调整项目、模块、等级或时间范围后重新查询。" />
        </Box>
      )}
    </Paper>
  );
}

export function LogDetailDrawer({ selectedLog, relatedLogs, onClose }) {
  return (
    <Drawer anchor="right" open={Boolean(selectedLog)} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>日志详情</Typography>
          <Typography variant="caption" color="text.secondary">{selectedLog?.id}</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseOutlined /></IconButton>
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
              }) : <EmptyState compact title="暂无相关事件" />}
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
  );
}
