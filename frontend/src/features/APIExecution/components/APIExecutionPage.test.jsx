import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import APIExecutionPage from '../../../pages/APIExecutionPage';
import { useAPIExecution } from '../context';
import { useProjectAssets } from '../hooks/useAPIExecutionQueries';

// Mock context hook and provider
vi.mock('../context', () => ({
  APIExecutionProvider: ({ children }) => <div data-testid="api-execution-provider">{children}</div>,
  useAPIExecution: vi.fn(),
}));

// Mock API query hooks
vi.mock('../hooks/useAPIExecutionQueries', () => ({
  useProjectAssets: vi.fn(),
}));

// Mock Snackbar Provider
vi.mock('../../../components/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));

// Mock sub-components
vi.mock('./StepImport', () => ({
  default: () => <div data-testid="step-import">StepImport Config</div>,
}));
vi.mock('./StepOrchestrate', () => ({
  default: () => <div data-testid="step-orchestrate">StepOrchestrate Code</div>,
}));
vi.mock('./StepResult', () => ({
  default: () => <div data-testid="step-result">StepResult Info</div>,
}));
vi.mock('./RunHistory', () => ({
  default: () => <div data-testid="run-history">RunHistory Table</div>,
}));
vi.mock('./AgentGuidancePanel', () => ({
  default: () => <div data-testid="agent-guidance">AgentGuidance Console</div>,
}));

// Mock Simple Workspace Sections and Notices
vi.mock('./SimpleWorkspace', () => ({
  WorkbenchActivityNotice: () => <div data-testid="workbench-activity-notice">WorkbenchActivityNotice</div>,
  SimpleNextActionNotice: () => <div data-testid="simple-next-action-notice">SimpleNextActionNotice</div>,
  SimplePrepareSection: ({ onOpenAdvanced, onOpenAssets }) => (
    <div data-testid="simple-prepare">
      SimplePrepareSection
      <button onClick={onOpenAdvanced}>切换到配置高级模式</button>
      <button onClick={onOpenAssets}>切换到资产高级模式</button>
    </div>
  ),
  SimpleAgentSection: ({ onNavigate, onOpenAdvanced, onOpenAssets }) => (
    <div data-testid="simple-agent">
      SimpleAgentSection
      <button onClick={() => onNavigate('orchestrate')}>简洁去执行步骤</button>
      <button onClick={onOpenAdvanced}>切换到智能高级模式</button>
      <button onClick={onOpenAssets}>切换到资产高级模式从智能</button>
    </div>
  ),
  SimpleExecutionSection: ({ onOpenAdvanced, onBackToScope }) => (
    <div data-testid="simple-execution">
      SimpleExecutionSection
      <button onClick={onOpenAdvanced}>切换到执行高级模式</button>
      <button onClick={onBackToScope}>返回简洁选择</button>
    </div>
  ),
  SimpleResultSection: ({ onOpenAdvanced, onBackToExecute }) => (
    <div data-testid="simple-result">
      SimpleResultSection
      <button onClick={onOpenAdvanced}>切换到结果高级模式</button>
    </div>
  ),
  AgentSection: () => <div data-testid="agent-section">AgentSection Console</div>,
  AssetsSection: () => <div data-testid="assets-section">AssetsSection Table</div>,
}));

const renderWithQueryClient = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe('APIExecutionPage Integration Tests', () => {
  const mockSetActiveStep = vi.fn();
  
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
    
    useProjectAssets.mockReturnValue({
      isFetched: true,
      data: {
        modules: [{ id: 'm1', name: 'User Module' }],
        interfaces: [
          { id: 'i1', name: 'Get User', status: 'active', hidden: false },
          { id: 'i2', name: 'Post User', status: 'changed', hidden: false },
        ],
      },
    });

    useAPIExecution.mockReturnValue({
      activeStep: 0,
      setActiveStep: mockSetActiveStep,
      loading: false,
      loadingMessage: '',
      dslText: '{"steps":[]}',
      runReport: null,
      runResult: null,
      projectName: 'Test Project',
      environmentName: 'Staging Env',
      baseUrl: 'https://api.test.com',
      selectedProjectId: 'proj-123',
      projects: [],
      projectsFetched: true,
      spec: {},
      parsedScript: { steps: [] },
      backgroundRunStatus: '',
    });
  });

  it('renders simple mode step section initially and supports mode switching', async () => {
    renderWithQueryClient(<APIExecutionPage />);

    // Assert simple mode title and telemetry deck
    expect(screen.getByText('API Agent 测试工作台')).toBeInTheDocument();
    expect(screen.getByText('极客遥测舱')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '简洁模式' })).toBeInTheDocument();

    // Supports switching to advanced mode
    const modeSwitchBtn = screen.getByRole('button', { name: '高级模式' });
    await userEvent.click(modeSwitchBtn);

    // Advanced tabs are now visible
    expect(screen.getByRole('tab', { name: /项目配置/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /接口资产/ })).toBeInTheDocument();
  });

  it('navigates simple step sections via simulated clicks', async () => {
    useAPIExecution.mockReturnValue({
      activeStep: 1,
      setActiveStep: mockSetActiveStep,
      loading: false,
      loadingMessage: '',
      dslText: '',
      runReport: null,
      runResult: null,
      projectName: 'Test Project',
      environmentName: 'Staging Env',
      baseUrl: 'https://api.test.com',
      selectedProjectId: 'proj-123',
      projects: [],
      projectsFetched: true,
      spec: {},
      parsedScript: { steps: [] },
      backgroundRunStatus: '',
    });

    renderWithQueryClient(<APIExecutionPage />);

    // Renders SimpleAgentSection when activeStep is 1 (Scope)
    expect(screen.getByTestId('simple-agent')).toBeInTheDocument();

    // Trigger navigate click in simple agent section
    const goExecuteBtn = screen.getByRole('button', { name: '简洁去执行步骤' });
    await userEvent.click(goExecuteBtn);

    expect(mockSetActiveStep).toHaveBeenCalledWith(2);
  });

  it('lands on interface assets by default when API automation data exists', async () => {
    useAPIExecution.mockReturnValue({
      activeStep: 0,
      setActiveStep: mockSetActiveStep,
      loading: false,
      loadingMessage: '',
      dslText: '',
      runReport: null,
      runResult: null,
      projectName: 'Test Project',
      environmentName: 'Staging Env',
      baseUrl: 'https://api.test.com',
      selectedProjectId: 'proj-123',
      projects: [{ project_id: 'proj-123', name: 'Test Project' }],
      projectsFetched: true,
      spec: {},
      parsedScript: { steps: [] },
      backgroundRunStatus: '',
    });

    renderWithQueryClient(<APIExecutionPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /接口资产/ })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('assets-section')).toBeInTheDocument();
    });
  });

  it('respects tab clicking inside advanced workspace mode', async () => {
    // Force advanced workspace mode by putting it in localStorage
    window.localStorage.setItem('api-execution:workspace-mode', 'advanced');

    renderWithQueryClient(<APIExecutionPage />);

    // Advanced tab list should render
    const orchestrateTab = screen.getByRole('tab', { name: /编排执行/ });
    await userEvent.click(orchestrateTab);

    expect(mockSetActiveStep).toHaveBeenCalledWith(2);
  });
});
