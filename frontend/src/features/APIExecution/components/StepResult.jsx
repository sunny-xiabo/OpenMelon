import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, Box, Typography, Button, Chip, Paper, Alert, LinearProgress, Divider } from '@mui/material';
import { BuildCircleOutlined, RefreshOutlined, TroubleshootOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import EmptyState from '../../../components/EmptyState';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { API_EXECUTION_DASHBOARD_REFRESH_EVENT } from '../../../constants/events';
import {
  getPolicyRiskColor,
  getPolicyRiskLabel,
  getRunStatusMeta,
} from '../utils';
import { getAssertionTypeLabel } from '../constants';
import {
  applyRepairOperationsToScript,
  buildRepairApplyConfirmMessage,
  getLowRiskRepairOperations,
  markAiRepairSource,
} from '../utils/repairPatch';
import StageHeader from './StageHeader';
import AIFlowDraftDialog from './AIFlowDraftDialog';
import { EXEC_KEYS } from '../hooks/useAPIExecutionQueries';

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

const getRunTone = (status) => {
  if (status === 'passed') return 'success.main';
  if (status === 'queued' || status === 'running') return 'info.main';
  if (status === 'cancelled') return 'warning.main';
  return 'error.main';
};

const getProgressInfo = (report) => {
  const resultCount = report?.results?.length || 0;
  const progressTotal = report?.progress_total || report?.script?.steps?.length || resultCount || 0;
  const progressCompleted = report?.progress_total ? report?.progress_completed || 0 : resultCount;
  const percent = progressTotal > 0 ? Math.min(100, Math.round((progressCompleted / progressTotal) * 100)) : 0;
  return { progressTotal, progressCompleted, percent };
};

const getProgressMessage = (report) => {
  if (!report) return '';
  if (report.status === 'queued') return '任务排队中，等待可用执行槽位';
  if (report.status === 'running') {
    return report.current_step_name ? `正在执行：${report.current_step_name}` : '正在执行接口步骤';
  }
  if (report.status === 'passed') return '执行已完成，全部步骤通过';
  if (report.status === 'cancelled') return '执行已取消';
  return report.failure_reason || '执行失败';
};

const formatAssertionValue = (value) => {
  if (value === undefined || value === null || value === '') return '未记录';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const DIAGNOSTIC_CATEGORY_LABELS = {
  variable_reference_missing: '变量缺失',
  request_error: '请求异常',
  status_code_mismatch: '状态码不符',
  response_schema_mismatch: '响应结构不符',
  test_data_mismatch: '测试数据不符',
};

const DIAGNOSTIC_SEVERITY_META = {
  high: { label: '高', color: 'error' },
  medium: { label: '中', color: 'warning' },
  low: { label: '低', color: 'info' },
};

const getDiagnosticCategoryLabel = (category = '') => (
  DIAGNOSTIC_CATEGORY_LABELS[category] || category || '待分析'
);

const getDiagnosticSeverityMeta = (severity = 'medium') => (
  DIAGNOSTIC_SEVERITY_META[severity] || DIAGNOSTIC_SEVERITY_META.medium
);

const buildAgentDiagnosisSummary = (runReport) => {
  const diagnostics = runReport?.failure_diagnostics || [];
  const suggestions = runReport?.repair_suggestions || [];
  const categoryCounts = diagnostics.reduce((acc, item) => {
    const key = item.category || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const severityOrder = { high: 3, medium: 2, low: 1 };
  const highestSeverity = diagnostics.reduce((current, item) => (
    (severityOrder[item.severity] || 0) > (severityOrder[current] || 0) ? item.severity : current
  ), 'low');
  return {
    diagnostics,
    suggestions,
    categoryCounts,
    highestSeverity,
    hasDiagnosis: diagnostics.length > 0 || suggestions.length > 0,
  };
};

const getControlledRepairPolicyBlock = (runReport) => {
  const policy = runReport?.execution_options?.project_policy_snapshot || {};
  if (!policy.allow_ai_repair) return '项目未开启 AI 自动修复，请只应用草稿后人工执行。';
  const maxAutoRepairs = Number(policy.max_auto_repairs || 0);
  const repairCount = (runReport?.repair_history || []).length;
  if (maxAutoRepairs > 0 && repairCount >= maxAutoRepairs) {
    return `自动修复次数已达到项目上限 ${maxAutoRepairs} 次，请人工确认后再执行。`;
  }
  return '';
};

function AgentDiagnosisPanel({ runReport, loading, parsedScript, onGenerateRepairPatch, onBackToFlow }) {
  const summary = React.useMemo(() => buildAgentDiagnosisSummary(runReport), [runReport]);
  if (!summary.hasDiagnosis) return null;
  const severityMeta = getDiagnosticSeverityMeta(summary.highestSeverity);
  const failedStepIds = Array.from(new Set(summary.diagnostics.map((item) => item.step_id).filter(Boolean)));

  return (
    <Alert
      severity={summary.highestSeverity === 'high' ? 'error' : 'warning'}
      icon={<TroubleshootOutlined />}
      sx={{
        mb: 2,
        borderRadius: 4.5,
        border: '1px solid',
        borderColor: summary.highestSeverity === 'high' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)',
        bgcolor: summary.highestSeverity === 'high' ? 'rgba(244, 63, 94, 0.03)' : 'rgba(245, 158, 11, 0.03)',
        boxShadow: summary.highestSeverity === 'high' 
          ? '0 8px 30px rgba(244, 63, 94, 0.04), inset 0 1px 0 rgba(255,255,255,0.7)' 
          : '0 8px 30px rgba(245, 158, 11, 0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
        backdropFilter: 'blur(10px)',
        '& .MuiAlert-icon': {
          color: summary.highestSeverity === 'high' ? '#f43f5e' : '#f59e0b',
        },
        '& .MuiAlert-message': {
          width: '100%',
        }
      }}
      action={(
        <Stack direction="row" spacing={1} sx={{ mt: { xs: 1, md: 0 }, alignSelf: { xs: 'flex-start', md: 'center' } }}>
          <Button
            size="small"
            variant="contained"
            startIcon={<BuildCircleOutlined />}
            disabled={!parsedScript || loading}
            onClick={() => onGenerateRepairPatch(runReport)}
            sx={{
              fontWeight: 800,
              textTransform: 'none',
              borderRadius: 2,
              px: 2,
              py: 0.75,
              fontSize: '11px',
              color: '#ffffff',
              bgcolor: summary.highestSeverity === 'high' ? '#f43f5e' : '#f59e0b',
              boxShadow: summary.highestSeverity === 'high' 
                ? '0 4px 12px rgba(244, 63, 94, 0.2)' 
                : '0 4px 12px rgba(245, 158, 11, 0.2)',
              '&:hover': {
                bgcolor: summary.highestSeverity === 'high' ? '#e11d48' : '#d97706',
              }
            }}
          >
            生成修复草稿
          </Button>
          <Button 
            size="small" 
            variant="outlined" 
            onClick={onBackToFlow} 
            sx={{ 
              fontWeight: 800,
              textTransform: 'none',
              borderRadius: 2,
              px: 2,
              py: 0.75,
              fontSize: '11px',
              borderColor: summary.highestSeverity === 'high' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)',
              color: summary.highestSeverity === 'high' ? '#f43f5e' : '#f59e0b',
              bgcolor: '#ffffff',
              '&:hover': {
                borderColor: summary.highestSeverity === 'high' ? '#f43f5e' : '#f59e0b',
                bgcolor: 'rgba(0, 0, 0, 0.02)'
              }
            }}
          >
            返回编排定位
          </Button>
        </Stack>
      )}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" fontWeight={800}>Agent 诊断摘要</Typography>
          <Chip size="small" color={severityMeta.color} label={`风险 ${severityMeta.label}`} variant="outlined" sx={{ borderRadius: 1.5, fontWeight: 700 }} />
          <Chip size="small" label={`${summary.diagnostics.length} 个诊断`} variant="outlined" sx={{ borderRadius: 1.5 }} />
          {!!failedStepIds.length && <Chip size="small" label={`影响 ${failedStepIds.length} 步`} variant="outlined" sx={{ borderRadius: 1.5 }} />}
        </Stack>

        {!!Object.keys(summary.categoryCounts).length && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {Object.entries(summary.categoryCounts).map(([category, count]) => (
              <Chip
                key={category}
                size="small"
                label={`${getDiagnosticCategoryLabel(category)} ${count}`}
                sx={{ bgcolor: 'rgba(255,255,255,0.62)', borderRadius: 1.5, fontWeight: 700 }}
              />
            ))}
          </Stack>
        )}

        {!!summary.diagnostics.length && (
          <Stack spacing={1}>
            {summary.diagnostics.slice(0, 4).map((diagnostic, index) => {
              const itemSeverity = getDiagnosticSeverityMeta(diagnostic.severity);
              return (
                <Box key={`${diagnostic.step_id}-${diagnostic.category}-${index}`} sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip size="small" color={itemSeverity.color} label={itemSeverity.label} variant="outlined" sx={{ borderRadius: 1.5, fontWeight: 700 }} />
                    <Typography variant="caption" fontWeight={850}>
                      {diagnostic.step_id || '全局'}{diagnostic.step_name ? ` · ${diagnostic.step_name}` : ''} · {getDiagnosticCategoryLabel(diagnostic.category)}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25, wordBreak: 'break-word' }}>
                    {diagnostic.explanation}
                  </Typography>
                  {!!diagnostic.suggestions?.length && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: 'break-word', fontWeight: 500 }}>
                      建议：{diagnostic.suggestions.slice(0, 2).join('；')}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}

        {!!summary.suggestions.length && (
          <>
            <Divider flexItem />
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word', fontWeight: 500 }}>
              修复建议：{summary.suggestions.slice(0, 3).join('；')}
            </Typography>
          </>
        )}
      </Stack>
    </Alert>
  );
}

export default function StepResult() {
  const showSnackbar = useSnackbar();
  const queryClient = useQueryClient();
  const {
    aiPatch,
    applyAiPatch,
    backgroundRunId,
    backgroundRunStatus,
    cancellingRunId,
    cancelBackgroundRun,
    generateAiRepairPatch,
    handleAutoRepairRun,
    loadRunIntoEditor,
    loading,
    parsedScript,
    refreshBackgroundRun,
    requestConfirm,
    rerunFailedSteps,
    runReport,
    runResult,
    setActiveStep,
    setDslText,
    setLoading,
    setRunReport,
    setRunResult,
    exportRunReport,
  } = useAPIExecution();
  const [repairDraftOpen, setRepairDraftOpen] = React.useState(false);
  const [knowledgeCandidate, setKnowledgeCandidate] = React.useState(null);
  const pendingRepairFocusRef = React.useRef(false);

  const hasPatchOperations = (aiPatch?.patch_operations || []).length > 0;
  const hasRepairDraft = !!aiPatch?.repair_draft?.draft_script;
  const canApplyAiPatch = !!aiPatch?.patched_script;
  const lowRiskRepairOperations = React.useMemo(
    () => getLowRiskRepairOperations(aiPatch?.repair_draft),
    [aiPatch?.repair_draft],
  );
  const hasRepairExperience = React.useMemo(() => (
    !!runReport?.run_id
    && ((runReport.repair_history || []).length > 0
      || ['auto_repair_rerun', 'controlled_repair_rerun'].includes(runReport.automation_summary?.type))
  ), [runReport]);

  const applyRepairDraft = async () => {
    if (!hasRepairDraft) return;
    const operations = aiPatch?.repair_draft?.patch_operations || aiPatch?.patch_operations || [];
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认应用完整 AI 修复草稿？', operations));
    if (!confirmed) return;
    const nextScript = markAiRepairSource(aiPatch.repair_draft.draft_script, 'full_repair_draft', operations);
    setDslText(JSON.stringify(nextScript, null, 2));
    setActiveStep(2);
    setRepairDraftOpen(false);
  };

  const applyLowRiskRepairOperations = async () => {
    if (!parsedScript || !lowRiskRepairOperations.length) return;
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认仅应用低风险 AI 修复项？', lowRiskRepairOperations));
    if (!confirmed) return;
    const patched = applyRepairOperationsToScript(parsedScript, lowRiskRepairOperations);
    const nextScript = markAiRepairSource(patched, 'low_risk_repair', lowRiskRepairOperations);
    setDslText(JSON.stringify(nextScript, null, 2));
    setActiveStep(2);
    setRepairDraftOpen(false);
  };

  const applyLowRiskAndControlledRerun = async () => {
    if (!parsedScript || !runReport?.run_id || !lowRiskRepairOperations.length) return;
    const failedStepIds = (runReport.results || [])
      .filter((result) => result.status !== 'passed' && result.step_id)
      .map((result) => result.step_id);
    const affectedStepIds = Array.from(new Set(lowRiskRepairOperations.map((operation) => operation.step_id).filter(Boolean)));
    const rerunStepIds = failedStepIds.filter((stepId) => affectedStepIds.includes(stepId));
    const targetStepIds = rerunStepIds.length ? rerunStepIds : failedStepIds;
    const policyBlock = getControlledRepairPolicyBlock(runReport);
    if (policyBlock) {
      showSnackbar(policyBlock, 'warning');
      return;
    }
    const policy = runReport.execution_options?.project_policy_snapshot || {};
    const policyLines = [
      '',
      '策略判断：',
      `- AI 自动修复：${policy.allow_ai_repair ? '已开启' : '未开启'}`,
      `- 最大自动修复次数：${policy.max_auto_repairs || '不限'}`,
      `- 已记录修复次数：${(runReport.repair_history || []).length}`,
      `- 本次重跑步骤：${targetStepIds.length ? targetStepIds.join('、') : '全部步骤'}`,
    ].join('\n');
    const confirmed = await requestConfirm(`${buildRepairApplyConfirmMessage(
      `确认应用低风险项并受控重跑${targetStepIds.length ? '受影响失败步骤' : '当前流程'}？`,
      lowRiskRepairOperations,
    )}${policyLines}`);
    if (!confirmed) return;

    const patched = applyRepairOperationsToScript(parsedScript, lowRiskRepairOperations);
    const nextScript = markAiRepairSource(patched, 'low_risk_repair', lowRiskRepairOperations);
    const options = runReport.execution_options || {};
    setLoading(true);
    try {
      const data = await apiExecutionAPI.runAllSteps(nextScript, {
        project_id: options.project_id || '',
        environment_id: options.environment_id || '',
        environment_snapshot: options.environment_snapshot || {},
        project_policy_snapshot: options.project_policy_snapshot || {},
        base_url: options.base_url || nextScript.base_url,
        timeout_ms: options.timeout_ms || 30000,
        run_timeout_ms: options.run_timeout_ms,
        max_steps: targetStepIds.length || options.max_steps || nextScript.steps?.length,
        continue_on_failure: options.continue_on_failure ?? true,
        replace_run_id: runReport.run_id,
        step_ids: targetStepIds,
        requestTimeoutMs: 90000,
      });
      setDslText(JSON.stringify(data.script || nextScript, null, 2));
      setRunReport(data);
      setRunResult(null);
      setRepairDraftOpen(false);
      setActiveStep(3);
      if (data.execution_options?.project_id || options.project_id) {
        const projectId = data.execution_options?.project_id || options.project_id;
        queryClient.invalidateQueries({ queryKey: EXEC_KEYS.agentContext(projectId) });
        queryClient.invalidateQueries({ queryKey: EXEC_KEYS.assets(projectId) });
      }
      window.dispatchEvent(new CustomEvent(API_EXECUTION_DASHBOARD_REFRESH_EVENT));
      showSnackbar(
        data.status === 'passed' ? '低风险修复重跑已通过，并更新原记录' : '低风险修复已重跑，仍需查看剩余失败项',
        data.status === 'passed' ? 'success' : 'warning',
      );
    } catch (error) {
      showSnackbar(error.message || '低风险修复受控重跑失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyDirectAiPatch = async () => {
    const operations = aiPatch?.patch_operations || [];
    if (!canApplyAiPatch || !operations.length) return;
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认应用 AI 补丁到脚本？', operations));
    if (!confirmed) return;
    if (hasRepairDraft) {
      const nextScript = markAiRepairSource(aiPatch.repair_draft.draft_script, 'direct_patch', operations);
      setDslText(JSON.stringify(nextScript, null, 2));
      setActiveStep(2);
      setRepairDraftOpen(false);
      return;
    }
    applyAiPatch();
  };

  const createKnowledgeCandidate = async () => {
    if (!runReport?.run_id) return;
    setLoading(true);
    try {
      const data = await apiExecutionAPI.createKnowledgeCandidate(runReport.run_id);
      setKnowledgeCandidate(data);
      showSnackbar(
        data.already_resolved ? '该修复经验已沉淀到知识库' : '已生成修复经验候选，请确认后再沉淀',
        data.already_resolved ? 'info' : 'success',
      );
    } catch (error) {
      showSnackbar(error.message || '生成修复经验候选失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const approveKnowledgeCandidate = async () => {
    const taskId = knowledgeCandidate?.task_id || (runReport?.run_id ? `knowledge-candidate:${runReport.run_id}` : '');
    if (!taskId) return;
    const confirmed = await requestConfirm([
      '确认将本次修复经验沉淀到知识库？',
      '',
      '会写入执行摘要、失败诊断和修复历史，后续相似失败会优先召回 这些 经验。',
    ].join('\n'));
    if (!confirmed) return;
    setLoading(true);
    try {
      const data = await apiExecutionAPI.approveKnowledgeCandidate(taskId);
      setKnowledgeCandidate((prev) => ({ ...(prev || {}), task_id: taskId, status: 'resolved', already_resolved: true }));
      showSnackbar(`已确认沉淀：${data.knowledge_count} 条知识，向量写入 ${data.vector_written || 0}`, data.errors?.length ? 'warning' : 'success');
      window.dispatchEvent(new CustomEvent(API_EXECUTION_DASHBOARD_REFRESH_EVENT));
    } catch (error) {
      showSnackbar(error.message || '确认沉淀失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (!runReport || runReport.status !== 'failed' || !parsedScript || loading) return;
    if (sessionStorage.getItem('openmelon_api_execution_focus_repair_diagnostics') !== '1') return;
    sessionStorage.removeItem('openmelon_api_execution_focus_repair_diagnostics');
    pendingRepairFocusRef.current = true;
    generateAiRepairPatch(runReport);
  }, [generateAiRepairPatch, loading, parsedScript, runReport]);

  React.useEffect(() => {
    if (!pendingRepairFocusRef.current || !hasRepairDraft) return;
    pendingRepairFocusRef.current = false;
    setRepairDraftOpen(true);
  }, [hasRepairDraft]);

  React.useEffect(() => {
    setKnowledgeCandidate(null);
  }, [runReport?.run_id]);

  return (
    <>
      <Stack spacing={3}>
        <StageHeader
          title="执行结果与诊断"
          action={(
            <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={() => setActiveStep(2)} sx={{ borderRadius: 2 }}>
              返回编排
            </Button>
          )}
        />

        {backgroundRunId && (
          <Alert
            severity={['queued', 'running'].includes(backgroundRunStatus) ? 'info' : backgroundRunStatus === 'passed' ? 'success' : 'warning'}
            sx={{ borderRadius: 3.5 }}
            action={(
              <Stack direction="row" spacing={1}>
                <Button size="small" color="inherit" onClick={refreshBackgroundRun} sx={{ fontWeight: 800 }}>刷新</Button>
                {['queued', 'running'].includes(backgroundRunStatus) && (
                  <Button size="small" color="inherit" disabled={cancellingRunId === backgroundRunId} onClick={cancelBackgroundRun} sx={{ fontWeight: 800 }}>
                    {cancellingRunId === backgroundRunId ? '取消中...' : '取消'}
                  </Button>
                )}
              </Stack>
            )}
          >
            后台任务：{backgroundRunId} · {getRunStatusMeta(backgroundRunStatus).label}
          </Alert>
        )}

        {runReport && (
          <Paper sx={{
            p: 3,
            borderRadius: 4.5,
            border: '1px solid rgba(255, 255, 255, 0.45)',
            bgcolor: 'rgba(255, 255, 255, 0.45)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <Box sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: runReport.status === 'passed' ? '#10b981' : runReport.status === 'failed' ? '#ef4444' : '#3b82f6',
                boxShadow: runReport.status === 'passed' ? '0 0 12px #10b981' : runReport.status === 'failed' ? '0 0 12px #ef4444' : '0 0 12px #3b82f6',
                animation: 'statusPulse 2.5s infinite ease-in-out',
                '@keyframes statusPulse': {
                  '0%': { opacity: 0.6, transform: 'scale(0.85)' },
                  '50%': { opacity: 1, transform: 'scale(1.2)' },
                  '100%': { opacity: 0.6, transform: 'scale(0.85)' },
                }
              }} />
              <Typography variant="h6" sx={{ color: getRunTone(runReport.status), fontWeight: 900 }}>
                {getRunStatusMeta(runReport.status).label}
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontWeight: 500 }}>
              通过 {runReport.passed} / 失败 {runReport.failed}。耗时：{runReport.duration_ms}ms
            </Typography>

            {(() => {
              const { progressTotal, progressCompleted, percent } = getProgressInfo(runReport);
              return (
                <Box sx={{ mb: 2.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight={800}>{getProgressMessage(runReport)}</Typography>
                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                      {progressCompleted} / {progressTotal}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant={progressTotal ? 'determinate' : 'indeterminate'}
                    value={percent}
                    sx={{ height: 8, borderRadius: 2 }}
                  />
                </Box>
              );
            })()}

            {runReport.execution_options?.policy_decision && Object.keys(runReport.execution_options.policy_decision).length > 0 && (
              <Alert severity={runReport.execution_options.policy_decision.allowed === false ? 'error' : 'info'} sx={{ mb: 2, borderRadius: 3.5 }}>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={800}>项目策略判断</Typography>
                    <Chip
                      size="small"
                      label={getPolicyRiskLabel(runReport.execution_options.policy_decision.risk_level)}
                      color={getPolicyRiskColor(runReport.execution_options.policy_decision.risk_level)}
                      variant="outlined"
                      sx={{ borderRadius: 1.5, fontWeight: 700 }}
                    />
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      {runReport.execution_options.policy_decision.allow_ai_execution ? '允许 AI 自动执行' : 'AI 自动执行未开启'}
                      {' / '}
                      {runReport.execution_options.policy_decision.allow_ai_repair ? '允许 AI 自动修复' : 'AI 自动修复未开启'}
                    </Typography>
                  </Stack>
                  {!!runReport.execution_options.policy_decision.evaluated_steps?.length && (
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      已评估接口：{runReport.execution_options.policy_decision.evaluated_steps.join('、')}
                    </Typography>
                  )}
                  {!!runReport.execution_options.policy_decision.warnings?.length && (
                    <Typography variant="caption" color="warning.main" fontWeight={600}>
                      提醒：{runReport.execution_options.policy_decision.warnings.join('；')}
                    </Typography>
                  )}
                  {!!runReport.execution_options.policy_decision.violations?.length && (
                    <Typography variant="caption" color="error" fontWeight={600}>
                      阻断原因：{runReport.execution_options.policy_decision.violations.join('；')}
                    </Typography>
                  )}
                </Stack>
              </Alert>
            )}

            <AgentDiagnosisPanel
              runReport={runReport}
              loading={loading}
              parsedScript={parsedScript}
              onGenerateRepairPatch={generateAiRepairPatch}
              onBackToFlow={() => setActiveStep(2)}
            />

            <Stack direction="row" spacing={1} sx={{ mb: 2.5 }} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="outlined" onClick={() => exportRunReport(runReport)} sx={{ borderRadius: 2, fontWeight: 700 }}>导出报告</Button>
              {runReport.script && <Button size="small" variant="outlined" onClick={() => loadRunIntoEditor(runReport)} sx={{ borderRadius: 2, fontWeight: 700 }}>载入编辑</Button>}
              {ACTIVE_RUN_STATUSES.has(runReport.status) && (
                <Button size="small" variant="contained" color="warning" disabled={loading || cancellingRunId === backgroundRunId} onClick={cancelBackgroundRun} sx={{ borderRadius: 2, fontWeight: 800 }}>
                  {cancellingRunId === backgroundRunId ? '取消中...' : '取消执行'}
                </Button>
              )}
              {!!runReport.failed && !ACTIVE_RUN_STATUSES.has(runReport.status) && <Button size="small" variant="outlined" color="secondary" disabled={!parsedScript || loading} onClick={() => generateAiRepairPatch(runReport)} sx={{ borderRadius: 2, fontWeight: 700 }}>AI 修复补丁</Button>}
              {!!runReport.failed && !ACTIVE_RUN_STATUSES.has(runReport.status) && <Button size="small" variant="contained" color="secondary" disabled={!runReport.run_id || loading} onClick={() => handleAutoRepairRun(runReport.run_id)} sx={{ borderRadius: 2, fontWeight: 800 }}>受控自动修复重跑</Button>}
              {!!runReport.failed && !ACTIVE_RUN_STATUSES.has(runReport.status) && <Button size="small" variant="contained" color="warning" disabled={!parsedScript || loading} onClick={rerunFailedSteps} sx={{ borderRadius: 2, fontWeight: 800 }}>重跑失败步骤</Button>}
              {hasRepairExperience && !ACTIVE_RUN_STATUSES.has(runReport.status) && (
                <Button size="small" variant="outlined" color="success" disabled={loading} onClick={createKnowledgeCandidate} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  生成修复经验候选
                </Button>
              )}
            </Stack>

            {['auto_repair_rerun', 'controlled_repair_rerun'].includes(runReport.automation_summary?.type) && (
              <Alert severity={runReport.automation_summary.after?.status === 'passed' ? 'success' : 'warning'} sx={{ mb: 2, borderRadius: 3.5 }}>
                <Typography variant="body2" fontWeight={800}>
                  {runReport.automation_summary.type === 'controlled_repair_rerun' ? '受控修复结果对比' : '自动修复结果对比'}
                </Typography>
                <Typography variant="caption" display="block" fontWeight={500}>
                  修复前：{runReport.automation_summary.before?.passed || 0} 通过 / {runReport.automation_summary.before?.failed || 0} 失败；
                  修复后：{runReport.automation_summary.after?.passed || 0} 通过 / {runReport.automation_summary.after?.failed || 0} 失败
                </Typography>
                {!!runReport.automation_summary.patched_fields?.length && (
                  <Typography variant="caption" display="block" color="text.secondary" fontWeight={500}>
                    修改：{runReport.automation_summary.patched_fields.map((item) => `${item.step_id}.${item.field}`).join('、')}
                  </Typography>
                )}
                {runReport.automation_summary.repair_effect_score && (
                  <Typography variant="caption" display="block" color="text.secondary" fontWeight={500}>
                    修复效果：{runReport.automation_summary.repair_effect_score.label}（{runReport.automation_summary.repair_effect_score.score}/100）
                  </Typography>
                )}
              </Alert>
            )}

            {hasRepairExperience && (
              <Alert
                severity={knowledgeCandidate?.already_resolved ? 'success' : 'info'}
                sx={{ mb: 2, borderRadius: 3.5 }}
                action={(
                  <Stack direction="row" spacing={1}>
                    <Button size="small" color="inherit" disabled={loading} onClick={createKnowledgeCandidate} sx={{ fontWeight: 800 }}>
                      生成候选
                    </Button>
                    <Button
                      size="small"
                      color="inherit"
                      disabled={loading || knowledgeCandidate?.already_resolved}
                      onClick={approveKnowledgeCandidate}
                      sx={{ fontWeight: 800 }}
                    >
                      确认沉淀
                    </Button>
                  </Stack>
                )}
              >
                <Typography variant="body2" fontWeight={800}>
                  修复经验沉淀
                </Typography>
                <Typography variant="caption" display="block" fontWeight={500}>
                  {knowledgeCandidate?.already_resolved
                    ? '本次修复经验已写入知识库。'
                    : knowledgeCandidate?.task_id
                      ? `候选已生成：${knowledgeCandidate.candidate_item_count || 0} 条知识项，风险等级 ${knowledgeCandidate.risk_level || 'medium'}。`
                      : '可将本次修复前后对比、失败特征和补丁字段生成候选，确认后再写入知识库。'}
                </Typography>
              </Alert>
            )}

            {(hasPatchOperations || hasRepairDraft) && (
              <Alert severity={aiPatch.automatic_applicable ? 'success' : 'warning'} sx={{ mb: 2, borderRadius: 3.5 }}>
                <Stack spacing={1}>
                  <Typography variant="body2" fontWeight={800}>
                    {aiPatch.summary || (hasRepairDraft ? 'AI 已生成修复草稿，请预览后人工确认应用。' : '暂未找到可自动应用的修复补丁。')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" fontWeight={500}>
                    AI 来源：{aiPatch.ai_mode === 'llm' ? `已配置模型 ${aiPatch.model_name || ''}` : '启发式规则'}
                    {aiPatch.fallback_reason ? ` · ${aiPatch.fallback_reason}` : ''}
                  </Typography>
                  {hasPatchOperations ? (
                    aiPatch.patch_operations.map((operation, index) => (
                      <Typography key={`${operation.step_id}-${operation.field}-${index}`} variant="caption" fontWeight={500}>
                        {operation.step_id} · {operation.field}：{operation.reason}
                      </Typography>
                    ))
                  ) : (
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      当前失败未匹配到可直接套用的字段补丁，可先查看修复草稿中的步骤、断言和变量链路建议。
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {hasRepairDraft && (
                      <Button size="small" variant="contained" onClick={() => setRepairDraftOpen(true)} sx={{ borderRadius: 1.5, fontWeight: 700 }}>预览修复草稿</Button>
                    )}
                    {canApplyAiPatch && (
                      <Button size="small" variant="outlined" onClick={applyDirectAiPatch} sx={{ borderRadius: 1.5, fontWeight: 700 }}>应用补丁到脚本</Button>
                    )}
                  </Stack>
                </Stack>
              </Alert>
            )}

            <Stack spacing={2} sx={{ mt: 2 }}>
              {(runReport.results || []).map((res, i) => (
                <Box
                  key={i}
                  sx={{
                    p: 2.5,
                    borderRadius: 3.5,
                    border: '1px solid',
                    borderColor: res.status === 'passed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    bgcolor: res.status === 'passed' ? 'rgba(16, 185, 129, 0.03)' : 'rgba(239, 68, 68, 0.03)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.01)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 6px 16px rgba(0,0,0,0.03)',
                    }
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight={800}>{res.method} {res.url}</Typography>
                    <Typography variant="body2" color={res.status === 'passed' ? 'success.main' : 'error.main'} fontWeight={800}>
                      {res.status_code} - {res.status === 'passed' ? '通过' : '失败'}
                    </Typography>
                  </Stack>
                  {!!res.assertions?.length && (
                    <Stack spacing={1} sx={{ mt: 1.5 }}>
                      {res.assertions.map((assertion, assertionIndex) => (
                        <Box
                          key={`${assertion.type}-${assertionIndex}`}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: 'auto 1fr' },
                            gap: 1.5,
                            alignItems: 'center',
                            p: 1.5,
                            borderRadius: 2.5,
                            bgcolor: assertion.passed ? 'rgba(16, 185, 129, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                            border: '1px solid',
                            borderColor: assertion.passed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          }}
                        >
                          <Chip
                            size="small"
                            label={assertion.passed ? '断言通过' : '断言失败'}
                            color={assertion.passed ? 'success' : 'error'}
                            variant="outlined"
                            sx={{ width: 'fit-content', fontWeight: 800, borderRadius: 1.5 }}
                          />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="caption" sx={{ fontWeight: 850, color: 'text.primary' }}>
                              {getAssertionTypeLabel(assertion.type)}{assertion.path ? ` · ${assertion.path}` : ''}
                            </Typography>
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: 'break-word', mt: 0.25 }}>
                              期望：{formatAssertionValue(assertion.expected)}；实际：{formatAssertionValue(assertion.actual)}
                            </Typography>
                            {assertion.message && (
                              <Typography variant="caption" display="block" color={assertion.passed ? 'text.secondary' : 'error.main'} sx={{ mt: 0.25 }}>
                                {assertion.message}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  )}
                  {!!res.diagnostics?.length && (
                    <Stack spacing={1} sx={{ mt: 1.5 }}>
                      {res.diagnostics.map((diagnostic, diagnosticIndex) => {
                        const severityMeta = getDiagnosticSeverityMeta(diagnostic.severity);
                        return (
                          <Box
                            key={`${diagnostic.category}-${diagnosticIndex}`}
                            sx={{
                              p: 1.5,
                              borderRadius: 2.5,
                              bgcolor: 'rgba(245, 158, 11, 0.04)',
                              border: '1px solid',
                              borderColor: 'rgba(245, 158, 11, 0.15)',
                            }}
                          >
                            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
                              <Chip size="small" color={severityMeta.color} label={`诊断 ${severityMeta.label}`} variant="outlined" sx={{ borderRadius: 1.5, fontWeight: 700 }} />
                              <Typography variant="caption" fontWeight={850} color="warning.dark">
                                {getDiagnosticCategoryLabel(diagnostic.category)}
                              </Typography>
                            </Stack>
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                              {diagnostic.explanation}
                            </Typography>
                            {!!diagnostic.suggestions?.length && (
                              <Typography variant="caption" display="block" color="warning.dark" sx={{ wordBreak: 'break-word', mt: 0.25, fontWeight: 500 }}>
                                建议：{diagnostic.suggestions.slice(0, 2).join('；')}
                              </Typography>
                            )}
                          </Box>
                        );
                      })}
                    </Stack>
                  )}
                  {res.error && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block', fontWeight: 600 }}>{res.error}</Typography>}
                </Box>
              ))}
              {ACTIVE_RUN_STATUSES.has(runReport.status) && !(runReport.results || []).length && (
                <Typography variant="body2" color="text.secondary">等待第一个步骤完成...</Typography>
              )}
            </Stack>
          </Paper>
        )}

        {runResult && (
          <Paper sx={{
            p: 3,
            borderRadius: 4.5,
            border: '1px solid rgba(255, 255, 255, 0.45)',
            bgcolor: 'rgba(255, 255, 255, 0.45)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <Box sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: runResult.status === 'passed' ? '#10b981' : '#ef4444',
                boxShadow: runResult.status === 'passed' ? '0 0 12px #10b981' : '0 0 12px #ef4444',
                animation: 'statusPulse 2.5s infinite ease-in-out',
                '@keyframes statusPulse': {
                  '0%': { opacity: 0.6, transform: 'scale(0.85)' },
                  '50%': { opacity: 1, transform: 'scale(1.2)' },
                  '100%': { opacity: 0.6, transform: 'scale(0.85)' },
                }
              }} />
              <Typography variant="h6" sx={{ color: runResult.status === 'passed' ? 'success.main' : 'error.main', fontWeight: 900 }}>
                单步执行{runResult.status === 'passed' ? '通过' : '失败'}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
              <Typography variant="body2" fontWeight={700}>{runResult.method} {runResult.url}</Typography>
              <Typography variant="body2" color={runResult.status === 'passed' ? 'success.main' : 'error.main'} fontWeight={700}>
                {runResult.status_code} - {runResult.status === 'passed' ? '通过' : '失败'}
              </Typography>
            </Stack>
            {runResult.error && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block', fontWeight: 600 }}>{runResult.error}</Typography>}
          </Paper>
        )}

        {!runReport && !runResult && (
          <EmptyState compact title="暂无执行结果" description="请点击上方按钮执行测试脚本。" />
        )}

      </Stack>
      <AIFlowDraftDialog
        open={repairDraftOpen}
        draft={aiPatch?.repair_draft}
        onClose={() => setRepairDraftOpen(false)}
        onApply={applyRepairDraft}
        onApplyLowRisk={applyLowRiskRepairOperations}
        onApplyLowRiskAndRerun={runReport?.run_id ? applyLowRiskAndControlledRerun : undefined}
      />
    </>
  );
}
