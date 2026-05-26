import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StepResult from './StepResult';
import { useAPIExecution } from '../context';

vi.mock('../context', () => ({
  useAPIExecution: vi.fn(),
}));

vi.mock('../../../components/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));

vi.mock('./StageHeader', () => ({
  default: ({ title }) => <div>{title}</div>,
}));

vi.mock('./AIFlowDraftDialog', () => ({
  default: () => null,
}));

vi.mock('../../../api/execution', () => ({
  apiExecutionAPI: {
    autoRepairRun: vi.fn(),
    runAllSteps: vi.fn(),
    createKnowledgeCandidate: vi.fn(),
  },
}));

const renderStepResult = (context) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  useAPIExecution.mockReturnValue({
    aiPatch: null,
    applyAiPatch: vi.fn(),
    backgroundRunId: '',
    backgroundRunStatus: '',
    cancellingRunId: '',
    cancelBackgroundRun: vi.fn(),
    generateAiRepairPatch: vi.fn(),
    handleAutoRepairRun: vi.fn(),
    loadRunIntoEditor: vi.fn(),
    loading: false,
    parsedScript: { steps: [] },
    refreshBackgroundRun: vi.fn(),
    requestConfirm: vi.fn(),
    rerunFailedSteps: vi.fn(),
    runReport: null,
    runResult: null,
    setActiveStep: vi.fn(),
    setDslText: vi.fn(),
    setLoading: vi.fn(),
    setRunReport: vi.fn(),
    setRunResult: vi.fn(),
    exportRunReport: vi.fn(),
    ...context,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StepResult />
    </QueryClientProvider>,
  );
};

describe('StepResult background run status', () => {
  it('shows running background task state and cancelling feedback', () => {
    renderStepResult({
      backgroundRunId: 'run-bg-1',
      backgroundRunStatus: 'running',
      cancellingRunId: 'run-bg-1',
      runReport: {
        run_id: 'run-bg-1',
        status: 'running',
        case_name: '后台执行 smoke',
        duration_ms: 0,
        passed: 1,
        failed: 0,
        progress_total: 3,
        progress_completed: 1,
        current_step_id: 's2',
        current_step_name: 'Step 2',
        results: [
          {
            step_id: 's1',
            name: 'Step 1',
            method: 'GET',
            url: 'http://127.0.0.1:8000/step-1',
            status: 'passed',
            status_code: 200,
            duration_ms: 5,
            assertions: [],
            extracted: {},
            request: {},
            response: {},
            diagnostics: [],
          },
        ],
      },
    });

    expect(screen.getByText(/后台任务：run-bg-1/)).toBeInTheDocument();
    expect(screen.getByText('正在执行：Step 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '取消中...' }).length).toBeGreaterThan(0);
  });
});
