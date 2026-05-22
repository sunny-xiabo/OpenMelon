import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { APIExecutionRecommendationsPanel } from './RunHistory';
import { apiExecutionAPI } from '../../../api/execution';

vi.mock('../../../components/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));

vi.mock('../../../api/execution', () => ({
  apiExecutionAPI: {
    getRecommendations: vi.fn(),
    executeRecommendationAction: vi.fn(),
  },
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

describe('APIExecutionRecommendationsPanel', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    apiExecutionAPI.getRecommendations.mockResolvedValue({ total: 0, items: [], summary: {} });
    apiExecutionAPI.executeRecommendationAction.mockResolvedValue({ message: 'ok' });
  });

  it('renders API automation recommendation cards', async () => {
    apiExecutionAPI.getRecommendations.mockResolvedValue({
      total: 1,
      items: [{
        id: 'failed_run:auto_repair:run-1',
        title: '最近一次 API 执行失败，可尝试受控修复',
        severity: 'error',
        reason: '状态码断言失败',
        evidence: [{ label: '失败步骤', value: 1 }],
        risk_level: 'high',
        actions: [{
          id: 'open_run',
          action: 'open_run',
          label: '查看失败记录',
          target_id: 'run-1',
          frontend_only: true,
        }],
      }],
      summary: { open_count: 1 },
    });

    renderWithQueryClient(<APIExecutionRecommendationsPanel projectId="project-1" />);

    expect(await screen.findByText('最近一次 API 执行失败，可尝试受控修复')).toBeInTheDocument();
    expect(screen.getByText('失败步骤: 1')).toBeInTheDocument();
  });

  it('executes low risk recommendation actions', async () => {
    apiExecutionAPI.getRecommendations.mockResolvedValue({
      total: 1,
      items: [{
        id: 'ops:scheduled_entry',
        title: '当前 API 自动化未发现阻断项',
        severity: 'info',
        reason: '可以按需触发规格同步。',
        evidence: [],
        risk_level: 'low',
        actions: [{
          id: 'trigger_spec_sync',
          action: 'trigger_spec_sync',
          label: '同步规格 DSL',
          risk_level: 'low',
          requires_confirmation: false,
        }],
      }],
      summary: { open_count: 1 },
    });

    renderWithQueryClient(<APIExecutionRecommendationsPanel projectId="project-1" />);

    await userEvent.click(await screen.findByRole('button', { name: /同步规格 DSL/ }));

    await waitFor(() => {
      expect(apiExecutionAPI.executeRecommendationAction.mock.calls[0][0]).toEqual({
        action: 'trigger_spec_sync',
        targetId: '',
        projectId: 'project-1',
        confirm: false,
        params: {},
      });
    });
  });
});
