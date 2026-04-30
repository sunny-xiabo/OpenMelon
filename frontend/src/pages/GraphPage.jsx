import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
} from '@mui/material';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { graphAPI } from '../services/api';
import {
  buildNodeTypeHelpers,
  loadNodeTypeOverrides,
  mergeNodeTypeConfigs,
  NODE_TYPE_OVERRIDES_UPDATED_EVENT,
} from '../theme/nodeTypes';
import LoadingOverlay from '../components/LoadingOverlay';
import EmptyState from '../components/EmptyState';
import { GRAPH_DATA_UPDATED_EVENT } from '../features/Graph/constants';
import GraphLegend from '../features/Graph/components/GraphLegend';
import GraphToolbar from '../features/Graph/components/GraphToolbar';
import NodeDetailPanel from '../features/Graph/components/NodeDetailPanel';

export default function GraphPage({ isActive = true }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const [searchText, setSearchText] = useState('');
  const [docType, setDocType] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showChunks, setShowChunks] = useState(false);
  const [filters, setFilters] = useState({ doc_types: [], modules: [] });
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [graphReady, setGraphReady] = useState(null);
  const [nodeTypeConfigs, setNodeTypeConfigs] = useState([]);
  const [nodeTypeOverrides, setNodeTypeOverrides] = useState({});
  const { legend, getVisualMeta } = useMemo(
    () => buildNodeTypeHelpers(mergeNodeTypeConfigs(nodeTypeConfigs, nodeTypeOverrides)),
    [nodeTypeConfigs, nodeTypeOverrides],
  );

  const loadNodeTypes = async () => {
    try {
      const data = await graphAPI.getNodeTypes();
      setNodeTypeConfigs(data.node_types || []);
    } catch {
      setNodeTypeConfigs([]);
    }
  };

  useEffect(() => {
    if (containerRef.current && !networkRef.current) {
      networkRef.current = new Network(containerRef.current, { nodes: new DataSet([]), edges: new DataSet([]) }, {
        physics: { enabled: true, stabilization: { iterations: 100 } },
        interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true, dragNodes: true },
        edges: { smooth: { type: 'curvedCW', roundness: 0.2 }, color: '#ccc', font: { size: 10, align: 'top' } },
      });
      networkRef.current.on('click', async (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          setDetailOpen(true);
          setDetailCollapsed(false);
          const nodeData = networkRef.current.body.data.nodes.get(nodeId);
          if (String(nodeId).startsWith('chunk_')) {
            setSelectedNode({ id: String(nodeId), labels: ['DocumentChunk'], properties: { filename: nodeData?.label || '', title: nodeData?.title || '' } });
          } else {
            try {
              const d = await graphAPI.getNodeDetail(nodeId);
              if (d && nodeData?.title && !d.properties?.title) {
                d.properties.title = nodeData.title;
              }
              setSelectedNode(d);
            } catch (e) { console.error(e); }
          }
        } else {
          setDetailOpen(false);
          setSelectedNode(null);
        }
      });
      networkRef.current.on('stabilizationIterationsDone', () => {
        networkRef.current.setOptions({ physics: false });
        networkRef.current.fit({ animation: false });
      });
    }
  }, []);

  useEffect(() => { checkGraphStatus(); }, []);
  useEffect(() => {
    setNodeTypeOverrides(loadNodeTypeOverrides());
    loadNodeTypes();
  }, []);
  useEffect(() => {
    const handleGraphDataUpdated = () => {
      checkGraphStatus();
    };
    const handleStorage = (event) => {
      if (event.key === 'graphDataVersion') {
        checkGraphStatus();
      }
      if (event.key === 'graph-node-type-overrides') {
        setNodeTypeOverrides(loadNodeTypeOverrides());
      }
    };
    const handleNodeTypeOverridesUpdated = () => {
      setNodeTypeOverrides(loadNodeTypeOverrides());
    };
    window.addEventListener(GRAPH_DATA_UPDATED_EVENT, handleGraphDataUpdated);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(NODE_TYPE_OVERRIDES_UPDATED_EVENT, handleNodeTypeOverridesUpdated);
    return () => {
      window.removeEventListener(GRAPH_DATA_UPDATED_EVENT, handleGraphDataUpdated);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(NODE_TYPE_OVERRIDES_UPDATED_EVENT, handleNodeTypeOverridesUpdated);
    };
  }, []);

  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);
  const isFirstFilterRender = useRef(true);

  useEffect(() => {
    if (graphReady && isActive && !hasInitialLoaded) {
      setHasInitialLoaded(true);
      loadFullGraph();
    }
  }, [graphReady, isActive, hasInitialLoaded]);

  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      return;
    }
    if (graphReady && hasInitialLoaded) {
      loadFullGraph();
    }
  }, [docType, moduleFilter, showChunks]);

  const checkGraphStatus = async () => {
    setLoading(true);
    try {
      const status = await graphAPI.getStatus();
      const hasData = Boolean(status?.has_data);
      setGraphReady(hasData);
      if (hasData) {
        const graphFilters = await graphAPI.getFilters();
        setFilters(graphFilters);
        setDetailOpen(false);
        setSelectedNode(null);
      } else {
        setFilters({ doc_types: [], modules: [] });
        setSelectedNode(null);
        setDetailOpen(false);
        if (networkRef.current) {
          networkRef.current.setData({ nodes: new DataSet([]), edges: new DataSet([]) });
        }
      }
    } catch (e) {
      console.error(e);
      setGraphReady(false);
    } finally {
      setLoading(false);
    }
  };

  const loadFullGraph = async () => {
    if (!graphReady) return;
    setLoading(true);
    try {
      const d = await graphAPI.getFullGraph({ doc_type: docType, module: moduleFilter, include_chunks: showChunks });
      renderGraph(d);
    } catch (e) { console.error(e); setLoading(false); }
  };

  const resetGraph = () => {
    setSearchText('');
    setDocType('');
    setModuleFilter('');
    setShowChunks(false);
    loadFullGraph();
  };

  const searchEntity = async () => {
    if (!graphReady) return;
    if (!searchText.trim()) return;
    setLoading(true);
    try {
      const d = await graphAPI.searchEntity(searchText);
      renderGraph(d, searchText);
    } catch (e) { console.error(e); setLoading(false); }
  };

  const renderGraph = (data, focusLabel) => {
    if (!networkRef.current) return;
    const nodes = (data.nodes || []).map(n => {
      const g = n.group || n.labels?.[0] || 'Entity';
      const meta = getVisualMeta(g);
      return { id: n.id, label: n.label || n.id, group: g, color: { background: meta.color.bg, border: meta.color.border }, size: meta.size, title: n.title || n.label, font: { color: '#fff', size: 12 } };
    });
    const edges = (data.relationships || []).map((r, i) => ({ id: i, from: r.source || r.from, to: r.target || r.to, label: r.label || r.type }));
    networkRef.current.setOptions({ physics: { enabled: true, stabilization: { iterations: 100 } } });
    const onStabilized = () => {
      networkRef.current.off('stabilized', onStabilized);
      networkRef.current.setOptions({ physics: false });
      setLoading(false);
      if (focusLabel) {
        const t = nodes.find(n => n.label === focusLabel || n.id === focusLabel);
        if (t) { networkRef.current.focus(t.id, { scale: 1.2, animation: true }); return; }
      }
      networkRef.current.fit({ animation: false });
    };
    networkRef.current.on('stabilized', onStabilized);
    networkRef.current.setData({ nodes: new DataSet(nodes), edges: new DataSet(edges) });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <GraphToolbar
        checkGraphStatus={checkGraphStatus}
        docType={docType}
        filters={filters}
        graphReady={graphReady}
        loadFullGraph={loadFullGraph}
        moduleFilter={moduleFilter}
        resetGraph={resetGraph}
        searchEntity={searchEntity}
        searchText={searchText}
        setDocType={setDocType}
        setModuleFilter={setModuleFilter}
        setSearchText={setSearchText}
        setShowChunks={setShowChunks}
        showChunks={showChunks}
      />

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0 }}>
          {loading && <LoadingOverlay message="图谱数据加载中..." />}
          
          <Box
            ref={containerRef}
            sx={{
              flex: 1,
              minHeight: 0,
              outline: 'none',
              bgcolor: '#f8fafc',
              backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {graphReady === false && (
            <Box sx={{ position: 'absolute', inset: 0, p: 2, display: 'flex', zIndex: 5, bgcolor: 'rgba(248,250,252,0.9)', backdropFilter: 'blur(4px)' }}>
              <EmptyState
                title="暂无数据"
                description="Neo4j 为空，上传完成后会自动恢复，也可以手动刷新数据。"
                actionLabel="刷新数据"
                onAction={checkGraphStatus}
              />
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
