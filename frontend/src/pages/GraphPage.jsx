import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  IconButton,
  Tooltip,
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
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

const LABELS = { name: '名称', filename: '文件名', doc_type: '文档类型', module: '模块', chunk_index: '分块序号', page: '页码', title: '标题', content: '内容' };
const GRAPH_DATA_UPDATED_EVENT = 'graph-data-updated';

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
      <Paper square elevation={0} sx={{ display: 'flex', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid rgba(226,232,240,0.8)', alignItems: 'center', flexWrap: 'wrap', background: '#ffffff', zIndex: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 2, borderRight: '1px solid', borderColor: 'divider' }}>
          <TextField
            size="small"
            placeholder="搜实体名称..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchEntity()}
            sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: 13 } }}
          />
          <Button size="small" variant="contained" onClick={searchEntity} sx={{ borderRadius: 2, boxShadow: 'none' }}>检索</Button>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select value={docType} onChange={e => setDocType(e.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
              <MenuItem value="">全部类型</MenuItem>
              {filters.doc_types?.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
              <MenuItem value="">全部模块</MenuItem>
              {filters.modules?.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControlLabel
            sx={{ mx: 1 }}
            control={<Checkbox size="small" checked={showChunks} onChange={e => setShowChunks(e.target.checked)} color="primary" />}
            label={<Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>显示分块</Typography>}
          />
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!graphReady && (
            <Button size="small" variant="outlined" onClick={checkGraphStatus} sx={{ borderRadius: 2 }}>刷新数据</Button>
          )}
          <Button size="small" variant="outlined" onClick={resetGraph} sx={{ borderRadius: 2, color: 'text.secondary', borderColor: 'divider' }}>重置</Button>
          <Button size="small" variant="contained" onClick={loadFullGraph} disabled={!graphReady} sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}>全图</Button>
        </Box>
      </Paper>

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

          <Box sx={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 1.25, p: 1.25, bgcolor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', border: '1px solid', borderColor: 'rgba(255,255,255,0.4)', borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.04)', zIndex: 10, maxWidth: 'calc(100% - 32px)' }}>
            {legend.map(({ type, color }) => (
              <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'rgba(255,255,255,0.6)', px: 1, py: 0.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color.bg, boxShadow: `0 0 0 1px ${color.border}` }} />
                <Typography variant="caption" sx={{ color: '#475569', fontWeight: 500 }}>{type}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {detailOpen && (
          detailCollapsed ? (
            <Tooltip title="展开节点详情" placement="left">
              <Box
                onClick={() => setDetailCollapsed(false)}
                sx={{
                  position: 'absolute',
                  top: 24,
                  right: 24,
                  width: 44,
                  height: 44,
                  bgcolor: 'rgba(255,255,255,0.9)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'primary.main',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  zIndex: 20,
                  transition: 'all 0.2s',
                  '&:hover': { transform: 'scale(1.05)', boxShadow: '0 6px 16px rgba(0,0,0,0.12)' },
                }}
              >
                <ChevronLeft />
              </Box>
            </Tooltip>
          ) : (
            <Paper
              elevation={0}
              sx={{
                position: 'absolute',
                top: 16,
                right: 16,
                bottom: 16,
                width: 360,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'rgba(255,255,255,0.85)',
                backdropFilter: 'blur(16px)',
                border: '1px solid',
                borderColor: 'rgba(255,255,255,0.5)',
                borderRadius: 4,
                boxShadow: '0 12px 40px rgba(15,23,42,0.08)',
                zIndex: 20,
                overflow: 'hidden',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.75, borderBottom: '1px solid rgba(226,232,240,0.6)' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>节点详情</Typography>
                <IconButton size="small" onClick={() => setDetailCollapsed(true)} sx={{ bgcolor: 'rgba(241,245,249,0.8)', '&:hover': { bgcolor: '#e2e8f0' } }}>
                  <ChevronRight fontSize="small" />
                </IconButton>
              </Box>
              <Box sx={{ flex: 1, p: 2.5, overflow: 'auto' }}>
                {selectedNode?.labels && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>类型</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500, color: '#334155' }}>{selectedNode.labels.join(', ')}</Typography>
                  </Box>
                )}
                {selectedNode?.properties && Object.entries(selectedNode.properties).map(([k, v]) => {
                  if (k === 'embedding') return null;
                  const isLong = k === 'content' || k === 'title';
                  return (
                    <Box key={k} sx={{ mb: 2 }}>
                      <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                        {LABELS[k] || k}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 0.5,
                          wordBreak: 'break-word',
                          color: '#1e293b',
                          ...(isLong && {
                            whiteSpace: 'pre-wrap',
                            bgcolor: 'rgba(248,250,252,0.6)',
                            p: 1.5,
                            borderRadius: 2,
                            border: '1px solid rgba(226,232,240,0.5)',
                            fontSize: 13,
                            lineHeight: 1.6,
                          }),
                        }}
                      >
                        {typeof v === 'string' ? v : String(v)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          )
        )}
      </Box>
    </Box>
  );
}
