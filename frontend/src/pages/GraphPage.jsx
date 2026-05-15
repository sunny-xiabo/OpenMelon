import { useState, useEffect, useRef, useMemo } from 'react';
import { Box } from '@mui/material';
import LoadingOverlay from '../components/LoadingOverlay';
import EmptyState from '../components/EmptyState';
import GraphLegend from '../features/Graph/components/GraphLegend';
import GraphToolbar from '../features/Graph/components/GraphToolbar';
import NodeDetailPanel from '../features/Graph/components/NodeDetailPanel';

// Hooks
import { 
  useGraphStatus, 
  useGraphFilters, 
  useFullGraph, 
  useGetNodeDetail, 
  useSearchEntity 
} from '../features/Graph/hooks/useGraph';
import { useNodeTypeLegend } from '../features/NodeType/hooks/useNodeTypes';

export default function GraphPage({ isActive = true }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const graphLibRef = useRef(null);
  const [graphEngineLoading, setGraphEngineLoading] = useState(false);
  
  // 筛选与交互状态
  const [searchText, setSearchText] = useState('');
  const [docType, setDocType] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showChunks, setShowChunks] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);

  // 使用 TanStack Query
  const { data: status, refetch: refetchStatus } = useGraphStatus();
  const { data: filters = { doc_types: [], modules: [] } } = useGraphFilters();
  const { data: legend = [] } = useNodeTypeLegend();
  
  const graphReady = !!status?.has_data;
  const graphParams = useMemo(() => ({ doc_type: docType, module: moduleFilter, include_chunks: showChunks }), [docType, moduleFilter, showChunks]);
  
  const { data: graphData, isLoading: isGraphLoading, error: graphError, refetch: refetchGraph } = useFullGraph(graphParams, graphReady && isActive);
  const getNodeDetailMutation = useGetNodeDetail();
  const searchEntityMutation = useSearchEntity();

  // 初始化 vis-network
  useEffect(() => {
    let cancelled = false;
    async function initNetwork() {
      if (!containerRef.current || networkRef.current) return;
      setGraphEngineLoading(true);
      const [{ Network }, { DataSet }] = await Promise.all([
        import('vis-network'),
        import('vis-data'),
      ]);
      if (cancelled || !containerRef.current || networkRef.current) return;
      graphLibRef.current = { DataSet };
      const options = {
        physics: { enabled: true, stabilization: { iterations: 100 } },
        interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true },
        edges: { smooth: { type: 'curvedCW', roundness: 0.2 }, color: '#cbd5e1' },
      };
      
      const network = new Network(containerRef.current, { nodes: new DataSet([]), edges: new DataSet([]) }, options);
      networkRef.current = network;
      setGraphEngineLoading(false);

      network.on('click', async (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          setDetailOpen(true);
          setDetailCollapsed(false);
          try {
            const detail = await getNodeDetailMutation.mutateAsync(nodeId);
            setSelectedNode(detail);
          } catch (e) { console.error(e); }
        } else {
          setDetailOpen(false);
          setSelectedNode(null);
        }
      });

      network.on('stabilizationIterationsDone', () => {
        network.setOptions({ physics: { enabled: false } });
        network.fit();
      });
    }
    initNetwork().catch((error) => {
      console.error('Failed to load graph engine:', error);
      setGraphEngineLoading(false);
    });
    
    return () => {
      cancelled = true;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, []);

  // 渲染图谱逻辑 (增加健壮性检查)
  const renderGraph = (data, focusLabel) => {
    // 关键修复：检查 Network 实例及其内部渲染体是否存在
    const DataSet = graphLibRef.current?.DataSet;
    if (!networkRef.current || !networkRef.current.body || !DataSet || !data) return;
    
    try {
      const nodes = (data.nodes || []).map(n => {
        const g = n.group || n.labels?.[0] || 'Entity';
        const visual = legend.find(l => l.type === g) || { color: { bg: '#94a3b8', border: '#64748b' }, size: 20 };
        return { 
          id: n.id, 
          label: n.label || n.id, 
          group: g, 
          color: { background: visual.color.bg, border: visual.color.border }, 
          size: visual.size,
          font: { color: '#fff', size: 12 } 
        };
      });
      const edges = (data.relationships || []).map((r, i) => ({ 
        id: i, from: r.source || r.from, to: r.target || r.to, label: r.label || r.type 
      }));

      // 静默设置数据，防止触发未初始化的 unselectAll
      networkRef.current.setData({ nodes: new DataSet(nodes), edges: new DataSet(edges) });
      
      if (focusLabel) {
        const target = nodes.find(n => n.label === focusLabel);
        if (target) networkRef.current.focus(target.id, { scale: 1.2, animation: true });
      }
    } catch (e) {
      console.warn('Vis-network rendering suppressed due to internal state:', e.message);
    }
  };

  // 数据变化时重新渲染
  useEffect(() => {
    // 只有当元数据和图谱数据都就绪，且渲染引擎 body 存在时才渲染
    if (graphData && legend.length > 0 && networkRef.current?.body) {
      renderGraph(graphData);
    }
  }, [graphData, legend, isActive]);

  const handleSearch = async () => {
    if (!searchText.trim()) return;
    try {
      const data = await searchEntityMutation.mutateAsync(searchText);
      renderGraph(data, searchText);
    } catch (e) {}
  };

  const resetFilters = () => {
    setSearchText('');
    setDocType('');
    setModuleFilter('');
    setShowChunks(false);
    refetchGraph();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <GraphToolbar
        checkGraphStatus={refetchStatus}
        docType={docType}
        filters={filters}
        graphReady={graphReady}
        loadFullGraph={refetchGraph}
        moduleFilter={moduleFilter}
        resetGraph={resetFilters}
        searchEntity={handleSearch}
        searchText={searchText}
        setDocType={setDocType}
        setModuleFilter={setModuleFilter}
        setSearchText={setSearchText}
        setShowChunks={setShowChunks}
        showChunks={showChunks}
      />

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {(isGraphLoading || graphEngineLoading) && <LoadingOverlay message="图谱计算中..." />}
          
          <Box
            ref={containerRef}
            sx={{
              flex: 1, minHeight: 0, outline: 'none',
              backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          {graphError && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 10, bgcolor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(4px)' }}>
              <EmptyState variant="error" title="图谱加载失败" description={graphError.message} onAction={refetchGraph} />
            </Box>
          )}

          {!graphError && graphReady === false && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 10, bgcolor: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(4px)' }}>
              <EmptyState title="暂无图谱数据" description="请先在问答或导入中心产生数据。" actionLabel="刷新状态" onAction={refetchStatus} />
            </Box>
          )}

          <GraphLegend legend={legend} />
        </Box>

        {detailOpen && (
          <NodeDetailPanel
            collapsed={detailCollapsed}
            selectedNode={selectedNode}
            setCollapsed={setDetailCollapsed}
          />
        )}
      </Box>
    </Box>
  );
}
