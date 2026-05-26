import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  AutoFixHighOutlined,
  CheckCircleOutlineOutlined,
  HubOutlined,
  RefreshOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { useSnackbar } from '../../components/SnackbarProvider';
import { indexGovernanceAPI } from '../../api/indexGovernance';

const severityMeta = {
  error: { label: '严重', color: 'error', icon: <WarningAmberOutlined fontSize="small" /> },
  warning: { label: '警告', color: 'warning', icon: <WarningAmberOutlined fontSize="small" /> },
  info: { label: '建议', color: 'info', icon: <HubOutlined fontSize="small" /> },
};

const riskLabels = {
  low: '低危',
  medium: '中危',
  high: '高危风险',
};

export default function GovernanceRecommendationsPanel({ compact = false, title = '闭环治理建议 (RAG Shield Advice)', caption = '基于 RAG 观测与全域索引一致性扫描，生成针对数据漏测与过期的安全治理动作。' }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const showSnackbar = useSnackbar();
  const [confirmDialog, setConfirmDialog] = React.useState({ open: false });
  
  const recommendationsQuery = useQuery({
    queryKey: ['index-governance', 'recommendations'],
    queryFn: indexGovernanceAPI.getRecommendations,
    refetchOnWindowFocus: false,
  });

  const actionMutation = useMutation({
    mutationFn: indexGovernanceAPI.executeRecommendationAction,
    onSuccess: (data) => {
      showSnackbar(data?.message || '治理闭环动作执行成功！', { severity: 'success' });
      queryClient.invalidateQueries({ queryKey: ['index-governance'] });
      queryClient.invalidateQueries({ queryKey: ['ai-obs'] });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
    onError: (error) => {
      showSnackbar(error?.message || '闭环动作执行失败', { severity: 'error' });
    },
  });

  const recommendations = recommendationsQuery.data?.items || [];
  const visibleItems = compact ? recommendations.slice(0, 3) : recommendations;

  const executeAction = async (action, confirm = false) => {
    await actionMutation.mutateAsync({
      action: action.kind,
      assetKey: action.asset_key || '',
      confirm,
    });
  };

  const requestAction = (recommendation, action) => {
    if (!action.requires_confirm) {
      executeAction(action, false);
      return;
    }
    setConfirmDialog({
      open: true,
      title: action.risk === 'high' ? '确认执行高风险索引治理动作' : '确认执行索引治理动作',
      message: `将立即执行「${action.label}」治理命令。\n\n来源安全诊断：${recommendation.title}\n根本原因：${recommendation.reason}`,
      confirmText: action.label,
      danger: action.risk === 'high',
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await executeAction(action, true);
      },
    });
  };

  return (
    <Paper 
      variant="outlined" 
      sx={{ 
        borderRadius: 4.5, 
        overflow: 'hidden', 
        bgcolor: 'rgba(255,255,255,0.35)', 
        border: '1px solid rgba(99, 102, 241, 0.15)',
        boxShadow: '0 8px 32px rgba(99, 102, 241, 0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Header bar */}
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(0,0,0,0.06)', bgcolor: 'rgba(255, 255, 255, 0.3)' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 1.5, bgcolor: 'rgba(99, 102, 241, 0.08)', color: '#6366f1' }}>
              <HubOutlined fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.primary' }}>{title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{caption}</Typography>
            </Box>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshOutlined />}
            onClick={() => recommendationsQuery.refetch()}
            disabled={recommendationsQuery.isFetching}
            sx={{
              borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' }
            }}
          >
            同步刷新
          </Button>
        </Stack>
      </Box>

      {recommendationsQuery.isFetching && <LinearProgress />}

      <Box sx={{ p: 2.5 }}>
        {recommendationsQuery.isError ? (
          <EmptyState compact variant="error" title="闭环建议加载失败" description={recommendationsQuery.error?.message} />
        ) : !recommendations.length && !recommendationsQuery.isLoading ? (
          <Alert 
            icon={<CheckCircleOutlineOutlined />} 
            severity="success" 
            sx={{ 
              borderRadius: 3.5, 
              fontWeight: 700, 
              border: '1px solid rgba(16, 185, 129, 0.12)', 
              bgcolor: 'rgba(16, 185, 129, 0.02)',
              color: '#0f766e'
            }}
          >
            当前扫描通过：未发现需要执行的 RAG / 索引一致性数据治理闭环动作。
          </Alert>
        ) : (
          <Stack spacing={2}>
            {visibleItems.map((recommendation) => {
              const meta = severityMeta[recommendation.severity] || severityMeta.info;
              
              // Keyframes glowing pulse per severity category
              const pulseStyles = {
                border: '1px solid',
                borderColor: alpha(theme.palette[meta.color].main, 0.15),
                bgcolor: alpha(theme.palette[meta.color].main, 0.01),
                animation: `${recommendation.id}_glow 3s infinite ease-in-out`,
                [`@keyframes ${recommendation.id}_glow`]: {
                  '0%, 100%': { borderColor: alpha(theme.palette[meta.color].main, 0.15), boxShadow: `0 0 8px ${alpha(theme.palette[meta.color].main, 0.01)}` },
                  '50%': { borderColor: alpha(theme.palette[meta.color].main, 0.45), boxShadow: `0 0 16px ${alpha(theme.palette[meta.color].main, 0.06)}` }
                }
              };

              return (
                <Box
                  key={recommendation.id}
                  sx={{
                    p: 2,
                    borderRadius: 3.5,
                    transition: 'all 0.3s',
                    ...pulseStyles
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip 
                        size="small" 
                        color={meta.color} 
                        icon={meta.icon} 
                        label={meta.label} 
                        sx={{
                          height: 18,
                          fontSize: '10px',
                          fontWeight: 800,
                          borderRadius: 1.5,
                        }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 800, color: 'text.primary' }}>
                        {recommendation.title}
                      </Typography>
                    </Stack>
                    
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500, lineHeight: 1.5 }}>
                      {recommendation.reason}
                    </Typography>
                    
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {(recommendation.evidence || []).slice(0, compact ? 2 : 4).map((item) => (
                        <Chip 
                          key={`${recommendation.id}-${item.label}`} 
                          size="small" 
                          label={`${item.label}: ${item.value}`} 
                          sx={{ 
                            height: 18,
                            fontSize: '9px',
                            fontWeight: 700,
                            borderRadius: 1.2,
                            bgcolor: 'rgba(0,0,0,0.03)',
                            color: 'text.secondary',
                          }}
                        />
                      ))}
                    </Stack>
                    
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 0.5 }}>
                      {(recommendation.actions || []).map((action) => (
                        <Button
                          key={`${recommendation.id}-${action.id}`}
                          size="small"
                          variant="outlined"
                          color={action.risk === 'high' ? 'warning' : 'primary'}
                          startIcon={<AutoFixHighOutlined sx={{ fontSize: 12 }} />}
                          disabled={actionMutation.isPending}
                          onClick={() => requestAction(recommendation, action)}
                          sx={{
                            borderRadius: 1.8,
                            fontSize: '11px',
                            fontWeight: 800,
                            height: 26,
                            px: 1.5,
                            borderColor: action.risk === 'high' ? 'rgba(245, 158, 11, 0.45)' : 'rgba(14, 165, 233, 0.45)',
                            bgcolor: 'white',
                            '&:hover': {
                              transform: 'translateY(-1px)',
                              bgcolor: action.risk === 'high' ? 'rgba(245, 158, 11, 0.04)' : 'rgba(14, 165, 233, 0.04)',
                              borderColor: action.risk === 'high' ? 'warning.main' : 'primary.main',
                            }
                          }}
                        >
                          {action.label}
                          {action.risk && <Box component="span" sx={{ ml: 0.5, opacity: 0.72 }}>· {riskLabels[action.risk]}</Box>}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
            
            {compact && recommendations.length > visibleItems.length && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, fontWeight: 500 }}>
                • 提示：系统仍有 {recommendations.length - visibleItems.length} 条建议，请前往 [数据治理中心](/index-governance) 查看完整闭环建议。
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      <ConfirmDialog
        {...confirmDialog}
        onCancel={() => setConfirmDialog({ open: false })}
      />
    </Paper>
  );
}
