import {
  Box,
  Typography,
} from '@mui/material';

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
    warning: { bg: 'rgba(245,158,11,0.10)', color: 'warning.main' },
    error: { bg: 'rgba(239,68,68,0.10)', color: 'error.main' },
    success: { bg: 'rgba(34,197,94,0.10)', color: 'success.main' },
    info: { bg: 'rgba(14,165,233,0.10)', color: 'info.main' },
  };
  const theme = colors[tone] || colors.info;
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: theme.bg, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography
        variant={compact ? 'body2' : 'h5'}
        sx={{ color: theme.color, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {value}
      </Typography>
    </Box>
  );
}
