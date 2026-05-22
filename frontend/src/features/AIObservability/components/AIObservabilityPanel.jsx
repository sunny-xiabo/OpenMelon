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
  LinearProgress,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
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
import { formatRunTime } from '../../APIExecution/utils';
import GovernanceRecommendationsPanel from '../../IndexGovernance/GovernanceRecommendationsPanel';

// Hooks
import {
  useAISummary,
  useAILogs,
  useAIDebugSettings,
  useUpdateDebugSettings,
  useAIDebugSnapshot,
} from '../hooks/useAIObservability';

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

const formatNumber = (v) => Number(v || 0).toLocaleString();
const formatMs = (v) => `${formatNumber(v)} ms`;
const formatPercent = (v) => `${Number(v || 0).toFixed(1)}%`;

const getRangeParams = (timeRange) => {
  const range = TIME_RANGE_OPTIONS.find((i) => i.value === timeRange);
  if (!range?.ms) return { startAt: '', endAt: '' };
  return { startAt: new Date(Date.now() - range.ms).toISOString(), endAt: '' };
};

function Metric({ label, value, helper = '', tone = 'info', icon = null }) {
  const theme = useTheme();
  const tones = {
    info: { bg: alpha(theme.palette.info.main, 0.1), color: theme.palette.info.main },
    success: { bg: alpha(theme.palette.success.main, 0.1), color: theme.palette.success.main },
    warning: { bg: alpha(theme.palette.warning.main, 0.1), color: theme.palette.warning.main },
    error: { bg: alpha(theme.palette.error.main, 0.1), color: theme.palette.error.main },
  };
  const config = tones[tone] || tones.info;
  return (
    <Box sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: alpha(config.color, 0.1), bgcolor: config.bg, minWidth: 0 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: alpha(config.color, 0.8) }}>{label}</Typography>
        {icon && <Box sx={{ display: 'flex', color: config.color }}>{icon}</Box>}
      </Stack>
      <Typography variant="h6" sx={{ fontWeight: 800, color: config.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
      {helper && <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.7 }} noWrap>{helper}</Typography>}
    </Box>
  );
}

function DistributionCard({ title, items = [], emptyTitle, color = 'primary.main' }) {
  const max = Math.max(...items.map((i) => i.count || 0), 1);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.52)' }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{title}</Typography>
      <Stack spacing={1}>
        {items.slice(0, 6).map((item) => {
          const percent = Math.round(((item.count || 0) / max) * 100);
          return (
            <Box key={item.label}>
              <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mb: 0.5 }}>
                <Typography variant="caption" noWrap sx={{ fontWeight: 700 }}>{item.label}</Typography>
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
  
  // 筛选状态
  const [feature, setFeature] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [degraded, setDegraded] = React.useState('');
  const [timeRange, setTimeRange] = React.useState('7d');
  const [keyword, setKeyword] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(25);
  
  const [confirmDialog, setConfirmDialog] = React.useState({ open: false, title: '', message: '', onConfirm: null });
  const [snapshotContent, setSnapshotContent] = React.useState(null);

  const rangeParams = React.useMemo(() => getRangeParams(timeRange), [timeRange]);
  const filters = React.useMemo(() => ({
    feature, status, degraded, keyword,
    startAt: rangeParams.startAt, endAt: rangeParams.endAt,
  }), [feature, status, degraded, keyword, rangeParams]);

  // 使用 TanStack Query
  const { data: summary, isLoading: isSummaryLoading, error: summaryError, refetch: refetchSummary } = useAISummary(filters);
  const { data: logData, isFetching: isLogsFetching } = useAILogs({ ...filters, limit: rowsPerPage, offset: page * rowsPerPage });
  const { data: debugSettings = { enabled: false } } = useAIDebugSettings();
  
  const updateSettingsMutation = useUpdateDebugSettings();
  const getSnapshotMutation = useAIDebugSnapshot();

  const items = logData?.items || [];
  const total = logData?.total || 0;

  // 筛选条件变化重置页码
  React.useEffect(() => setPage(0), [feature, status, degraded, keyword, timeRange]);

  const handleToggleDebug = () => {
    if (debugSettings.enabled) {
      updateSettingsMutation.mutate({ ...debugSettings, enabled: false });
      return;
    }
    setConfirmDialog({
      open: true,
      title: '开启 AI/RAG 调试快照',
      message: '开启后会短期保存脱敏后的 prompt/响应片段，用于排错。',
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await updateSettingsMutation.mutateAsync({ ...debugSettings, enabled: true, retention_minutes: 30, max_chars: 4000 });
      },
    });
  };

  const handleViewSnapshot = async (item) => {
    try {
      const data = await getSnapshotMutation.mutateAsync(item.call_id);
      setSnapshotContent(data);
    } catch (e) {
      showSnackbar(e.message || '快照已失效', { severity: 'warning' });
    }
  };

  const totalCalls = summary?.total || 0;
  const failedRate = totalCalls ? ((summary?.failed_count || 0) / totalCalls) * 100 : 0;
  const degradedRate = totalCalls ? ((summary?.degraded_count || 0) / totalCalls) * 100 : 0;
  const statusItems = [
    { label: '成功', count: Math.max(0, totalCalls - (summary?.failed_count || 0)) },
    { label: '失败', count: summary?.failed_count || 0 },
    { label: '降级', count: summary?.degraded_count || 0 },
  ].filter(i => i.count > 0);

  return (
    <Box sx={{ p: 0 }}>
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'rgba(255, 255, 255, 0.4)', bgcolor: 'rgba(255, 255, 255, 0.1)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" gap={1.5}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>AI/RAG 调用观测</Typography>
            <Typography variant="caption" color="text.secondary">分析模型效能、耗时与稳定性指标。</Typography>
          </Box>
          <Tooltip title="刷新数据">
            <span>
              <IconButton onClick={() => refetchSummary()} disabled={isSummaryLoading} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <RefreshOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      <Box sx={{ p: 2.5 }}>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>时间范围</InputLabel>
          <Select label="时间范围" value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            {TIME_RANGE_OPTIONS.map((i) => <MenuItem key={i.value} value={i.value}>{i.label}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>功能</InputLabel>
          <Select label="功能" value={feature} onChange={(e) => setFeature(e.target.value)}>
            <MenuItem value="">全部功能</MenuItem>
            {Object.entries(FEATURE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>状态</InputLabel>
          <Select label="状态" value={status} onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="">全部状态</MenuItem>
            {Object.entries(STATUS_LABELS).map(([v, m]) => <MenuItem key={v} value={v}>{m.label}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="搜索..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
        />
      </Stack>

      {summaryError ? (
        <EmptyState variant="error" title="加载失败" description={summaryError.message} onAction={() => refetchSummary()} />
      ) : isSummaryLoading ? (
        <EmptyState variant="loading" title="正在获取观测数据..." />
      ) : (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1 }}>
            <Metric label="调用总数" value={formatNumber(summary?.total)} icon={<BoltOutlined fontSize="small" />} />
            <Metric label="失败率" value={formatPercent(failedRate)} tone={failedRate > 5 ? 'error' : 'success'} icon={<ErrorOutlineOutlined fontSize="small" />} />
            <Metric label="降级率" value={formatPercent(degradedRate)} tone={degradedRate > 0 ? 'warning' : 'success'} icon={<WarningAmberOutlined fontSize="small" />} />
            <Metric label="平均耗时" value={formatMs(summary?.avg_latency_ms)} icon={<SpeedOutlined fontSize="small" />} />
            <Metric label="总 Token" value={formatNumber(summary?.total_tokens)} helper={`输入 ${formatNumber(summary?.input_tokens)}`} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 1 }}>
            <DistributionCard title="模型分布" items={summary?.model_counts} color="#2563eb" />
            <DistributionCard title="功能分布" items={summary?.feature_counts} color="#0891b2" />
            <DistributionCard title="失败原因" items={summary?.failure_reason_counts} color="#dc2626" />
          </Box>

          {(feature === 'rag' || !feature) && (
            <GovernanceRecommendationsPanel
              compact
              title="RAG 闭环建议"
              caption="把 RAG 失败、降级和索引治理诊断串成可执行动作。"
            />
          )}

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.4)' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2">调试快照控制</Typography>
                <Typography variant="caption" color="text.secondary">开启后将记录脱敏后的对话片段，仅限排障使用。</Typography>
              </Box>
              <Button 
                variant={debugSettings.enabled ? 'contained' : 'outlined'} 
                color={debugSettings.enabled ? 'warning' : 'primary'}
                onClick={handleToggleDebug}
                disabled={updateSettingsMutation.isPending}
              >
                {debugSettings.enabled ? '已开启调试模式' : '开启调试快照'}
              </Button>
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {isLogsFetching && <LinearProgress />}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>时间</TableCell>
                    <TableCell>功能</TableCell>
                    <TableCell>模型</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell align="right">耗时</TableCell>
                    <TableCell align="right">Tokens</TableCell>
                    <TableCell align="right">快照</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.call_id} hover>
                      <TableCell>{formatRunTime(item.created_at)}</TableCell>
                      <TableCell>{FEATURE_LABELS[item.feature] || item.feature}</TableCell>
                      <TableCell>{item.model}</TableCell>
                      <TableCell>
                        <Chip size="small" label={STATUS_LABELS[item.status]?.label} color={STATUS_LABELS[item.status]?.color} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">{formatMs(item.latency_ms)}</TableCell>
                      <TableCell align="right">{formatNumber(item.total_tokens)}</TableCell>
                      <TableCell align="right">
                        <Button size="small" disabled={!debugSettings.enabled} onClick={() => handleViewSnapshot(item)}>查看</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!items.length && (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <EmptyState compact title="暂无 AI/RAG 调用记录" />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div" count={total} page={page} rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[10, 25, 50, 100]}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </Paper>
        </Stack>
      )}

      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} />
      
      <Dialog open={!!snapshotContent} onClose={() => setSnapshotContent(null)} maxWidth="md" fullWidth>
        <DialogTitle>调用快照内容</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {['system', 'user', 'context', 'response'].map(key => snapshotContent?.[key] && (
              <Box key={key}>
                <Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 800 }}>{key}</Typography>
                <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, fontSize: 12, whiteSpace: 'pre-wrap', border: '1px solid #e2e8f0' }}>
                  {snapshotContent[key]}
                </Box>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setSnapshotContent(null)}>关闭</Button></DialogActions>
      </Dialog>
      </Box>
    </Box>
  );
}
