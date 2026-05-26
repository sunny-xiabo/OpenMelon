import {
  Box,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';

export const TASK_LABELS = {
  manual_review: '失败待诊断',
  knowledge_ingest_candidate: '知识待确认',
  knowledge_write_failure: '知识写入失败',
  scheduled_run_review: '定时执行待处理',
  policy_blocked: '策略阻断',
};

export const TASK_CATEGORY_LABELS = {
  manual_review: '失败诊断',
  knowledge_ingest_candidate: '知识候选',
  knowledge_write_failure: '写入异常',
  scheduled_run_review: '定时执行',
  policy_blocked: '策略审批',
};

export const TASK_STATUS_LABELS = {
  pending: '待处理',
  running: '处理中',
  failed: '失败',
  resolved: '已完成',
};

export const GOVERNANCE_STEPS = [
  { key: 'tasks', label: '待办队列', caption: '确认候选 / 处理异常' },
  { key: 'knowledge', label: '知识库', caption: '有效 / 失效 / 撤回' },
  { key: 'templates', label: '模板库', caption: '复用资产管理' },
  { key: 'assets', label: '资产健康', caption: '积压与一致性' },
];

export const KNOWLEDGE_STATUS = {
  active: { label: '已沉淀', color: 'success' },
  invalid: { label: '已标记失效', color: 'warning' },
  revoked: { label: '已撤回使用', color: 'default' },
};

export const KNOWLEDGE_TYPE_LABELS = {
  api_run_summary: 'API 执行摘要',
  api_failure: 'API 失败经验',
  api_repair: 'API 修复经验',
  test_case: '测试用例',
};

export const getTaskDisplayLabel = (task) => {
  if (task.task_type === 'knowledge_ingest_candidate') {
    return task.status === 'resolved' ? '知识已沉淀' : '知识待确认';
  }
  if (task.task_type === 'knowledge_write_failure') {
    return task.status === 'resolved' ? '知识写入已处理' : '知识写入失败';
  }
  if (task.task_type === 'manual_review') {
    return task.status === 'resolved' ? '失败诊断已完成' : '失败待诊断';
  }
  if (task.task_type === 'scheduled_run_review') {
    return task.status === 'resolved' ? '定时执行已处理' : '定时执行待处理';
  }
  if (task.task_type === 'policy_blocked') {
    return task.status === 'resolved' ? '策略阻断已处理' : '策略阻断';
  }
  return TASK_LABELS[task.task_type] || task.task_type || '待处理项';
};

export const getTaskSource = (task) => {
  if (task.run_id) {
    return { label: '执行记录', value: task.run_id, helper: task.project_id || task.environment_id || '' };
  }
  if (task.project_id) {
    return { label: '项目', value: task.project_id, helper: task.environment_id || '' };
  }
  if (task.environment_id) {
    return { label: '环境', value: task.environment_id, helper: '' };
  }
  return { label: '任务', value: task.task_id || '未记录', helper: '' };
};

export function Metric({ label, value, tone, compact = false }) {
  const colors = {
    warning: { bg: 'rgba(217, 119, 6, 0.04)', color: '#d97706', border: 'rgba(217, 119, 6, 0.15)' },
    error: { bg: 'rgba(220, 38, 38, 0.04)', color: '#dc2626', border: 'rgba(220, 38, 38, 0.15)' },
    success: { bg: 'rgba(22, 163, 74, 0.04)', color: '#16a34a', border: 'rgba(22, 163, 74, 0.15)' },
    info: { bg: 'rgba(2, 132, 199, 0.04)', color: '#0284c7', border: 'rgba(2, 132, 199, 0.15)' },
  };
  const theme = colors[tone] || colors.info;
  const isErrorAlert = tone === 'error' && (typeof value === 'number' ? value > 0 : parseInt(value, 10) > 0);

  return (
    <Box 
      className={isErrorAlert ? "pulse-animation magnetic-card" : "magnetic-card"}
      sx={{ 
        p: compact ? 1.75 : 2.2, 
        borderRadius: 3.5, 
        bgcolor: theme.bg, 
        border: '1px solid', 
        borderColor: isErrorAlert ? '#dc2626' : theme.border, 
        minWidth: 0,
        boxShadow: isErrorAlert 
          ? '0 0 12px rgba(220,38,38,0.15), inset 0 1px 0 rgba(255,255,255,0.6)' 
          : '0 4px 12px rgba(15,23,42,0.01), inset 0 1px 0 rgba(255,255,255,0.7)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: theme.color,
          boxShadow: `0 8px 24px ${isErrorAlert ? 'rgba(220,38,38,0.2)' : 'rgba(15,23,42,0.03)'}, inset 0 1px 0 rgba(255,255,255,0.8)`
        }
      }}
    >
      {/* Visual background gradient glow */}
      <Box sx={{ 
        position: 'absolute', top: -30, right: -30, width: 80, height: 80, 
        background: `radial-gradient(circle, ${alpha(theme.color, 0.06)} 0%, transparent 70%)`,
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      <Stack spacing={compact ? 0.75 : 1} sx={{ position: 'relative', zIndex: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', letterSpacing: '0.02em', opacity: 0.85 }}>
          {label}
        </Typography>
        <Typography
          variant={compact ? 'body2' : 'h6'}
          sx={{ 
            color: theme.color, 
            fontWeight: 900, 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap',
            fontSize: compact ? '12px' : '18px',
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </Typography>
      </Stack>
    </Box>
  );
}
