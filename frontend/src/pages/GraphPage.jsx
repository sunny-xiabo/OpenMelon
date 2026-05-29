import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import EmptyState from '../components/EmptyState';
import GraphLegend from '../features/Graph/components/GraphLegend';
import GraphToolbar from '../features/Graph/components/GraphToolbar';
import NodeDetailPanel from '../features/Graph/components/NodeDetailPanel';
import {
  buildGraphRenderState,
  focusGraphNode,
} from '../features/Graph/utils/graphRendering';
import { graphAPI } from '../api/graph';

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
  const graphStateRef = useRef(null);
  const graphDataRef = useRef(null);
  const expandedClusterKeysRef = useRef(new Set());
  const renderGraphRef = useRef(null);
  const [graphEngineLoading, setGraphEngineLoading] = useState(false);
  const [graphEngineReady, setGraphEngineReady] = useState(false);

  // path query state
  const [pathMode, setPathMode] = useState(false);
  const [pathSource, setPathSource] = useState(null);
  const [pathTarget, setPathTarget] = useState(null);
  const pathModeRef = useRef(false);
  const pathSourceRef = useRef(null);
  const pathTargetRef = useRef(null);

  // filter and interaction state
  const [searchText, setSearchText] = useState('');
  const [docType, setDocType] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showChunks, setShowChunks] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);

  // TanStack Query hooks
  const { data: status, refetch: refetchStatus } = useGraphStatus();
  const { data: filters = { doc_types: [], modules: [] } } = useGraphFilters();
  const { data: legend = [] } = useNodeTypeLegend();

  const graphReady = !!status?.has_data;
  const graphParams = useMemo(() => ({ doc_type: docType, module: moduleFilter, include_chunks: showChunks }), [docType, moduleFilter, showChunks]);

  const { data: graphData, isLoading: isGraphLoading, error: graphError, refetch: refetchGraph } = useFullGraph(graphParams, graphReady && isActive);
  const { mutateAsync: getNodeDetail } = useGetNodeDetail();
  const searchEntityMutation = useSearchEntity();

  // load vis-network only when graph tab is active and data exists
  useEffect(() => {
    let cancelled = false;
    async function initNetwork() {
      if (!isActive || !graphReady || !containerRef.current || networkRef.current) return;
      setGraphEngineLoading(true);
      const [{ Network }, { DataSet }] = await Promise.all([
        import('vis-network'),
        import('vis-data'),
      ]);
      if (cancelled || !containerRef.current || networkRef.current) return;
      graphLibRef.current = { DataSet };
      const options = {
        autoResize: true,
        physics: { enabled: false },
        interaction: { hover: false, tooltipDelay: 0, zoomView: true, dragView: true, hideEdgesOnDrag: true },
        edges: { smooth: false, color: '#cbd5e1' },
      };

      const network = new Network(containerRef.current, { nodes: new DataSet([]), edges: new DataSet([]) }, options);
      networkRef.current = network;
      setGraphEngineReady(true);
      setGraphEngineLoading(false);

      network.on('click', async (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];

          // path mode: select source then target, query backend, highlight result
          if (pathModeRef.current) {
            if (!pathSourceRef.current) {
              pathSourceRef.current = nodeId;
              setPathSource(nodeId);
              network.selectNodes([nodeId]);
            } else if (!pathTargetRef.current) {
              pathTargetRef.current = nodeId;
              setPathTarget(nodeId);
              const source = pathSourceRef.current;
              try {
                const pathData = await graphAPI.getPath(source, nodeId);
                const pathNodeIds = pathData.nodes?.map((n) => n.id) || [];
                if (pathNodeIds.length > 0) {
                  network.selectNodes(pathNodeIds);
                  network.fit({ nodes: pathNodeIds, animation: true });
                }
              } catch (e) {
                console.error('Path query failed:', e);
                pathTargetRef.current = null;
                setPathTarget(null);
              }
            }
            return;
          }

          const clusterKey = graphStateRef.current?.collapsedClusterLookup?.get(nodeId);
          if (clusterKey) {
            setDetailOpen(false);
            setSelectedNode(null);
            expandedClusterKeysRef.current = new Set([...expandedClusterKeysRef.current, clusterKey]);
            renderGraphRef.current?.(graphDataRef.current);
            return;
          }
          setDetailOpen(true);
          setDetailCollapsed(false);
          try {
            const detail = await getNodeDetail(nodeId);
            setSelectedNode(detail);
          } catch (e) { console.error(e); }
        } else {
          setDetailOpen(false);
          setSelectedNode(null);
        }
      });

    }
    initNetwork().catch((error) => {
      console.error('Failed to load graph engine:', error);
      setGraphEngineReady(false);
      setGraphEngineLoading(false);
    });

    return () => {
      cancelled = true;
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
      graphLibRef.current = null;
      setGraphEngineReady(false);
      setGraphEngineLoading(false);
    };
  }, [getNodeDetail, graphReady, isActive]);

  const renderGraph = useCallback((data, focusLabel) => {
    const DataSet = graphLibRef.current?.DataSet;
    if (!networkRef.current || !networkRef.current.body || !DataSet || !data) return;

    try {
      if (graphDataRef.current !== data) {
        graphDataRef.current = data;
        expandedClusterKeysRef.current = new Set();
      }
      let graphState = buildGraphRenderState(data, legend, expandedClusterKeysRef.current);

      if (focusLabel) {
        const hiddenTarget = graphState.allNodes.find((node) => node.label === focusLabel || node.id === focusLabel || node.properties?.name === focusLabel);
        const clusterId = hiddenTarget ? graphState.nodeClusterLookup.get(hiddenTarget.id) : null;
        const clusterKey = clusterId ? graphState.collapsedClusterLookup.get(clusterId) : null;
        if (clusterKey) {
          expandedClusterKeysRef.current = new Set([...expandedClusterKeysRef.current, clusterKey]);
          graphState = buildGraphRenderState(data, legend, expandedClusterKeysRef.current);
        }
      }

      graphStateRef.current = graphState;
      networkRef.current.setOptions(graphState.options);
      networkRef.current.setData({ nodes: new DataSet(graphState.nodes), edges: new DataSet(graphState.edges) });

      if (focusLabel) {
        const target = graphState.nodes.find((node) => node.label === focusLabel || node.id === focusLabel || node.properties?.name === focusLabel);
        if (target) focusGraphNode(networkRef.current, target.id, graphState.nodeClusterLookup);
      } else {
        window.setTimeout(() => {
          networkRef.current?.fit({ animation: graphState.mode === 'full' });
        }, graphState.mode === 'full' ? 80 : 40);
      }
    } catch (e) {
      console.warn('Vis-network rendering suppressed due to internal state:', e.message);
    }
  }, [legend]);

  useEffect(() => {
    renderGraphRef.current = renderGraph;
  }, [renderGraph]);

  // re-render when graph data changes
  useEffect(() => {
    if (graphData && graphEngineReady && networkRef.current?.body) {
      renderGraph(graphData);
    }
  }, [graphData, graphEngineReady, isActive, renderGraph]);

  // ensure graph re-fetches when filter params change
  useEffect(() => {
    if (graphReady && isActive) {
      refetchGraph();
    }
  }, [graphParams, graphReady, isActive, refetchGraph]);

  const handleSearch = async () => {
    if (!searchText.trim()) return;
    try {
      const data = await searchEntityMutation.mutateAsync(searchText);
      renderGraph(data, searchText);
    } catch (e) {
      console.warn('Graph search failed:', e);
    }
  };

  const resetFilters = () => {
    setSearchText('');
    setDocType('');
    setModuleFilter('');
    setShowChunks(false);
  };

  const handleExport = useCallback(() => {
    if (!containerRef.current) return;
    const canvas = containerRef.current.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `openmelon-graph-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleTogglePathMode = useCallback(() => {
    setPathMode((prev) => {
      const next = !prev;
      pathModeRef.current = next;
      if (!next) {
        pathSourceRef.current = null;
        pathTargetRef.current = null;
        setPathSource(null);
        setPathTarget(null);
        networkRef.current?.unselectAll();
      }
      return next;
    });
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <GraphToolbar
        checkGraphStatus={refetchStatus}
        docType={docType}
        filters={filters}
        graphReady={graphReady}
        loadFullGraph={refetchGraph}
        moduleFilter={moduleFilter}
        onExport={handleExport}
        onTogglePathMode={handleTogglePathMode}
        pathMode={pathMode}
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
          {(isGraphLoading || graphEngineLoading) && (
            <Box sx={{ position: 'absolute', top: 12, left: 16, right: 16, zIndex: 12, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.86)', border: '1px solid rgba(15, 23, 42, 0.08)', overflow: 'hidden', pointerEvents: 'none' }}>
              <LinearProgress sx={{ height: 3 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.25, py: 0.75, fontWeight: 800 }}>
                图谱正在更新，画布可继续查看
              </Typography>
            </Box>
          )}

          {graphReady && (
            <Box
              ref={containerRef}
              sx={{
                flex: 1, minHeight: 0, outline: 'none',
                backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
          )}

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
