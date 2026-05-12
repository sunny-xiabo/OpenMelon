import React from 'react';
import { Stack, Box, Typography, Button, Alert, CircularProgress, Paper } from '@mui/material';
import { AutoAwesomeOutlined, ContentCopyOutlined, DataObjectOutlined, FormatAlignLeftOutlined, PlayCircleOutlineOutlined } from '@mui/icons-material';
import { autocompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { useAPIExecution } from '../context';
import {
  applyRepairOperationsToScript,
  buildRepairApplyConfirmMessage,
  getLowRiskRepairOperations,
  markAiRepairSource,
} from '../utils/repairPatch';
import { ASSERTION_TYPES, EXTRACTION_SOURCES } from '../constants';
import StageHeader from './StageHeader';
import FlowWorkbench from '../../APIExecutionFlow/components/FlowWorkbench';
import AIFlowDraftDialog from './AIFlowDraftDialog';

const ROOT_FIELDS = ['case_id', 'name', 'target_project', 'environment', 'base_url', 'variables', 'steps'];
const STEP_FIELDS = ['id', 'name', 'method', 'path', 'operation_id', 'headers', 'query', 'path_params', 'body', 'assertions', 'extractions'];
const ASSERTION_FIELDS = ['type', 'expected', 'path', 'value'];
const EXTRACTION_FIELDS = ['name', 'source', 'path'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ASSERTION_TYPE_VALUES = ASSERTION_TYPES.map((item) => item.value);
const EXTRACTION_SOURCE_VALUES = EXTRACTION_SOURCES.map((item) => item.value);

const apiJsonEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#ffffff',
    color: '#202124',
  },
  '.cm-content': {
    caretColor: '#1a73e8',
  },
  '.cm-gutters': {
    backgroundColor: '#f8f9fa',
    color: '#9aa0a6',
    borderRight: '1px solid #e8eaed',
  },
  '.cm-activeLine': {
    backgroundColor: '#e8f0fe66',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: '#d2e3fc',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-tooltip': {
    border: '1px solid #e8eaed',
    borderRadius: '6px',
    boxShadow: '0 8px 24px rgba(60,64,67,0.16)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#e8f0fe',
    color: '#202124',
  },
});

const apiJsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#1a73e8', fontWeight: '600' },
  { tag: tags.string, color: '#188038' },
  { tag: tags.number, color: '#b06000' },
  { tag: tags.bool, color: '#9334e6' },
  { tag: tags.null, color: '#5f6368', fontStyle: 'italic' },
  { tag: tags.punctuation, color: '#5f6368' },
]);

const quotedFieldCompletion = (field) => ({ label: field, type: 'property', apply: `${field}": ` });
const quotedValueCompletion = (value) => ({ label: value, type: 'constant', apply: value });

const getDslFieldCompletions = (docBeforeCursor) => {
  if (/"assertions"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return ASSERTION_FIELDS;
  if (/"extractions"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return EXTRACTION_FIELDS;
  if (/"steps"\s*:\s*\[[\s\S]*$/.test(docBeforeCursor)) return STEP_FIELDS;
  return ROOT_FIELDS;
};

const dslCompletionSource = (context) => {
  const line = context.state.doc.lineAt(context.pos);
  const beforeLine = line.text.slice(0, context.pos - line.from);
  const docBeforeCursor = context.state.doc.sliceString(0, context.pos);
  const stringMatch = beforeLine.match(/"([^"]*)$/);
  const keyPrefixMatch = beforeLine.match(/(?:^|[,{]\s*)"([^"]*)$/);
  const valuePrefixMatch = beforeLine.match(/"([^"]+)"\s*:\s*"([^"]*)$/);

  if (valuePrefixMatch) {
    const [, fieldName, prefix] = valuePrefixMatch;
    const valuesByField = {
      method: HTTP_METHODS,
      type: ASSERTION_TYPE_VALUES,
      source: EXTRACTION_SOURCE_VALUES,
    };
    const values = valuesByField[fieldName];
    if (!values) return null;
    return {
      from: context.pos - prefix.length,
      options: values.map(quotedValueCompletion),
    };
  }

  if (keyPrefixMatch || (context.explicit && stringMatch)) {
    const prefix = (keyPrefixMatch || stringMatch)?.[1] || '';
    return {
      from: context.pos - prefix.length,
      options: getDslFieldCompletions(docBeforeCursor).map(quotedFieldCompletion),
    };
  }

  return null;
};

export default function StepOrchestrate() {
  const {
    dslText, setDslText, enhanceDslWithAi, globalHeadersText, setGlobalHeadersText,
    bearerToken, setBearerToken, parsedScript, runStepId, setRunStepId, runSelectedStep, runAllSteps, loading,
    baseUrl, setBaseUrl, exportPytestScript, exportPostmanCollection, aiPatch, applyAiPatch,
    backgroundRunStatus, aiEnhancing, runReport, disabledFlowStepIds, setDisabledFlowStepIds, requestConfirm,
    generateAiRepairPatch,
    selectedProjectId, projectName
  } = useAPIExecution();
  const [flowDirty, setFlowDirty] = React.useState(false);
  const [repairDraftOpen, setRepairDraftOpen] = React.useState(false);
  const autoRepairSuggestionRunRef = React.useRef('');
  const executionDisabled = loading || ['queued', 'running'].includes(backgroundRunStatus);
  const lowRiskRepairOperations = React.useMemo(
    () => getLowRiskRepairOperations(aiPatch?.repair_draft),
    [aiPatch?.repair_draft],
  );
  const jsonValidation = React.useMemo(() => {
    if (!dslText.trim()) return { valid: false, message: '暂无脚本' };
    try {
      const parsed = JSON.parse(dslText);
      return { valid: true, message: `${parsed.steps?.length || 0} 个步骤` };
    } catch (error) {
      return { valid: false, message: error.message || 'JSON 格式错误' };
    }
  }, [dslText]);

  const beautifyDslJson = () => {
    try {
      setDslText(JSON.stringify(JSON.parse(dslText), null, 2));
    } catch {
      // Invalid JSON is already surfaced in the editor status.
    }
  };

  const copyDslJson = async () => {
    if (!dslText) return;
    await navigator.clipboard?.writeText(dslText);
  };

  const confirmBeforeExecution = async () => {
    if (!flowDirty) return true;
    return requestConfirm('当前步骤配置有未保存修改，直接执行会使用上一次保存的 DSL。仍然继续执行？');
  };

  const handleRunSelectedStep = async () => {
    if (!await confirmBeforeExecution()) return;
    runSelectedStep();
  };

  const handleRunAllSteps = async () => {
    if (!await confirmBeforeExecution()) return;
    runAllSteps();
  };

  const applyRepairDraft = async () => {
    if (!aiPatch?.repair_draft?.draft_script) return;
    const operations = aiPatch?.repair_draft?.patch_operations || aiPatch?.patch_operations || [];
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认应用完整 AI 修复草稿？', operations));
    if (!confirmed) return;
    setDslText(JSON.stringify(markAiRepairSource(aiPatch.repair_draft.draft_script, 'full_repair_draft', operations), null, 2));
    setRepairDraftOpen(false);
  };

  const applyLowRiskRepairOperations = async () => {
    if (!parsedScript || !lowRiskRepairOperations.length) return;
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认仅应用低风险 AI 修复项？', lowRiskRepairOperations));
    if (!confirmed) return;
    const patched = applyRepairOperationsToScript(parsedScript, lowRiskRepairOperations);
    setDslText(JSON.stringify(markAiRepairSource(patched, 'low_risk_repair', lowRiskRepairOperations), null, 2));
    setRepairDraftOpen(false);
  };

  const applyDirectAiPatch = async () => {
    const operations = aiPatch?.patch_operations || [];
    if (!operations.length) return;
    const confirmed = await requestConfirm(buildRepairApplyConfirmMessage('确认应用 AI 补丁到脚本？', operations));
    if (!confirmed) return;
    if (aiPatch?.repair_draft?.draft_script) {
      setDslText(JSON.stringify(markAiRepairSource(aiPatch.repair_draft.draft_script, 'direct_patch', operations), null, 2));
      return;
    }
    applyAiPatch();
  };

  React.useEffect(() => {
    const runKey = runReport?.run_id || runReport?.run_at || '';
    if (!runKey || runReport?.status !== 'failed' || !parsedScript || loading || aiEnhancing) return;
    if (autoRepairSuggestionRunRef.current === runKey) return;
    autoRepairSuggestionRunRef.current = runKey;
    generateAiRepairPatch(runReport);
  }, [aiEnhancing, generateAiRepairPatch, loading, parsedScript, runReport]);

  return (
    <>
    <Stack spacing={4}>
                <StageHeader
                  title="步骤 3: 编排与执行"
                  action={(
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                      <Button 
                        variant="outlined" 
                        startIcon={<PlayCircleOutlineOutlined />} 
                        disabled={!dslText || executionDisabled} 
                        onClick={handleRunSelectedStep}
                        sx={{ borderRadius: 2, fontWeight: 700, px: 3, bgcolor: '#ffffff' }}
                      >
                        单步执行选中步骤
                      </Button>
                      <Button 
                        variant="contained" 
                        disabled={!dslText || executionDisabled} 
                        onClick={handleRunAllSteps}
                        sx={{ 
                          borderRadius: 2, 
                          fontWeight: 800, 
                          px: 4,
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                          }
                        }}
                      >
                        全量链路执行
                      </Button>
                    </Stack>
                  )}
                />

                <Box sx={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                  p: 2.5, bgcolor: '#f8fafc', borderRadius: 4, border: '1px solid', borderColor: 'rgba(0,0,0,0.04)',
                  boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.5)'
                }}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', boxShadow: '0 2px 8px rgba(79, 70, 229, 0.15)' }}>
                      <DataObjectOutlined />
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={800} color="text.primary" sx={{ mb: 0.5 }}>流程核心 (DSL)</Typography>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: jsonValidation.valid ? 'success.main' : 'error.main', boxShadow: jsonValidation.valid ? '0 0 8px rgba(34, 197, 94, 0.6)' : 'none' }} />
                        <Typography variant="caption" color={jsonValidation.valid ? 'text.secondary' : 'error.main'} fontWeight={600}>
                          {jsonValidation.valid ? `语法就绪 · ${jsonValidation.message}` : jsonValidation.message}
                        </Typography>
                      </Stack>
                    </Box>
                  </Stack>
                  
                  <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" startIcon={<FormatAlignLeftOutlined />} disabled={!dslText || !jsonValidation.valid} onClick={beautifyDslJson} sx={{ borderRadius: 2, bgcolor: '#fff' }}>一键美化</Button>
                    <Button size="small" variant="outlined" startIcon={<ContentCopyOutlined />} disabled={!dslText} onClick={copyDslJson} sx={{ borderRadius: 2, bgcolor: '#fff' }}>复制</Button>
                    <Button size="small" variant="outlined" onClick={exportPytestScript} sx={{ borderRadius: 2, bgcolor: '#fff' }}>导出 Pytest</Button>
                    <Button size="small" variant="outlined" onClick={exportPostmanCollection} sx={{ borderRadius: 2, bgcolor: '#fff' }}>导出 Postman</Button>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!parsedScript || loading}
                      onClick={enhanceDslWithAi}
                      startIcon={aiEnhancing ? <CircularProgress size={14} color="inherit" thickness={5} /> : <AutoAwesomeOutlined fontSize="small" />}
                      sx={{
                        borderRadius: 2,
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
                        color: '#fff',
                        fontWeight: 800,
                        boxShadow: '0 4px 12px rgba(217, 70, 239, 0.3)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #7c3aed 0%, #c026d3 100%)',
                          boxShadow: '0 6px 16px rgba(217, 70, 239, 0.4)',
                        }
                      }}
                    >
                      {aiEnhancing ? 'AI 深度编排中...' : '智能补全编排'}
                    </Button>
                  </Stack>
                </Box>

                <Paper 
                  elevation={0} 
                  sx={{ 
                    borderRadius: 4, 
                    border: '1px solid',
                    borderColor: 'rgba(0,0,0,0.06)', 
                    overflow: 'hidden',
                    boxShadow: '0 12px 40px -12px rgba(0,0,0,0.08)'
                  }}
                >
                  <FlowWorkbench
                    dslText={dslText}
                    setDslText={setDslText}
                    parsedScript={parsedScript}
                    runStepId={runStepId}
                    setRunStepId={setRunStepId}
                    baseUrl={baseUrl}
                    setBaseUrl={setBaseUrl}
                    bearerToken={bearerToken}
                    setBearerToken={setBearerToken}
                    globalHeadersText={globalHeadersText}
                    setGlobalHeadersText={setGlobalHeadersText}
                    runReport={runReport}
                    disabledStepIds={disabledFlowStepIds}
                    setDisabledStepIds={setDisabledFlowStepIds}
                    onDirtyChange={setFlowDirty}
                    requestConfirm={requestConfirm}
                    selectedProjectId={selectedProjectId}
                    projectName={projectName}
                    editorTheme={apiJsonEditorTheme}
                    editorHighlightStyle={syntaxHighlighting(apiJsonHighlightStyle)}
                    completionSource={dslCompletionSource}
                  />
                </Paper>

                {aiPatch?.patch_operations?.length > 0 && (
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 3, 
                      borderRadius: 4, 
                      border: '1px solid',
                      borderColor: aiPatch.automatic_applicable ? 'success.light' : 'warning.light',
                      bgcolor: aiPatch.automatic_applicable ? '#f0fdf4' : '#fffbeb',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px -8px rgba(0,0,0,0.05)'
                    }}
                  >
                    <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: aiPatch.automatic_applicable ? 'success.main' : 'warning.main' }} />
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: aiPatch.automatic_applicable ? 'success.100' : 'warning.100', display: 'flex', alignItems: 'center', justifyContent: 'center', color: aiPatch.automatic_applicable ? 'success.main' : 'warning.main' }}>
                          <AutoAwesomeOutlined fontSize="small" />
                        </Box>
                        <Typography variant="subtitle1" fontWeight={800} sx={{ color: aiPatch.automatic_applicable ? 'success.dark' : 'warning.dark' }}>
                          {aiPatch.summary}
                        </Typography>
                      </Stack>
                      <Stack spacing={1.5} sx={{ pl: 5.5 }}>
                        {aiPatch.patch_operations.map((operation, index) => (
                          <Box key={`${operation.step_id}-${operation.field}-${index}`} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                            <Box sx={{ mt: 1, width: 5, height: 5, borderRadius: '50%', bgcolor: aiPatch.automatic_applicable ? 'success.main' : 'warning.main', opacity: 0.5 }} />
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                              <Typography component="span" fontWeight={800} color="text.primary" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.04)', px: 0.5, py: 0.2, borderRadius: 1 }}>{operation.step_id}</Typography>
                              <Typography component="span" fontWeight={700} sx={{ ml: 1, color: 'primary.main' }}>[{operation.field}]</Typography>
                              {' '}{operation.reason}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={2} sx={{ pl: 5.5, pt: 1.5 }}>
                        {!!aiPatch.repair_draft?.draft_script && (
                          <Button 
                            size="small" 
                            variant="contained" 
                            color={aiPatch.automatic_applicable ? 'success' : 'warning'} 
                            onClick={() => setRepairDraftOpen(true)} 
                            sx={{ borderRadius: 2, fontWeight: 800, boxShadow: 'none' }}
                          >
                            预览修复编排
                          </Button>
                        )}
                        <Button 
                          size="small" 
                          variant="outlined" 
                          onClick={applyDirectAiPatch} 
                          sx={{ borderRadius: 2, fontWeight: 700, bgcolor: '#ffffff', borderColor: aiPatch.automatic_applicable ? 'success.light' : 'warning.light', color: aiPatch.automatic_applicable ? 'success.dark' : 'warning.dark' }}
                        >
                          直接应用修复
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                )}
              </Stack>
              <AIFlowDraftDialog
                open={repairDraftOpen}
                draft={aiPatch?.repair_draft}
                onClose={() => setRepairDraftOpen(false)}
                onApply={applyRepairDraft}
                onApplyLowRisk={applyLowRiskRepairOperations}
              />
  </>
  );
}
