import React from 'react';
import { alpha } from '@mui/material/styles';
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
  Tooltip,
  Typography,
  useTheme,
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
  VerifiedUserOutlined,
  PsychologyOutlined,
  LightbulbOutlined,
  TipsAndUpdatesOutlined,
} from '@mui/icons-material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { indexGovernanceAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import PageHeader from '../components/PageHeader';
import GovernanceRecommendationsPanel from '../features/IndexGovernance/GovernanceRecommendationsPanel';
import healthySvg from '../assets/system_healthy.svg';

const PIPELINE_STEPS = [
  { label: '业务源', icon: <DataObjectOutlined fontSize="small" />, caption: '文档 / 用例 / API 知识', color: '#4F46E5' },
  { label: 'Neo4j', icon: <AccountTreeOutlined fontSize="small" />, caption: '图谱节点、关系、embedding', color: '#3B82F6' },
  { label: 'Qdrant', icon: <StorageOutlined fontSize="small" />, caption: '语义向量点与 payload', color: '#10B981' },
  { label: 'RAG 检索', icon: <SearchOutlined fontSize="small" />, caption: '只召回 active 资产', color: '#8B5CF6' },
];

const statusConfig = {
  healthy: { label: '健康', color: 'success', gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' },
  attention: { label: '需关注', color: 'warning', gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' },
  unavailable: { label: '不可用', color: 'error', gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' },
};

const taskStatusConfig = {
  queued: { label: '排队中', color: 'default', icon: <ReplayOutlined fontSize="small" /> },
  running: { label: '执行中', color: 'info', icon: <RestartAltOutlined fontSize="small" className="spin-animation" /> },
  succeeded: { label: '已完成', color: 'success', icon: <AutoFixHighOutlined fontSize="small" /> },
  failed: { label: '失败', color: 'error', icon: <SyncProblemOutlined fontSize="small" /> },
  cancelled: { label: '已取消', color: 'warning', icon: <CancelOutlined fontSize="small" /> },
};

const taskOperationLabels = {
  rebuild_qdrant: 'Qdrant 重建',
};

function SectionHeader({ title, caption, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ p: 2 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>{title}</Typography>
        {caption && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{caption}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

function MetricCard({ label, value, tone = 'info', helper, icon }) {
  const theme = useTheme();
  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 2.5, 
        borderRadius: 4, 
        border: '1px solid rgba(255, 255, 255, 0.5)',
        borderLeft: `4px solid ${theme.palette[tone].main}`,
        background: alpha(theme.palette[tone].main, 0.04),
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          bgcolor: alpha(theme.palette[tone].main, 0.08),
          transform: 'translateY(-4px)',
          boxShadow: `0 12px 24px ${alpha(theme.palette[tone].main, 0.12)}`
        }
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ p: 1, borderRadius: 2.5, bgcolor: alpha(theme.palette[tone].main, 0.1), color: theme.palette[tone].main, display: 'grid', placeItems: 'center' }}>
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.2 }}>{value}</Typography>
        </Box>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>{helper}</Typography>
    </Paper>
  );
}

function Pipeline() {
  const theme = useTheme();
  return (
    <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.03), border: '1px solid', borderColor: alpha(theme.palette.primary.main, 0.1), boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
        {PIPELINE_STEPS.map((step, index) => (
          <React.Fragment key={step.label}>
            <Tooltip title={step.caption} arrow>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 160, cursor: 'default' }}>
                <Box 
                  sx={{ 
                    width: 42, height: 42, borderRadius: 3, 
                    display: 'grid', placeItems: 'center', 
                    bgcolor: 'white', color: step.color,
                    boxShadow: `0 4px 12px ${alpha(step.color, 0.15)}`,
                    border: '1px solid', borderColor: alpha(step.color, 0.1)
                  }}
                >
                  {step.icon}
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', color: 'text.primary', letterSpacing: 0.5 }}>{step.label}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>ACTIVE SYNC</Typography>
                </Box>
              </Stack>
            </Tooltip>
            {index < PIPELINE_STEPS.length - 1 && (
              <Box 
                sx={{ 
                  width: { xs: 2, md: 60 }, 
                  height: { xs: 20, md: 2 }, 
                  bgcolor: alpha(theme.palette.divider, 0.5), 
                  display: { xs: 'none', md: 'block' },
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 1
                }} 
              >
                <Box className="flow-animation" sx={{ position: 'absolute', inset: 0 }} />
              </Box>
            )}
          </React.Fragment>
        ))}
      </Stack>
    </Box>
  );
}

function AdviceDrawer({ open, onClose, diagnostics, assets }) {
  const theme = useTheme();
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setGenerating(true);
      const timer = setTimeout(() => setGenerating(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const issues = diagnostics.filter(d => d.level !== 'success');

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      scroll="paper"
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: 4,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
        }
      }}
    >
      <DialogTitle sx={{ p: 3, pb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <PsychologyOutlined sx={{ color: theme.palette.primary.main }} />
        <Box>
          <Typography variant="h6" fontWeight={800}>AI 治理专家建议</Typography>
          <Typography variant="caption" color="text.secondary">基于当前图谱一致性扫描结果生成的修复方案</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ ml: 'auto' }}>
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 3, pt: 1 }}>
        {generating ? (
          <Stack spacing={2} sx={{ py: 4, alignItems: 'center', textAlign: 'center' }}>
            <Box sx={{ position: 'relative', width: 80, height: 80, display: 'grid', placeItems: 'center' }}>
              <Box className="pulse-animation" sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: alpha(theme.palette.primary.main, 0.1) }} />
              <PsychologyOutlined sx={{ fontSize: 40, color: theme.palette.primary.main, zIndex: 1 }} />
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={700}>正在深度分析差异点...</Typography>
              <Typography variant="caption" color="text.secondary">正在评估索引拓扑结构与向量空间分布</Typography>
            </Box>
            <LinearProgress sx={{ width: '100%', maxWidth: 240, borderRadius: 2 }} />
          </Stack>
        ) : (
          <Stack spacing={3} sx={{ py: 1 }}>
            {issues.length > 0 ? (
              <>
                <Alert icon={<LightbulbOutlined />} severity="info" sx={{ borderRadius: 3, '& .MuiAlert-message': { width: '100%' } }}>
                  <Typography variant="subtitle2" fontWeight={700}>核心诊断结论</Typography>
                  <Typography variant="caption">
                    当前检测到 {issues.length} 类结构化差异，主要集中在「{issues[0].title.split('存在')[0]}」等资产。这通常是由于并发写入或异步索引同步延迟导致的。
                  </Typography>
                </Alert>
                
                <Stack spacing={2}>
                  <Typography variant="subtitle2" fontWeight={800} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TipsAndUpdatesOutlined fontSize="small" color="primary" /> 逐步修复建议
                  </Typography>
                  {issues.map((issue, idx) => (
                    <Paper key={idx} variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                      <Stack direction="row" spacing={2}>
                        <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: theme.palette.primary.main, color: 'white', display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>
                          {idx + 1}
                        </Box>
                        <Box>
                          <Typography variant="body2" fontWeight={700}>{issue.title}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            建议方案：{issue.action === '清理孤儿' ? '执行「一键清理」以维持 Qdrant 存储效率，避免检索到已失效的过期内容。' : '触发「重建索引」任务，系统将利用 Neo4j 中的原始文本重新生成向量点并回填至 Qdrant。'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
                
                <Box sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.success.main, 0.05), border: '1px dashed', borderColor: alpha(theme.palette.success.main, 0.2) }}>
                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>专家提醒：</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">
                    对于大规模资产重建，建议在业务低峰期执行。修复完成后，建议再次运行「一致性扫描」以确认最终状态。
                  </Typography>
                </Box>
              </>
            ) : (
              <Stack spacing={2} sx={{ py: 4, alignItems: 'center', textAlign: 'center' }}>
                <VerifiedUserOutlined sx={{ fontSize: 64, color: 'success.main', opacity: 0.5 }} />
                <Box>
                  <Typography variant="subtitle1" fontWeight={800}>您的索引架构非常健康</Typography>
                  <Typography variant="body2" color="text.secondary">未发现任何需要人工干预的异常。继续保持当前的同步频率即可。</Typography>
                </Box>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <Box sx={{ p: 2, px: 3, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider' }}>
        <Button onClick={onClose} variant="contained" sx={{ borderRadius: 2 }}>
          {issues.length > 0 ? '我已了解' : '太棒了'}
        </Button>
      </Box>
    </Dialog>
  );
}

export default function IndexGovernancePage({ isActive }) {
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  const [assetType, setAssetType] = React.useState('');
  const [keyword, setKeyword] = React.useState('');
  const [detailAssetKey, setDetailAssetKey] = React.useState('');
  const [adviceOpen, setAdviceOpen] = React.useState(false);
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
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: { xs: 2, md: 3 }, gap: 3, background: 'transparent' }}>
      <PageHeader 
        title="索引治理" 
        subtitle="统一协同业务源、图谱索引与向量库的一致性生命周期管理。" 
      >
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button 
            variant="outlined" 
            size="small"
            startIcon={<RadarOutlined />} 
            onClick={() => scanMutation.mutate()} 
            disabled={isFetching || scanMutation.isPending}
            sx={{ borderRadius: 2 }}
          >
            {scanMutation.isPending ? '扫描中...' : '一致性扫描'}
          </Button>
          <Button 
            variant="contained" 
            size="small"
            startIcon={<PsychologyOutlined />} 
            onClick={() => setAdviceOpen(true)}
            sx={{ 
              borderRadius: 2,
              background: 'linear-gradient(135deg, #4F46E5 0%, #3B82F6 100%)',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              '&:hover': {
                boxShadow: '0 6px 16px rgba(59, 130, 246, 0.4)',
              }
            }}
          >
            修复建议
          </Button>
        </Box>
      </PageHeader>

      <GovernanceRecommendationsPanel />

      <Paper 
        elevation={0} 
        sx={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255, 255, 255, 0.4)', 
          borderRadius: 4, 
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
        }}
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3, overflow: 'auto' }}>
          {/* Stats Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
            <MetricCard icon={<AccountTreeOutlined fontSize="small" />} label="Neo4j 节点" value={summary.total_neo4j ?? 0} tone="info" helper={summary.neo4j_available ? 'Graph nodes' : 'Neo4j 不可用'} />
            <MetricCard icon={<StorageOutlined fontSize="small" />} label="Qdrant 点" value={summary.total_qdrant ?? 0} tone={summary.qdrant_available ? 'success' : 'error'} helper={summary.qdrant_available ? 'Vector points' : 'Qdrant 不可用'} />
            <MetricCard icon={<SyncProblemOutlined fontSize="small" />} label="风险项" value={summary.issue_count ?? 0} tone={summary.issue_count ? 'warning' : 'success'} helper="一致性风险" />
            <MetricCard icon={<DataObjectOutlined fontSize="small" />} label="资产类型" value={summary.asset_type_count ?? assets.length} tone="info" helper="监控中资产" />
          </Box>

          <Pipeline />

          {/* Filter & Table Container */}
          <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(255, 255, 255, 0.6)', background: 'rgba(255, 255, 255, 0.4)', borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>资产类型</InputLabel>
                <Select label="资产类型" value={assetType} onChange={(event) => setAssetType(event.target.value)}>
                  <MenuItem value="">全部</MenuItem>
                  <MenuItem value="document">文档知识</MenuItem>
                  <MenuItem value="test_case">测试用例</MenuItem>
                  <MenuItem value="api_knowledge">API 知识</MenuItem>
                </Select>
              </FormControl>
              <TextField 
                size="small" 
                placeholder="搜索资产..." 
                value={keyword} 
                onChange={(event) => setKeyword(event.target.value)} 
                sx={{ flex: 1 }}
                InputProps={{ startAdornment: <SearchOutlined fontSize="small" sx={{ color: 'text.disabled', mr: 1 }} /> }}
              />
              <Button variant="outlined" size="small" onClick={refresh} disabled={isFetching} startIcon={<RefreshOutlined />}>刷新</Button>
            </Stack>

            <TableContainer component={Box} sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: (theme) => alpha(theme.palette.primary.main, 0.02) }}>
                    <TableCell sx={{ fontWeight: 700 }}>资产名称</TableCell>
                    <TableCell align="right">业务源</TableCell>
                    <TableCell align="right">Neo4j</TableCell>
                    <TableCell align="right">Qdrant</TableCell>
                    <TableCell>一致性风险</TableCell>
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
                      <TableRow key={asset.key} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{asset.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{asset.source}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{asset.businessCount}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{asset.neo4jCount ?? '-'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{asset.qdrantCount ?? '-'}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            {asset.missingInQdrantCount > 0 && <Chip size="small" variant="outlined" color="warning" label={`缺 ${asset.missingInQdrantCount}`} sx={{ height: 20, fontSize: '0.7rem' }} />}
                            {asset.orphanInQdrantCount > 0 && <Chip size="small" variant="outlined" color="error" label={`孤 ${asset.orphanInQdrantCount}`} sx={{ height: 20, fontSize: '0.7rem' }} />}
                            {!asset.missingInQdrantCount && !asset.orphanInQdrantCount && <Chip size="small" variant="outlined" color="success" label="同步" sx={{ height: 20, fontSize: '0.7rem' }} />}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ minWidth: 100 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ flex: 1, position: 'relative' }}>
                              <LinearProgress 
                                variant="determinate" 
                                value={health} 
                                sx={{ 
                                  height: 6, borderRadius: 3,
                                  bgcolor: alpha(theme.palette[status.color].main, 0.1),
                                  '& .MuiLinearProgress-bar': {
                                    background: status.gradient || theme.palette[status.color].main,
                                    borderRadius: 3
                                  }
                                }} 
                              />
                            </Box>
                            <Typography variant="caption" fontWeight={800} sx={{ color: `${status.color}.main` }}>{health}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="详情"><IconButton size="small" onClick={() => setDetailAssetKey(asset.key)}><SearchOutlined fontSize="small" /></IconButton></Tooltip>
                            <Tooltip title="重建"><IconButton size="small" disabled={asset.status === 'unavailable' || hasRunningTask} onClick={() => requestRebuildQdrant(asset)}><RestartAltOutlined fontSize="small" /></IconButton></Tooltip>
                            <Tooltip title="清理"><IconButton size="small" color="warning" disabled={!asset.orphanInQdrantCount} onClick={() => requestCleanupOrphans(asset)}><DeleteSweepOutlined fontSize="small" /></IconButton></Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Bottom Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {tasks.length > 0 && (
                <Paper variant="outlined" sx={{ borderRadius: 3, p: 0, overflow: 'hidden' }}>
                  <SectionHeader title="治理任务进度" caption="监控后台索引维护任务的实时执行情况。" />
                  <Divider />
                  <Stack spacing={1.5} sx={{ p: 2 }}>
                    {tasks.map((task) => {
                      const taskStatus = taskStatusConfig[task.status] || taskStatusConfig.queued;
                      const total = Number(task.total || 0);
                      const processed = Number(task.processed || 0);
                      const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : (task.status === 'succeeded' ? 100 : 6);
                      const asset = assets.find((item) => item.key === task.asset_key);
                      return (
                        <Box key={task.task_id} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: alpha(theme.palette.background.default, 0.4) }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{asset?.name || task.asset_key}</Typography>
                              <Typography variant="caption" color="text.secondary">{taskOperationLabels[task.operation] || task.operation} • {task.task_id.split('-')[0]}</Typography>
                            </Box>
                            <Chip size="small" color={taskStatus.color} label={taskStatus.label} />
                          </Stack>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ position: 'relative', flex: 1 }}>
                              <LinearProgress 
                                variant="determinate" 
                                value={progress} 
                                color={taskStatus.color} 
                                sx={{ height: 6, borderRadius: 3 }} 
                              />
                              {task.status === 'running' && (
                                <Box className="pulse-animation" sx={{ position: 'absolute', inset: 0, borderRadius: 3, bgcolor: alpha(theme.palette[taskStatus.color].main, 0.4), zIndex: -1 }} />
                              )}
                            </Box>
                            <Typography variant="caption" fontWeight={700}>{progress}%</Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </Paper>
              )}

              <Alert severity="info" sx={{ borderRadius: 3 }}>
                治理说明：定期执行“一致性深度扫描”可确保图谱检索的精准度。系统会自动识别 Neo4j 节点与 Qdrant 向量之间的差异并提供一键式修复工具。
              </Alert>
            </Box>

            <Stack spacing={3}>
              <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700 }}>快捷治理动作</Typography>
                <Stack spacing={1.5}>
                  <Button variant="outlined" fullWidth startIcon={<SyncProblemOutlined />} onClick={() => syncStatusMutation.mutate()} disabled={syncStatusMutation.isPending || isFetching} sx={{ justifyContent: 'flex-start' }}>同步检索过滤状态</Button>
                  <Button variant="outlined" fullWidth startIcon={<RestartAltOutlined />} onClick={() => assets[0] && requestRebuildQdrant(assets[0])} disabled={!assets.length || rebuildQdrantMutation.isPending || hasRunningTask} sx={{ justifyContent: 'flex-start' }}>增量回填向量库</Button>
                  <Button variant="outlined" color="warning" fullWidth startIcon={<DeleteSweepOutlined />} onClick={() => { const target = assets.find((asset) => asset.orphanInQdrantCount); if (target) requestCleanupOrphans(target); }} disabled={!assets.some((asset) => asset.orphanInQdrantCount) || cleanupOrphansMutation.isPending} sx={{ justifyContent: 'flex-start' }}>清理全局孤儿向量</Button>
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ borderRadius: 3, p: 2.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700 }}>最新诊断报告</Typography>
                <Stack spacing={1.5}>
                  {diagnostics.length > 0 && !diagnostics.every(d => d.level === 'success') ? (
                    diagnostics.map((item, idx) => (
                      <Box key={idx} sx={{ p: 1.5, borderRadius: 2, bgcolor: item.level === 'warning' ? alpha(theme.palette.warning.main, 0.05) : alpha(theme.palette.success.main, 0.05), border: '1px solid', borderColor: item.level === 'warning' ? alpha(theme.palette.warning.main, 0.1) : alpha(theme.palette.success.main, 0.1) }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, display: 'block' }}>{item.title}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{item.detail}</Typography>
                        <Button size="small" variant="text" sx={{ p: 0, minWidth: 'auto', fontSize: '0.7rem' }} disabled={item.level === 'success'}>{item.action}</Button>
                      </Box>
                    ))
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2, px: 1 }}>
                      <Box 
                        component="img" 
                        src={healthySvg} 
                        sx={{ 
                          width: '100%', 
                          maxWidth: 160, 
                          mx: 'auto', 
                          mb: 1, 
                          filter: 'drop-shadow(0 8px 16px rgba(16, 185, 129, 0.1))',
                        }} 
                      />
                      <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', color: 'success.main', letterSpacing: 0.5 }}>图谱架构完美</Typography>
                      <Typography variant="caption" color="text.secondary">所有资产均处于高度同步状态</Typography>
                    </Box>
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Box>
        </Box>
      </Paper>

      {/* AI Advice Drawer */}
      <AdviceDrawer 
        open={adviceOpen} 
        onClose={() => setAdviceOpen(false)} 
        diagnostics={diagnostics}
        assets={assets}
      />

      {/* Asset Detail Dialog */}
      <Dialog 
        open={Boolean(detailAssetKey)} 
        onClose={() => setDetailAssetKey('')} 
        maxWidth="sm" 
        fullWidth 
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogTitle sx={{ px: 3, py: 2 }}>
          <Typography variant="subtitle1" fontWeight={700}>资产差异明细</Typography>
          <Typography variant="caption" color="text.secondary">{assetDetailQuery.data?.asset?.name}</Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {assetDetailQuery.isFetching && <LinearProgress />}
          <Box sx={{ p: 2.5 }}>
             <Stack spacing={2.5}>
               <Box>
                 <Typography variant="caption" sx={{ fontWeight: 700, mb: 1, display: 'block' }}>Neo4j 存在但 Qdrant 缺失</Typography>
                 <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 200, overflow: 'auto', bgcolor: alpha(theme.palette.action.hover, 0.3) }}>
                    {(assetDetailQuery.data?.missing_in_qdrant || []).length ? assetDetailQuery.data.missing_in_qdrant.map(id => (
                      <Typography key={id} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>{id}</Typography>
                    )) : <Typography variant="caption" color="text.secondary">无记录</Typography>}
                 </Paper>
               </Box>
               <Box>
                 <Typography variant="caption" sx={{ fontWeight: 700, mb: 1, display: 'block' }}>Qdrant 存在但 Neo4j 缺失 (孤儿)</Typography>
                 <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 200, overflow: 'auto', bgcolor: alpha(theme.palette.action.hover, 0.3) }}>
                    {(assetDetailQuery.data?.orphan_in_qdrant || []).length ? assetDetailQuery.data.orphan_in_qdrant.map(id => (
                      <Typography key={id} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>{id}</Typography>
                    )) : <Typography variant="caption" color="text.secondary">无记录</Typography>}
                 </Paper>
               </Box>
             </Stack>
          </Box>
        </DialogContent>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={() => setDetailAssetKey('')} size="small">关闭</Button>
        </Box>
      </Dialog>

      <ConfirmDialog
        {...confirmDialog}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false })}
      />
    </Box>
  );
}
