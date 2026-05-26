import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StepOrchestrate from './StepOrchestrate';
import { useAPIExecution } from '../context';

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('../context', () => ({
  useAPIExecution: vi.fn(),
}));

vi.mock('./StageHeader', () => ({
  default: ({ title, action }) => (
    <div>
      <h2>{title}</h2>
      {action}
    </div>
  ),
}));

vi.mock('./AIFlowDraftDialog', () => ({
  default: () => null,
}));

vi.mock('../../APIExecutionFlow/components/FlowWorkbench', () => ({
  default: () => <div data-testid="flow-workbench" />,
}));

const baseContext = {
  dslText: '{"steps":[]}',
  setDslText: vi.fn(),
  enhanceDslWithAi: vi.fn(),
  globalHeadersText: '',
  setGlobalHeadersText: vi.fn(),
  bearerToken: '',
  setBearerToken: vi.fn(),
  parsedScript: { steps: [{ id: 's1', name: 'Step 1', method: 'GET', path: '/one' }] },
  runStepId: 's1',
  setRunStepId: vi.fn(),
  runSelectedStep: vi.fn(),
  runAllSteps: vi.fn(),
  forceStopActiveExecution: vi.fn(),
  loading: false,
  baseUrl: 'http://127.0.0.1:8000',
  setBaseUrl: vi.fn(),
  exportPytestScript: vi.fn(),
  exportPostmanCollection: vi.fn(),
  aiPatch: null,
  applyAiPatch: vi.fn(),
  backgroundRunStatus: '',
  activeExecutionMode: '',
  aiEnhancing: false,
  runReport: null,
  disabledFlowStepIds: [],
  setDisabledFlowStepIds: vi.fn(),
  requestConfirm: vi.fn().mockResolvedValue(true),
  generateAiRepairPatch: vi.fn(),
  selectedProjectId: 'project-1',
  projectName: 'Project',
};

describe('StepOrchestrate direct execution controls', () => {
  it('allows force stopping a loading single-step execution', async () => {
    const forceStopActiveExecution = vi.fn();
    useAPIExecution.mockReturnValue({
      ...baseContext,
      forceStopActiveExecution,
      loading: true,
      activeExecutionMode: 'single',
    });

    render(<StepOrchestrate />);
    const button = screen.getByRole('button', { name: /强制结束单步/ });

    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(forceStopActiveExecution).toHaveBeenCalledTimes(1);
  });
});
