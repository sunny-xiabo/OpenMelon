export const buildRunEditorState = (run) => {
  const options = run?.execution_options || {};
  const environmentSnapshot = options.environment_snapshot || {};
  const projectSnapshot = options.project_policy_snapshot || {};
  const script = run?.script || null;
  const firstStepId = script?.steps?.[0]?.id || '';

  return {
    projectId: options.project_id || '',
    environmentId: options.environment_id || '',
    projectSnapshot,
    environmentSnapshot,
    baseUrl: options.base_url || environmentSnapshot.base_url || script?.base_url || '',
    dslText: script ? JSON.stringify(script, null, 2) : '',
    firstStepId,
  };
};

export const applyRunToEditor = ({
  run,
  step = 2,
  setActiveStep,
  setSelectedProjectId,
  setSelectedEnvironmentId,
  restoreProjectSnapshot,
  restoreEnvironmentSnapshot,
  setBaseUrl,
  setDslText,
  setRunReport,
  setRunResult,
  setAssertionStepId,
  setRunStepId,
}) => {
  const editorState = buildRunEditorState(run);
  if (editorState.projectId) setSelectedProjectId(editorState.projectId);
  if (editorState.environmentId) setSelectedEnvironmentId(editorState.environmentId);
  restoreProjectSnapshot(editorState.projectSnapshot);
  restoreEnvironmentSnapshot(editorState.environmentSnapshot);
  setBaseUrl(editorState.baseUrl);
  setDslText(editorState.dslText);
  setRunReport(run);
  setRunResult(null);
  setAssertionStepId(editorState.firstStepId);
  setRunStepId(editorState.firstStepId);
  setActiveStep(step);
};

export const resetEditorForSpec = ({
  spec,
  setDslText,
  setBaseUrl,
  setRunResult,
  setRunReport,
  setAssertionStepId,
}) => {
  setDslText('');
  setBaseUrl((prev) => prev || spec?.servers?.[0]?.url || '');
  setRunResult(null);
  setRunReport(null);
  setAssertionStepId('');
};
