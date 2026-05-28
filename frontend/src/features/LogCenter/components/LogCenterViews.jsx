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
  Pagination,
  TableRow,
  TextField,
  Typography,
  alpha,
  Divider,
} from '@mui/material';
import {
  CloseOutlined,
  DeleteSweepOutlined,
  RefreshOutlined,
  SearchOutlined,
  RemoveRedEyeOutlined,
  ShieldOutlined,
  TerminalOutlined,
  DnsOutlined,
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
    <Stack 
      direction={{ xs: 'column', md: 'row' }} 
      spacing={2} 
      sx={{ 
        mb: 3,
        p: 2.2,
        borderRadius: 3.5,
        border: '1px solid rgba(255, 255, 255, 0.45)',
        background: 'rgba(255, 255, 255, 0.25)',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.01), inset 0 1px 0 rgba(255,255,255,0.6)',
      }}
    >
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <InputLabel id="log-project-label">选择项目</InputLabel>
        <Select 
          labelId="log-project-label"
          label="选择项目" 
          value={projectId} 
          onChange={(event) => setProjectId(event.target.value)}
          sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
        >
          <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部项目</MenuItem>
          {projects.map((project) => (
            <MenuItem key={project.project_id} value={project.project_id} sx={{ fontSize: '12px' }}>
              {project.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id="log-module-label">子模块</InputLabel>
        <Select 
          labelId="log-module-label"
          label="子模块" 
          value={moduleFilter} 
          onChange={(event) => setModuleFilter(event.target.value)}
          sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
        >
          <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部模块</MenuItem>
          {Object.entries(MODULE_LABELS).map(([value, label]) => (
            <MenuItem key={value} value={value} sx={{ fontSize: '12px' }}>{label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel id="log-level-label">日志等级</InputLabel>
        <Select 
          labelId="log-level-label"
          label="日志等级" 
          value={levelFilter} 
          onChange={(event) => setLevelFilter(event.target.value)}
          sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
        >
          <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部等级</MenuItem>
          {Object.entries(LEVEL_META).map(([value, meta]) => (
            <MenuItem key={value} value={value} sx={{ fontSize: '12px' }}>{meta.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id="log-time-label">时间范围</InputLabel>
        <Select 
          labelId="log-time-label"
          label="时间范围" 
          value={timeRange} 
          onChange={(event) => setTimeRange(event.target.value)}
          sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
        >
          {TIME_RANGE_OPTIONS.map((item) => (
            <MenuItem key={item.value} value={item.value} sx={{ fontSize: '12px' }}>{item.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        size="small"
        label="搜索摘要描述/错误堆栈..."
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        InputProps={{ 
          startAdornment: <SearchOutlined fontSize="small" sx={{ color: 'text.secondary', mr: 0.5 }} /> 
        }}
        sx={{ 
          flex: 1, 
          minWidth: 200,
          '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', bgcolor: 'rgba(255,255,255,0.4)' }
        }}
      />

      <Button 
        variant="outlined" 
        startIcon={<RefreshOutlined />} 
        onClick={loadLogs}
        sx={{ borderRadius: 2.2, fontWeight: 700, textTransform: 'none', px: 2.5 }}
      >
        刷新
      </Button>
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
    <Paper 
      elevation={0}
      sx={{ 
        p: 2.5, 
        mb: 3, 
        borderRadius: 4, 
        border: '1px solid rgba(245, 158, 11, 0.2)',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.03) 0%, rgba(255, 255, 255, 0.25) 100%)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.015), inset 0 1px 0 rgba(255,255,255,0.7)',
      }}
    >
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.2} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1.75} alignItems="center" sx={{ flex: 1 }}>
          <Box 
            sx={{ 
              width: 36, 
              height: 36, 
              borderRadius: 2, 
              bgcolor: 'rgba(245,158,11,0.08)',
              color: 'warning.main',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}
          >
            <DeleteSweepOutlined sx={{ fontSize: 18 }} />
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>日志维护净化舱 (Log Purification Cabin)</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 500 }}>
              定期清理已归档的数据库记录，以释放系统存储。清理会沿用当前项目和模块筛选。
            </Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id="cleanup-days-label">清理时间范围</InputLabel>
            <Select 
              labelId="cleanup-days-label"
              label="清理时间范围" 
              value={cleanupDays} 
              onChange={(event) => setCleanupDays(Number(event.target.value))}
              sx={{ borderRadius: 2.2, fontSize: '11px', fontWeight: 700, bgcolor: 'white' }}
            >
              <MenuItem value={0} sx={{ fontSize: '11px' }}>全部已记录日志</MenuItem>
              <MenuItem value={30} sx={{ fontSize: '11px' }}>30 天前日志</MenuItem>
              <MenuItem value={90} sx={{ fontSize: '11px' }}>90 天前日志</MenuItem>
              <MenuItem value={180} sx={{ fontSize: '11px' }}>180 天前日志</MenuItem>
              <MenuItem value={365} sx={{ fontSize: '11px' }}>365 天前日志</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="cleanup-level-label">清理等级</InputLabel>
            <Select 
              labelId="cleanup-level-label"
              label="清理等级" 
              value={cleanupLevel} 
              onChange={(event) => setCleanupLevel(event.target.value)}
              sx={{ borderRadius: 2.2, fontSize: '11px', fontWeight: 700, bgcolor: 'white' }}
            >
              <MenuItem value="non_error" sx={{ fontSize: '11px' }}>非 Error 记录</MenuItem>
              <MenuItem value="info" sx={{ fontSize: '11px' }}>仅 Info 记录</MenuItem>
              <MenuItem value="warning" sx={{ fontSize: '11px' }}>仅 Warning 记录</MenuItem>
              <MenuItem value="error" sx={{ fontSize: '11px' }}>仅 Error 记录</MenuItem>
              <MenuItem value="all" sx={{ fontSize: '11px' }}>清除全部等级</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="contained"
            color="warning"
            startIcon={<DeleteSweepOutlined sx={{ fontSize: '15px !important' }} />}
            onClick={() => setCleanupDialogOpen(true)}
            disabled={loading}
            sx={{ 
              borderRadius: 2.2, 
              fontWeight: 800, 
              px: 3, 
              fontSize: '11.5px',
              textTransform: 'none',
              boxShadow: '0 4px 12px rgba(245,158,11,0.2)',
            }}
          >
            清理历史
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

export function LogStats({ logStats }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2, mb: 3 }}>
      <Metric label="系统事件总数" value={logStats.total} tone="info" />
      <Metric label="Error 错误" value={logStats.errorCount} tone="error" />
      <Metric label="Warning 警告" value={logStats.warningCount} tone="warning" />
      <Metric label="API 自动化失败" value={logStats.failedRuns} tone="error" />
      <Metric label="待处理任务数" value={logStats.pendingTasks} tone="warning" />
      <Metric label="最近报错时间" value={logStats.latestErrorAt ? formatRunTime(logStats.latestErrorAt) : '安全·暂无'} tone={logStats.latestErrorAt ? 'error' : 'success'} compact />
    </Box>
  );
}

export function LogPagerInfo() {
  // Return empty block since pagination details are beautifully integrated in our custom footer
  return null;
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
  const visibleTotal = usingFallback ? filteredLogs.length : totalLogs;

  return (
    <Paper 
      elevation={0}
      sx={{ 
        borderRadius: 4.5, 
        border: '1px solid rgba(255, 255, 255, 0.45)',
        bgcolor: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
        overflow: 'hidden' 
      }}
    >
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
        <Box sx={{ p: 4 }}>
          <EmptyState compact variant="loading" title="日志加载流读取中..." />
        </Box>
      ) : filteredLogs.length ? (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.25)' }}>
                  <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px', py: 1.5 }}>时间</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>等级</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>对应模块</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>事件类型</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>事件摘要 / 附加说明</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px', pr: 2 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedLogs.map((log) => {
                  const level = LEVEL_META[log.level] || LEVEL_META.info;
                  
                  // Soft tag tones matching AI Observability
                  let chipTone = '#0ea5e9';
                  if (log.level === 'warning') chipTone = '#f59e0b';
                  if (log.level === 'error') chipTone = '#ef4444';

                  return (
                    <TableRow key={log.id} hover sx={{ '&:hover': { bgcolor: 'rgba(26,115,232,0.02) !important' } }}>
                      <TableCell sx={{ fontSize: '11px', fontWeight: 500, color: 'text.secondary', py: 1.25 }}>
                        {formatRunTime(log.time) || '未记录'}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          label={level.label} 
                          variant="outlined" 
                          sx={{ 
                            height: 18, 
                            fontSize: '10px', 
                            fontWeight: 800, 
                            borderRadius: 1,
                            borderColor: alpha(chipTone, 0.3),
                            bgcolor: alpha(chipTone, 0.04),
                            color: chipTone,
                          }} 
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: '11.5px', fontWeight: 700, color: 'text.primary' }}>
                        {log.moduleLabel}
                      </TableCell>
                      <TableCell sx={{ fontSize: '11px', fontFamily: 'monospace', color: 'text.secondary' }}>
                        {log.type}
                      </TableCell>
                      <TableCell sx={{ minWidth: 200 }}>
                        <Typography variant="body2" sx={{ fontWeight: 800, fontSize: '12px', color: 'text.primary' }}>
                          {log.title}
                        </Typography>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mt: 0.25 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: '10.5px' }}>
                            {log.detail}
                          </Typography>
                          {usingFallback && getRelatedCount(log, logs) > 0 && (
                            <Chip 
                              size="small" 
                              label={`关联 ${getRelatedCount(log, logs)}`} 
                              variant="outlined" 
                              sx={{ height: 16, fontSize: '9px', fontWeight: 700, borderRadius: 0.5, py: 0 }}
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 2 }}>
                        <Button 
                          size="small" 
                          variant="outlined"
                          startIcon={<RemoveRedEyeOutlined sx={{ fontSize: '12px !important' }} />}
                          onClick={() => openLogDetail(log)}
                          sx={{ 
                            borderRadius: 1.5, 
                            py: 0.1, 
                            px: 1.25, 
                            fontSize: '10.5px', 
                            fontWeight: 800,
                            textTransform: 'none',
                          }}
                        >
                          视察
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Premium custom numbered glassmorphic pagination footer */}
          <Box 
            sx={{ 
              p: 2, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              borderTop: '1px solid rgba(0,0,0,0.04)',
              bgcolor: 'rgba(255,255,255,0.15)',
              flexWrap: 'wrap',
              gap: 2
            }}
          >
            {/* Left side: Showing X-Y of Z */}
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 650, fontSize: '11px' }}>
              {visibleTotal > 0 ? (
                `显示第 ${page * rowsPerPage + 1} - ${Math.min((page + 1) * rowsPerPage, visibleTotal)} 条，共 ${visibleTotal} 条事件`
              ) : (
                '共 0 条事件'
              )}
            </Typography>

            {/* Right side: Rows selector & pagination buttons */}
            <Stack direction="row" spacing={3} alignItems="center">
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 650, fontSize: '11px' }}>
                  每页显示:
                </Typography>
                <Select
                  size="small"
                  value={rowsPerPage}
                  onChange={handleRowsPerPageChange}
                  sx={{ 
                    height: 28, 
                    fontSize: '11px', 
                    fontWeight: 700,
                    borderRadius: 2,
                    '& .MuiSelect-select': { py: 0.5, px: 1 },
                    bgcolor: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(0,0,0,0.02)',
                  }}
                >
                  {[10, 20, 50, 100].map(val => (
                    <MenuItem key={val} value={val} sx={{ fontSize: '11px', fontWeight: 600 }}>
                      {val} 行
                    </MenuItem>
                  ))}
                </Select>
              </Stack>

              <Pagination 
                count={Math.max(1, Math.ceil(visibleTotal / rowsPerPage))} 
                page={page + 1} 
                onChange={(_, p) => setPage(p - 1)}
                size="small"
                color="primary"
                sx={{
                  '& .MuiPaginationItem-root': {
                    borderRadius: 2,
                    fontWeight: 700,
                    fontSize: '11px',
                    bgcolor: 'rgba(255,255,255,0.4)',
                    border: '1px solid rgba(0,0,0,0.03)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.8)',
                      borderColor: 'primary.light',
                    },
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'white',
                      boxShadow: '0 2px 8px rgba(26,115,232,0.25)',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      }
                    }
                  }
                }}
              />
            </Stack>
          </Box>
        </>
      ) : (
        <Box sx={{ p: 4 }}>
          <EmptyState compact title="当前筛选条件下暂无日志" description="可调整上方过滤项目、模块、等级或选择更大时间范围重试。" />
        </Box>
      )}
    </Paper>
  );
}

export function LogDetailDrawer({ selectedLog, relatedLogs, onClose }) {
  // Format JSON payload nicely
  const payloadJson = selectedLog?.payload 
    ? JSON.stringify(selectedLog.payload, null, 2)
    : '';
  const lines = payloadJson.split('\n');

  return (
    <Drawer 
      anchor="right" 
      open={Boolean(selectedLog)} 
      onClose={onClose} 
      PaperProps={{ 
        sx: {
          width: { xs: '100%', sm: 540 },
          bgcolor: '#f8fafc',
          borderLeft: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '-20px 0 50px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        } 
      }}
    >
      {/* macOS styled Drawer Header */}
      <Box 
        sx={{
          p: 2.5,
          bgcolor: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          flexShrink: 0
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          {/* macOS window control buttons decorative */}
          <Stack direction="row" spacing={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10b981' }} />
          </Stack>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: '#1e293b', fontSize: '13px' }}>
              系统诊断 Ledger
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', display: 'block', mt: 0.15, fontSize: '10px' }}>
              ID: {selectedLog?.id}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'rgba(0,0,0,0.04)' } }}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </Box>

      {/* Drawer Body Scroll Content */}
      <Box 
        sx={{ 
          p: 3, 
          flex: 1, 
          overflow: 'auto',
          '&::-webkit-scrollbar': { width: '5px' },
          '&::-webkit-scrollbar-track': { background: '#f1f5f9' },
          '&::-webkit-scrollbar-thumb': { background: '#cbd5e1', borderRadius: '3px' },
        }}
      >
        {selectedLog && (
          <Stack spacing={3}>
            {/* Structured Info grids */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
              <Info label="事件记录时间 (Timestamp)" value={formatRunTime(selectedLog.time) || selectedLog.time} />
              <Info label="产生子模块 (Module)" value={selectedLog.moduleLabel} />
              <Info label="事件类型 (Type)" value={selectedLog.type} />
              <Info label="事件摘要 (Title)" value={selectedLog.title} />
            </Box>

            <Box sx={{ gridColumn: 'span 2' }}>
              <Info label="附加说明内容 (Detail)" value={selectedLog.detail || '无'} />
            </Box>

            {/* Event reference Tags */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', mb: 1 }}>
                关联标识事件引脚 (Refs Tags)
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }} useFlexGap>
                {(selectedLog.refs || []).map((ref) => (
                  <Chip 
                    key={ref} 
                    size="small" 
                    label={ref} 
                    sx={{ 
                      height: 20, 
                      fontSize: '10.5px', 
                      fontFamily: 'monospace', 
                      fontWeight: 700,
                      bgcolor: 'rgba(0,0,0,0.04)',
                      color: 'text.primary',
                      border: '1px solid rgba(0,0,0,0.06)'
                    }} 
                  />
                ))}
                {!selectedLog.refs?.length && (
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>暂无关联引脚</Typography>
                )}
              </Stack>
            </Box>

            {/* Related Event ledger flow */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', mb: 1 }}>
                相关上下文关联事件 (Related Events)
              </Typography>
              <Stack spacing={1.5}>
                {relatedLogs.length ? relatedLogs.map((log) => {
                  const level = LEVEL_META[log.level] || LEVEL_META.info;
                  
                  let relatedTone = '#0ea5e9';
                  if (log.level === 'warning') relatedTone = '#f59e0b';
                  if (log.level === 'error') relatedTone = '#ef4444';

                  return (
                    <Box 
                      key={log.id} 
                      sx={{ 
                        p: 1.75, 
                        border: '1px solid rgba(0,0,0,0.06)', 
                        bgcolor: 'rgba(0,0,0,0.015)',
                        borderRadius: 3.5,
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: 'rgba(0,0,0,0.04)',
                          borderColor: alpha(relatedTone, 0.3)
                        }
                      }}
                    >
                      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                        <Chip 
                          size="small" 
                          label={level.label} 
                          variant="outlined" 
                          sx={{ 
                            height: 16, 
                            fontSize: '9px', 
                            fontWeight: 800, 
                            borderRadius: 0.5,
                            borderColor: alpha(relatedTone, 0.25),
                            bgcolor: alpha(relatedTone, 0.04),
                            color: relatedTone
                          }} 
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                          {formatRunTime(log.time) || '未记录'}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '12px' }}>
                        {log.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontSize: '10px' }}>
                        {log.moduleLabel} · {log.type}
                      </Typography>
                    </Box>
                  );
                }) : (
                  <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>暂无上下文相关事件</Typography>
                )}
              </Stack>
            </Box>

            {/* macOS styled Dark Terminal Box for Raw JSON payload */}
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', mb: 1 }}>
                原始事件遥测负载数据 (Raw JSON Payload)
              </Typography>
              
              <Box 
                sx={{ 
                  borderRadius: 3.5,
                  bgcolor: '#f1f5f9',
                  border: '1px solid rgba(0,0,0,0.08)',
                  overflow: 'hidden',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                }}
              >
                {/* Mini terminal title */}
                <Box 
                  sx={{ 
                    px: 2,
                    py: 0.75,
                    bgcolor: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(0,0,0,0.06)'
                  }}
                >
                  <TerminalOutlined sx={{ fontSize: 13, color: '#60a5fa', mr: 0.75 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'Consolas, monospace', fontSize: '9.5px', fontWeight: 700 }}>
                    payload.json (Read-Only)
                  </Typography>
                </Box>

                {/* Line number code text viewport */}
                <Box 
                  sx={{ 
                    p: 2, 
                    maxHeight: 280, 
                    overflow: 'auto',
                    '&::-webkit-scrollbar': { width: '5px' },
                    '&::-webkit-scrollbar-track': { background: '#f1f5f9' },
                    '&::-webkit-scrollbar-thumb': { background: '#cbd5e1', borderRadius: '3px' },
                  }}
                >
                  {lines.map((line, idx) => (
                    <Box key={idx} sx={{ display: 'flex', gap: 1.5, py: 0.1 }}>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: 'text.disabled', 
                          fontFamily: 'Consolas, monospace', 
                          userSelect: 'none',
                          minWidth: '2.5em',
                          textAlign: 'right',
                          fontSize: '11px',
                        }}
                      >
                        {idx + 1}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          color: '#334155', 
                          fontFamily: 'Consolas, Courier New, monospace', 
                          fontSize: '11px',
                          whiteSpace: 'pre',
                          wordBreak: 'break-all',
                          fontWeight: 500,
                        }}
                      >
                        {line}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
