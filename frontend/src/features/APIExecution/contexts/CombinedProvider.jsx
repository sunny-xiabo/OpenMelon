import { useCallback, useEffect } from 'react';
import { UIProvider, useUIContext } from './UIContext';
import { SpecProvider, useSpecContext } from './SpecContext';
import { ProjectEnvProvider, useProjectEnvContext } from './ProjectEnvContext';
import { DSLProvider, useDSLContext } from './DSLContext';
import { ExecutionProvider, useExecutionContext } from './ExecutionContext';
import { RunHistoryProvider, useRunHistoryContext } from './RunHistoryContext';
import { applyRunToEditor, resetEditorForSpec } from './stateCoordinator';

// Inner component that wires cross-domain coordination
function CrossDomainWire() {
  const { setActiveStep } = useUIContext();
  const { setDslText, setAssertionStepId, setRunStepId } = useDSLContext();
  const { setRunReport, setRunResult, registerFetchHistory } = useExecutionContext();
  const { setBaseUrl, restoreProjectSnapshot, restoreEnvironmentSnapshot, setSelectedProjectId, setSelectedEnvironmentId } = useProjectEnvContext();
  const { registerResetCallback } = useSpecContext();
  const { fetchHistory } = useRunHistoryContext();

  // Register fetchHistory with ExecutionContext for background polling
  useEffect(() => {
    registerFetchHistory(fetchHistory);
  }, [fetchHistory]);

  // Register cross-domain reset callback for spec changes
  useEffect(() => {
    const unregister = registerResetCallback((data) => resetEditorForSpec({
      spec: data,
      setDslText,
      setBaseUrl,
      setRunResult,
      setRunReport,
      setAssertionStepId,
    }));
    return unregister;
  }, []);

  useEffect(() => {
    const pendingRunId = sessionStorage.getItem('openmelon_api_execution_run_id');
    if (!pendingRunId) return;
    let cancelled = false;
    import('../../../api/executionRun').then(({ getExecutionRun }) => (
      getExecutionRun(pendingRunId)
    )).then((run) => {
      if (cancelled || !run?.script) return;
      applyRunToEditor({
        run,
        step: 3,
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
      });
      sessionStorage.removeItem('openmelon_api_execution_run_id');
    }).catch(() => {
      sessionStorage.removeItem('openmelon_api_execution_run_id');
    });
    return () => { cancelled = true; };
  }, []);

  return null;
}

// loadRunIntoEditor as a hook that coordinates across all contexts
export function useLoadRunIntoEditor() {
  const { setActiveStep } = useUIContext();
  const { setDslText, setAssertionStepId, setRunStepId } = useDSLContext();
  const { setRunReport, setRunResult } = useExecutionContext();
  const { setSelectedProjectId, setSelectedEnvironmentId, restoreProjectSnapshot, restoreEnvironmentSnapshot, setBaseUrl } = useProjectEnvContext();
  const showSnackbar = useSnackbar();

  return useCallback((run) => {
    if (!run?.script) {
      showSnackbar('该历史记录没有脚本数据，无法载入', 'warning');
      return;
    }
    applyRunToEditor({
      run,
      step: 2,
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
    });
    showSnackbar('已载入历史脚本，可以编辑后重跑', 'success');
  }, []);
}

// Import useSnackbar for the hook above
import { useSnackbar } from '../../../components/SnackbarProvider';

export const APIExecutionProvider = ({ children }) => {
  return (
    <UIProvider>
      <SpecProvider>
        <ProjectEnvProvider>
          <DSLProvider>
            <ExecutionProvider>
              <RunHistoryProvider>
                <CrossDomainWire />
                {children}
              </RunHistoryProvider>
            </ExecutionProvider>
          </DSLProvider>
        </ProjectEnvProvider>
      </SpecProvider>
    </UIProvider>
  );
};
