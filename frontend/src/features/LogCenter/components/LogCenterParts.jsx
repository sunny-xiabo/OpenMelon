import { Box, Typography } from '@mui/material';
import { apiExecutionAPI } from '../../../api/execution';
import {
  formatDuration,
  formatRunTime,
  getRunStatusMeta,
} from '../../APIExecution/utils';

export const LEVEL_META = {
  info: { label: '信息', color: 'info' },
  warning: { label: '警告', color: 'warning' },
  error: { label: '错误', color: 'error' },
};

export const MODULE_LABELS = {
  api_execution: 'API 自动化',
  policy: '策略审计',
  task_center: '任务中心',
  knowledge: '知识治理',
  rag_query: 'RAG 查询',
  ingestion: '文档索引',
  management: '文件管理',
  graph: '知识图谱',
  prompt_hub: 'Prompt Hub',
  testcase_generation: '测试用例生成',
  webhook: '企业 Webhook',
  ai_assistant: 'AI 助手',
};

const TASK_TYPE_LABELS = {
  manual_review: '失败待诊断',
  knowledge_ingest_candidate: '知识待确认',
  knowledge_write_failure: '知识写入失败',
  scheduled_run_review: '定时执行待处理',
  policy_blocked: '策略阻断',
};

export const TIME_RANGE_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: '1h', label: '最近 1 小时', ms: 60 * 60 * 1000 },
  { value: '24h', label: '最近 24 小时', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '最近 7 天', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: '最近 30 天', ms: 30 * 24 * 60 * 60 * 1000 },
];

function buildRunLogs(runs) {
  return runs.map((run) => {
    const status = getRunStatusMeta(run.status);
    const options = run.execution_options || {};
    return {
      id: `run:${run.run_id}`,
      time: run.run_at,
      level: run.status === 'failed' ? 'error' : run.status === 'cancelled' ? 'warning' : 'info',
      module: 'api_execution',
      moduleLabel: MODULE_LABELS.api_execution,
      type: '执行记录',
      title: `${run.case_name || run.case_id || 'API 执行'} · ${status.label}`,
      detail: `通过 ${run.passed || 0} / 失败 ${run.failed || 0} · ${formatDuration(run.duration_ms)}`,
      refs: compactRefs([run.run_id, run.case_id, options.project_id, options.environment_id]),
      payload: run,
    };
  });
}

function buildPolicyLogs(audits) {
  return audits.map((audit) => ({
    id: `policy:${audit.audit_id}`,
    time: audit.created_at,
    level: audit.approved || audit.decision?.allowed ? 'info' : 'warning',
    module: 'policy',
    moduleLabel: MODULE_LABELS.policy,
    type: audit.action || '策略审计',
    title: audit.approved || audit.decision?.allowed ? '策略允许执行' : '策略需要关注',
    detail: audit.approval_note || audit.decision?.reason || audit.decision?.violations?.join('；') || '无备注',
    refs: compactRefs([audit.run_id, audit.project_id, audit.environment_id, audit.decision?.project_id, audit.decision?.environment_id]),
    payload: audit,
  }));
}

function buildTaskLogs(tasks) {
  return tasks.map((task) => ({
    id: `task:${task.task_id}`,
    time: task.updated_at || task.created_at,
    level: task.status === 'failed' || task.risk_level === 'blocked' ? 'error' : task.status === 'pending' ? 'warning' : 'info',
    module: 'task_center',
    moduleLabel: MODULE_LABELS.task_center,
    type: TASK_TYPE_LABELS[task.task_type] || task.task_type || '待处理任务',
    title: task.status === 'resolved' ? '任务已完成' : '任务待处理',
    detail: task.reason || task.resolution_note || task.task_id,
    refs: compactRefs([task.task_id, task.run_id, task.project_id, task.environment_id, task.result_run_id]),
    payload: task,
  }));
}

function buildKnowledgeLogs(items) {
  return items.map((item) => ({
    id: `knowledge:${item.knowledge_id}`,
    time: item.updated_at || item.created_at,
    level: item.status === 'invalid' ? 'warning' : item.status === 'revoked' ? 'error' : 'info',
    module: 'knowledge',
    moduleLabel: MODULE_LABELS.knowledge,
    type: item.item_type || '知识项',
    title: item.summary || item.knowledge_id,
    detail: item.governance_note || `状态：${item.status || 'active'}`,
    refs: compactRefs([item.knowledge_id, item.source_run_id, item.project_id]),
    payload: item,
  }));
}

export async function loadFallbackLogs(projectId) {
  const [projectData, runData, auditData, taskData, knowledgeData] = await Promise.all([
    apiExecutionAPI.listProjects(),
    apiExecutionAPI.listRuns({ limit: 200, projectId }),
    apiExecutionAPI.listPolicyAudits({ limit: 100, projectId }),
    apiExecutionAPI.listAutomationTasks({ limit: 200, projectId }),
    apiExecutionAPI.listKnowledgeReviewItems({ limit: 200, projectId }),
  ]);
  return {
    projects: projectData.projects || [],
    logs: [
      ...buildRunLogs(runData.items || runData.runs || []),
      ...buildPolicyLogs(auditData.audits || []),
      ...buildTaskLogs(taskData.items || taskData.tasks || []),
      ...buildKnowledgeLogs(knowledgeData.items || []),
    ].sort((a, b) => String(b.time).localeCompare(String(a.time))),
  };
}

export function normalizeUnifiedLog(event) {
  return {
    id: event.event_id,
    time: event.created_at,
    level: event.level || 'info',
    module: event.module || '',
    moduleLabel: MODULE_LABELS[event.module] || event.module || '未知模块',
    type: event.event_type || '事件',
    title: event.title || event.event_type || event.event_id,
    detail: event.message || '',
    refs: event.refs || compactRefs([event.trace_id, event.source_id, event.project_id]),
    payload: event.data || event,
  };
}

export function getRangeParams(timeRange) {
  const range = TIME_RANGE_OPTIONS.find((item) => item.value === timeRange);
  if (!range?.ms) return { startAt: '', endAt: '' };
  return {
    startAt: new Date(Date.now() - range.ms).toISOString(),
    endAt: '',
  };
}

export function parseLogTime(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function compactRefs(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function getRelatedCount(log, logs) {
  if (!log.refs?.length) return 0;
  const refs = new Set(log.refs);
  return logs.filter((item) => item.id !== log.id && (item.refs || []).some((ref) => refs.has(ref))).length;
}

export function findRelatedLogs(log, logs) {
  if (!log.refs?.length) return [];
  const refs = new Set(log.refs);
  return logs.filter((item) => item.id !== log.id && (item.refs || []).some((ref) => refs.has(ref))).slice(0, 8);
}

export function Metric({ label, value, tone, compact = false }) {
  const colors = {
    warning: { bg: 'rgba(245,158,11,0.10)', color: 'warning.main' },
    error: { bg: 'rgba(239,68,68,0.10)', color: 'error.main' },
    success: { bg: 'rgba(34,197,94,0.10)', color: 'success.main' },
    info: { bg: 'rgba(14,165,233,0.10)', color: 'info.main' },
  };
  const theme = colors[tone] || colors.info;
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: theme.bg, border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
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

export function Info({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}
