import { useCallback, useEffect } from 'react';
import { UIProvider, useUIContext } from './UIContext';
import { SpecProvider, useSpecContext } from './SpecContext';
import { ProjectEnvProvider, useProjectEnvContext } from './ProjectEnvContext';
import { DSLProvider, useDSLContext } from './DSLContext';
import { ExecutionProvider, useExecutionContext } from './ExecutionContext';
import { RunHistoryProvider, useRunHistoryContext } from './RunHistoryContext';
import { formatLineList } from '../utils';

// Inner component that wires cross-domain coordination
function CrossDomainWire() {
  const { setActiveStep } = useUIContext();
  const { setDslText, setAssertionStepId, setRunStepId, parsedScript } = useDSLContext();
  const { setRunReport, setRunResult, registerFetchHistory, runAllSteps, buildRunOptions: _buildRunOptions } = useExecutionContext();
  const { setBaseUrl, restoreProjectSnapshot, restoreEnvironmentSnapshot, setSelectedProjectId, setSelectedEnvironmentId } = useProjectEnvContext();
  const { registerResetCallback, spec } = useSpecContext();
  const { fetchHistory } = useRunHistoryContext();

  // Register fetchHistory with ExecutionContext for background polling
  useEffect(() => {
    registerFetchHistory(fetchHistory);
  }, [fetchHistory]);

  // Register cross-domain reset callback for spec changes
  useEffect(() => {
    const unregister = registerResetCallback((data) => {
      setDslText('');
      setBaseUrl((prev) => prev || data.servers?.[0]?.url || '');
      setRunResult(null);
      setRunReport(null);
      setAssertionStepId('');
    });
    return unregister;
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
    const options = run.execution_options || {};
    const environmentSnapshot = options.environment_snapshot || {};
    const projectSnapshot = options.project_policy_snapshot || {};
    if (options.project_id) setSelectedProjectId(options.project_id);
    if (options.environment_id) setSelectedEnvironmentId(options.environment_id);
    restoreProjectSnapshot(projectSnapshot);
    restoreEnvironmentSnapshot(environmentSnapshot);
    setBaseUrl(options.base_url || environmentSnapshot.base_url || run.script.base_url || '');
    setDslText(JSON.stringify(run.script, null, 2));
    setRunReport(run);
    setRunResult(null);
    setAssertionStepId(run.script.steps?.[0]?.id || '');
    setRunStepId(run.script.steps?.[0]?.id || '');
    setActiveStep(2);
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
