import { Box } from '@mui/material';
import {
  AccountTree as FeaturesIcon,
  BugReport as CasesIcon,
  Warning as WarningIcon,
  Widgets as WidgetsIcon,
} from '@mui/icons-material';
import MetricCard from './MetricCard';

export default function CoverageMetricCards({ metrics, modules }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
      <MetricCard
        label="模块总数"
        value={modules.length}
        helper={`其中 ${metrics.healthyCount} 个模块覆盖健康`}
        accent="rgba(26,115,232,0.08)"
        icon={<WidgetsIcon fontSize="inherit" />}
        trend={metrics.healthyCount > 0 ? { text: `${((metrics.healthyCount / modules.length) * 100).toFixed(0)}% 健康`, color: '#22c55e' } : null}
      />
      <MetricCard
        label="功能总数"
        value={metrics.totalFeatures}
        helper="已纳入图谱统计的功能节点总量"
        accent="rgba(16,185,129,0.08)"
        icon={<FeaturesIcon fontSize="inherit" />}
      />
      <MetricCard
        label="用例总数"
        value={metrics.totalCases}
        helper={metrics.totalFeatures > 0 ? `平均每功能 ${(metrics.totalCases / metrics.totalFeatures).toFixed(1)} 条用例` : '按模块聚合的测试用例节点总量'}
        accent="rgba(245,158,11,0.08)"
        icon={<CasesIcon fontSize="inherit" />}
      />
      <MetricCard
        label="风险模块"
        value={metrics.riskCount}
        helper="覆盖率低于 50% 的模块数量"
        accent="rgba(239,68,68,0.08)"
        icon={<WarningIcon fontSize="inherit" />}
        trend={metrics.riskCount > 0 ? { text: '需关注', color: '#ef4444' } : { text: '无风险', color: '#22c55e' }}
      />
    </Box>
  );
}
