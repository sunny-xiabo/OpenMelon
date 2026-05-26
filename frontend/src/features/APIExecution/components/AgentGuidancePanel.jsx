import React from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { ScienceOutlined } from '@mui/icons-material';
import { useAgentContext } from '../hooks/useAPIExecutionQueries';
import { useProjectEnvContext } from '../contexts/ProjectEnvContext';
import { useAgentPlanBuilder } from '../hooks/useAgentPlanBuilder';

export default function AgentGuidancePanel({ onNavigate, onOpenAdvanced }) {
  const { selectedProjectId } = useProjectEnvContext();
  const { data: agentContext, isLoading } = useAgentContext(selectedProjectId);
  const { buildingPlan, handleAgentAction } = useAgentPlanBuilder({ onNavigate });
  const recommendation = agentContext?.recommendation;

  if (!selectedProjectId) {
    return (
      <Alert severity="info">
        Agent 会在选择项目后给出下一步建议。请先进入准备页创建或选择项目。
      </Alert>
    );
  }

  const assetSummary = agentContext?.asset_summary || {};
  const readiness = agentContext?.readiness || {};

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 1,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        bgcolor: '#ffffff',
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ScienceOutlined color="primary" /> Agent 下一步推荐
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isLoading ? 'Agent 正在检查项目、环境、资产和最近执行结果。' : agentContext?.summary || 'Agent 会根据当前状态推荐下一步。'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={readiness.base_url_ready ? '环境可执行' : '环境待配置'} color={readiness.base_url_ready ? 'success' : 'default'} variant="outlined" />
            <Chip size="small" label={`${assetSummary.active_interface_count || 0} 个有效接口`} color={assetSummary.active_interface_count ? 'success' : 'default'} variant="outlined" />
            <Chip size="small" label={`${assetSummary.changed_interface_count || 0} 个变更`} color={assetSummary.changed_interface_count ? 'warning' : 'default'} variant="outlined" />
            {!!agentContext?.pending_task_count && <Chip size="small" label={`${agentContext.pending_task_count} 个待办`} color="warning" variant="outlined" />}
          </Stack>
        </Stack>

        {recommendation && (
          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#f8fafc', border: '1px solid rgba(15, 23, 42, 0.06)' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
              <Box>
                <Typography variant="body2" fontWeight={850}>{recommendation.label}</Typography>
                <Typography variant="caption" color="text.secondary">{recommendation.description}</Typography>
              </Box>
              <Button variant="contained" onClick={() => handleAgentAction(recommendation, { onOpenAdvanced })} disabled={buildingPlan}>
                {buildingPlan && recommendation.action === 'generate_test_plan' ? '生成中...' : recommendation.action === 'generate_test_plan' ? '按推荐生成计划' : '去处理'}
              </Button>
            </Stack>
          </Box>
        )}

        {!!agentContext?.skipped_reason_groups?.length && (
          <Alert severity="info">
            Agent 已自动避开不可测试接口：{agentContext.skipped_reason_groups.slice(0, 2).map((item) => `${item.reason} ${item.count} 个`).join('；')}
          </Alert>
        )}

        {!!agentContext?.quick_actions?.length && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {agentContext.quick_actions.map((action) => (
              <Button key={`${action.action}-${action.label}`} size="small" variant="outlined" onClick={() => handleAgentAction(action, { onOpenAdvanced })} disabled={buildingPlan && action.action === 'generate_test_plan'}>
                {action.label}
              </Button>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
