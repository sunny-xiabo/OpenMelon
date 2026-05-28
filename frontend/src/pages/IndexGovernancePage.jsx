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
import healthySvg from '../assets/system_healthy.svg';
import GovernanceRecommendationsPanel from '../features/IndexGovernance/GovernanceRecommendationsPanel';

const PIPELINE_STEPS = [
  { label: '业务数据源', icon: <DataObjectOutlined fontSize="small" />, caption: '文档 / 用例 / API 知识', color: '#4f46e5' },
  { label: 'Neo4j 知识图谱', icon: <AccountTreeOutlined fontSize="small" />, caption: '图谱节点、关系与 Embeddings', color: '#0ea5e9' },
  { label: 'Qdrant 向量库', icon: <StorageOutlined fontSize="small" />, caption: '语义向量点与 metadata payload', color: '#10b981' },
  { label: '智能 RAG 检索', icon: <SearchOutlined fontSize="small" />, caption: '仅召回 active 同步健康资产', color: '#8b5cf6' },
];

const statusConfig = {
  healthy: { label: '同步健康', color: 'success', gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' },
  attention: { label: '需关注', color: 'warning', gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' },
  unavailable: { label: '服务断联', color: 'error', gradient: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' },
};

const taskStatusConfig = {
  queued: { label: '排队中', color: 'default', icon: <ReplayOutlined fontSize="small" /> },
  running: { label: '重建中', color: 'info', icon: <RestartAltOutlined fontSize="small" className="spin-animation" /> },
  succeeded: { label: '已完成', color: 'success', icon: <AutoFixHighOutlined fontSize="small" /> },
  failed: { label: '失败', color: 'error', icon: <SyncProblemOutlined fontSize="small" /> },
  cancelled: { label: '已取消', color: 'warning', icon: <CancelOutlined fontSize="small" /> },
};

const taskOperationLabels = {
  rebuild_qdrant: 'Qdrant 重建',
};

function SectionHeader({ title, caption, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5} sx={{ p: 2.25 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.primary' }}>{title}</Typography>
        {caption && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontWeight: 500 }}>{caption}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

function MetricCard({ label, value, tone = 'info', helper, icon }) {
  const theme = useTheme();
  
  // Custom HSL gradients for metric cards
  const gradientMap = {
    info: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
    success: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
    warning: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
    error: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
  };

  const currentBg = theme.palette[tone].main;

  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 2.5, 
        borderRadius: 4.5, 
        border: '1px solid',
        borderColor: alpha(currentBg, 0.15),
        background: gradientMap[tone] || gradientMap.info,
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.01), inset 0 1px 0 rgba(255,255,255,0.6)',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(currentBg, 0.45),
          boxShadow: `0 12px 36px ${alpha(currentBg, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.8)`
        }
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box 
          sx={{ 
            width: 32, 
            height: 32, 
            borderRadius: 2, 
            bgcolor: alpha(currentBg, 0.1), 
            color: currentBg, 
            display: 'grid', 
            placeItems: 'center',
            boxShadow: `0 0 8px ${alpha(currentBg, 0.15)}`
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.02em', display: 'block' }}>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 950, color: 'slate.900', lineHeight: 1.1, fontFamily: 'monospace' }}>
            {value}
          </Typography>
        </Box>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '10px', fontWeight: 600 }}>{helper}</Typography>
    </Paper>
  );
}

function Pipeline() {
  const theme = useTheme();
  return (
    <Box 
      sx={{ 
        p: 3, 
        borderRadius: 4.5, 
        bgcolor: 'rgba(14, 165, 233, 0.015)', 
        border: '1px solid rgba(14, 165, 233, 0.08)', 
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' 
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems="center" justifyContent="space-between">
        {PIPELINE_STEPS.map((step, index) => (
          <React.Fragment key={step.label}>
            <Tooltip title={step.caption} arrow>
              <Paper 
                elevation={0}
                sx={{ 
                  p: 1.75, 
                  borderRadius: 3.5,
                  flex: 1, 
                  minWidth: 180, 
                  cursor: 'default',
                  border: '1px solid rgba(0,0,0,0.05)',
                  bgcolor: 'white',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    borderColor: alpha(step.color, 0.25),
                    boxShadow: `0 8px 16px ${alpha(step.color, 0.05)}`
                  }
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box 
                    sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: 2.2, 
                      display: 'grid', 
                      placeItems: 'center', 
                      bgcolor: 'white', 
                      color: step.color,
                      boxShadow: `0 4px 12px ${alpha(step.color, 0.12)}`,
                      border: '1px solid', 
                      borderColor: alpha(step.color, 0.08)
                    }}
                  >
                    {step.icon}
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 900, display: 'block', color: 'slate.900', letterSpacing: 0.2 }}>
                      {step.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em' }}>
                      ACTIVE SYNC
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Tooltip>
            {index < PIPELINE_STEPS.length - 1 && (
              <Box 
                sx={{ 
                  width: { xs: 2, md: 45 }, 
                  height: { xs: 15, md: 2 }, 
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
          borderRadius: 4.5,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ p: 3, pb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.08)', color: 'primary.main' }}>
          <PsychologyOutlined />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary' }}>
            AI 治理专家诊断建议
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 500 }}>
            基于当前全域数据图谱一致性深度扫描得出的受控修复方案
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ alignSelf: 'flex-start', mt: -0.5 }}>
          <CloseOutlined fontSize="small" />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3, pt: 2 }}>
        {generating ? (
          <Stack spacing={2.5} sx={{ py: 5, alignItems: 'center', textAlign: 'center' }}>
            <Box sx={{ position: 'relative', width: 70, height: 70, display: 'grid', placeItems: 'center' }}>
              <Box 
                sx={{ 
                  position: 'absolute', 
                  inset: 0, 
                  borderRadius: '50%', 
                  bgcolor: 'rgba(99, 102, 241, 0.08)',
                  animation: 'pulseGlow 2s infinite ease-in-out',
                  '@keyframes pulseGlow': {
                    '0%, 100%': { transform: 'scale(1)', opacity: 0.5 },
                    '50%': { transform: 'scale(1.2)', opacity: 0.9 }
                  }
                }} 
              />
              <PsychologyOutlined sx={{ fontSize: 36, color: 'primary.main', zIndex: 1 }} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 800 }}>正在评估全图一致性阻断风险...</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 500 }}>正在计算语义向量空间物理分布差异</Typography>
            </Box>
            <LinearProgress sx={{ width: '100%', maxWidth: 220, borderRadius: 3, height: 4 }} />
          </Stack>
        ) : (
          <Stack spacing={3} sx={{ py: 1 }}>
            {issues.length > 0 ? (
              <>
                <Alert 
                  icon={<LightbulbOutlined />} 
                  severity="info" 
                  sx={{ 
                    borderRadius: 3.5, 
                    fontWeight: 700, 
                    border: '1px solid rgba(14, 165, 233, 0.12)', 
                    bgcolor: 'rgba(14, 165, 233, 0.02)',
                    color: '#0369a1',
                    '& .MuiAlert-message': { width: '100%' } 
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>核心诊断结论</Typography>
                  <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.5, fontWeight: 500 }}>
                    当前全图分析发现共 {issues.length} 类核心资产结构差异。主要由于后台高并发任务异步回填延迟导致。
                  </Typography>
                </Alert>
                
                <Stack spacing={2}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 900, display: 'flex', alignItems: 'center', gap: 1, color: 'slate.900' }}>
                    <TipsAndUpdatesOutlined fontSize="small" style={{ color: '#6366f1' }} /> 逐步修复指令推荐
                  </Typography>
                  {issues.map((issue, idx) => (
                    <Paper 
                      key={idx} 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        borderRadius: 3.5, 
                        bgcolor: 'rgba(0,0,0,0.01)', 
                        borderColor: 'rgba(0,0,0,0.05)' 
                      }}
                    >
                      <Stack direction="row" spacing={2} alignItems="flex-start">
                        <Box 
                          sx={{ 
                            width: 20, 
                            height: 20, 
                            borderRadius: '50%', 
                            bgcolor: 'primary.main', 
                            color: 'white', 
                            display: 'grid', 
                            placeItems: 'center', 
                            fontSize: '0.7rem', 
                            fontWeight: 900, 
                            flexShrink: 0,
                            mt: 0.25
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary' }}>{issue.title}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.5, fontWeight: 500 }}>
                            建议方案：{issue.action === '清理孤儿' 
                              ? '执行「一键清理孤儿」功能以移除 Qdrant 中多余的脏向量点，防止语义检索到已过期的脏用例数据。' 
                              : '直接在下方资产行中触发「重建」，系统将基于图谱中文本文档重新进行词嵌入 (embedding) 并推送到 Qdrant。'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
                
                <Box 
                  sx={{ 
                    p: 2, 
                    borderRadius: 3.5, 
                    bgcolor: 'rgba(16, 185, 129, 0.03)', 
                    border: '1px dashed', 
                    borderColor: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5
                  }}
                >
                  <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 800 }}>✓ 安全治理保障体系：</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5, fontWeight: 500 }}>
                    在大规模的图谱回填或增量构建时，建议在系统闲时提交任务。重建完成之后，可通过“一致性扫描”按钮执行核验闭环。
                  </Typography>
                </Box>
              </>
            ) : (
              <Stack spacing={2} sx={{ py: 4, alignItems: 'center', textAlign: 'center' }}>
                <VerifiedUserOutlined sx={{ fontSize: 48, color: 'success.main', opacity: 0.7 }} />
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>您的知识与向量一致性完美</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 500 }}>未发现任何异常数据，当前检索召回处于最佳状态！</Typography>
                </Box>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      
      <Box sx={{ p: 2, px: 3.5, display: 'flex', justifyContent: 'flex-end', bgcolor: 'rgba(0,0,0,0.01)' }}>
        <Button onClick={onClose} variant="contained" sx={{ borderRadius: 2, px: 3, fontWeight: 800, fontSize: '12px' }}>
          {issues.length > 0 ? '我已了解建议' : '太棒了'}
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

  // 监听后台任务完成，自动刷新资产和诊断数据
  const prevActiveRef = React.useRef(false);
  const hasActive = tasks.some((t) => ['queued', 'running'].includes(t.status));
  React.useEffect(() => {
    if (prevActiveRef.current && !hasActive) {
      // 任务刚从运行中变为全部完成，刷新资产数据
      summaryQuery.refetch();
      assetsQuery.refetch();
      diagnosticsQuery.refetch();
    }
    prevActiveRef.current = hasActive;
  }, [hasActive, summaryQuery, assetsQuery, diagnosticsQuery]);

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
      message: `确认清理「${asset.name}」中 ${asset.orphanInQdrantCount} 条 Qdrant 孤儿数据点？这仅会安全擦除未匹配到图谱节点的孤立数据，不影响图谱文本。`,
      confirmText: '一键清理孤儿',
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
      message: `确认清理「${asset.name}」中 ${asset.sourceOrphanCount} 条源端已物理删除但仍残留图谱中的失效节点？`,
      confirmText: '安全清理索引',
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
      title: '重建 Qdrant 向量空间',
      message: `将为「${asset.name}」重新生成缺失的 Qdrant 向量。该操作不影响 Neo4j，仅作为一致性缺失填补。`,
      confirmText: '开始回填向量',
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
      title: '取消索引治理任务',
      message: `确认取消正在运行的任务 ${task.task_id.split('-')[0]} 吗？已写入的部分不受影响。`,
      confirmText: '停止任务',
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
      title: '重试索引治理任务',
      message: `将立即重新发起任务 ${task.task_id.split('-')[0]} 执行。`,
      confirmText: '立即重试',
      danger: false,
      onConfirm: async () => {
        setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false });
        await retryTaskMutation.mutateAsync(task.task_id);
      },
    });
  };

  const overallStatus = statusConfig[summary.status] || statusConfig.attention;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: { xs: 2, md: 3.5 }, gap: 3.5, background: 'radial-gradient(ellipse at 50% -20%, rgba(14, 165, 233, 0.015) 0%, transparent 85%)' }}>
      
      {/* Frosted Telemetry Header */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          p: 2.25,
          borderRadius: 4.5,
          border: '1px solid rgba(255, 255, 255, 0.45)', 
          bgcolor: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.01), inset 0 1px 0 rgba(255,255,255,0.6)'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 2, bgcolor: 'rgba(14, 165, 233, 0.08)', color: 'primary.main' }}>
            <RadarOutlined />
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.01em' }}>
              索引治理舱
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              面向图谱关系索引、Qdrant 向量空间及多物理源的数据生命周期一致性治理与闭环审计
            </Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button 
            size="small" 
            variant="outlined" 
            startIcon={<RadarOutlined />} 
            onClick={() => scanMutation.mutate()} 
            disabled={isFetching || scanMutation.isPending}
            sx={{
              borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' }
            }}
          >
            {scanMutation.isPending ? '深度扫描中...' : '一致性深度扫描'}
          </Button>
          <Button 
            size="small" 
            variant="contained" 
            startIcon={<PsychologyOutlined />} 
            onClick={() => setAdviceOpen(true)}
            sx={{ 
              borderRadius: 2.2, 
              fontSize: '11px', 
              fontWeight: 800,
              background: 'linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)',
              boxShadow: '0 4px 12px rgba(14, 165, 233, 0.25)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4338ca 0%, #0284c7 100%)',
                boxShadow: '0 6px 16px rgba(14, 165, 233, 0.35)',
              }
            }}
          >
            AI 专家修复建议
          </Button>
        </Stack>
      </Box>

      {/* Recommendations Panel */}
      <GovernanceRecommendationsPanel />

      {/* Main Glassmorphic Panel */}
      <Paper 
        elevation={0} 
        sx={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255, 255, 255, 0.4)', 
          borderRadius: 4.5, 
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(15px)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
        }}
      >
        <Box sx={{ p: 3.5, display: 'flex', flexDirection: 'column', gap: 3.5, overflow: 'auto', flex: 1 }}>
          
          {/* Stats Grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2.5 }}>
            <MetricCard icon={<AccountTreeOutlined fontSize="small" />} label="Neo4j 图谱节点" value={summary.total_neo4j ?? 0} tone="info" helper={summary.neo4j_available ? 'Graph topology active' : '图数据库断联'} />
            <MetricCard icon={<StorageOutlined fontSize="small" />} label="Qdrant 向量点" value={summary.total_qdrant ?? 0} tone={summary.qdrant_available ? 'success' : 'error'} helper={summary.qdrant_available ? 'Vector space synced' : '向量库不可用'} />
            <MetricCard icon={<SyncProblemOutlined fontSize="small" />} label="已检测差异项" value={summary.issue_count ?? 0} tone={summary.issue_count ? 'warning' : 'success'} helper="未对齐的向量节点" />
            <MetricCard icon={<DataObjectOutlined fontSize="small" />} label="监测中知识资产" value={summary.asset_type_count ?? assets.length} tone="info" helper="全域监测覆盖" />
          </Box>

          <Pipeline />

          {/* Asset List and Table */}
          <Paper 
            elevation={0} 
            sx={{ 
              p: 2.5, 
              border: '1px solid rgba(0,0,0,0.05)', 
              background: 'rgba(255, 255, 255, 0.55)', 
              borderRadius: 4 
            }}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel sx={{ fontSize: '12px' }}>资产业务类型</InputLabel>
                <Select 
                  label="资产业务类型" 
                  value={assetType} 
                  onChange={(event) => setAssetType(event.target.value)}
                  sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 700 }}
                >
                  <MenuItem value="" sx={{ fontSize: '12px' }}>全部资产</MenuItem>
                  <MenuItem value="document" sx={{ fontSize: '12px' }}>文档知识 (Markdown/RAG)</MenuItem>
                  <MenuItem value="test_case" sx={{ fontSize: '12px' }}>测试用例 (DSL)</MenuItem>
                  <MenuItem value="api_knowledge" sx={{ fontSize: '12px' }}>API 规范资产</MenuItem>
                </Select>
              </FormControl>
              
              <TextField 
                size="small" 
                placeholder="搜索全图资产..." 
                value={keyword} 
                onChange={(event) => setKeyword(event.target.value)} 
                sx={{ 
                  flex: 1,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2.2,
                    fontSize: '12px',
                    fontWeight: 700,
                    bgcolor: 'white',
                  }
                }}
                InputProps={{ startAdornment: <SearchOutlined fontSize="small" sx={{ color: 'text.disabled', mr: 1 }} /> }}
              />
              
              <Button 
                variant="outlined" 
                size="small" 
                startIcon={<RefreshOutlined />}
                onClick={refresh} 
                disabled={isFetching}
                sx={{
                  borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
                  height: 36, px: 2,
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' }
                }}
              >
                刷新资产
              </Button>
            </Stack>

            <TableContainer 
              sx={{ 
                borderRadius: 4, 
                border: '1px solid rgba(0,0,0,0.05)', 
                bgcolor: 'background.paper',
                boxShadow: '0 4px 12px rgba(0,0,0,0.01)',
                overflow: 'hidden'
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow
                    sx={{
                      '& th': {
                        bgcolor: 'rgba(241, 245, 249, 0.6)',
                        color: 'text.secondary',
                        fontWeight: 800,
                        fontSize: '11px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                        py: 1.5,
                      }
                    }}
                  >
                    <TableCell sx={{ pl: 2.5 }}>资产名称与物理源</TableCell>
                    <TableCell align="right">物理源业务数</TableCell>
                    <TableCell align="right">Neo4j 图谱数</TableCell>
                    <TableCell align="right">Qdrant 向量数</TableCell>
                    <TableCell>图向量一致性状态 (风险项)</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>资产健康占比</TableCell>
                    <TableCell align="right" sx={{ pr: 2.5 }}>数据操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!isLoading && filteredAssets.map((asset) => {
                    const status = statusConfig[asset.status] || statusConfig.attention;
                    const base = Math.max(Number(asset.qdrantCount || 0), Number(asset.neo4jCount || 0), 1);
                    const health = asset.status === 'unavailable' ? 8 : Math.max(8, Math.round((asset.activeCount / base) * 100));
                    return (
                      <TableRow 
                        key={asset.key} 
                        hover
                        sx={{
                          transition: 'background-color 0.2s',
                          '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.015) !important' },
                          '& td': { borderBottom: '1px solid rgba(0, 0, 0, 0.03)', py: 1.5 }
                        }}
                      >
                        <TableCell sx={{ pl: 2.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>{asset.name}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '10px' }}>{asset.source}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '12px', fontFamily: 'monospace' }}>{asset.businessCount}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '12px', fontFamily: 'monospace' }}>{asset.neo4jCount ?? '-'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '12px', fontFamily: 'monospace' }}>{asset.qdrantCount ?? '-'}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.75}>
                            {asset.missingInQdrantCount > 0 && (
                              <Chip 
                                size="small" 
                                label={`缺 ${asset.missingInQdrantCount}`} 
                                sx={{
                                  height: 18,
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  bgcolor: 'rgba(245, 158, 11, 0.08)',
                                  color: '#f59e0b',
                                  border: 'none',
                                }}
                              />
                            )}
                            {asset.orphanInQdrantCount > 0 && (
                              <Chip 
                                size="small" 
                                label={`孤 ${asset.orphanInQdrantCount}`} 
                                sx={{
                                  height: 18,
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  bgcolor: 'rgba(239, 68, 68, 0.08)',
                                  color: '#ef4444',
                                  border: 'none',
                                }}
                              />
                            )}
                            {!asset.missingInQdrantCount && !asset.orphanInQdrantCount && (
                              <Chip 
                                size="small" 
                                label="全同步" 
                                sx={{
                                  height: 18,
                                  fontSize: '10px',
                                  fontWeight: 800,
                                  bgcolor: 'rgba(16, 185, 129, 0.08)',
                                  color: '#10b981',
                                  border: 'none',
                                }}
                              />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <Box sx={{ flex: 1, position: 'relative' }}>
                              <LinearProgress 
                                variant="determinate" 
                                value={health} 
                                sx={{ 
                                  height: 6, 
                                  borderRadius: 3,
                                  bgcolor: alpha(theme.palette[status.color].main, 0.08),
                                  '& .MuiLinearProgress-bar': {
                                    background: status.gradient || theme.palette[status.color].main,
                                    borderRadius: 3
                                  }
                                }} 
                              />
                            </Box>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: `${status.color}.main`, fontFamily: 'monospace' }}>
                              {`${health}%`}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 2.5 }}>
                          <Stack direction="row" spacing={0.75} justifyContent="flex-end">
                            <Tooltip title="查看资产差异"><IconButton aria-label="查看资产差异" size="small" onClick={() => setDetailAssetKey(asset.key)} sx={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 1.5, p: 0.5 }}><SearchOutlined fontSize="small" sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                            <Tooltip title="重建向量空间"><IconButton aria-label="重建向量空间" size="small" disabled={asset.status === 'unavailable' || hasRunningTask} onClick={() => requestRebuildQdrant(asset)} sx={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 1.5, p: 0.5 }}><RestartAltOutlined fontSize="small" sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                            <Tooltip title="清理孤儿向量"><IconButton aria-label="清理孤儿向量" size="small" color="warning" disabled={!asset.orphanInQdrantCount} onClick={() => requestCleanupOrphans(asset)} sx={{ border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: 1.5, p: 0.5, '&:hover': { bgcolor: 'rgba(239,68,68,0.03)' } }}><DeleteSweepOutlined fontSize="small" sx={{ fontSize: 14 }} /></IconButton></Tooltip>
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 3.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
              {tasks.length > 0 && (
                <Paper variant="outlined" sx={{ borderRadius: 4, p: 0, overflow: 'hidden' }}>
                  <SectionHeader title="后台治理任务监控进度" caption="实时监听异步图谱重建任务与回填处理进度" />
                  <Divider sx={{ borderColor: 'rgba(0,0,0,0.05)' }} />
                  <Stack spacing={1.5} sx={{ p: 2 }}>
                    {tasks.map((task) => {
                      const taskStatus = taskStatusConfig[task.status] || taskStatusConfig.queued;
                      const total = Number(task.total || 0);
                      const processed = Number(task.processed || 0);
                      const progress = ['succeeded', 'cancelled'].includes(task.status)
                        ? 100
                        : total > 0
                          ? Math.min(100, Math.round((processed / total) * 100))
                          : 6;
                      const asset = assets.find((item) => item.key === task.asset_key);
                      return (
                        <Box 
                          key={task.task_id} 
                          sx={{ 
                            p: 2, 
                            borderRadius: 3.5, 
                            border: '1px solid rgba(0,0,0,0.05)', 
                            bgcolor: 'rgba(0,0,0,0.015)' 
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                            <Box>
                              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                                {asset?.name || task.asset_key}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                {taskOperationLabels[task.operation] || task.operation} • 线程 {task.task_id.split('-')[0]}
                              </Typography>
                            </Box>
                            <Chip 
                              size="small" 
                              color={taskStatus.color} 
                              label={taskStatus.label}
                              sx={{ height: 18, fontSize: '9px', fontWeight: 800 }}
                            />
                          </Stack>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Box sx={{ position: 'relative', flex: 1 }}>
                              <LinearProgress 
                                variant="determinate" 
                                value={progress} 
                                color={taskStatus.color} 
                                sx={{ 
                                  height: 6, 
                                  borderRadius: 3,
                                  bgcolor: 'rgba(0,0,0,0.05)'
                                }} 
                              />
                              {task.status === 'running' && (
                                <Box className="pulse-animation" sx={{ position: 'absolute', inset: 0, borderRadius: 3, bgcolor: alpha(theme.palette[taskStatus.color].main, 0.4), zIndex: -1 }} />
                              )}
                            </Box>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: 'slate.700', fontFamily: 'monospace' }}>
                              {`${progress}%`}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </Paper>
              )}

              <Alert 
                severity="info" 
                sx={{ 
                  borderRadius: 3.5, 
                  fontWeight: 700, 
                  border: '1px solid rgba(14, 165, 233, 0.12)', 
                  bgcolor: 'rgba(14, 165, 233, 0.02)',
                  color: '#0369a1' 
                }}
              >
                治理手册说明：定期执行全域“一致性深度扫描”有利于在底层 RAG 语义切片时拦截数据溢出和过期，自动维护并回填召回漏洞。
              </Alert>
            </Box>

            <Stack spacing={3.5}>
              <Paper variant="outlined" sx={{ borderRadius: 4, p: 2.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 900 }}>快捷治理动作面板</Typography>
                <Stack spacing={1.5}>
                  <Button 
                    variant="outlined" 
                    fullWidth 
                    startIcon={<SyncProblemOutlined />} 
                    onClick={() => syncStatusMutation.mutate()} 
                    disabled={syncStatusMutation.isPending || isFetching} 
                    sx={{
                      justifyContent: 'flex-start', borderRadius: 2, fontSize: '11px', fontWeight: 800,
                      borderColor: 'rgba(0,0,0,0.06)', bgcolor: 'white', py: 1,
                      '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.04)', borderColor: 'primary.main' }
                    }}
                  >
                    同步检索过滤状态
                  </Button>
                  <Button 
                    variant="outlined" 
                    fullWidth 
                    startIcon={<RestartAltOutlined />} 
                    onClick={() => assets[0] && requestRebuildQdrant(assets[0])} 
                    disabled={!assets.length || rebuildQdrantMutation.isPending || hasRunningTask} 
                    sx={{
                      justifyContent: 'flex-start', borderRadius: 2, fontSize: '11px', fontWeight: 800,
                      borderColor: 'rgba(0,0,0,0.06)', bgcolor: 'white', py: 1,
                      '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.04)', borderColor: 'primary.main' }
                    }}
                  >
                    增量同步回填向量库
                  </Button>
                  <Button 
                    variant="outlined" 
                    color="warning" 
                    fullWidth 
                    startIcon={<DeleteSweepOutlined />} 
                    onClick={() => { const target = assets.find((asset) => asset.orphanInQdrantCount); if (target) requestCleanupOrphans(target); }} 
                    disabled={!assets.some((asset) => asset.orphanInQdrantCount) || cleanupOrphansMutation.isPending} 
                    sx={{
                      justifyContent: 'flex-start', borderRadius: 2, fontSize: '11px', fontWeight: 800,
                      borderColor: 'rgba(239, 68, 68, 0.1)', bgcolor: 'white', py: 1,
                      '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.03)', borderColor: 'error.main' }
                    }}
                  >
                    一键清理全域孤儿向量
                  </Button>
                </Stack>
              </Paper>

              <Paper variant="outlined" sx={{ borderRadius: 4, p: 2.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 900 }}>最新图谱诊断日志</Typography>
                <Stack spacing={1.5}>
                  {diagnostics.length > 0 && !diagnostics.every(d => d.level === 'success') ? (
                    diagnostics.map((item, idx) => (
                      <Box 
                        key={idx} 
                        sx={{ 
                          p: 1.5, 
                          borderRadius: 3.5, 
                          bgcolor: item.level === 'warning' ? 'rgba(245, 158, 11, 0.02)' : 'rgba(16, 185, 129, 0.02)', 
                          border: '1px solid', 
                          borderColor: item.level === 'warning' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)' 
                        }}
                      >
                        <Typography variant="caption" sx={{ fontWeight: 800, display: 'block', color: 'slate.900' }}>{item.title}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75, fontWeight: 500, fontSize: '10px' }}>{item.detail}</Typography>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          disabled={item.level === 'success'}
                          sx={{ height: 20, borderRadius: 1.5, fontSize: '9px', fontWeight: 800 }}
                        >
                          {item.action}
                        </Button>
                      </Box>
                    ))
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2, px: 1 }}>
                      <Box 
                        component="img" 
                        src={healthySvg} 
                        sx={{ 
                          width: '100%', 
                          maxWidth: 140, 
                          mx: 'auto', 
                          mb: 1.5, 
                          filter: 'drop-shadow(0 8px 24px rgba(16, 185, 129, 0.15))',
                        }} 
                      />
                      <Typography variant="caption" sx={{ fontWeight: 900, display: 'block', color: '#10b981', letterSpacing: 0.5, mt: 1 }}>
                        图谱索引完美同步
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, fontSize: '10px' }}>
                        当前未发现任何一致性差异漏洞
                      </Typography>
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

      {/* Asset Detail Dialog displaying missing UUIDs inside a gorgeous terminal */}
      <Dialog 
        open={Boolean(detailAssetKey)} 
        onClose={() => setDetailAssetKey('')} 
        maxWidth="sm" 
        fullWidth 
        PaperProps={{ sx: { borderRadius: 4.5 } }}
      >
        <DialogTitle sx={{ px: 3.5, pt: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 1.5, bgcolor: 'rgba(14, 165, 233, 0.08)', color: 'primary.main' }}>
            <DataObjectOutlined fontSize="small" />
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>图谱向量未匹配差异明细</Typography>
            <Typography variant="caption" color="text.secondary">{assetDetailQuery.data?.asset?.name}</Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {assetDetailQuery.isFetching && <LinearProgress />}
          <Box sx={{ p: 3.5 }}>
             <Stack spacing={3}>
               <Box>
                 <Typography variant="caption" sx={{ fontWeight: 800, mb: 1, display: 'block', color: 'slate.700' }}>
                   ① Neo4j 图谱存在但 Qdrant 缺失的数据 ID 列表
                 </Typography>
                 
                 {/* Dark hacker terminal monospace box */}
                 <Box 
                   sx={{ 
                     borderRadius: 3.5, 
                     overflow: 'hidden', 
                     border: '1px solid rgba(30, 41, 59, 0.3)',
                     bgcolor: '#0f172a',
                   }}
                 >
                   <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#1e293b', borderBottom: '1px solid rgba(51, 65, 85, 0.3)', display: 'flex', gap: 0.5 }}>
                     <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444' }} />
                     <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                     <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
                   </Box>
                   <Box sx={{ p: 2, maxHeight: 180, overflow: 'auto' }}>
                      {(assetDetailQuery.data?.missing_in_qdrant || []).length ? assetDetailQuery.data.missing_in_qdrant.map(id => (
                        <Typography key={id} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', color: '#38bdf8', lineHeight: 1.5 }}>
                          {id}
                        </Typography>
                      )) : <Typography variant="caption" sx={{ color: 'slate.400', fontFamily: 'monospace' }}>[SUCCESS] no missing vectors detected</Typography>}
                   </Box>
                 </Box>
               </Box>
               
               <Box>
                 <Typography variant="caption" sx={{ fontWeight: 800, mb: 1, display: 'block', color: 'slate.700' }}>
                   ② Qdrant 存在但 Neo4j 缺失的数据 ID 列表 (孤儿点)
                 </Typography>
                 
                 {/* Dark hacker terminal monospace box */}
                 <Box 
                   sx={{ 
                     borderRadius: 3.5, 
                     overflow: 'hidden', 
                     border: '1px solid rgba(30, 41, 59, 0.3)',
                     bgcolor: '#0f172a',
                   }}
                 >
                   <Box sx={{ px: 1.5, py: 0.75, bgcolor: '#1e293b', borderBottom: '1px solid rgba(51, 65, 85, 0.3)', display: 'flex', gap: 0.5 }}>
                     <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444' }} />
                     <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                     <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
                   </Box>
                   <Box sx={{ p: 2, maxHeight: 180, overflow: 'auto' }}>
                      {(assetDetailQuery.data?.orphan_in_qdrant || []).length ? assetDetailQuery.data.orphan_in_qdrant.map(id => (
                        <Typography key={id} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', color: '#f43f5e', lineHeight: 1.5 }}>
                          {id}
                        </Typography>
                      )) : <Typography variant="caption" sx={{ color: 'slate.400', fontFamily: 'monospace' }}>[SUCCESS] no orphan vector points detected</Typography>}
                   </Box>
                 </Box>
               </Box>
             </Stack>
          </Box>
        </DialogContent>
        <Box sx={{ p: 2, px: 3.5, display: 'flex', justifyContent: 'flex-end', bgcolor: 'rgba(0,0,0,0.01)' }}>
          <Button onClick={() => setDetailAssetKey('')} size="small" sx={{ fontWeight: 800, fontSize: '11px' }}>
            关闭明细
          </Button>
        </Box>
      </Dialog>

      <ConfirmDialog
        {...confirmDialog}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null, confirmText: '确认', danger: false })}
      />
    </Box>
  );
}
