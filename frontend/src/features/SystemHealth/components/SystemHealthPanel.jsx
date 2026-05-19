import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import HubOutlined from '@mui/icons-material/HubOutlined';
import MemoryOutlined from '@mui/icons-material/MemoryOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import SettingsEthernetOutlined from '@mui/icons-material/SettingsEthernetOutlined';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { useSystemHealth } from '../hooks/useSystemHealth';

const STATUS_META = {
  ok: { label: '正常', color: 'success', tone: '#16a34a', icon: CheckCircleOutlineOutlined },
  disabled: { label: '未启用', color: 'default', tone: '#64748b', icon: HelpOutlineOutlined },
  not_loaded: { label: '未加载', color: 'info', tone: '#0284c7', icon: HelpOutlineOutlined },
  missing_config: { label: '缺少配置', color: 'warning', tone: '#d97706', icon: WarningAmberOutlined },
  degraded: { label: '降级', color: 'warning', tone: '#d97706', icon: WarningAmberOutlined },
  down: { label: '不可用', color: 'error', tone: '#dc2626', icon: ErrorOutlineOutlined },
  unknown: { label: '未知', color: 'default', tone: '#64748b', icon: HelpOutlineOutlined },
};

const COMPONENTS = [
  { key: 'api', label: 'API 服务', icon: MonitorHeartOutlined },
  { key: 'sqlite', label: 'SQLite', icon: StorageOutlined },
  { key: 'llm', label: 'LLM Provider', icon: PsychologyOutlined },
  { key: 'neo4j', label: 'Neo4j', icon: HubOutlined },
  { key: 'qdrant', label: 'Qdrant', icon: SettingsEthernetOutlined },
  { key: 'reranker', label: 'Reranker', icon: MemoryOutlined },
];

const getStatusMeta = (status) => STATUS_META[status] || STATUS_META.unknown;

function formatCheckedAt(value) {
  if (!value) return '尚未检查';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDetailValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '空';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === null || value === undefined || value === '') return '空';
  return String(value);
}

function detailEntries(component) {
  return Object.entries(component || {})
    .filter(([key]) => !['status', 'message'].includes(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 4);
}

function StatusChip({ status }) {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: '1rem !important' }} />}
      label={meta.label}
      color={meta.color}
      variant={meta.color === 'default' ? 'outlined' : 'filled'}
      sx={{ borderRadius: 1.5, fontWeight: 700 }}
    />
  );
}

function ComponentHealthCard({ item, component }) {
  const status = component?.status || 'unknown';
  const meta = getStatusMeta(status);
  const Icon = item.icon;
  const entries = detailEntries(component);

  return (
    <Box
      sx={{
        minWidth: 0,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(meta.tone, 0.18),
        bgcolor: alpha(meta.tone, 0.05),
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              display: 'grid',
              placeItems: 'center',
              color: meta.tone,
              bgcolor: alpha(meta.tone, 0.12),
              flexShrink: 0,
            }}
          >
            <Icon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.25 }}>
              {item.label}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
              {component?.message || '暂无检查结果'}
            </Typography>
          </Box>
        </Stack>
        <StatusChip status={status} />
      </Stack>

      {entries.length > 0 && (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
          {entries.map(([key, value]) => (
            <Tooltip key={key} title={`${key}: ${formatDetailValue(value)}`}>
              <Chip
                size="small"
                label={`${key}: ${formatDetailValue(value)}`}
                variant="outlined"
                sx={{
                  maxWidth: '100%',
                  borderRadius: 1.25,
                  '& .MuiChip-label': {
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  },
                }}
              />
            </Tooltip>
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function SystemHealthPanel() {
  const { data, error, isLoading, isFetching, refetch } = useSystemHealth();
  const components = data?.components || {};
  const orderedComponents = COMPONENTS.map((item) => ({ item, component: components[item.key] || {} }));
  const extraComponents = Object.entries(components)
    .filter(([key]) => !COMPONENTS.some((item) => item.key === key))
    .map(([key, component]) => ({
      item: { key, label: key, icon: MonitorHeartOutlined },
      component,
    }));
  const allComponents = [...orderedComponents, ...extraComponents];
  const overallStatus = error ? 'down' : (data?.status || 'unknown');
  const overallMeta = getStatusMeta(overallStatus);
  const OverallIcon = overallMeta.icon;
  const degradedCount = allComponents.filter(({ component }) => ['degraded', 'missing_config', 'not_loaded'].includes(component?.status)).length;
  const downCount = allComponents.filter(({ component }) => component?.status === 'down').length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, height: '100%', overflow: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-end' }}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>运行态健康检查</Typography>
          <Typography variant="body2" color="text.secondary">
            汇总后端 API、SQLite、LLM、Neo4j、Qdrant 与 Reranker 的当前可用性。
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={isFetching ? <CircularProgress size={16} /> : <RefreshOutlined />}
          onClick={() => refetch()}
          disabled={isFetching}
          sx={{ alignSelf: { xs: 'flex-start', md: 'auto' } }}
        >
          刷新
        </Button>
      </Stack>

      {isLoading && <LinearProgress sx={{ mb: 2, borderRadius: 99 }} />}

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {error.message || '健康检查请求失败'}
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          mb: 2,
          borderRadius: 2.5,
          border: '1px solid',
          borderColor: alpha(overallMeta.tone, 0.2),
          bgcolor: alpha(overallMeta.tone, 0.06),
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                color: overallMeta.tone,
                bgcolor: alpha(overallMeta.tone, 0.12),
              }}
            >
              <OverallIcon />
            </Box>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>系统状态</Typography>
                <StatusChip status={overallStatus} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                版本 {data?.version || '未知'} · 检查时间 {formatCheckedAt(data?.checked_at)}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={2} divider={<Divider orientation="vertical" flexItem />}>
            <Box>
              <Typography variant="caption" color="text.secondary">降级项</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: degradedCount ? 'warning.main' : 'text.primary' }}>
                {degradedCount}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">不可用</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, color: downCount ? 'error.main' : 'text.primary' }}>
                {downCount}
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.5,
        }}
      >
        {allComponents.map(({ item, component }) => (
          <ComponentHealthCard key={item.key} item={item} component={component} />
        ))}
      </Box>
    </Box>
  );
}
