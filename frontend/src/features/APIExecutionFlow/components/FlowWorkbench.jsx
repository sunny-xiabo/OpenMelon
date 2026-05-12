import React from 'react';
import {
  Alert,
  Box,
  Collapse,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { AccountTreeOutlined, ViewListOutlined } from '@mui/icons-material';
import { arrayMove } from '@dnd-kit/sortable';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import { buildFlowGraph, buildFlowSummary } from '../utils/flowAnalysis';
import {
  defaultAssertion,
  defaultExtraction,
  normalizeAssertionExpected,
  parseArrayDraft,
  parseJsonText,
  safeJsonText,
} from '../utils/jsonDraft';
import FlowAdvancedJsonEditor from './FlowAdvancedJsonEditor';
import FlowGraphView from './FlowGraphView';
import FlowRunConfigBar from './FlowRunConfigBar';
import FlowStepEditor from './FlowStepEditor';
import FlowStepList from './FlowStepList';
import FlowTemplateDialog from './FlowTemplateDialog';
import FlowVariablePanel from './FlowVariablePanel';

export default function FlowWorkbench({
  dslText,
  setDslText,
  parsedScript,
  runStepId,
  setRunStepId,
  baseUrl,
  setBaseUrl,
  bearerToken,
  setBearerToken,
  globalHeadersText,
  setGlobalHeadersText,
  runReport,
  disabledStepIds,
  setDisabledStepIds,
  onDirtyChange,
  requestConfirm,
  selectedProjectId,
  projectName,
  editorTheme,
  editorHighlightStyle,
  completionSource,
}) {
  const showSnackbar = useSnackbar();
  const [activeStepId, setActiveStepId] = React.useState('');
  const [stepDraft, setStepDraft] = React.useState(null);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [variableInsertTarget, setVariableInsertTarget] = React.useState('bodyText');
  const [viewMode, setViewMode] = React.useState('list');
  const [templateDialog, setTemplateDialog] = React.useState({ open: false, mode: 'load' });
  const [templates, setTemplates] = React.useState([]);
  const [templatesLoading, setTemplatesLoading] = React.useState(false);
  const [templateForm, setTemplateForm] = React.useState({ template_id: '', name: '', description: '', tags: '' });
  const [activeDragStepId, setActiveDragStepId] = React.useState('');

  const steps = parsedScript?.steps || [];
  const disabledSet = React.useMemo(() => new Set(disabledStepIds || []), [disabledStepIds]);
  const activeStep = steps.find((step) => step.id === activeStepId) || steps[0] || null;
  const flowSummary = React.useMemo(() => buildFlowSummary(parsedScript), [parsedScript]);
  const flowGraph = React.useMemo(() => buildFlowGraph(steps, flowSummary), [steps, flowSummary]);
  const repairSourceLabel = getRepairSourceLabel(parsedScript?.ai_repair_source);

  const updateScript = React.useCallback((nextScript) => {
    setDslText(JSON.stringify(nextScript, null, 2));
  }, [setDslText]);

  const loadTemplates = React.useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const data = await apiExecutionAPI.listFlowTemplates({ projectId: selectedProjectId || '', limit: 100 });
      setTemplates(data.templates || []);
    } catch (error) {
      showSnackbar(error.message || '流程模板加载失败', 'error');
    } finally {
      setTemplatesLoading(false);
    }
  }, [selectedProjectId, showSnackbar]);

  React.useEffect(() => {
    if (!activeStepId && steps[0]?.id) setActiveStepId(steps[0].id);
    if (activeStepId && !steps.some((step) => step.id === activeStepId)) {
      setActiveStepId(steps[0]?.id || '');
    }
  }, [activeStepId, steps]);

  React.useEffect(() => {
    if (!activeStep) {
      setStepDraft(null);
      return;
    }
    setStepDraft({
      ...activeStep,
      headersText: safeJsonText(activeStep.headers),
      queryText: safeJsonText(activeStep.query),
      pathParamsText: safeJsonText(activeStep.path_params),
      bodyText: safeJsonText(activeStep.body, 'null'),
      assertionsText: safeJsonText(activeStep.assertions || [], '[]'),
      extractionsText: safeJsonText(activeStep.extractions || [], '[]'),
      retryText: safeJsonText(activeStep.retry || null, 'null'),
      dependsOnText: (activeStep.depends_on || []).join('\n'),
    });
    setDirty(false);
    setSaveError('');
  }, [activeStep?.id]);

  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const confirmDraftDiscard = async (message) => {
    if (!dirty) return true;
    if (requestConfirm) return requestConfirm(message);
    return window.confirm(message);
  };

  const confirmAction = async (message) => {
    if (requestConfirm) return requestConfirm(message);
    return window.confirm(message);
  };

  const openTemplateDialog = async (mode) => {
    if (mode === 'save') {
      setTemplateForm({
        template_id: '',
        name: parsedScript?.name || `${projectName || 'API'} 流程模板`,
        description: '',
        tags: '',
      });
    }
    setTemplateDialog({ open: true, mode });
    await loadTemplates();
  };

  const closeTemplateDialog = () => {
    setTemplateDialog({ open: false, mode: 'load' });
  };

  const saveFlowTemplate = async () => {
    if (!parsedScript) return;
    try {
      const saved = await apiExecutionAPI.saveFlowTemplate({
        template_id: templateForm.template_id || undefined,
        project_id: selectedProjectId || '',
        name: templateForm.name.trim() || parsedScript.name || 'API 流程模板',
        description: templateForm.description.trim(),
        tags: templateForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
        script: {
          ...parsedScript,
          flow_template_id: templateForm.template_id || '',
          flow_template_name: templateForm.name.trim() || parsedScript.name || 'API 流程模板',
          flow_template_tags: templateForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
        },
      });
      showSnackbar(`流程模板「${saved.name}」已${templateForm.template_id ? '覆盖' : '保存'}`, 'success');
      setTemplates((prev) => [saved, ...prev.filter((item) => item.template_id !== saved.template_id)]);
      if (saved.script) {
        setDslText(JSON.stringify(saved.script, null, 2));
      }
      closeTemplateDialog();
    } catch (error) {
      showSnackbar(error.message || '流程模板保存失败', 'error');
    }
  };

  const loadFlowTemplate = async (template) => {
    if (!template?.script) return;
    if (!await confirmAction('载入模板会替换当前 DSL，未保存修改将丢失。继续载入？')) return;
    const nextScript = {
      ...template.script,
      flow_template_id: template.template_id || '',
      flow_template_name: template.name || template.script?.name || '',
      flow_template_tags: template.tags || [],
    };
    setDslText(JSON.stringify(nextScript, null, 2));
    setActiveStepId(nextScript.steps?.[0]?.id || '');
    setRunStepId(nextScript.steps?.[0]?.id || '');
    setDirty(false);
    showSnackbar(`已载入流程模板「${template.name}」`, 'success');
    closeTemplateDialog();
  };

  const duplicateFlowTemplate = async (template) => {
    if (!template?.script) return;
    try {
      const duplicated = await apiExecutionAPI.saveFlowTemplate({
        project_id: selectedProjectId || template.project_id || '',
        name: `${template.name || '流程模板'} 副本`,
        description: template.description || '',
        tags: template.tags || [],
        script: {
          ...template.script,
          flow_template_id: '',
          flow_template_name: `${template.name || '流程模板'} 副本`,
          flow_template_tags: template.tags || [],
        },
      });
      setTemplates((prev) => [duplicated, ...prev]);
      showSnackbar(`已复制流程模板「${duplicated.name}」`, 'success');
    } catch (error) {
      showSnackbar(error.message || '流程模板复制失败', 'error');
    }
  };

  const saveFlowTemplateAsNew = async () => {
    if (!parsedScript) return;
    try {
      const duplicated = await apiExecutionAPI.saveFlowTemplate({
        project_id: selectedProjectId || '',
        name: templateForm.name.trim() || parsedScript.name || 'API 流程模板',
        description: templateForm.description.trim(),
        tags: templateForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
        script: {
          ...parsedScript,
          flow_template_id: '',
          flow_template_name: templateForm.name.trim() || parsedScript.name || 'API 流程模板',
          flow_template_tags: templateForm.tags.split(',').map((item) => item.trim()).filter(Boolean),
        },
      });
      showSnackbar(`流程模板「${duplicated.name}」已另存为新模板`, 'success');
      setTemplates((prev) => [duplicated, ...prev]);
      if (duplicated.script) {
        setDslText(JSON.stringify(duplicated.script, null, 2));
      }
      closeTemplateDialog();
    } catch (error) {
      showSnackbar(error.message || '流程模板另存为失败', 'error');
    }
  };

  const deleteFlowTemplate = async (template) => {
    if (!await confirmAction(`确认删除流程模板「${template.name}」？`)) return;
    try {
      await apiExecutionAPI.deleteFlowTemplate(template.template_id);
      setTemplates((prev) => prev.filter((item) => item.template_id !== template.template_id));
      showSnackbar('流程模板已删除', 'success');
    } catch (error) {
      showSnackbar(error.message || '流程模板删除失败', 'error');
    }
  };

  const editFlowTemplate = (template) => {
    setTemplateForm({
      template_id: template.template_id || '',
      name: template.name || '',
      description: template.description || '',
      tags: (template.tags || []).join(', '),
    });
    setTemplateDialog({ open: true, mode: 'save' });
  };

  const moveStep = (stepId, direction) => {
    if (!parsedScript) return;
    const index = steps.findIndex((step) => step.id === stepId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= steps.length) return;
    const nextSteps = [...steps];
    const [item] = nextSteps.splice(index, 1);
    nextSteps.splice(target, 0, item);
    updateScript({ ...parsedScript, steps: nextSteps });
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveDragStepId('');
    if (!over || active.id === over.id) return;
    const oldIndex = steps.findIndex((step) => step.id === active.id);
    const newIndex = steps.findIndex((step) => step.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    updateScript({ ...parsedScript, steps: arrayMove(steps, oldIndex, newIndex) });
  };

  const saveStepDraft = () => {
    if (!parsedScript || !stepDraft) return;
    const headers = parseJsonText(stepDraft.headersText, {}, 'Headers');
    const query = parseJsonText(stepDraft.queryText, {}, 'Query');
    const pathParams = parseJsonText(stepDraft.pathParamsText, {}, 'Path Params');
    const body = parseJsonText(stepDraft.bodyText, null, 'Body');
    const assertions = parseJsonText(stepDraft.assertionsText, [], 'Assertions');
    const extractions = parseJsonText(stepDraft.extractionsText, [], 'Extractions');
    const retry = parseJsonText(stepDraft.retryText, null, 'Retry');
    const firstError = [headers, query, pathParams, body, assertions, extractions, retry].find((item) => !item.ok);
    if (firstError) {
      setSaveError(firstError.message);
      return;
    }
    const nextStep = {
      id: stepDraft.id.trim(),
      name: stepDraft.name.trim() || stepDraft.id.trim(),
      method: stepDraft.method.toUpperCase(),
      path: stepDraft.path.trim(),
      operation_id: stepDraft.operation_id.trim(),
      headers: headers.value,
      query: query.value,
      path_params: pathParams.value,
      body: body.value,
      assertions: Array.isArray(assertions.value) ? assertions.value : [],
      extractions: Array.isArray(extractions.value) ? extractions.value : [],
      retry: retry.value,
      depends_on: stepDraft.dependsOnText.split('\n').map((item) => item.trim()).filter(Boolean),
      parallel_group: stepDraft.parallel_group || '',
    };
    const nextSteps = steps.map((step) => (step.id === activeStep.id ? nextStep : step));
    updateScript({ ...parsedScript, steps: nextSteps });
    setActiveStepId(nextStep.id);
    setRunStepId((prev) => (prev === activeStep.id ? nextStep.id : prev));
    setDirty(false);
    setSaveError('');
  };

  const updateDraft = (patch) => {
    setStepDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const selectStep = async (stepId) => {
    if (!await confirmDraftDiscard('当前步骤有未保存修改，切换后会丢失这些修改。继续切换？')) return;
    setActiveStepId(stepId);
  };

  const setAdvancedVisible = async () => {
    if (!advancedOpen && !await confirmDraftDiscard('当前步骤有未保存修改，展开 JSON 前建议先保存。仍然展开？')) return;
    setAdvancedOpen((prev) => !prev);
  };

  const toggleStepDisabled = (stepId) => {
    setDisabledStepIds((prevIds) => {
      const next = new Set(prevIds || []);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return Array.from(next);
    });
  };

  const getResultForStep = (stepId) => (runReport?.results || []).find((result) => result.step_id === stepId);

  const insertVariable = (name) => {
    if (!stepDraft) return;
    const field = variableInsertTarget || 'bodyText';
    updateDraft({ [field]: `${stepDraft[field] || ''}${stepDraft[field] ? ' ' : ''}{{${name}}}` });
  };

  const addAssertion = () => {
    if (!stepDraft) return;
    const parsed = parseJsonText(stepDraft.assertionsText, [], 'Assertions');
    const next = Array.isArray(parsed.value) ? [...parsed.value, defaultAssertion] : [defaultAssertion];
    updateDraft({ assertionsText: safeJsonText(next, '[]') });
  };

  const addExtraction = () => {
    if (!stepDraft) return;
    const parsed = parseJsonText(stepDraft.extractionsText, [], 'Extractions');
    const next = Array.isArray(parsed.value) ? [...parsed.value, defaultExtraction] : [defaultExtraction];
    updateDraft({ extractionsText: safeJsonText(next, '[]') });
  };

  const updateAssertionAt = (index, patch) => {
    const assertions = parseArrayDraft(stepDraft.assertionsText);
    const next = assertions.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const nextItem = { ...item, ...patch };
      if ('expected' in patch || 'type' in patch) {
        nextItem.expected = normalizeAssertionExpected(nextItem.type, nextItem.expected);
      }
      return nextItem;
    });
    updateDraft({ assertionsText: safeJsonText(next, '[]') });
  };

  const removeAssertionAt = (index) => {
    const assertions = parseArrayDraft(stepDraft.assertionsText);
    updateDraft({ assertionsText: safeJsonText(assertions.filter((_, itemIndex) => itemIndex !== index), '[]') });
  };

  const updateExtractionAt = (index, patch) => {
    const extractions = parseArrayDraft(stepDraft.extractionsText);
    const next = extractions.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    updateDraft({ extractionsText: safeJsonText(next, '[]') });
  };

  const removeExtractionAt = (index) => {
    const extractions = parseArrayDraft(stepDraft.extractionsText);
    updateDraft({ extractionsText: safeJsonText(extractions.filter((_, itemIndex) => itemIndex !== index), '[]') });
  };

  const updateRetry = (nextRetry) => {
    updateDraft({ retryText: nextRetry ? safeJsonText(nextRetry, 'null') : 'null' });
  };

  if (!parsedScript) {
    return (
      <Paper sx={{ p: 3, borderRadius: 4, border: '1px solid rgba(255,255,255,0.6)', bgcolor: 'rgba(255,255,255,0.45)' }}>
        <Typography variant="subtitle1" fontWeight={800}>流程编排工作台</Typography>
        <Typography variant="body2" color="text.secondary">请先在上一步生成测试脚本。</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={2}>
      <FlowRunConfigBar
        steps={steps}
        runStepId={runStepId}
        setRunStepId={setRunStepId}
        baseUrl={baseUrl}
        setBaseUrl={setBaseUrl}
        bearerToken={bearerToken}
        setBearerToken={setBearerToken}
        globalHeadersText={globalHeadersText}
        setGlobalHeadersText={setGlobalHeadersText}
        onOpenTemplateDialog={openTemplateDialog}
      />

      {!!flowSummary.warnings.length && (
        <Alert severity="warning">
          {flowSummary.warnings.slice(0, 4).join('；')}
          {flowSummary.warnings.length > 4 ? `；另有 ${flowSummary.warnings.length - 4} 条提醒` : ''}
        </Alert>
      )}

      {repairSourceLabel && (
        <Alert severity="info">
          当前 DSL 来自 {repairSourceLabel}
          {parsedScript.ai_repair_applied_operations?.length ? `，已写回 ${parsedScript.ai_repair_applied_operations.length} 项字段修改` : ''}
          。请确认脚本后再执行。
        </Alert>
      )}

      <Box 
        sx={{ 
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 700
        }}
      >
        {/* Top Header / Config Bar */}
        <Box sx={{ borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: '#f8fafc' }}>
          <FlowRunConfigBar
            steps={steps}
            runStepId={runStepId}
            setRunStepId={setRunStepId}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            bearerToken={bearerToken}
            setBearerToken={setBearerToken}
            globalHeadersText={globalHeadersText}
            setGlobalHeadersText={setGlobalHeadersText}
            onOpenTemplateDialog={openTemplateDialog}
          />
        </Box>

        {/* Collapsible Graph View Pane */}
        <Box sx={{ borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: '#ffffff', px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: 'primary.50', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'primary.main' }}>
              <AccountTreeOutlined fontSize="small" />
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight={800} color="text.primary">链路蓝图分析</Typography>
            </Box>
          </Stack>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={viewMode}
            onChange={(_, nextValue) => nextValue && setViewMode(nextValue)}
            sx={{ '& .MuiToggleButton-root': { px: 2, borderRadius: 2, fontWeight: 700 } }}
          >
            <ToggleButton value="list">隐藏</ToggleButton>
            <ToggleButton value="graph">展开蓝图</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Collapse in={viewMode === 'graph'} unmountOnExit>
          <Box sx={{ borderBottom: '1px solid rgba(0,0,0,0.08)', bgcolor: '#f8fafc', p: 2 }}>
            <FlowGraphView
              steps={steps}
              activeStepId={activeStep?.id}
              disabledSet={disabledSet}
              flowSummary={flowSummary}
              flowGraph={flowGraph}
              getResultForStep={getResultForStep}
              onSelectStep={selectStep}
            />
          </Box>
        </Collapse>

        {/* Main 3-Column IDE Area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, overflow: 'hidden', minHeight: 500 }}>
          
          {/* Left Pane: Step List */}
          <Box sx={{ width: { xs: '100%', lg: 320 }, borderRight: { lg: '1px solid rgba(0,0,0,0.08)' }, borderBottom: { xs: '1px solid rgba(0,0,0,0.08)', lg: 'none' }, bgcolor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
            <FlowStepList
              steps={steps}
              activeStepId={activeStep?.id}
              disabledSet={disabledSet}
              flowSummary={flowSummary}
              activeDragStepId={activeDragStepId}
              setActiveDragStepId={setActiveDragStepId}
              getResultForStep={getResultForStep}
              onDragEnd={handleDragEnd}
              onSelectStep={selectStep}
              onMoveStep={moveStep}
            />
          </Box>

          {/* Center Pane: Editor */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <FlowStepEditor
              activeStep={activeStep}
              disabledSet={disabledSet}
              dirty={dirty}
              stepDraft={stepDraft}
              saveError={saveError}
              onSave={saveStepDraft}
              onUpdateDraft={updateDraft}
              onToggleDisabled={toggleStepDisabled}
              onAddAssertion={addAssertion}
              onAddExtraction={addExtraction}
              onUpdateAssertion={updateAssertionAt}
              onRemoveAssertion={removeAssertionAt}
              onUpdateExtraction={updateExtractionAt}
              onRemoveExtraction={removeExtractionAt}
              onUpdateRetry={updateRetry}
            />
          </Box>

          {/* Right Pane: Variables */}
          <Box sx={{ width: { xs: '100%', lg: 300 }, borderLeft: { lg: '1px solid rgba(0,0,0,0.08)' }, bgcolor: '#fafafa', display: 'flex', flexDirection: 'column' }}>
            <FlowVariablePanel
              flowSummary={flowSummary}
              activeStepId={activeStep?.id}
              variableInsertTarget={variableInsertTarget}
              setVariableInsertTarget={setVariableInsertTarget}
              onInsertVariable={insertVariable}
            />
          </Box>
        </Box>
      </Box>

      <FlowAdvancedJsonEditor
        open={advancedOpen}
        dslText={dslText}
        setDslText={setDslText}
        editorTheme={editorTheme}
        editorHighlightStyle={editorHighlightStyle}
        completionSource={completionSource}
        onToggle={setAdvancedVisible}
      />

      <FlowTemplateDialog
        open={templateDialog.open}
        mode={templateDialog.mode}
        templates={templates}
        loading={templatesLoading}
        form={templateForm}
        setForm={setTemplateForm}
        selectedProjectId={selectedProjectId}
        onClose={closeTemplateDialog}
        onSave={saveFlowTemplate}
        onSaveAs={saveFlowTemplateAsNew}
        onLoad={loadFlowTemplate}
        onEdit={editFlowTemplate}
        onDuplicate={duplicateFlowTemplate}
        onDelete={deleteFlowTemplate}
      />
    </Stack>
  );
}

function getRepairSourceLabel(source) {
  const labels = {
    low_risk_repair: 'AI 低风险修复项',
    full_repair_draft: 'AI 完整修复草稿',
    direct_patch: 'AI 修复补丁',
  };
  return labels[source] || '';
}
