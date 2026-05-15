import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  AccountTreeOutlined,
  AutoFixHighOutlined,
  CancelOutlined,
  CloseOutlined,
  DataObjectOutlined,
  DeleteSweepOutlined,
  FilterAltOffOutlined,
  HubOutlined,
  RadarOutlined,
  RefreshOutlined,
  ReplayOutlined,
  RestartAltOutlined,
  SearchOutlined,
  StorageOutlined,
  SyncProblemOutlined,
} from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { indexGovernanceAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import ConfirmDialog from '../components/ConfirmDialog';

const PIPELINE_STEPS = [
  { label: '业务源', icon: <DataObjectOutlined fontSize="small" />, caption: '文档 / 用例 / API 知识' },
  { label: 'Neo4j', icon: <AccountTreeOutlined fontSize="small" />, caption: '图谱节点、关系、embedding' },
  { label: 'Qdrant', icon: <StorageOutlined fontSize="small" />, caption: '语义向量点与 payload' },
  { label: 'RAG 检索', icon: <SearchOutlined fontSize="small" />, caption: '只召回 active 资产' },
];

const statusConfig = {
  healthy: { label: '健康', color: 'success' },
  attention: { label: '需关注', color: 'warning' },
  unavailable: { label: '不可用', color: 'default' },
};

const taskStatusConfig = {
  queued: { label: '排队中', color: 'default' },
  running: { label: '执行中', color: 'info' },
  succeeded: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  cancelled: { label: '已取消', color: 'warning' },
};

const taskOperationLabels = {
  rebuild_qdrant: 'Qdrant 重建',
};

const shellSx = {
  borderRadius: 2,
  borderColor: 'rgba(148,163,184,0.28)',
  bgcolor: 'rgba(255,255,255,0.86)',
  boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
};

function SectionHeader({ title, caption, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ p: 1.5 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{title}</Typography>
        {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

function MetricCard({ label, value, tone = 'info', helper, icon }) {
  const colors = {
    info: { bg: 'rgba(14,165,233,0.08)', iconBg: 'rgba(14,165,233,0.14)', color: 'info.main' },
    success: { bg: 'rgba(34,197,94,0.08)', iconBg: 'rgba(34,197,94,0.14)', color: 'success.main' },
    warning: { bg: 'rgba(245,158,11,0.08)', iconBg: 'rgba(245,158,11,0.16)', color: 'warning.main' },
    error: { bg: 'rgba(239,68,68,0.08)', iconBg: 'rgba(239,68,68,0.14)', color: 'error.main' },
  };
  const palette = colors[tone] || colors.info;
  return (
    <Paper variant="outlined" sx={{ ...shellSx, p: 1.5, bgcolor: palette.bg, minHeight: 96 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h4" sx={{ color: palette.color, fontWeight: 800, lineHeight: 1.05, mt: 0.5 }}>{value}</Typography>
        </Box>
        {icon && (
          <Box sx={{ width: 34, height: 34, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: palette.iconBg, color: palette.color, flexShrink: 0 }}>
            {icon}
          </Box>
        )}
      </Stack>
      {helper && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>{helper}</Typography>}
    </Paper>
  );
}

function Pipeline() {
  return (
    <Paper variant="outlined" sx={{ ...shellSx, p: 1.25 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', md: 'center' }}>
        {PIPELINE_STEPS.map((step, index) => (
          <Stack key={step.label} direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0, p: 0.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: 'rgba(25,118,210,0.08)', color: 'primary.main', flexShrink: 0 }}>
              {step.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>{step.label}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{step.caption}</Typography>
            </Box>
            {index < PIPELINE_STEPS.length - 1 && (
              <Box sx={{ display: { xs: 'none', md: 'block' }, ml: 'auto', color: 'text.disabled', fontWeight: 800 }}>→</Box>
            )}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

export default function IndexGovernancePage() {
  const showSnackbar = useSnackbar();
  const [assetType, setAssetType] = React.useState('');
  const [keyword, setKeyword] = React.useState('');
  const [detailAssetKey, setDetailAssetKey] = React.useState('');
  const [confirmDialog, setConfirmDialog] = React.useState({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
  const summaryQuery = useQuery({
    queryKey: ['index-governance', 'summary'],
    queryFn: indexGovernanceAPI.getSummary,
    refetchOnWindowFocus: false,
  });
  const assetsQuery = useQuery({
    queryKey: ['index-governance', 'assets'],
    queryFn: indexGovernanceAPI.getAssets,
    refetchOnWindowFocus: false,
  });
  const diagnosticsQuery = useQuery({
    queryKey: ['index-governance', 'diagnostics'],
    queryFn: indexGovernanceAPI.getDiagnostics,
    refetchOnWindowFocus: false,
  });
  const tasksQuery = useQuery({
    queryKey: ['index-governance', 'tasks'],
    queryFn: indexGovernanceAPI.getTasks,
    refetchInterval: (query) => {
      const items = query.state.data?.items || [];
      return items.some((task) => ['queued', 'running'].includes(task.status)) ? 1500 : false;
    },
    refetchOnWindowFocus: false,
  });
  const assetDetailQuery = useQuery({
    queryKey: ['index-governance', 'asset-detail', detailAssetKey],
    queryFn: () => indexGovernanceAPI.getAssetDetails(detailAssetKey),
    enabled: Boolean(detailAssetKey),
    refetchOnWindowFocus: false,
  });

  const assets = React.useMemo(() => (assetsQuery.data?.items || []).map((asset) => ({
    key: asset.key,
    name: asset.name,
    source: asset.source,
    assetType: asset.asset_type,
    neo4jLabel: asset.neo4j_label,
    qdrantCollection: asset.qdrant_collection,
    businessCount: asset.business_count ?? 0,
    neo4jCount: asset.neo4j_count,
    qdrantCount: asset.qdrant_count,
    activeCount: asset.active_count ?? 0,
    issueCount: asset.issue_count ?? 0,
    missingInQdrantCount: asset.missing_in_qdrant_count ?? 0,
    orphanInQdrantCount: asset.orphan_in_qdrant_count ?? 0,
    sourceOrphanCount: asset.source_orphan_count ?? 0,
    missingInQdrantSamples: asset.missing_in_qdrant_samples || [],
    orphanQdrantSamples: asset.orphan_qdrant_samples || [],
    lastSync: asset.last_sync || '实时扫描',
    status: asset.status || 'attention',
  })), [assetsQuery.data]);
  const diagnostics = diagnosticsQuery.data?.items || [];
  const tasks = tasksQuery.data?.items || [];
  const hasRunningTask = tasks.some((task) => ['queued', 'running'].includes(task.status));
  const summary = summaryQuery.data || {};
  const isLoading = summaryQuery.isLoading || assetsQuery.isLoading || diagnosticsQuery.isLoading;
  const isFetching = summaryQuery.isFetching || assetsQuery.isFetching || diagnosticsQuery.isFetching;
  const isError = summaryQuery.isError || assetsQuery.isError || diagnosticsQuery.isError;
  const syncStatusMutation = useMutation({
    mutationFn: indexGovernanceAPI.syncStatus,
    onSuccess: (data) => {
      showSnackbar(data?.message || '治理状态已同步', { severity: 'success' });
      refresh();
    },
    onError: (error) => {
      showSnackbar(error?.message || '治理状态同步失败', { severity: 'error' });
    },
  });
  const scanMutation = useMutation({
    mutationFn: indexGovernanceAPI.scan,
    onSuccess: (data) => {
      const issueCount = data?.summary?.issue_count ?? 0;
      showSnackbar(`一致性扫描完成，发现 ${issueCount} 个风险项`, { severity: issueCount ? 'warning' : 'success' });
      refresh();
    },
    onError: (error) => {
      showSnackbar(error?.message || '一致性扫描失败', { severity: 'error' });
    },
  });
  const cleanupOrphansMutation = useMutation({
    mutationFn: indexGovernanceAPI.cleanupOrphans,
    onSuccess: (data) => {
      showSnackbar(data?.message || '孤儿向量已清理', { severity: 'success' });
      refresh();
    },
    onError: (error) => {
      showSnackbar(error?.message || '孤儿向量清理失败', { severity: 'error' });
    },
  });
  const cleanupSourceOrphansMutation = useMutation({
    mutationFn: indexGovernanceAPI.cleanupSourceOrphans,
    onSuccess: (data) => {
      showSnackbar(data?.message || '源缺失索引已清理', { severity: 'success' });
      refresh();
    },
    onError: (error) => {
      showSnackbar(error?.message || '源缺失索引清理失败', { severity: 'error' });
    },
  });
  const rebuildQdrantMutation = useMutation({
    mutationFn: indexGovernanceAPI.rebuildQdrant,
    onSuccess: (data) => {
      showSnackbar(data?.message || 'Qdrant 重建任务已启动', { severity: 'success' });
      refresh();
      tasksQuery.refetch();
    },
    onError: (error) => {
      showSnackbar(error?.message || 'Qdrant 向量重建失败', { severity: 'error' });
    },
  });
  const cancelTaskMutation = useMutation({
    mutationFn: indexGovernanceAPI.cancelTask,
    onSuccess: (data) => {
      showSnackbar(data?.message || '已请求取消任务', { severity: 'warning' });
      tasksQuery.refetch();
    },
    onError: (error) => {
      showSnackbar(error?.message || '取消任务失败', { severity: 'error' });
    },
  });
  const retryTaskMutation = useMutation({
    mutationFn: indexGovernanceAPI.retryTask,
    onSuccess: (data) => {
      showSnackbar(data?.message || '已发起重试任务', { severity: 'success' });
      tasksQuery.refetch();
    },
    onError: (error) => {
      showSnackbar(error?.message || '重试任务失败', { severity: 'error' });
    },
  });

  const refresh = () => {
    summaryQuery.refetch();
    assetsQuery.refetch();
    diagnosticsQuery.refetch();
    tasksQuery.refetch();
  };

  const filteredAssets = React.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return assets.filter((asset) => {
      if (assetType && asset.assetType !== assetType) return false;
      if (!kw) return true;
      return [asset.name, asset.source, asset.neo4jLabel, asset.qdrantCollection].some((value) => String(value).toLowerCase().includes(kw));
    });
  }, [assetType, assets, keyword]);

  const requestCleanupOrphans = (asset) => {
    setConfirmDialog({
      open: true,
      title: '清理孤儿向量',
      message: `将清理「${asset.name}」中 ${asset.orphanInQdrantCount} 条 Qdrant 孤儿向量。\n\n这只删除未匹配到 Neo4j 节点的向量点，不会删除业务记录。`,
      confirmText: '清理孤儿',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
        await cleanupOrphansMutation.mutateAsync(asset.key);
      },
    });
  };

  const requestCleanupSourceOrphans = (asset) => {
    setConfirmDialog({
      open: true,
      title: '清理源缺失索引',
      message: `将清理「${asset.name}」中 ${asset.sourceOrphanCount} 条业务源缺失的 Neo4j/Qdrant 派生索引。\n\n此操作适用于业务知识已不存在但索引残留的情况。`,
      confirmText: '清理索引',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
        await cleanupSourceOrphansMutation.mutateAsync(asset.key);
      },
    });
  };

  const requestRebuildQdrant = (asset) => {
    setConfirmDialog({
      open: true,
      title: '重建 Qdrant 向量',
      message: `将从 Neo4j 中已有 embedding 重建「${asset.name}」的 Qdrant 向量。\n\n这个操作不会重新生成 embedding，也不会删除业务记录，适合修复“缺失向量”。`,
      confirmText: '开始重建',
      danger: false,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
        await rebuildQdrantMutation.mutateAsync(asset.key);
      },
    });
  };

  const requestCancelTask = (task) => {
    setConfirmDialog({
      open: true,
      title: '取消索引任务',
      message: `将取消任务 ${task.task_id}。\n\n已写入的批次不会回滚，取消后可重新发起重建。`,
      confirmText: '取消任务',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
        await cancelTaskMutation.mutateAsync(task.task_id);
      },
    });
  };

  const requestRetryTask = (task) => {
    setConfirmDialog({
      open: true,
      title: '重试索引任务',
      message: `将基于任务 ${task.task_id} 重新发起一次 ${taskOperationLabels[task.operation] || task.operation}。`,
      confirmText: '重试',
      danger: false,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
        await retryTaskMutation.mutateAsync(task.task_id);
      },
    });
  };

  const overallStatus = statusConfig[summary.status] || statusConfig.attention;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, overflow: 'auto', bgcolor: '#f7f9fc', minHeight: '100%' }}>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ ...shellSx, p: { xs: 1.75, md: 2 }, borderColor: 'rgba(37,99,235,0.18)' }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} gap={2}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(25,118,210,0.10)', color: 'primary.main', flexShrink: 0 }}>
                <HubOutlined />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h6" sx={{ fontWeight: 850 }}>索引治理</Typography>
                  <Chip size="small" color={overallStatus.color} label={overallStatus.label} />
                </Stack>
                <Typography variant="body2" color="text.secondary">统一治理业务源、Neo4j 图谱索引与 Qdrant 向量库内容。</Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', lg: 'flex-end' }} flexWrap="wrap">
              <Button variant="outlined" startIcon={<RadarOutlined />} onClick={() => scanMutation.mutate()} disabled={isFetching || scanMutation.isPending}>
                {scanMutation.isPending ? '扫描中...' : '一致性扫描'}
              </Button>
              <Button variant="contained" startIcon={<AutoFixHighOutlined />} disabled>生成修复建议</Button>
            </Stack>
          </Stack>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1.25 }}>
          <MetricCard icon={<AccountTreeOutlined fontSize="small" />} label="Neo4j 索引节点" value={summary.total_neo4j ?? 0} tone="info" helper={summary.neo4j_available ? 'DocumentChunk / TestCaseVector' : 'Neo4j 不可用'} />
          <MetricCard icon={<StorageOutlined fontSize="small" />} label="Qdrant 向量点" value={summary.total_qdrant ?? 0} tone={summary.qdrant_available ? 'success' : 'warning'} helper={summary.qdrant_available ? 'doc_chunks / test_cases' : 'Qdrant 不可用'} />
          <MetricCard icon={<SyncProblemOutlined fontSize="small" />} label="一致性风险" value={summary.issue_count ?? 0} tone={summary.issue_count ? 'warning' : 'success'} helper="孤儿向量、缺失节点、状态未同步" />
          <MetricCard icon={<DataObjectOutlined fontSize="small" />} label="受控资产类型" value={summary.asset_type_count ?? assets.length} tone="info" helper="文档、测试用例、API 知识" />
        </Box>

        {isFetching && <LinearProgress />}
        {isError && <Alert severity="error">索引治理数据加载失败，请确认后端服务和双库连接状态。</Alert>}

        <Pipeline />

        <Paper variant="outlined" sx={{ ...shellSx, p: 1.25 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>资产类型</InputLabel>
              <Select label="资产类型" value={assetType} onChange={(event) => setAssetType(event.target.value)}>
                <MenuItem value="">全部资产</MenuItem>
                <MenuItem value="document">文档知识</MenuItem>
                <MenuItem value="test_case">测试用例</MenuItem>
                <MenuItem value="api_knowledge">API 自动化知识</MenuItem>
              </Select>
            </FormControl>
            <TextField size="small" label="搜索资产 / 集合 / 模块" value={keyword} onChange={(event) => setKeyword(event.target.value)} sx={{ flex: 1 }} />
            <Button variant="text" startIcon={<FilterAltOffOutlined />} onClick={() => { setAssetType(''); setKeyword(''); }}>清空</Button>
            <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={refresh} disabled={isFetching}>刷新</Button>
          </Stack>
        </Paper>

        {tasks.length > 0 && (
          <Paper variant="outlined" sx={{ ...shellSx, overflow: 'hidden' }}>
            <SectionHeader
              title="异步任务"
              caption="重建任务在后台执行，可查看进度、取消或失败后重试。"
              action={<Button size="small" startIcon={<RefreshOutlined />} onClick={() => tasksQuery.refetch()} disabled={tasksQuery.isFetching}>刷新任务</Button>}
            />
            <Divider />
            <Stack spacing={1} sx={{ p: 1.5 }}>
              {tasks.map((task) => {
                const taskStatus = taskStatusConfig[task.status] || taskStatusConfig.queued;
                const total = Number(task.total || 0);
                const processed = Number(task.processed || 0);
                const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : (task.status === 'succeeded' ? 100 : 6);
                const asset = assets.find((item) => item.key === task.asset_key);
                const canCancel = ['queued', 'running'].includes(task.status);
                const canRetry = ['failed', 'cancelled'].includes(task.status);
                return (
                  <Box key={task.task_id} sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: 'rgba(148,163,184,0.24)', bgcolor: task.status === 'running' ? 'rgba(14,165,233,0.05)' : 'rgba(248,250,252,0.88)' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>{asset?.name || task.asset_key}</Typography>
                          <Chip size="small" label={taskOperationLabels[task.operation] || task.operation} variant="outlined" />
                          <Chip size="small" color={taskStatus.color} label={taskStatus.label} />
                          <Typography variant="caption" color="text.secondary">{task.task_id}</Typography>
                        </Stack>
                        <Typography variant="caption" color={task.error ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 0.35 }}>
                          {task.error || task.message || '等待执行'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" startIcon={<CancelOutlined />} color="warning" disabled={!canCancel || cancelTaskMutation.isPending} onClick={() => requestCancelTask(task)}>
                          取消
                        </Button>
                        <Button size="small" startIcon={<ReplayOutlined />} disabled={!canRetry || retryTaskMutation.isPending} onClick={() => requestRetryTask(task)}>
                          重试
                        </Button>
                      </Stack>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                      <LinearProgress variant="determinate" value={progress} color={task.status === 'failed' ? 'error' : task.status === 'succeeded' ? 'success' : 'info'} sx={{ flex: 1, height: 7, borderRadius: 99 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ width: 84, textAlign: 'right' }}>
                        {processed}/{total || '-'}
                      </Typography>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.65fr) minmax(340px, 0.85fr)' }, gap: 2 }}>
          <Paper variant="outlined" sx={{ ...shellSx, overflow: 'hidden' }}>
            <SectionHeader
              title="索引资产清单"
              caption="按业务来源查看 SQLite / Neo4j / Qdrant 三边一致性。"
              action={<Chip size="small" label={`显示 ${filteredAssets.length} / ${assets.length}`} />}
            />
            <Divider />
            <TableContainer>
              <Table size="small" sx={{ '& th': { bgcolor: 'rgba(248,250,252,0.96)', color: 'text.secondary', fontWeight: 800 }, '& td': { py: 1.25, borderColor: 'rgba(148,163,184,0.18)' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>资产类型</TableCell>
                    <TableCell>双库位置</TableCell>
                    <TableCell align="right">业务源</TableCell>
                    <TableCell align="right">Neo4j</TableCell>
                    <TableCell align="right">Qdrant</TableCell>
                    <TableCell>明细差异</TableCell>
                    <TableCell>健康度</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!isLoading && filteredAssets.map((asset) => {
                    const status = statusConfig[asset.status] || statusConfig.attention;
                    const base = Math.max(Number(asset.qdrantCount || 0), Number(asset.neo4jCount || 0), 1);
                    const health = asset.status === 'unavailable' ? 8 : Math.max(8, Math.round((asset.activeCount / base) * 100));
                    return (
                      <TableRow key={asset.key} hover sx={{ '&:hover td': { bgcolor: 'rgba(25,118,210,0.025)' } }}>
                        <TableCell sx={{ minWidth: 176 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>{asset.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{asset.source}</Typography>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            <Chip size="small" icon={<HubOutlined />} label={asset.neo4jLabel} variant="outlined" sx={{ justifyContent: 'flex-start' }} />
                            <Chip size="small" icon={<StorageOutlined />} label={asset.qdrantCollection} variant="outlined" sx={{ justifyContent: 'flex-start' }} />
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 750 }}>{asset.businessCount}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 750 }}>{asset.neo4jCount ?? '不可用'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 750 }}>{asset.qdrantCount ?? '不可用'}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            <Chip
                              size="small"
                              color={asset.missingInQdrantCount ? 'warning' : 'success'}
                              label={`缺失 ${asset.missingInQdrantCount}`}
                              title={asset.missingInQdrantSamples.join('\n')}
                              variant={asset.missingInQdrantCount ? 'filled' : 'outlined'}
                            />
                            <Chip
                              size="small"
                              color={asset.orphanInQdrantCount ? 'warning' : 'success'}
                              label={`孤儿 ${asset.orphanInQdrantCount}`}
                              title={asset.orphanQdrantSamples.join('\n')}
                              variant={asset.orphanInQdrantCount ? 'filled' : 'outlined'}
                            />
                            <Chip
                              size="small"
                              color={asset.sourceOrphanCount ? 'warning' : 'success'}
                              label={`源缺失 ${asset.sourceOrphanCount}`}
                              variant={asset.sourceOrphanCount ? 'filled' : 'outlined'}
                            />
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ minWidth: 148 }}>
                          <Stack spacing={0.75}>
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Chip size="small" color={status.color} label={status.label} />
                              <Typography variant="caption" color="text.secondary">{asset.lastSync}</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={health} color={asset.status === 'healthy' ? 'success' : 'warning'} sx={{ height: 6, borderRadius: 99, bgcolor: 'rgba(148,163,184,0.16)' }} />
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ minWidth: 270 }}>
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                            <Button size="small" variant="outlined" startIcon={<SearchOutlined />} onClick={() => setDetailAssetKey(asset.key)}>
                              明细
                            </Button>
                            <Button size="small" startIcon={<RestartAltOutlined />} disabled={asset.status === 'unavailable' || rebuildQdrantMutation.isPending || hasRunningTask} onClick={() => requestRebuildQdrant(asset)}>
                              重建
                            </Button>
                            <Button size="small" color="warning" startIcon={<DeleteSweepOutlined />} disabled={!asset.orphanInQdrantCount || cleanupOrphansMutation.isPending} onClick={() => requestCleanupOrphans(asset)}>
                              孤儿
                            </Button>
                            <Button size="small" color="warning" startIcon={<SyncProblemOutlined />} disabled={!asset.sourceOrphanCount || asset.key !== 'api_knowledge' || cleanupSourceOrphansMutation.isPending} onClick={() => requestCleanupSourceOrphans(asset)}>
                              源缺失
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!isLoading && filteredAssets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>没有匹配的索引资产</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ ...shellSx, p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: 'rgba(25,118,210,0.08)', color: 'primary.main' }}>
                  <AutoFixHighOutlined fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.15 }}>治理动作</Typography>
                  <Typography variant="caption" color="text.secondary">高风险动作会弹窗确认并记录审计。</Typography>
                </Box>
              </Stack>
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<SyncProblemOutlined />}
                  disabled={syncStatusMutation.isPending || isFetching}
                  onClick={() => syncStatusMutation.mutate()}
                  sx={{ justifyContent: 'flex-start', py: 0.9 }}
                >
                  {syncStatusMutation.isPending ? '同步中...' : '同步失效 / 撤回状态到检索过滤'}
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  disabled={!assets.length || rebuildQdrantMutation.isPending || hasRunningTask}
                  startIcon={<RestartAltOutlined />}
                  sx={{ justifyContent: 'flex-start', py: 0.9 }}
                  onClick={() => assets[0] && requestRebuildQdrant(assets[0])}
                >
                  从 Neo4j 回填 Qdrant
                </Button>
                <Button
                  variant="outlined"
                  color="warning"
                  fullWidth
                  disabled={!assets.some((asset) => asset.orphanInQdrantCount) || cleanupOrphansMutation.isPending}
                  startIcon={<DeleteSweepOutlined />}
                  sx={{ justifyContent: 'flex-start', py: 0.9 }}
                  onClick={() => {
                    const target = assets.find((asset) => asset.orphanInQdrantCount);
                    if (target) requestCleanupOrphans(target);
                  }}
                >
                  清理孤儿向量
                </Button>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ ...shellSx, p: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: 1.25, display: 'grid', placeItems: 'center', bgcolor: 'rgba(34,197,94,0.10)', color: 'success.main' }}>
                  <RadarOutlined fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.15 }}>扫描结果</Typography>
                  <Typography variant="caption" color="text.secondary">展示最近一次诊断结论。</Typography>
                </Box>
              </Stack>
              <Stack spacing={1}>
                {diagnostics.map((item) => (
                  <Box key={item.title} sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid', borderColor: item.level === 'warning' ? 'warning.light' : 'rgba(148,163,184,0.22)', bgcolor: item.level === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.06)' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{item.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.detail}</Typography>
                      </Box>
                      <Button size="small" disabled={item.level === 'success'}>{item.action}</Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Stack>
        </Box>

        <Alert severity="info" sx={{ borderRadius: 2 }}>
          当前已接入真实 summary、assets、diagnostics 与异步任务接口。同步、重建、清理都会写入日志中心的“索引治理”审计分类。
        </Alert>
      </Stack>
      <Dialog open={Boolean(detailAssetKey)} onClose={() => setDetailAssetKey('')} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1.25 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              {assetDetailQuery.data?.asset?.name || '索引明细'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {assetDetailQuery.data?.asset?.source || '正在读取明细'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setDetailAssetKey('')}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {assetDetailQuery.isFetching && <LinearProgress sx={{ mb: 1.5 }} />}
          {assetDetailQuery.isError && <Alert severity="error">索引明细加载失败，请确认 Neo4j 和 Qdrant 连接状态。</Alert>}
          {assetDetailQuery.data && (
            <Stack spacing={1.5}>
              <Alert severity="info" sx={{ borderRadius: 1.5 }}>{assetDetailQuery.data.message}</Alert>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(248,250,252,0.8)' }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.75 }}>Neo4j 有但 Qdrant 缺失</Typography>
                  <Stack spacing={0.5}>
                    {(assetDetailQuery.data.missing_in_qdrant || []).length ? assetDetailQuery.data.missing_in_qdrant.map((id) => (
                      <Typography key={id} variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{id}</Typography>
                    )) : <Typography variant="caption" color="text.secondary">无缺失向量</Typography>}
                  </Stack>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(248,250,252,0.8)' }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.75 }}>Qdrant 有但 Neo4j 缺失</Typography>
                  <Stack spacing={0.5}>
                    {(assetDetailQuery.data.orphan_in_qdrant || []).length ? assetDetailQuery.data.orphan_in_qdrant.map((id) => (
                      <Typography key={id} variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{id}</Typography>
                    )) : <Typography variant="caption" color="text.secondary">无孤儿向量</Typography>}
                  </Stack>
                </Paper>
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        {...confirmDialog}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false })}
      />
    </Box>
  );
}
