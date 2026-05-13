import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  BoltOutlined,
  ErrorOutlineOutlined,
  LockOutlined,
  RefreshOutlined,
  SearchOutlined,
  SpeedOutlined,
  StorageOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import EmptyState from '../../../components/EmptyState';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { formatRunTime } from '../../APIExecution/utils';

const FEATURE_LABELS = {
  rag: 'RAG 问答',
  embedding: 'Embedding',
  testcase_generation: '测试用例生成',
  api_execution_ai: 'API 自动化 AI',
};

const STATUS_LABELS = {
  success: { label: '成功', color: 'success' },
  failed: { label: '失败', color: 'error' },
  degraded: { label: '降级', color: 'warning' },
};

const TIME_RANGE_OPTIONS = [
  { value: '24h', label: '最近 24 小时', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '最近 7 天', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: '最近 30 天', ms: 30 * 24 * 60 * 60 * 1000 },
  { value: 'all', label: '全部时间' },
];

const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatMs = (value) => `${formatNumber(value)} ms`;
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const getRangeParams = (timeRange) => {
  const range = TIME_RANGE_OPTIONS.find((item) => item.value === timeRange);
  if (!range?.ms) return { startAt: '', endAt: '' };
  return { startAt: new Date(Date.now() - range.ms).toISOString(), endAt: '' };
};

function Metric({ label, value, helper = '', tone = 'info', icon = null }) {
  const colors = {
    info: { bg: 'rgba(14,165,233,0.10)', color: 'info.main' },
    success: { bg: 'rgba(34,197,94,0.10)', color: 'success.main' },
    warning: { bg: 'rgba(245,158,11,0.10)', color: 'warning.main' },
    error: { bg: 'rgba(239,68,68,0.10)', color: 'error.main' },
  };
  const theme = colors[tone] || colors.info;
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: theme.bg, minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {icon && <Box sx={{ display: 'flex', color: theme.color }}>{icon}</Box>}
      </Stack>
      <Typography variant="h6" sx={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
      {helper && <Typography variant="caption" color="text.secondary" noWrap>{helper}</Typography>}
    </Box>
  );
}

function DistributionCard({ title, items = [], emptyTitle, color = 'primary.main' }) {
  const max = Math.max(...items.map((item) => item.count || 0), 1);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.52)' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>
      <Stack spacing={1}>
        {items.slice(0, 6).map((item) => {
          const percent = Math.round(((item.count || 0) / max) * 100);
          return (
            <Box key={item.label}>
              <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mb: 0.5 }}>
                <Typography variant="caption" noWrap title={item.label} sx={{ fontWeight: 700 }}>{item.label}</Typography>
                <Typography variant="caption" color="text.secondary">{item.count}</Typography>
              </Stack>
              <Box sx={{ height: 7, borderRadius: 999, bgcolor: 'rgba(15,23,42,0.08)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${percent}%`, bgcolor: color, borderRadius: 999 }} />
              </Box>
            </Box>
          );
        })}
        {!items.length && <EmptyState compact title={emptyTitle} />}
      </Stack>
    </Paper>
  );
}

export default function AIObservabilityPanel() {
  const showSnackbar = useSnackbar();
  const [feature, setFeature] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [degraded, setDegraded] = React.useState('');
  const [timeRange, setTimeRange] = React.useState('7d');
  const [keyword, setKeyword] = React.useState('');
  const [summary, setSummary] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(20);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [debugSettings, setDebugSettings] = React.useState({ enabled: false, retention_minutes: 30, max_chars: 4000 });
  const [confirmDialog, setConfirmDialog] = React.useState({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
  const [snapshot, setSnapshot] = React.useState(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const rangeParams = getRangeParams(timeRange);
      const filters = {
        feature,
        status,
        degraded,
        keyword,
        startAt: rangeParams.startAt,
        endAt: rangeParams.endAt,
      };
      const [summaryData, logData] = await Promise.all([
        apiExecutionAPI.getAICallSummary(filters),
        apiExecutionAPI.listAICallLogs({
          ...filters,
          limit: rowsPerPage,
          offset: page * rowsPerPage,
        }),
      ]);
      setSummary(summaryData);
      setItems(logData.items || []);
      setTotal(logData.total || 0);
      setLoadError('');
    } catch (error) {
      const message = error.message || '加载 AI/RAG 观测数据失败';
      setLoadError(message);
      showSnackbar(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [degraded, feature, keyword, page, rowsPerPage, showSnackbar, status, timeRange]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => {
    apiExecutionAPI.getAIDebugSettings()
      .then((data) => setDebugSettings(data))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    setPage(0);
  }, [degraded, feature, keyword, status, timeRange]);

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number.parseInt(event.target.value, 10));
    setPage(0);
  };

  const updateDebugSettings = async (nextSettings) => {
    try {
      const data = await apiExecutionAPI.updateAIDebugSettings(nextSettings);
      setDebugSettings(data);
      showSnackbar(data.enabled ? 'AI/RAG 调试快照已开启' : 'AI/RAG 调试快照已关闭', data.enabled ? 'warning' : 'success');
    } catch (error) {
      showSnackbar(error.message || '更新调试快照设置失败', 'error');
    }
  };

  const requestToggleDebug = () => {
    if (debugSettings.enabled) {
      updateDebugSettings({ ...debugSettings, enabled: false });
      return;
    }
    setConfirmDialog({
      open: true,
      title: '开启 AI/RAG 调试快照',
      message: '开启后会短期保存脱敏后的 prompt/响应片段，用于排查提示词拼装和模型输出问题。\n\n系统会自动遮蔽 token、密钥、邮箱、手机号等常见敏感信息，但仍建议仅在本机排障时短时间开启。',
      confirmText: '开启 30 分钟',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        await updateDebugSettings({ ...debugSettings, enabled: true, retention_minutes: 30, max_chars: 4000 });
      },
    });
  };

  const requestSnapshot = (item) => {
    setConfirmDialog({
      open: true,
      title: '查看调试快照',
      message: `将读取调用 ${item.call_id} 的脱敏快照。\n\n快照只用于排障，仍可能包含业务片段，请避免截图或外传。`,
      confirmText: '查看快照',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          const data = await apiExecutionAPI.getAIDebugSnapshot(item.call_id);
          setSnapshot(data);
        } catch (error) {
          showSnackbar(error.message || '调试快照不存在或已过期', 'warning');
        }
      },
    });
  };

  const totalCalls = summary?.total || 0;
  const failedRate = totalCalls ? ((summary?.failed_count || 0) / totalCalls) * 100 : 0;
  const degradedRate = totalCalls ? ((summary?.degraded_count || 0) / totalCalls) * 100 : 0;
  const successCount = Math.max(0, totalCalls - (summary?.failed_count || 0));
  const statusItems = [
    { label: '成功', count: successCount },
    { label: '失败', count: summary?.failed_count || 0 },
    { label: '降级', count: summary?.degraded_count || 0 },
  ].filter((item) => item.count > 0);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>AI/RAG 调用观测</Typography>
          <Typography variant="body2" color="text.secondary">记录模型、耗时、字符/token 量、降级和失败原因；不保存敏感 prompt 原文。</Typography>
        </Box>
        <Tooltip title="刷新观测数据">
          <span>
            <IconButton onClick={loadData} disabled={loading}>
              <RefreshOutlined />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        这里仅展示调用元数据和错误摘要，用于容量、成本和稳定性排查；不会展示用户问题、上下文、系统提示词或完整模型响应。
      </Alert>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>时间范围</InputLabel>
          <Select label="时间范围" value={timeRange} onChange={(event) => setTimeRange(event.target.value)}>
            {TIME_RANGE_OPTIONS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>功能</InputLabel>
          <Select label="功能" value={feature} onChange={(event) => setFeature(event.target.value)}>
            <MenuItem value="">全部功能</MenuItem>
            {Object.entries(FEATURE_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>状态</InputLabel>
          <Select label="状态" value={status} onChange={(event) => setStatus(event.target.value)}>
            <MenuItem value="">全部状态</MenuItem>
            {Object.entries(STATUS_LABELS).map(([value, meta]) => <MenuItem key={value} value={value}>{meta.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>降级</InputLabel>
          <Select label="降级" value={degraded} onChange={(event) => setDegraded(event.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="true">仅降级</MenuItem>
            <MenuItem value="false">未降级</MenuItem>
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
      </Stack>

      {loadError ? (
        <EmptyState variant="error" title="AI/RAG 观测加载失败" description={loadError} actionLabel="重试" onAction={loadData} />
      ) : loading && !summary ? (
        <EmptyState variant="loading" title="正在加载 AI/RAG 观测" />
      ) : (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1 }}>
            <Metric label="调用总数" value={formatNumber(summary?.total)} helper={TIME_RANGE_OPTIONS.find((item) => item.value === timeRange)?.label} icon={<BoltOutlined fontSize="small" />} />
            <Metric label="失败率" value={formatPercent(failedRate)} helper={`${formatNumber(summary?.failed_count)} 次失败`} tone={summary?.failed_count ? 'error' : 'success'} icon={<ErrorOutlineOutlined fontSize="small" />} />
            <Metric label="降级率" value={formatPercent(degradedRate)} helper={`${formatNumber(summary?.degraded_count)} 次降级`} tone={summary?.degraded_count ? 'warning' : 'success'} icon={<WarningAmberOutlined fontSize="small" />} />
            <Metric label="平均耗时" value={formatMs(summary?.avg_latency_ms)} helper="按筛选范围聚合" icon={<SpeedOutlined fontSize="small" />} />
            <Metric label="输入字符" value={formatNumber(summary?.prompt_chars)} helper={`输出 ${formatNumber(summary?.response_chars)}`} icon={<StorageOutlined fontSize="small" />} />
            <Metric label="总 tokens" value={formatNumber(summary?.total_tokens)} helper={`输入 ${formatNumber(summary?.input_tokens)} / 输出 ${formatNumber(summary?.output_tokens)}`} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.1fr 1fr 1fr' }, gap: 1 }}>
            <DistributionCard title="模型分布" items={summary?.model_counts || []} emptyTitle="暂无模型统计" color="#2563eb" />
            <DistributionCard title="功能分布" items={summary?.feature_counts || []} emptyTitle="暂无功能统计" color="#0891b2" />
            <DistributionCard title="失败原因" items={summary?.failure_reason_counts || []} emptyTitle="暂无失败原因" color="#dc2626" />
          </Box>

          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.52)' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
              <Stack direction="row" spacing={1} alignItems="center">
                <LockOutlined color="primary" fontSize="small" />
                <Box>
                  <Typography variant="subtitle2">隐私边界</Typography>
                  <Typography variant="caption" color="text.secondary">
                    默认仅记录元数据；调试快照开启后短期保存脱敏片段，过期后不可查看。
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant={debugSettings.enabled ? 'contained' : 'outlined'} color={debugSettings.enabled ? 'warning' : 'primary'} onClick={requestToggleDebug}>
                  {debugSettings.enabled ? `快照开启 ${debugSettings.retention_minutes} 分钟` : '开启调试快照'}
                </Button>
                {statusItems.map((item) => (
                  <Chip key={item.label} size="small" label={`${item.label} ${item.count}`} variant="outlined" />
                ))}
                {!statusItems.length && <Chip size="small" label="暂无调用" variant="outlined" />}
              </Stack>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.52)' }}>
            {items.length ? (
              <>
                <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle2">调用明细</Typography>
                  <Typography variant="caption" color="text.secondary">按时间倒序展示元数据，失败原因已截断为摘要。</Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>时间</TableCell>
                        <TableCell>功能</TableCell>
                        <TableCell>操作</TableCell>
                        <TableCell>模型</TableCell>
                        <TableCell>状态</TableCell>
                        <TableCell align="right">耗时</TableCell>
                        <TableCell align="right">字符</TableCell>
                        <TableCell align="right">Tokens</TableCell>
                        <TableCell>失败原因</TableCell>
                        <TableCell align="right">快照</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map((item) => {
                        const statusMeta = STATUS_LABELS[item.status] || STATUS_LABELS.success;
                        return (
                          <TableRow key={item.call_id} hover>
                            <TableCell>{formatRunTime(item.created_at) || '未记录'}</TableCell>
                            <TableCell>{FEATURE_LABELS[item.feature] || item.feature || '未分类'}</TableCell>
                            <TableCell>{item.operation || '未记录'}</TableCell>
                            <TableCell>{item.model || '未记录'}</TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                <Chip size="small" color={statusMeta.color} label={statusMeta.label} variant="outlined" />
                                {item.degraded && <Chip size="small" color="warning" label="降级" variant="outlined" />}
                              </Stack>
                            </TableCell>
                            <TableCell align="right">{formatMs(item.latency_ms)}</TableCell>
                            <TableCell align="right">{formatNumber((item.prompt_chars || 0) + (item.response_chars || 0))}</TableCell>
                            <TableCell align="right">{formatNumber(item.total_tokens)}</TableCell>
                            <TableCell>
                              <Typography variant="caption" color={item.failure_reason ? 'error.main' : 'text.secondary'} title={item.failure_reason || ''} sx={{ display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.failure_reason || '无'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Button size="small" variant="text" disabled={!debugSettings.enabled} onClick={() => requestSnapshot(item)}>
                                查看
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={total}
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
                <EmptyState compact title="暂无 AI/RAG 调用记录" description="产生 RAG 问答、Embedding 或测试用例生成调用后，这里会展示元数据。" />
              </Box>
            )}
          </Paper>
        </Stack>
      )}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        danger={confirmDialog.danger}
        onConfirm={confirmDialog.onConfirm || (() => {})}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false })}
      />
      <Dialog open={Boolean(snapshot)} onClose={() => setSnapshot(null)} maxWidth="md" fullWidth>
        <DialogTitle>脱敏调试快照</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Alert severity="warning">快照已脱敏并会过期，但仍仅建议用于本机排障。</Alert>
            {[
              ['System', snapshot?.system],
              ['User', snapshot?.user],
              ['Context', snapshot?.context],
              ['Response', snapshot?.response],
            ].map(([label, value]) => (
              value ? (
                <Box key={label}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Box component="pre" sx={{ mt: 0.5, p: 1.5, bgcolor: 'rgba(15,23,42,0.05)', borderRadius: 2, overflow: 'auto', maxHeight: 220, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {value}
                  </Box>
                </Box>
              ) : null
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnapshot(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
