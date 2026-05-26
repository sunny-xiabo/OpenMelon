import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IndexGovernancePage from '../../pages/IndexGovernancePage';
import { indexGovernanceAPI as indexGovernanceAPIFromServices } from '../../services/api';
import { indexGovernanceAPI as indexGovernanceAPIFromApi } from '../../api/indexGovernance';

// Mock SnackbarProvider
vi.mock('../../components/SnackbarProvider', () => ({
  useSnackbar: () => vi.fn(),
}));

// Mock ConfirmDialog to test user confirmation flows
vi.mock('../../components/ConfirmDialog', () => ({
  default: ({ open, title, message, onConfirm, onCancel, confirmText }) => {
    if (!open) return null;
    return (
      <div data-testid="mock-confirm-dialog">
        <h4>{title}</h4>
        <p>{message}</p>
        <button onClick={onConfirm}>{confirmText || '确认'}</button>
        <button onClick={onCancel}>取消</button>
      </div>
    );
  },
}));

// Mock both API module locations to return controlled mocks
vi.mock('../../services/api', () => ({
  indexGovernanceAPI: {
    getSummary: vi.fn(),
    getAssets: vi.fn(),
    getAssetDetails: vi.fn(),
    getDiagnostics: vi.fn(),
    getRecommendations: vi.fn(),
    executeRecommendationAction: vi.fn(),
    scan: vi.fn(),
    syncStatus: vi.fn(),
    cleanupOrphans: vi.fn(),
    cleanupSourceOrphans: vi.fn(),
    rebuildQdrant: vi.fn(),
    getTasks: vi.fn(),
    cancelTask: vi.fn(),
    retryTask: vi.fn(),
  },
}));

vi.mock('../../api/indexGovernance', () => ({
  indexGovernanceAPI: {
    getRecommendations: vi.fn(),
    executeRecommendationAction: vi.fn(),
  },
}));

const mockSummary = {
  neo4j_available: true,
  qdrant_available: true,
  asset_type_count: 3,
  total_neo4j: 3200,
  total_qdrant: 3250,
  issue_count: 50,
  status: 'attention',
};

const mockAssets = {
  items: [
    {
      key: 'documents',
      name: '文档知识',
      asset_type: 'document',
      source: '文档管理 / 文档解析',
      neo4j_label: 'DocumentChunk',
      qdrant_collection: 'doc_chunks',
      business_count: 3000,
      neo4j_count: 3200,
      qdrant_count: 3250,
      active_count: 3200,
      issue_count: 50,
      missing_in_qdrant_count: 0,
      orphan_in_qdrant_count: 50,
      source_orphan_count: 0,
      missing_in_qdrant_samples: [],
      orphan_qdrant_samples: ['pt-123', 'pt-456'],
      last_sync: '实时扫描',
      status: 'attention',
    },
  ],
  total: 1,
};

const mockDiagnostics = {
  items: [
    {
      level: 'warning',
      asset_key: 'documents',
      title: '文档知识存在孤儿向量',
      detail: 'Qdrant 有 50 条 point 未匹配到 Neo4j 节点，样本：pt-123, pt-456',
      action: '清理孤儿',
    },
  ],
  total: 1,
};

const mockRecommendations = {
  items: [
    {
      id: 'documents_orphans',
      title: '清理文档孤儿数据',
      severity: 'warning',
      reason: '检测到 Qdrant 向量库中存在无关联图谱节点的孤立特征向量。',
      evidence: [{ label: '孤儿数', value: '50' }],
      actions: [
        {
          id: 'cleanup_orphans_doc',
          label: '清理文档孤儿点',
          kind: 'cleanup_orphans',
          asset_key: 'documents',
          risk: 'medium',
          requires_confirm: true,
        },
      ],
    },
  ],
  total: 1,
};

const mockAssetDetail = {
  asset: { name: '文档知识' },
  missing_in_qdrant: ['neo-uuid-1', 'neo-uuid-2'],
  orphan_in_qdrant: ['qdr-uuid-1', 'qdr-uuid-2'],
};

const renderWithQueryClient = (ui) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe('IndexGovernancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Assign mock implementations to services/api indexGovernanceAPI
    indexGovernanceAPIFromServices.getSummary.mockResolvedValue(mockSummary);
    indexGovernanceAPIFromServices.getAssets.mockResolvedValue(mockAssets);
    indexGovernanceAPIFromServices.getDiagnostics.mockResolvedValue(mockDiagnostics);
    indexGovernanceAPIFromServices.getAssetDetails.mockResolvedValue(mockAssetDetail);
    indexGovernanceAPIFromServices.getTasks.mockResolvedValue({ items: [], total: 0 });
    indexGovernanceAPIFromServices.scan.mockResolvedValue({ summary: mockSummary });
    indexGovernanceAPIFromServices.cleanupOrphans.mockResolvedValue({ message: 'Cleaned' });
    indexGovernanceAPIFromServices.rebuildQdrant.mockResolvedValue({ message: 'Rebuilt queued' });
    indexGovernanceAPIFromServices.syncStatus.mockResolvedValue({ message: 'Synced' });

    // Assign mock implementations to api/indexGovernance indexGovernanceAPI (used by recommendations panel)
    indexGovernanceAPIFromApi.getRecommendations.mockResolvedValue(mockRecommendations);
    indexGovernanceAPIFromApi.executeRecommendationAction.mockResolvedValue({ message: 'Recommendation Action Success' });
  });

  it('renders index governance base layout and metrics successfully', async () => {
    renderWithQueryClient(<IndexGovernancePage isActive={true} />);

    expect(await screen.findByText('索引治理舱')).toBeInTheDocument();
    
    // Asynchronous loading resolution via findByText (grabbing the first element since there are multiple matches in DOM)
    expect((await screen.findAllByText('3200'))[0]).toBeInTheDocument(); // Neo4j total
    expect((await screen.findAllByText('3250'))[0]).toBeInTheDocument(); // Qdrant total
    expect((await screen.findAllByText('50'))[0]).toBeInTheDocument(); // Issue count

    // Verify RAG pipeline visual markers
    expect(screen.getByText('业务数据源')).toBeInTheDocument();
    expect(screen.getByText('Neo4j 知识图谱')).toBeInTheDocument();
    expect(screen.getByText('Qdrant 向量库')).toBeInTheDocument();
    expect(screen.getByText('智能 RAG 检索')).toBeInTheDocument();
  });

  it('renders assets data table and computes health percentage capsule', async () => {
    renderWithQueryClient(<IndexGovernancePage isActive={true} />);

    expect(await screen.findByText('文档知识')).toBeInTheDocument();
    
    // Multiples handling via getAllByText
    expect(screen.getAllByText('文档管理 / 文档解析')[0]).toBeInTheDocument();
    
    // businessCount, neo4jCount, qdrantCount
    expect(screen.getByText('3000')).toBeInTheDocument();
    
    const neo4jOccurrences = await screen.findAllByText('3200');
    expect(neo4jOccurrences.length).toBeGreaterThanOrEqual(2); // One in MetricCard, one in TableCell
    
    const qdrantOccurrences = await screen.findAllByText('3250');
    expect(qdrantOccurrences.length).toBeGreaterThanOrEqual(2); // One in MetricCard, one in TableCell

    // Health percentage is computed as activeCount / Math.max(qdrantCount, neo4jCount) = 3200 / 3250 = 98.46% -> 98%
    expect((await screen.findAllByText(/98%/))[0]).toBeInTheDocument();
    
    // Shows orphan badge
    expect(screen.getAllByText('孤 50')[0]).toBeInTheDocument();
  });

  it('triggers consistency deep scan with correct mutations', async () => {
    renderWithQueryClient(<IndexGovernancePage isActive={true} />);

    // Top Header consistent scan button (first of the two, or queried using getAllByRole)
    const scanBtns = await screen.findAllByRole('button', { name: '一致性深度扫描' });
    await userEvent.click(scanBtns[0]);

    expect(indexGovernanceAPIFromServices.scan).toHaveBeenCalled();
  });

  it('opens Advice Drawer and triggers expert AI diagnostics correctly', async () => {
    renderWithQueryClient(<IndexGovernancePage isActive={true} />);

    const adviceBtns = await screen.findAllByRole('button', { name: 'AI 专家修复建议' });
    await userEvent.click(adviceBtns[0]);

    // Dialog opens showing loading state first
    expect(screen.getByText('正在评估全图一致性阻断风险...')).toBeInTheDocument();

    // After mock timer resolves (we can use waitFor)
    await waitFor(() => {
      expect(screen.queryByText('正在评估全图一致性阻断风险...')).not.toBeInTheDocument();
    }, { timeout: 2000 });

    expect(screen.getByText('AI 治理专家诊断建议')).toBeInTheDocument();
    expect(screen.getByText('核心诊断结论')).toBeInTheDocument();
    expect(screen.getAllByText('清理文档孤儿数据')[0]).toBeInTheDocument();
  });

  it('opens detailed asset difference dialog and renders dark terminal with missing UUIDs', async () => {
    renderWithQueryClient(<IndexGovernancePage isActive={true} />);

    // Click "查看资产差异" aria-labeled button in actions
    const viewDetailsBtn = await screen.findByRole('button', { name: '查看资产差异' });
    await userEvent.click(viewDetailsBtn);

    expect(indexGovernanceAPIFromServices.getAssetDetails).toHaveBeenCalledWith('documents');
    
    // Dialog details should show terminal text
    expect(await screen.findByText('图谱向量未匹配差异明细')).toBeInTheDocument();
    expect(screen.getByText('neo-uuid-1')).toBeInTheDocument();
    expect(screen.getByText('qdr-uuid-1')).toBeInTheDocument();
  });

  it('shows Confirm Dialog when initiating rebuild_qdrant and triggers callback', async () => {
    renderWithQueryClient(<IndexGovernancePage isActive={true} />);

    // Click "重建向量空间" aria-labeled button in actions
    const rebuildBtn = await screen.findByRole('button', { name: '重建向量空间' });
    await userEvent.click(rebuildBtn);

    // Verification that our mock confirm dialog is open
    expect(await screen.findByTestId('mock-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('重建 Qdrant 向量空间')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: '开始回填向量' });
    await userEvent.click(confirmBtn);

    // Assert using expect.any(Object) as secondary parameter to tolerate TanStack Query context
    expect(indexGovernanceAPIFromServices.rebuildQdrant).toHaveBeenCalledWith('documents', expect.any(Object));
    expect(screen.queryByTestId('mock-confirm-dialog')).not.toBeInTheDocument();
  });

  it('shows Confirm Dialog in recommendations panel and runs high risk actions upon double check', async () => {
    renderWithQueryClient(<IndexGovernancePage isActive={true} />);

    // Finding button containing "清理文档孤儿点" using a flexible text matcher or regex
    const recActionBtn = await screen.findByRole('button', { name: /清理文档孤儿点/ });
    await userEvent.click(recActionBtn);

    // Expect double validation to show up (Medium risk requires standard confirm title "确认执行索引治理动作")
    expect(await screen.findByTestId('mock-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText('确认执行索引治理动作')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: '清理文档孤儿点' });
    await userEvent.click(confirmBtn);

    expect(indexGovernanceAPIFromApi.executeRecommendationAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cleanup_orphans',
        assetKey: 'documents',
        confirm: true,
      }),
      expect.any(Object)
    );
  });
});
