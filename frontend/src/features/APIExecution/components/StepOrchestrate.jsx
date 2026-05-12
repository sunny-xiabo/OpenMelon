import React from 'react';
import { Stack, Box, Typography, Button, Alert, CircularProgress } from '@mui/material';
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
    <Stack spacing={3}>
                <StageHeader
                  title="步骤 3: 编排与执行"
                  action={(
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                      <Button variant="outlined" startIcon={<PlayCircleOutlineOutlined />} disabled={!dslText || executionDisabled} onClick={handleRunSelectedStep}>
                        单步执行选中步骤
                      </Button>
                      <Button variant="contained" color="success" disabled={!dslText || executionDisabled} onClick={handleRunAllSteps}>
                        执行全部步骤
                      </Button>
                    </Stack>
                  )}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <DataObjectOutlined color="primary" fontSize="small" />
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>流程 DSL</Typography>
                      <Typography variant="caption" color={jsonValidation.valid ? 'success.main' : 'error.main'}>
                        {jsonValidation.valid ? `格式有效 · ${jsonValidation.message}` : jsonValidation.message}
                      </Typography>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" startIcon={<FormatAlignLeftOutlined />} disabled={!dslText || !jsonValidation.valid} onClick={beautifyDslJson}>一键美化</Button>
                    <Button size="small" variant="outlined" startIcon={<ContentCopyOutlined />} disabled={!dslText} onClick={copyDslJson}>复制</Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="secondary"
                      disabled={!parsedScript || loading}
                      onClick={enhanceDslWithAi}
                      startIcon={aiEnhancing ? <CircularProgress size={14} color="inherit" thickness={5} /> : <AutoAwesomeOutlined fontSize="small" />}
                    >
                      {aiEnhancing ? 'AI 编排中...' : 'AI 编排建议'}
                    </Button>
                    <Button size="small" variant="outlined" onClick={exportPytestScript}>导出 Pytest</Button>
                    <Button size="small" variant="outlined" onClick={exportPostmanCollection}>导出 Postman</Button>
                  </Stack>
                </Box>

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

                {aiPatch?.patch_operations?.length > 0 && (
                  <Alert severity={aiPatch.automatic_applicable ? 'success' : 'warning'}>
                    <Stack spacing={1}>
                      <Typography variant="body2" fontWeight={700}>{aiPatch.summary}</Typography>
                      {aiPatch.patch_operations.map((operation, index) => (
                        <Typography key={`${operation.step_id}-${operation.field}-${index}`} variant="caption">
                          {operation.step_id} · {operation.field}：{operation.reason}
                        </Typography>
                      ))}
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {!!aiPatch.repair_draft?.draft_script && (
                          <Button size="small" variant="contained" onClick={() => setRepairDraftOpen(true)}>预览修复草稿</Button>
                        )}
                        <Button size="small" variant="outlined" onClick={applyDirectAiPatch}>直接应用补丁</Button>
                      </Stack>
                    </Stack>
                  </Alert>
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
