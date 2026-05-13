import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIObservabilityPanel from './AIObservabilityPanel';
import { apiExecutionAPI } from '../../../api/execution';

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

describe('AIObservabilityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiExecutionAPI.getAICallSummary.mockResolvedValue(emptySummary);
    apiExecutionAPI.listAICallLogs.mockResolvedValue({ total: 0, items: [] });
    apiExecutionAPI.getAIDebugSettings.mockResolvedValue({ enabled: false, retention_minutes: 30, max_chars: 4000 });
    apiExecutionAPI.updateAIDebugSettings.mockResolvedValue({ enabled: true, retention_minutes: 30, max_chars: 4000 });
  });

  it('renders empty observability state from mocked API data', async () => {
    render(<AIObservabilityPanel />);

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
    render(<AIObservabilityPanel />);

    await screen.findByText('暂无 AI/RAG 调用记录');
    await userEvent.click(screen.getAllByRole('button', { name: '开启调试快照' })[0]);

    expect(screen.getByText('开启 AI/RAG 调试快照')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '开启 30 分钟' }));

    await waitFor(() => {
      expect(apiExecutionAPI.updateAIDebugSettings).toHaveBeenCalledWith(expect.objectContaining({
        enabled: true,
        retention_minutes: 30,
        max_chars: 4000,
      }));
    });
  });
});
