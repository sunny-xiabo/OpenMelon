// Compatibility layer -- combines all sub-contexts into a single useAPIExecution() hook.
// Existing consumers can keep using useAPIExecution() unchanged.
// New consumers should import from individual contexts for better re-render performance.

export { APIExecutionProvider } from './contexts/CombinedProvider';
export {
  API_EXECUTION_STATE_BOUNDARIES,
  CROSS_DOMAIN_ACTIONS,
} from './contexts/stateBoundaries';

import { useUIContext } from './contexts/UIContext';
import { useSpecContext } from './contexts/SpecContext';
import { useProjectEnvContext } from './contexts/ProjectEnvContext';
import { useDSLContext } from './contexts/DSLContext';
import { useExecutionContext } from './contexts/ExecutionContext';
import { useRunHistoryContext } from './contexts/RunHistoryContext';
import { useLoadRunIntoEditor } from './contexts/CombinedProvider';

export const useAPIExecution = () => {
  const ui = useUIContext();
  const spec = useSpecContext();
  const projectEnv = useProjectEnvContext();
  const dsl = useDSLContext();
  const exec = useExecutionContext();
  const history = useRunHistoryContext();
  const loadRunIntoEditor = useLoadRunIntoEditor();

  // Wrap cross-domain functions to match old signatures (no params, read from combined context)
  const wrappedGenerateDsl = () => dsl.generateDsl({
    spec: spec.spec,
    selectedOperationIds: spec.selectedOperationIds,
    projectName: projectEnv.projectName,
    environmentName: projectEnv.environmentName,
    baseUrl: projectEnv.baseUrl,
  });

  const wrappedRunSelectedStep = () => exec.runSelectedStep(dsl.parsedScript, dsl.runStepId, projectEnv.buildRunOptions, dsl.disabledFlowStepIds);

  const getExecutableScript = () => {
    if (!dsl.parsedScript || !dsl.disabledFlowStepIds?.length) return dsl.parsedScript;
    const disabled = new Set(dsl.disabledFlowStepIds);
    return {
      ...dsl.parsedScript,
      steps: (dsl.parsedScript.steps || []).filter((step) => !disabled.has(step.id)),
    };
  };

  const wrappedRunAllSteps = () => exec.runAllSteps(getExecutableScript(), projectEnv.buildRunOptions);

  const wrappedRerunFailedSteps = () => exec.rerunFailedSteps(getExecutableScript(), projectEnv.buildRunOptions);

  const wrappedHandleReplayRun = (run) => history.replayRun(run, exec.runAllSteps, projectEnv.buildRunOptions);

  const wrappedHandleAutoRepairRun = (runId) => history.handleAutoRepairRun(
    runId || exec.runReport?.run_id,
    exec.runReport,
    exec.setRunReport,
    dsl.setDslText,
    dsl.parsedScript,
  );

  const wrappedSaveCurrentEnvironment = () => projectEnv.saveCurrentEnvironment(spec.spec);

  const wrappedBuildProjectPayload = (projectId, name) => projectEnv.buildProjectPayload(projectId, name, spec.spec);

  const wrappedEnhanceDslWithAi = () => dsl.enhanceDslWithAi(projectEnv.buildProjectPolicySnapshot());

  const wrappedGenerateAiRepairPatch = (runReport) => dsl.generateAiRepairPatch(
    runReport,
    projectEnv.buildProjectPolicySnapshot(),
  );

  return {
    ...ui, ...spec, ...projectEnv, ...dsl, ...exec, ...history,
    // Override with wrapped versions
    loadRunIntoEditor,
    generateDsl: wrappedGenerateDsl,
    runSelectedStep: wrappedRunSelectedStep,
    runAllSteps: wrappedRunAllSteps,
    rerunFailedSteps: wrappedRerunFailedSteps,
    handleReplayRun: wrappedHandleReplayRun,
    handleAutoRepairRun: wrappedHandleAutoRepairRun,
    saveCurrentEnvironment: wrappedSaveCurrentEnvironment,
    buildProjectPayload: wrappedBuildProjectPayload,
    enhanceDslWithAi: wrappedEnhanceDslWithAi,
    generateAiRepairPatch: wrappedGenerateAiRepairPatch,
  };
};
