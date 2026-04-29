import React from 'react';
import { Stack, Box, Typography, Button, Chip, Paper, Alert } from '@mui/material';
import { RefreshOutlined } from '@mui/icons-material';
import { useAPIExecution } from '../context';
import EmptyState from '../../../components/EmptyState';
import {
  getPolicyRiskColor,
  getPolicyRiskLabel,
  getRunStatusMeta,
} from '../utils';

export default function StepResult() {
  const {
    aiPatch,
    applyAiPatch,
    backgroundRunId,
    backgroundRunStatus,
    cancelBackgroundRun,
    generateAiRepairPatch,
    handleAutoRepairRun,
    loadRunIntoEditor,
    loading,
    parsedScript,
    refreshBackgroundRun,
    rerunFailedSteps,
    runReport,
    runResult,
    setActiveStep,
    exportRunReport,
  } = useAPIExecution();

  return (
    <>
    <Stack spacing={3}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h5" fontWeight={800}>步骤 4: 执行结果与诊断</Typography>
                  <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={() => setActiveStep(2)}>
                    返回编排
                  </Button>
                </Box>

                {backgroundRunId && (
                  <Alert
                    severity={['queued', 'running'].includes(backgroundRunStatus) ? 'info' : backgroundRunStatus === 'passed' ? 'success' : 'warning'}
                    action={(
                      <Stack direction="row" spacing={1}>
                        <Button size="small" color="inherit" onClick={refreshBackgroundRun}>刷新</Button>
                        {['queued', 'running'].includes(backgroundRunStatus) && <Button size="small" color="inherit" onClick={cancelBackgroundRun}>取消</Button>}
                      </Stack>
                    )}
                  >
                    后台任务：{backgroundRunId} · {getRunStatusMeta(backgroundRunStatus).label}
                  </Alert>
                )}

                {runReport && (
                  <Paper sx={{ p: 3, bgcolor: '#ffffff', borderRadius: 3, border: '1px solid', borderColor: runReport.status === 'passed' ? 'success.main' : 'error.main' }}>
                     <Typography variant="h6" sx={{ color: runReport.status === 'passed' ? 'success.main' : 'error.main', fontWeight: 800, mb: 1 }}>
                        执行{runReport.status === 'passed' ? '通过' : '失败'}
                     </Typography>
                     <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>通过 {runReport.passed} / 失败 {runReport.failed}。耗时：{runReport.duration_ms}ms</Typography>
                     {runReport.execution_options?.policy_decision && Object.keys(runReport.execution_options.policy_decision).length > 0 && (
                       <Alert severity={runReport.execution_options.policy_decision.allowed === false ? 'error' : 'info'} sx={{ mb: 2 }}>
                         <Stack spacing={1}>
                           <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                             <Typography variant="body2" fontWeight={700}>项目策略判断</Typography>
                             <Chip
                               size="small"
                               label={getPolicyRiskLabel(runReport.execution_options.policy_decision.risk_level)}
                               color={getPolicyRiskColor(runReport.execution_options.policy_decision.risk_level)}
                               variant="outlined"
                             />
                             <Typography variant="caption" color="text.secondary">
                               {runReport.execution_options.policy_decision.allow_ai_execution ? '允许 AI 自动执行' : 'AI 自动执行未开启'}
                               {' / '}
                               {runReport.execution_options.policy_decision.allow_ai_repair ? '允许 AI 自动修复' : 'AI 自动修复未开启'}
                             </Typography>
                           </Stack>
                           {!!runReport.execution_options.policy_decision.evaluated_steps?.length && (
                             <Typography variant="caption" color="text.secondary">
                               已评估接口：{runReport.execution_options.policy_decision.evaluated_steps.join('、')}
                             </Typography>
                           )}
                           {!!runReport.execution_options.policy_decision.warnings?.length && (
                             <Typography variant="caption" color="warning.main">
                               提醒：{runReport.execution_options.policy_decision.warnings.join('；')}
                             </Typography>
                           )}
                           {!!runReport.execution_options.policy_decision.violations?.length && (
                             <Typography variant="caption" color="error">
                               阻断原因：{runReport.execution_options.policy_decision.violations.join('；')}
                             </Typography>
                           )}
                         </Stack>
                       </Alert>
                     )}
                     <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                       <Button size="small" variant="outlined" onClick={() => exportRunReport(runReport)}>导出报告</Button>
                       {runReport.script && <Button size="small" variant="outlined" onClick={() => loadRunIntoEditor(runReport)}>载入编辑</Button>}
                       {!!runReport.failed && <Button size="small" variant="outlined" color="secondary" disabled={!parsedScript || loading} onClick={generateAiRepairPatch}>AI 修复补丁</Button>}
                       {!!runReport.failed && <Button size="small" variant="contained" color="secondary" disabled={!runReport.run_id || loading} onClick={() => handleAutoRepairRun(runReport.run_id)}>受控自动修复重跑</Button>}
                       {!!runReport.failed && <Button size="small" variant="contained" color="warning" disabled={!parsedScript || loading} onClick={rerunFailedSteps}>重跑失败步骤</Button>}
                     </Stack>

                     {runReport.automation_summary?.type === 'auto_repair_rerun' && (
                       <Alert severity={runReport.automation_summary.after?.status === 'passed' ? 'success' : 'warning'} sx={{ mb: 2 }}>
                         <Typography variant="body2" fontWeight={700}>自动修复结果对比</Typography>
                         <Typography variant="caption" display="block">
                           修复前：{runReport.automation_summary.before?.passed || 0} 通过 / {runReport.automation_summary.before?.failed || 0} 失败；
                           修复后：{runReport.automation_summary.after?.passed || 0} 通过 / {runReport.automation_summary.after?.failed || 0} 失败
                         </Typography>
                         {!!runReport.automation_summary.patched_fields?.length && (
                           <Typography variant="caption" display="block" color="text.secondary">
                             修改：{runReport.automation_summary.patched_fields.map((item) => `${item.step_id}.${item.field}`).join('、')}
                           </Typography>
                         )}
                       </Alert>
                     )}

                     {aiPatch?.patch_operations?.length > 0 && (
                       <Alert severity={aiPatch.automatic_applicable ? 'success' : 'warning'} sx={{ mb: 2 }}>
                         <Stack spacing={1}>
                           <Typography variant="body2" fontWeight={700}>{aiPatch.summary}</Typography>
                           <Typography variant="caption" color="text.secondary">
                             AI 来源：{aiPatch.ai_mode === 'llm' ? `已配置模型 ${aiPatch.model_name || ''}` : '启发式规则'}
                             {aiPatch.fallback_reason ? ` · ${aiPatch.fallback_reason}` : ''}
                           </Typography>
                           {aiPatch.patch_operations.map((operation, index) => (
                             <Typography key={`${operation.step_id}-${operation.field}-${index}`} variant="caption">
                               {operation.step_id} · {operation.field}：{operation.reason}
                             </Typography>
                           ))}
                           <Button size="small" variant="contained" sx={{ alignSelf: 'flex-start' }} onClick={applyAiPatch}>应用补丁到脚本</Button>
                         </Stack>
                       </Alert>
                     )}
                     
                     <Stack spacing={1}>
                       {(runReport.results || []).map((res, i) => (
                         <Box key={i} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, borderLeft: '4px solid', borderLeftColor: res.status === 'passed' ? 'success.main' : 'error.main' }}>
                           <Stack direction="row" justifyContent="space-between">
                             <Typography variant="body2" fontWeight={700}>{res.method} {res.url}</Typography>
                             <Typography variant="body2" color={res.status === 'passed' ? 'success.main' : 'error.main'}>{res.status_code} - {res.status === 'passed' ? '通过' : '失败'}</Typography>
                           </Stack>
                           {res.error && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{res.error}</Typography>}
                         </Box>
                       ))}
                     </Stack>
                  </Paper>
                )}

                {runResult && (
                  <Paper sx={{ p: 3, bgcolor: '#ffffff', borderRadius: 3, border: '1px solid', borderColor: runResult.status === 'passed' ? 'success.main' : 'error.main' }}>
                     <Typography variant="h6" sx={{ color: runResult.status === 'passed' ? 'success.main' : 'error.main', fontWeight: 800, mb: 1 }}>
                        单步执行{runResult.status === 'passed' ? '通过' : '失败'}
                     </Typography>
                     <Stack direction="row" justifyContent="space-between">
                       <Typography variant="body2" fontWeight={700}>{runResult.method} {runResult.url}</Typography>
                       <Typography variant="body2" color={runResult.status === 'passed' ? 'success.main' : 'error.main'}>{runResult.status_code} - {runResult.status === 'passed' ? '通过' : '失败'}</Typography>
                     </Stack>
                     {runResult.error && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{runResult.error}</Typography>}
                  </Paper>
                )}

                {!runReport && !runResult && (
                  <EmptyState compact title="暂无执行结果" description="请点击上方按钮执行测试脚本。" />
                )}

              </Stack>
  </>
  );
}
