import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AIObservabilityPanel from './AIObservabilityPanel';
import { apiExecutionAPI } from '../../../api/execution';
import { indexGovernanceAPI } from '../../../api/indexGovernance';

vi.mock('../../../components/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));

vi.mock('../../../api/execution', () => ({
  apiExecutionAPI: {
    getAICallSummary: vi.fn(),
    listAICallLogs: vi.fn(),
    getAIDebugSettings: vi.fn(),
    updateAIDebugSettings: vi.fn(),
    getAIDebugSnapshot: vi.fn(),
  },
}));

vi.mock('../../../api/indexGovernance', () => ({
  indexGovernanceAPI: {
    getRecommendations: vi.fn(),
    executeRecommendationAction: vi.fn(),
  },
}));

const emptySummary = {
  total: 0,
  failed_count: 0,
  degraded_count: 0,
  avg_latency_ms: 0,
  prompt_chars: 0,
  response_chars: 0,
  input_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
  model_counts: [],
  feature_counts: [],
  failure_reason_counts: [],
};

const renderWithQueryClient = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe('AIObservabilityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiExecutionAPI.getAICallSummary.mockResolvedValue(emptySummary);
    apiExecutionAPI.listAICallLogs.mockResolvedValue({ total: 0, items: [] });
    apiExecutionAPI.getAIDebugSettings.mockResolvedValue({ enabled: false, retention_minutes: 30, max_chars: 4000 });
    apiExecutionAPI.updateAIDebugSettings.mockResolvedValue({ enabled: true, retention_minutes: 30, max_chars: 4000 });
    indexGovernanceAPI.getRecommendations.mockResolvedValue({ total: 0, items: [], summary: {} });
    indexGovernanceAPI.executeRecommendationAction.mockResolvedValue({ message: 'ok' });
  });

  it('renders empty observability state from mocked API data', async () => {
    renderWithQueryClient(<AIObservabilityPanel />);

    expect(await screen.findByText('AI/RAG 调用观测')).toBeInTheDocument();
    expect(await screen.findByText('暂无 AI/RAG 调用记录')).toBeInTheDocument();
    expect(apiExecutionAPI.getAICallSummary).toHaveBeenCalledWith(expect.objectContaining({
      feature: '',
      status: '',
      degraded: '',
      keyword: '',
    }));
  });

  it('requires confirmation before enabling debug snapshots', async () => {
    renderWithQueryClient(<AIObservabilityPanel />);

    await screen.findByText('暂无 AI/RAG 调用记录');
    await userEvent.click(screen.getAllByRole('button', { name: '开启调试快照' })[0]);

    expect(screen.getByText('开启 AI/RAG 调试快照')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '确认' }));

    await waitFor(() => {
      expect(apiExecutionAPI.updateAIDebugSettings).toHaveBeenCalledWith(expect.objectContaining({
        enabled: true,
        retention_minutes: 30,
        max_chars: 4000,
      }));
    });
  });

  it('renders RAG governance recommendations and executes low risk action', async () => {
    indexGovernanceAPI.getRecommendations.mockResolvedValue({
      total: 1,
      items: [{
        id: 'rag_stability:index_scan',
        title: 'RAG 失败或降级率升高',
        severity: 'error',
        reason: '近期 RAG 调用出现失败/降级，建议先复查索引一致性。',
        evidence: [{ label: '失败率', value: '20.0%' }],
        actions: [{ id: 'scan_index', label: '扫描索引一致性', kind: 'scan_index', risk: 'low', requires_confirm: false }],
      }],
      summary: { open_count: 1 },
    });

    renderWithQueryClient(<AIObservabilityPanel />);

    expect(await screen.findByText('RAG 失败或降级率升高')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /扫描索引一致性/ }));

    await waitFor(() => {
      expect(indexGovernanceAPI.executeRecommendationAction).toHaveBeenCalled();
      expect(indexGovernanceAPI.executeRecommendationAction.mock.calls[0][0]).toEqual({
        action: 'scan_index',
        assetKey: '',
        confirm: false,
      });
    });
  });
});
