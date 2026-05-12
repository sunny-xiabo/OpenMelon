import { createContext, useContext, useMemo, useState } from 'react';
import { useSnackbar } from '../../../components/SnackbarProvider';
import { apiExecutionAPI } from '../../../api/execution';
import {
  buildDownloadTimestamp,
  buildReportFilename,
  buildRunReportHtml,
  downloadBlob,
  mergeScriptVariables,
  toRunRequestOptions,
} from '../utils';
import {
  ASSERTION_TYPES_WITH_PATH,
  ASSERTION_TYPES_WITHOUT_EXPECTED,
} from '../constants';
import { useUIContext } from './UIContext';
import { useProjectEnvContext } from './ProjectEnvContext';

const DSLContext = createContext();

export const useDSLContext = () => {
  const ctx = useContext(DSLContext);
  if (!ctx) throw new Error('useDSLContext must be used within a DSLProvider');
  return ctx;
};

export const DSLProvider = ({ children }) => {
  const showSnackbar = useSnackbar();
  const { setLoading, setLoadingMessage, setActiveStep } = useUIContext();
  const { buildProjectPolicySnapshot } = useProjectEnvContext();

  const [dslText, setDslText] = useState('');
  const [assertionStepId, setAssertionStepId] = useState('');
  const [runStepId, setRunStepId] = useState('');
  const [assertionType, setAssertionType] = useState('status_code_in');
  const [assertionPath, setAssertionPath] = useState('');
  const [assertionExpected, setAssertionExpected] = useState('200');
  const [aiPatch, setAiPatch] = useState(null);
  const [aiEnhancing, setAiEnhancing] = useState(false);
  const [disabledFlowStepIds, setDisabledFlowStepIds] = useState([]);

  const parsedScript = useMemo(() => {
    if (!dslText) return null;
    try {
      return JSON.parse(dslText);
    } catch {
      return null;
    }
  }, [dslText]);

  // Accepts params from consumer (spec, selectedOperationIds, projectName, environmentName, baseUrl)
  const generateDsl = async ({ spec, selectedOperationIds, projectName: projName, environmentName: envName, baseUrl: bUrl }) => {
    if (!spec) return;
    const operationIds = Array.from(selectedOperationIds);
    if (!operationIds.length) {
      showSnackbar('请先选择接口', 'warning');
      return;
    }
    setLoadingMessage('正在生成测试脚本...');
    setLoading(true);
    try {
      const data = await apiExecutionAPI.generateDsl(spec.spec_id, operationIds);
      const nextScript = {
        ...data,
        target_project: projName?.trim() || data.target_project,
        environment: envName?.trim() || data.environment,
        base_url: bUrl?.trim() || data.base_url,
      };
      setDslText(JSON.stringify(nextScript, null, 2));
      setAssertionStepId(nextScript.steps?.[0]?.id || '');
      setRunStepId(nextScript.steps?.[0]?.id || '');
      setActiveStep(2);
      showSnackbar(`已生成 ${nextScript.steps?.length || 0} 个步骤`, 'success');
    } catch (error) {
      showSnackbar(error.message || '测试脚本生成失败', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const insertAssertion = () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'error');
      return;
    }
    const stepId = assertionStepId || parsedScript.steps?.[0]?.id;
    if (!stepId) return;
    const needsPath = ASSERTION_TYPES_WITH_PATH.has(assertionType);
    const needsExpected = !ASSERTION_TYPES_WITHOUT_EXPECTED.has(assertionType);
    const path = assertionPath.trim();
    if (needsPath && !path) {
      showSnackbar('请先填写断言路径', 'warning');
      return;
    }
    const expected = ['status_code_in', 'status_code_not_in'].includes(assertionType)
      ? assertionExpected.split(',').map((item) => Number(item.trim())).filter((item) => Number.isFinite(item))
      : Number.isFinite(Number(assertionExpected)) ? Number(assertionExpected) : assertionExpected;
    if (needsExpected && (['status_code_in', 'status_code_not_in'].includes(assertionType) ? !expected.length : assertionExpected.trim() === '')) {
      showSnackbar('请先填写期望值', 'warning');
      return;
    }
    const assertion = {
      type: assertionType,
      ...(needsPath ? { path } : {}),
      ...(needsExpected ? { expected } : {}),
    };
    const nextScript = {
      ...parsedScript,
      steps: (parsedScript.steps || []).map((step) => (
        step.id === stepId ? { ...step, assertions: [...(step.assertions || []), assertion] } : step
      )),
    };
    setDslText(JSON.stringify(nextScript, null, 2));
    showSnackbar('已插入断言', 'success');
  };

  const enhanceDslWithAi = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    setAiEnhancing(true);
    setLoading(true);
    try {
      const data = await apiExecutionAPI.enhanceDsl(parsedScript, buildProjectPolicySnapshot());
      setAiPatch(data);
      if (data.patch_operations?.length) {
        showSnackbar(`AI 已生成 ${data.patch_operations.length} 条编排建议，可查看后应用`, 'success');
      } else {
        showSnackbar('当前脚本暂无可补全的编排项', 'info');
      }
    } catch (error) {
      showSnackbar(error.message || 'AI DSL 补全失败', 'error');
    } finally {
      setAiEnhancing(false);
      setLoading(false);
    }
  };

  const generateAiRepairPatch = async (runReport) => {
    if (!parsedScript || !runReport) {
      showSnackbar('请先载入脚本并生成执行报告', 'warning');
      return;
    }
    setLoading(true);
    try {
      const data = await apiExecutionAPI.generateRepairPatch(parsedScript, runReport, buildProjectPolicySnapshot());
      setAiPatch(data);
      showSnackbar(data.patch_operations?.length ? 'AI 修复补丁已生成，请确认后应用' : '暂未找到可自动修复的补丁', data.patch_operations?.length ? 'success' : 'info');
    } catch (error) {
      showSnackbar(error.message || '生成 AI 修复补丁失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyAiPatch = () => {
    if (!aiPatch?.patched_script) return;
    setDslText(JSON.stringify(aiPatch.patched_script, null, 2));
    setAssertionStepId(aiPatch.patched_script.steps?.[0]?.id || '');
    setRunStepId(aiPatch.patched_script.steps?.[0]?.id || '');
    setActiveStep(2);
    showSnackbar('已应用 AI 补丁，请确认脚本后再执行', 'success');
  };

  const exportPytestScript = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    const blob = await apiExecutionAPI.exportPytest(parsedScript);
    downloadBlob(blob, `api-test-script-${buildDownloadTimestamp()}.py`);
  };

  const exportPostmanCollection = async () => {
    if (!parsedScript) {
      showSnackbar('请先生成或修复测试脚本 JSON', 'warning');
      return;
    }
    const blob = await apiExecutionAPI.exportPostman(parsedScript);
    downloadBlob(blob, `api-postman-collection-${buildDownloadTimestamp()}.json`);
  };

  const exportRunReport = (report) => {
    if (!report) return;
    const html = buildRunReportHtml(report);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, buildReportFilename());
  };

  const value = {
    dslText, setDslText,
    assertionStepId, setAssertionStepId,
    runStepId, setRunStepId,
    assertionType, setAssertionType,
    assertionPath, setAssertionPath,
    assertionExpected, setAssertionExpected,
    aiPatch, setAiPatch,
    aiEnhancing,
    disabledFlowStepIds, setDisabledFlowStepIds,
    parsedScript,
    generateDsl,
    insertAssertion,
    enhanceDslWithAi,
    generateAiRepairPatch,
    applyAiPatch,
    exportPytestScript,
    exportPostmanCollection,
    exportRunReport,
  };

  return (
    <DSLContext.Provider value={value}>
      {children}
    </DSLContext.Provider>
  );
};
