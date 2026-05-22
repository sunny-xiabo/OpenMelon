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
  low: '低风险',
  medium: '需确认',
  high: '高风险',
};

export default function GovernanceRecommendationsPanel({ compact = false, title = '闭环建议', caption = '基于 RAG 观测与索引治理诊断生成的可执行建议。' }) {
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
      showSnackbar(data?.message || '闭环动作已执行', { severity: 'success' });
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
      title: action.risk === 'high' ? '确认执行高风险治理动作' : '确认执行治理动作',
      message: `将执行「${action.label}」。\n\n来源建议：${recommendation.title}\n原因：${recommendation.reason}`,
      confirmText: action.label,
      danger: action.risk === 'high',
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await executeAction(action, true);
      },
    });
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.58)' }}>
      <Box sx={{ p: compact ? 1.5 : 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">{caption}</Typography>
          </Box>
          <Button
            size="small"
            startIcon={<RefreshOutlined />}
            onClick={() => recommendationsQuery.refetch()}
            disabled={recommendationsQuery.isFetching}
          >
            刷新
          </Button>
        </Stack>
      </Box>
      {recommendationsQuery.isFetching && <LinearProgress />}
      <Box sx={{ p: compact ? 1.5 : 2 }}>
        {recommendationsQuery.isError ? (
          <EmptyState compact variant="error" title="闭环建议加载失败" description={recommendationsQuery.error?.message} />
        ) : !recommendations.length && !recommendationsQuery.isLoading ? (
          <Alert icon={<CheckCircleOutlineOutlined />} severity="success" sx={{ borderRadius: 2 }}>
            当前未发现需要执行的 RAG / 索引治理闭环动作。
          </Alert>
        ) : (
          <Stack spacing={1.5}>
            {visibleItems.map((recommendation) => {
              const meta = severityMeta[recommendation.severity] || severityMeta.info;
              return (
                <Box
                  key={recommendation.id}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: alpha(theme.palette[meta.color].main, 0.18),
                    bgcolor: alpha(theme.palette[meta.color].main, 0.045),
                  }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" color={meta.color} icon={meta.icon} label={meta.label} variant="outlined" />
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>{recommendation.title}</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">{recommendation.reason}</Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {(recommendation.evidence || []).slice(0, compact ? 2 : 4).map((item) => (
                        <Chip key={`${recommendation.id}-${item.label}`} size="small" label={`${item.label}: ${item.value}`} sx={{ borderRadius: 1.5 }} />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {(recommendation.actions || []).map((action) => (
                        <Button
                          key={`${recommendation.id}-${action.id}`}
                          size="small"
                          variant={action.risk === 'high' ? 'contained' : 'outlined'}
                          color={action.risk === 'high' ? 'warning' : 'primary'}
                          startIcon={<AutoFixHighOutlined />}
                          disabled={actionMutation.isPending}
                          onClick={() => requestAction(recommendation, action)}
                          sx={{ borderRadius: 2 }}
                        >
                          {action.label}
                          {action.risk && <Box component="span" sx={{ ml: 0.75, opacity: 0.72 }}>· {riskLabels[action.risk]}</Box>}
                        </Button>
                      ))}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
            {compact && recommendations.length > visibleItems.length && (
              <Typography variant="caption" color="text.secondary">
                还有 {recommendations.length - visibleItems.length} 条建议，请到索引治理页查看完整闭环建议。
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
