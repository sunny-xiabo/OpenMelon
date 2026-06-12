import React from 'react';
import {
  Alert,
  Box,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { AltRouteOutlined, TipsAndUpdatesOutlined, WarningAmberOutlined } from '@mui/icons-material';

export default function AgentRecommendationPanel({ advice, lastPlanInsight }) {
  const backendRecommendations = lastPlanInsight?.recommendations || [];
  return (
    <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#ffffff', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
      <Stack spacing={1.25}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center">
            <TipsAndUpdatesOutlined color="primary" fontSize="small" />
            <Box>
              <Typography variant="subtitle2" fontWeight={850}>Agent 推荐</Typography>
              <Typography variant="caption" color="text.secondary">测试计划、风险解释、待补配置和链路依赖建议</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={advice.scopeLabel} color={advice.scope.length ? 'primary' : 'default'} variant="outlined" />
            <Chip size="small" label={`${advice.highRisk.length} 个高风险`} color={advice.highRisk.length ? 'warning' : 'default'} variant="outlined" />
            <Chip size="small" label={`${advice.dependencyMatches.length} 条可串联依赖`} color={advice.dependencyMatches.length ? 'success' : 'default'} variant="outlined" />
          </Stack>
        </Stack>

        {!!advice.missing.length && (
          <Alert severity="warning" icon={<WarningAmberOutlined fontSize="inherit" />}>
            {advice.missing.join('；')}
          </Alert>
        )}

        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          <Chip size="small" icon={<AltRouteOutlined />} label={advice.creates.length ? `创建接口 ${advice.creates.length} 个` : '未发现创建接口'} variant="outlined" />
          <Chip size="small" label={advice.pathVariableConsumers.length ? `路径参数接口 ${advice.pathVariableConsumers.length} 个` : '无路径参数依赖'} variant="outlined" />
          <Chip size="small" label={advice.auth.length ? `鉴权相关 ${advice.auth.length} 个` : '未纳入登录接口'} variant="outlined" />
        </Stack>

        {lastPlanInsight?.orchestrationSummary && (
          <Alert severity={lastPlanInsight.dependencyGraph?.length ? 'success' : 'info'}>
            {lastPlanInsight.orchestrationSummary}
          </Alert>
        )}

        {!!backendRecommendations.length && (
          <Stack spacing={0.75}>
            {backendRecommendations.slice(0, 3).map((item, index) => (
              <Typography key={`${item.type || 'recommendation'}-${index}`} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {item.title ? `${item.title}：` : ''}{item.message}
              </Typography>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
