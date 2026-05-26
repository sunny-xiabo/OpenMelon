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
  Pagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  LinearProgress,
  useTheme,
  Grid,
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
  RemoveRedEyeOutlined,
  ShieldOutlined,
  TerminalOutlined,
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
  success: { label: '成功', color: 'success', tone: '#10b981' },
  failed: { label: '失败', color: 'error', tone: '#ef4444' },
  degraded: { label: '降级', color: 'warning', tone: '#f59e0b' },
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
    info: { bg: 'rgba(2, 132, 199, 0.04)', color: '#0284c7', border: 'rgba(2, 132, 199, 0.15)' },
    success: { bg: 'rgba(22, 163, 74, 0.04)', color: '#16a34a', border: 'rgba(22, 163, 74, 0.15)' },
    warning: { bg: 'rgba(217, 119, 6, 0.04)', color: '#d97706', border: 'rgba(217, 119, 6, 0.15)' },
    error: { bg: 'rgba(220, 38, 38, 0.04)', color: '#dc2626', border: 'rgba(220, 38, 38, 0.15)' },
  };
  const config = tones[tone] || tones.info;
  
  return (
    <Box 
      className="magnetic-card"
      sx={{ 
        p: 2.2, 
        borderRadius: 4, 
        border: '1px solid', 
        borderColor: config.border, 
        bgcolor: config.bg, 
        minWidth: 0,
        boxShadow: `0 8px 24px ${alpha(config.color, 0.03)}, inset 0 1px 0 rgba(255,255,255,0.7)`,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 12px 28px ${alpha(config.color, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.9)`,
          borderColor: config.color,
        }
      }}
    >
      <Box sx={{ 
        position: 'absolute', top: -30, right: -30, width: 80, height: 80, 
        background: `radial-gradient(circle, ${alpha(config.color, 0.08)} 0%, transparent 70%)`,
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      <Stack spacing={1.5} sx={{ position: 'relative', zIndex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="caption" sx={{ fontWeight: 800, color: alpha(config.color, 0.85), letterSpacing: '0.04em' }}>
            {label}
          </Typography>
          {icon && (
            <Box 
              sx={{ 
                display: 'flex', 
                color: config.color, 
                bgcolor: alpha(config.color, 0.08), 
                p: 0.5, 
                borderRadius: 1.5,
                boxShadow: `0 2px 6px ${alpha(config.color, 0.08)}`
              }}
            >
              {icon}
            </Box>
          )}
        </Stack>
        
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: config.color, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
          </Typography>
          {helper && (
            <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.8, fontWeight: 500, display: 'block', mt: 0.5 }} noWrap>
              {helper}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

function DistributionCard({ title, items = [], emptyTitle, color = '#2563eb' }) {
  const max = Math.max(...items.map((i) => i.count || 0), 1);
  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 2.5, 
        borderRadius: 4, 
        border: '1px solid rgba(255, 255, 255, 0.45)', 
        bgcolor: 'rgba(255, 255, 255, 0.55)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.015), inset 0 1px 0 rgba(255,255,255,0.7)',
        height: '100%',
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
        {title}
      </Typography>
      <Stack spacing={1.75}>
        {items.slice(0, 6).map((item) => {
          const percent = Math.round(((item.count || 0) / max) * 100);
          return (
            <Box 
              key={item.label}
              sx={{
                p: 0.5,
                borderRadius: 1.5,
                transition: 'all 0.2s',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.6)',
                  '& .progress-bar-fill': {
                    filter: `drop-shadow(0 0 4px ${alpha(color, 0.4)})`
                  }
                }
              }}
            >
              <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mb: 0.75 }}>
                <Typography variant="caption" noWrap sx={{ fontWeight: 700, color: 'text.primary', fontSize: '11px' }}>
                  {item.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, fontSize: '10.5px' }}>
                  {item.count} 次
                </Typography>
              </Stack>
              <Box sx={{ height: 6, borderRadius: 99, bgcolor: 'rgba(15,23,42,0.06)', overflow: 'hidden' }}>
                <Box 
                  className="progress-bar-fill"
                  sx={{ 
                    height: '100%', 
                    width: `${percent}%`, 
                    background: `linear-gradient(90deg, ${color} 0%, ${alpha(color, 0.7)} 100%)`, 
                    borderRadius: 99,
                    transition: 'all 0.5s ease-out'
                  }} 
                />
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
  const theme = useTheme();
  
  // Filtering states
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

  // TanStack Query Hooks
  const { data: summary, isLoading: isSummaryLoading, error: summaryError, refetch: refetchSummary } = useAISummary(filters);
  const { data: logData, isFetching: isLogsFetching } = useAILogs({ ...filters, limit: rowsPerPage, offset: page * rowsPerPage });
  const { data: debugSettings = { enabled: false } } = useAIDebugSettings();
  
  const updateSettingsMutation = useUpdateDebugSettings();
  const getSnapshotMutation = useAIDebugSnapshot();

  const items = logData?.items || [];
  const total = logData?.total || 0;

  // Reset page when filter changes
  React.useEffect(() => setPage(0), [feature, status, degraded, keyword, timeRange]);

  const handleToggleDebug = () => {
    if (debugSettings.enabled) {
      updateSettingsMutation.mutate({ ...debugSettings, enabled: false });
      return;
    }
    setConfirmDialog({
      open: true,
      title: '开启 AI/RAG 调试快照',
      message: '开启后会短期保存脱敏后的 prompt/响应片段，仅限系统调试排障使用。是否确认开启？',
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await updateSettingsMutation.mutateAsync({ ...debugSettings, enabled: true, retention_minutes: 30, max_chars: 4000 });
      },
    });
  };

  const handleViewSnapshot = async (item) => {
    try {
      const data = await getSnapshotMutation.mutateAsync(item.call_id);
      setSnapshotContent({ ...data, call_id: item.call_id });
    } catch (e) {
      showSnackbar(e.message || '快照已失效', { severity: 'warning' });
    }
  };

  const totalCalls = summary?.total || 0;
  const failedRate = totalCalls ? ((summary?.failed_count || 0) / totalCalls) * 100 : 0;
  const degradedRate = totalCalls ? ((summary?.degraded_count || 0) / totalCalls) * 100 : 0;

  // macOS styled dialog prompt viewer split blocks
  const renderTerminalBlock = (title, text, colorTone) => {
    if (!text) return null;
    
    // Split text into line array to draw code line numbers!
    const lines = String(text || '').split('\n');

    return (
      <Box 
        sx={{ 
          borderRadius: 3.5, 
          bgcolor: '#090d16', 
          border: '1px solid rgba(255,255,255,0.06)', 
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
        }}
      >
        {/* Terminal Header */}
        <Box 
          sx={{ 
            px: 2, 
            py: 1, 
            bgcolor: '#141c2c', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.03)'
          }}
        >
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#94a3b8', opacity: 0.5 }} />
            <Typography variant="caption" sx={{ color: colorTone, fontFamily: 'Consolas, monospace', fontWeight: 700 }}>
              {title}@obs:~
            </Typography>
          </Stack>
          <Chip label="RO" size="small" sx={{ height: 16, fontSize: '8px', bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', borderRadius: 0.5 }} />
        </Box>

        {/* Terminal Body */}
        <Box 
          sx={{ 
            p: 2, 
            maxHeight: 180, 
            overflow: 'auto',
            '&::-webkit-scrollbar': { width: '5px' },
            '&::-webkit-scrollbar-track': { background: '#090d16' },
            '&::-webkit-scrollbar-thumb': { background: '#1e293b', borderRadius: '3px' },
          }}
        >
          {lines.map((line, idx) => (
            <Box key={idx} sx={{ display: 'flex', gap: 1.5, py: 0.15 }}>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'rgba(255,255,255,0.18)', 
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
                  color: '#e2e8f0', 
                  fontFamily: 'Consolas, Courier New, monospace', 
                  fontSize: '11px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {line}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ p: 0, background: 'radial-gradient(ellipse at 50% -20%, rgba(99, 102, 241, 0.03) 0%, transparent 80%)' }}>
      <style>
        {`
          @keyframes obs-led-ping {
            0% { transform: scale(0.8); opacity: 0.4; }
            50% { transform: scale(1.3); opacity: 0.8; }
            100% { transform: scale(0.8); opacity: 0.4; }
          }
          .obs-radar-pulse {
            width: 8px;
            height: 8px;
            borderRadius: 50%;
            display: inline-block;
            animation: obs-led-ping 2s infinite ease-in-out;
            transition: all 0.3s;
          }
        `}
      </style>

      {/* Header and refresh */}
      <Box sx={{ px: 3, py: 2.2, borderBottom: '1px solid', borderColor: 'rgba(255, 255, 255, 0.4)', bgcolor: 'rgba(255, 255, 255, 0.2)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" gap={1.5}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.01em' }}>
              AI/RAG 调用观测
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              实时分析大语言模型调用频率、运行耗时、Token 消耗及可用性率指标。
            </Typography>
          </Box>
          <Tooltip title="刷新数据">
            <span>
              <IconButton 
                onClick={() => refetchSummary()} 
                disabled={isSummaryLoading} 
                sx={{ 
                  border: '1px solid rgba(0,0,0,0.06)', 
                  bgcolor: 'white',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                  boxShadow: '0 2px 8px rgba(0,0,0,0.015)'
                }}
              >
                <RefreshOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* Filters Panel */}
        <Stack 
          direction={{ xs: 'column', md: 'row' }} 
          spacing={2} 
          sx={{ 
            mb: 3, 
            p: 2, 
            borderRadius: 3.5, 
            border: '1px solid rgba(255,255,255,0.4)', 
            bgcolor: 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="obs-range-label">时间范围</InputLabel>
            <Select 
              labelId="obs-range-label"
              label="时间范围" 
              value={timeRange} 
              onChange={(e) => setTimeRange(e.target.value)}
              sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
            >
              {TIME_RANGE_OPTIONS.map((i) => <MenuItem key={i.value} value={i.value} sx={{ fontSize: '12px' }}>{i.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="obs-feature-label">执行功能</InputLabel>
            <Select 
              labelId="obs-feature-label"
              label="执行功能" 
              value={feature} 
              onChange={(e) => setFeature(e.target.value)}
              sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部功能</MenuItem>
              {Object.entries(FEATURE_LABELS).map(([v, l]) => <MenuItem key={v} value={v} sx={{ fontSize: '12px' }}>{l}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="obs-status-label">调用状态</InputLabel>
            <Select 
              labelId="obs-status-label"
              label="调用状态" 
              value={status} 
              onChange={(e) => setStatus(e.target.value)}
              sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 600 }}
            >
              <MenuItem value="" sx={{ fontSize: '12px', fontWeight: 600 }}>全部状态</MenuItem>
              {Object.entries(STATUS_LABELS).map(([v, m]) => <MenuItem key={v} value={v} sx={{ fontSize: '12px' }}>{m.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="搜索日志内容/模型..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            InputProps={{
              startAdornment: <SearchOutlined fontSize="small" sx={{ color: 'text.secondary', mr: 0.5 }} />,
            }}
            sx={{ 
              flex: 1, 
              minWidth: 200,
              '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', bgcolor: 'rgba(255,255,255,0.4)' }
            }}
          />
        </Stack>

        {summaryError ? (
          <EmptyState variant="error" title="数据加载失败" description={summaryError.message} onAction={() => refetchSummary()} />
        ) : isSummaryLoading ? (
          <EmptyState variant="loading" title="正在获取观测数据..." />
        ) : (
          <Stack spacing={3}>
            {/* Top Telemetry Metrics cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2 }}>
              <Metric label="调用总数 (Calls)" value={formatNumber(summary?.total)} tone="info" icon={<BoltOutlined fontSize="small" />} />
              <Metric label="失败率 (Failure Rate)" value={formatPercent(failedRate)} tone={failedRate > 5 ? 'error' : 'success'} icon={<ErrorOutlineOutlined fontSize="small" />} />
              <Metric label="降级率 (Degraded Rate)" value={formatPercent(degradedRate)} tone={degradedRate > 0 ? 'warning' : 'success'} icon={<WarningAmberOutlined fontSize="small" />} />
              <Metric label="平均响应耗时" value={formatMs(summary?.avg_latency_ms)} tone="info" icon={<SpeedOutlined fontSize="small" />} />
              <Metric label="大模型 Token 吞吐" value={formatNumber(summary?.total_tokens)} tone="success" helper={`提示词输入 ${formatNumber(summary?.input_tokens)} Token`} />
            </Box>

            {/* Distributions charts */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr 1fr' }, gap: 3.5 }}>
              <DistributionCard title="模型分布 (Model Volume)" items={summary?.model_counts} color="#8b5cf6" />
              <DistributionCard title="场景功能分布 (Feature Volume)" items={summary?.feature_counts} color="#0ea5e9" />
              <DistributionCard title="失败诱因频次 (Error Analysis)" items={summary?.failure_reason_counts} color="#ef4444" />
            </Box>

            {/* Recommendations Section */}
            {(feature === 'rag' || !feature) && (
              <GovernanceRecommendationsPanel
                compact
                title="RAG 闭环建议"
                caption="把 RAG 失败、降级和索引治理诊断串成可执行动作。"
              />
            )}

            {/* Debug Snapshot Controller Vault */}
            <Paper 
              elevation={0}
              sx={{ 
                p: 2.5, 
                borderRadius: 4, 
                border: '1px solid rgba(255, 255, 255, 0.45)',
                background: debugSettings.enabled 
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.04) 0%, rgba(255, 255, 255, 0.2) 100%)'
                  : 'rgba(255, 255, 255, 0.55)',
                borderColor: debugSettings.enabled ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.45)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.015), inset 0 1px 0 rgba(255,255,255,0.7)',
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap gap={2}>
                <Stack direction="row" spacing={1.75} alignItems="center">
                  {/* Glowing warning radar lamp */}
                  <Box 
                    sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: 2, 
                      bgcolor: debugSettings.enabled ? 'rgba(245,158,11,0.08)' : 'rgba(0,0,0,0.03)',
                      color: debugSettings.enabled ? 'warning.main' : 'text.disabled',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <ShieldOutlined sx={{ fontSize: 18 }} />
                  </Box>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>调试快照控制舱 (Debug Security Vault)</Typography>
                      <Box 
                        className="obs-radar-pulse"
                        style={{
                          backgroundColor: debugSettings.enabled ? '#f59e0b' : '#94a3b8',
                          '--led-glow': debugSettings.enabled ? 'rgba(245,158,11,0.5)' : 'rgba(148,163,184,0.3)',
                        }}
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontWeight: 500 }}>
                      开启后将短期保存脱敏后的 Prompt / Response 对话快照，仅限开发排错，安全期限 30 分钟。
                    </Typography>
                  </Box>
                </Stack>
                <Button 
                  variant={debugSettings.enabled ? 'contained' : 'outlined'} 
                  color={debugSettings.enabled ? 'warning' : 'primary'}
                  onClick={handleToggleDebug}
                  disabled={updateSettingsMutation.isPending}
                  sx={{ 
                    borderRadius: 2.2, 
                    fontWeight: 800, 
                    px: 3, 
                    textTransform: 'none', 
                    fontSize: '12px',
                    boxShadow: debugSettings.enabled ? '0 4px 12px rgba(245,158,11,0.2)' : 'none'
                  }}
                >
                  {debugSettings.enabled ? '已开启调试模式' : '开启调试快照'}
                </Button>
              </Stack>
            </Paper>

            {/* Audit Logs table ledger */}
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
              {isLogsFetching && <LinearProgress />}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.25)' }}>
                      <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px', py: 1.5 }}>调用时间</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>对应场景</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>模型型号</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>健康状态</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>响应耗时</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px' }}>Token 消耗</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '11px', pr: 2 }}>调试视察</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => {
                      const meta = STATUS_LABELS[item.status] || STATUS_LABELS.success;
                      return (
                        <TableRow key={item.call_id} hover sx={{ '&:hover': { bgcolor: 'rgba(26,115,232,0.02) !important' } }}>
                          <TableCell sx={{ fontSize: '11px', py: 1.25, fontWeight: 500, color: 'text.secondary' }}>
                            {formatRunTime(item.created_at)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '11.5px', fontWeight: 700, color: 'text.primary' }}>
                            {FEATURE_LABELS[item.feature] || item.feature}
                          </TableCell>
                          <TableCell sx={{ fontSize: '11px', fontFamily: 'monospace', color: 'text.secondary' }}>
                            {item.model}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              size="small" 
                              label={meta.label} 
                              color={meta.color}
                              variant="outlined" 
                              sx={{ 
                                height: 18, 
                                fontSize: '10px', 
                                fontWeight: 800, 
                                borderRadius: 1,
                                borderColor: alpha(meta.tone, 0.3),
                                bgcolor: alpha(meta.tone, 0.04),
                                color: meta.tone,
                              }} 
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '11.5px', fontWeight: 600, color: 'text.primary' }}>
                            {formatMs(item.latency_ms)}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '11px', fontFamily: 'monospace', color: 'text.secondary' }}>
                            {formatNumber(item.total_tokens)}
                          </TableCell>
                          <TableCell align="right" sx={{ pr: 2 }}>
                            <Button 
                              size="small" 
                              variant="outlined"
                              disabled={!debugSettings.enabled} 
                              startIcon={<RemoveRedEyeOutlined sx={{ fontSize: '12px !important' }} />}
                              onClick={() => handleViewSnapshot(item)}
                              sx={{ 
                                borderRadius: 1.5, 
                                py: 0.1, 
                                px: 1.25, 
                                fontSize: '10.5px', 
                                fontWeight: 800,
                                textTransform: 'none',
                                '&:disabled': { color: 'text.disabled', borderColor: 'rgba(0,0,0,0.04)' }
                              }}
                            >
                              视察
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                  {total > 0 ? (
                    `显示第 ${page * rowsPerPage + 1} - ${Math.min((page + 1) * rowsPerPage, total)} 条，共 ${total} 条记录`
                  ) : (
                    '共 0 条记录'
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
                      onChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
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
                      {[10, 25, 50, 100].map(val => (
                        <MenuItem key={val} value={val} sx={{ fontSize: '11px', fontWeight: 600 }}>
                          {val} 行
                        </MenuItem>
                      ))}
                    </Select>
                  </Stack>

                  <Pagination 
                    count={Math.max(1, Math.ceil(total / rowsPerPage))} 
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
            </Paper>
          </Stack>
        )}

        <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} />
        
        {/* macOS styled Dialog console prompt inspector */}
        <Dialog 
          open={!!snapshotContent} 
          onClose={() => setSnapshotContent(null)} 
          maxWidth="md" 
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: 4.5,
              bgcolor: '#090d16',
              boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.08)',
            }
          }}
        >
          {/* macOS Top Bar */}
          <Box 
            sx={{ 
              px: 2.5, 
              py: 1.5, 
              bgcolor: '#141c2c', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}
          >
            <Stack direction="row" spacing={1}>
              <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: '#ef4444' }} />
              <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: '#f59e0b' }} />
              <Box sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: '#10b981' }} />
            </Stack>
            
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'rgba(255,255,255,0.4)', 
                fontFamily: 'Consolas, monospace',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              melon@auditor:~/snapshots/{snapshotContent?.call_id?.slice(0, 8) || 'log'}
            </Typography>
            <Box sx={{ width: 42 }} /> {/* spacer */}
          </Box>

          <DialogContent dividers sx={{ borderColor: 'rgba(255,255,255,0.05)', bgcolor: '#090d16', p: 3 }}>
            <Stack spacing={2.5}>
              {renderTerminalBlock('system', snapshotContent?.system, '#60a5fa')}
              {renderTerminalBlock('user', snapshotContent?.user, '#f87171')}
              {renderTerminalBlock('context', snapshotContent?.context, '#34d399')}
              {renderTerminalBlock('response', snapshotContent?.response, '#c084fc')}
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 2, bgcolor: '#141c2c', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Button 
              onClick={() => setSnapshotContent(null)}
              variant="contained"
              sx={{ 
                bgcolor: 'rgba(255,255,255,0.1)', 
                color: '#fff',
                borderRadius: 2,
                fontWeight: 800,
                fontSize: '11.5px',
                px: 3.5,
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              关闭终端
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
