import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Chip,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Collapse,
  Divider,
  useMediaQuery,
  Stack,
} from '@mui/material';
import { AutoAwesome, Add, AccountTree, Forum } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatAPI, graphAPI, webhookAPI } from '../services/api';
import { useSession } from '../hooks/useSession';
import { useSnackbar } from '../components/SnackbarProvider';
import {
  buildNodeTypeHelpers,
  loadNodeTypeOverrides,
  mergeNodeTypeConfigs,
  NODE_TYPE_OVERRIDES_UPDATED_EVENT,
} from '../theme/nodeTypes';
import LoadingOverlay from '../components/LoadingOverlay';
import EmptyState from '../components/EmptyState';

const METHOD_LABELS = {
  graph: 'Graph',
  vector: 'Vector',
  hybrid: 'Hybrid',
  visualization: 'Visualization',
};
const GRAPH_DATA_UPDATED_EVENT = 'graph-data-updated';

export default function QAPage() {
  const { sessions, currentSession, createSession, switchSession, deleteSession, loadHistory } = useSession();
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const showSnackbar = useSnackbar();

  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const [searchText, setSearchText] = useState('');
  const [docType, setDocType] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showChunks, setShowChunks] = useState(false);
  const [filters, setFilters] = useState({ doc_types: [], modules: [] });
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [graphReady, setGraphReady] = useState(null);
  const [nodeTypeConfigs, setNodeTypeConfigs] = useState([]);
  const [nodeTypeOverrides, setNodeTypeOverrides] = useState({});
  const { legend, getVisualMeta } = useMemo(
    () => buildNodeTypeHelpers(mergeNodeTypeConfigs(nodeTypeConfigs, nodeTypeOverrides)),
    [nodeTypeConfigs, nodeTypeOverrides],
  );

  const scrollDown = () => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  useEffect(() => {
    if (containerRef.current && !networkRef.current) {
      networkRef.current = new Network(containerRef.current, { nodes: new DataSet([]), edges: new DataSet([]) }, {
        physics: { enabled: true, stabilization: { iterations: 100 } },
        interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true, dragNodes: true },
        edges: { smooth: { type: 'curvedCW', roundness: 0.2 }, color: '#ccc', font: { size: 10, align: 'top' } },
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
    graphAPI.getNodeTypes()
      .then((data) => setNodeTypeConfigs(data.node_types || []))
      .catch(() => setNodeTypeConfigs([]));
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

  useEffect(() => {
    if (networkRef.current && graphReady) loadFullGraph();
  }, [docType, moduleFilter, showChunks, graphReady]);

  useEffect(() => {
    if (!graphExpanded || !networkRef.current || !graphReady) return;

    const timer = window.setTimeout(() => {
      networkRef.current?.redraw();
      networkRef.current?.fit({ animation: false });
      loadFullGraph();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [graphExpanded, graphReady]);

  const checkGraphStatus = async () => {
    setGraphLoading(true);
    try {
      const status = await graphAPI.getStatus();
      const hasData = Boolean(status?.has_data);
      setGraphReady(hasData);
      if (hasData) {
        const graphFilters = await graphAPI.getFilters();
        setFilters(graphFilters);
      } else {
        setFilters({ doc_types: [], modules: [] });
        if (networkRef.current) {
          networkRef.current.setData({ nodes: new DataSet([]), edges: new DataSet([]) });
        }
      }
    } catch (err) {
      console.error(err);
      setGraphReady(false);
    } finally {
      setGraphLoading(false);
    }
  };

  const loadFullGraph = async () => {
    if (!graphReady) return;
    setGraphLoading(true);
    try {
      const data = await graphAPI.getFullGraph({ doc_type: docType, module: moduleFilter, include_chunks: showChunks });
      renderGraph(data);
    } catch (err) { console.error(err); setGraphLoading(false); }
  };

  const searchEntity = async () => {
    if (!graphReady) return;
    if (!searchText.trim()) return;
    setGraphLoading(true);
    try {
      const data = await graphAPI.searchEntity(searchText);
      renderGraph(data, searchText);
    } catch (err) { console.error(err); setGraphLoading(false); }
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
      setGraphLoading(false);
      if (focusLabel) {
        const t = nodes.find(n => n.label === focusLabel || n.id === focusLabel);
        if (t) { networkRef.current.focus(t.id, { scale: 1.2, animation: true }); return; }
      }
      networkRef.current.fit({ animation: false });
    };
    networkRef.current.on('stabilized', onStabilized);
    networkRef.current.setData({ nodes: new DataSet(nodes), edges: new DataSet(edges) });
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    const q = input; setInput(''); setLoading(true);
    try {
      const r = await chatAPI.query(q, currentSession, includeHistory);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: r.answer,
        citations: r.citations,
        retrieval_method: r.retrieval_method,
        reasoning_steps: r.reasoning_steps,
        context_chunks: r.context_chunks,
        history_used: r.history_used,
      }]);
      if (r.graph_data?.nodes?.length > 0) renderGraph(r.graph_data);
      scrollDown();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: '请求失败: ' + err.message }]);
      showSnackbar('查询失败: ' + err.message, 'error');
    } finally { setLoading(false); }
  };

  const handleNewSession = () => { createSession(); setMessages([]); };
  const handleSwitchSession = async (sid) => {
    switchSession(sid);
    const h = await loadHistory(sid);
    setMessages(h.map(m => ({ role: m.role, content: m.content })));
  };

  const handlePushToWecom = async (answer) => {
    const question = messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.indexOf(messages.find(m => m.role === 'assistant' && m.content === answer)))?.content || '';
    try {
      await webhookAPI.send('wecom', question, answer);
      showSnackbar('已推送到企微', 'success');
    } catch (err) {
      showSnackbar('推送失败: ' + err.message, 'error');
    }
  };

  return (
    <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', p: { xs: 1, md: 1.5 }, gap: 1.5, bgcolor: 'background.default', flexDirection: isNarrow ? 'column' : 'row' }}>
      <Paper
        elevation={0}
        sx={{
          width: isNarrow ? '100%' : (graphExpanded ? '58%' : '100%'),
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 3,
          overflow: 'hidden',
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcff 100%)',
          transition: 'width 0.2s ease',
        }}
      >
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: '1px solid', borderColor: 'divider', background: 'linear-gradient(90deg, rgba(59,130,246,0.06) 0%, rgba(99,102,241,0.04) 100%)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ width: 38, height: 38, borderRadius: '10px', background: 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.7), 0 4px 8px rgba(99,102,241,0.1)' }}>
                <Forum fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b' }}>智能问答</Typography>
                <Typography variant="caption" sx={{ color: '#64748b' }}>在检索上下文中提问，右侧可同步查看图谱线索</Typography>
              </Box>
            </Box>
            <Button size="small" variant="outlined" startIcon={graphExpanded ? <AccountTree fontSize="small" /> : <Forum fontSize="small" />} onClick={() => setGraphExpanded(!graphExpanded)}>
              {graphExpanded ? '收起图谱' : '展开图谱'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary">历史会话</Typography>
            <Button size="small" startIcon={<Add fontSize="small" />} onClick={handleNewSession}>新建会话</Button>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', pb: 0.25 }}>
            {sessions.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ py: 0.5 }}>
                暂无历史会话
              </Typography>
            ) : (
              sessions.map(sid => (
                <Chip
                  key={sid}
                  label={sid}
                  onClick={() => handleSwitchSession(sid)}
                  onDelete={() => deleteSession(sid)}
                  color={sid === currentSession ? 'primary' : 'default'}
                  variant={sid === currentSession ? 'filled' : 'outlined'}
                  size="small"
                  sx={{ borderRadius: 2, maxWidth: 140, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                />
              ))
            )}
          </Stack>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: { xs: 1.25, md: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: '#f8fafc' }}>
          {messages.length === 0 ? (
            <EmptyState
              title="开始提问吧"
              description="可以直接问模块功能、设计思路、覆盖关系或上下文追问。"
              compact
            />
          ) : (
            messages.map((msg, i) => (
              <MsgBubble key={i} msg={msg} onPush={handlePushToWecom} />
            ))
          )}
          {loading && (
            <Box sx={{ display: 'flex', gap: 0.5, p: 1, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <Box key={i} sx={{
                  width: 7,
                  height: 7,
                  bgcolor: 'primary.main',
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out both',
                  animationDelay: `${-0.32 + i * 0.16}s`,
                }} />
              ))}
            </Box>
          )}
          <div ref={messagesEndRef} />
        </Box>

        <Divider />
        <Box sx={{ p: { xs: 1.25, md: 1.5 }, bgcolor: 'common.white' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                <TextField
                  multiline
                  minRows={2}
                  maxRows={5}
                  fullWidth
                  size="small"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="你想了解什么？..."
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 3,
                      fontSize: 13.5,
                      bgcolor: '#ffffff',
                      boxShadow: 'inset 0 2px 6px rgba(15,23,42,0.02)',
                      transition: 'all 0.2s',
                      '&.Mui-focused': {
                        bgcolor: '#ffffff',
                        boxShadow: '0 0 0 3px rgba(99,102,241,0.15)',
                      }
                    },
                  }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#6366f1' } }} />}
                    label={<Typography variant="caption" color="text.secondary">带上历史上下文</Typography>}
                    sx={{ ml: 0.25 }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>Enter 发送，Shift + Enter 换行</Typography>
                    <Button
                      variant="contained"
                      onClick={sendMessage}
                      disabled={loading || !input.trim()}
                      sx={{ 
                        minWidth: 92, 
                        minHeight: 38, 
                        borderRadius: 2.5,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                        boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
                        fontWeight: 600,
                        '&:hover': {
                          background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                          boxShadow: '0 6px 16px rgba(99,102,241,0.3)',
                        },
                        '&.Mui-disabled': {
                          background: '#e2e8f0',
                          color: '#94a3b8',
                          boxShadow: 'none'
                        }
                      }}
                    >
                      发送
                    </Button>
                  </Box>
                </Box>
            </Box>
          </Box>
        </Box>
      </Paper>

      {graphExpanded && (
        <Paper
          elevation={0}
          sx={{
            width: isNarrow ? '100%' : '42%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            overflow: 'hidden',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(226,232,240,0.8)', background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 34, height: 34, borderRadius: 2, background: 'linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.7), 0 4px 8px rgba(6,182,212,0.1)' }}>
                <AccountTree fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b' }}>图谱线索</Typography>
                <Typography variant="caption" sx={{ color: '#64748b' }}>辅助定位模块、节点关系和检索命中文档</Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ p: 1.25, borderBottom: '1px solid rgba(226,232,240,0.8)', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 1, zIndex: 2 }}>
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                placeholder="搜索实体..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchEntity()}
                sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: 13 } }}
              />
              <Button size="small" variant="contained" onClick={searchEntity} disabled={!graphReady || !searchText.trim()} sx={{ borderRadius: 2, boxShadow: 'none' }}>
                搜索
              </Button>
              <Button size="small" variant="outlined" onClick={loadFullGraph} disabled={!graphReady} sx={{ borderRadius: 2 }}>全图</Button>
              {!graphReady && (
                <Button size="small" variant="outlined" onClick={checkGraphStatus} sx={{ borderRadius: 2 }}>刷新数据</Button>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 110, flex: '0 0 auto' }}>
                <Select value={docType} onChange={e => setDocType(e.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
                  <MenuItem value="">全部类型</MenuItem>
                  {filters.doc_types?.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 110, flex: '0 0 auto' }}>
                <Select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
                  <MenuItem value="">全部模块</MenuItem>
                  {filters.modules?.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControlLabel
                control={<Checkbox size="small" checked={showChunks} onChange={e => setShowChunks(e.target.checked)} color="info" />}
                label={<Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>显示分块</Typography>}
                sx={{ ml: 0.25 }}
              />
            </Box>
          </Box>

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0, overflow: 'hidden' }}>
            {graphLoading && <LoadingOverlay message="图谱数据加载中..." />}
            {graphReady === false ? (
              <Box sx={{ m: 1, flex: 1, minHeight: 0, display: 'flex' }}>
                <EmptyState
                  title="暂无数据"
                  description="Neo4j 为空，上传完成后会自动恢复，也可以手动刷新数据。"
                  actionLabel="刷新数据"
                  onAction={checkGraphStatus}
                />
              </Box>
            ) : (
              <Box ref={containerRef} sx={{ flex: 1, minHeight: 0, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', outline: 'none', bgcolor: '#f8fafc', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
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
        </Paper>
      )}
    </Box>
  );
}

function MsgBubble({ msg, onPush }) {
  const [expanded, setExpanded] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);

  if (msg.role === 'user') {
    return (
      <Box sx={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', color: 'primary.contrastText', borderRadius: '20px 20px 4px 20px', px: 2, py: 1.4, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}>
        {msg.content}
      </Box>
    );
  }
  if (msg.role === 'error') {
    return (
      <Box sx={{ alignSelf: 'flex-start', maxWidth: '78%', bgcolor: '#fdecea', color: 'error.dark', borderRadius: 2.5, borderBottomLeftRadius: 0.75, px: 1.4, py: 1.15, fontSize: 13, lineHeight: 1.6 }}>
        {msg.content}
      </Box>
    );
  }
  return (
    <Box sx={{ alignSelf: 'flex-start', maxWidth: '80%', bgcolor: '#ffffff', borderRadius: '20px 20px 20px 4px', px: 2.25, py: 1.5, fontSize: 13.5, lineHeight: 1.6, boxShadow: '0 12px 32px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.02)', border: '1px solid rgba(226,232,240,0.6)' }}>
      <Box className="chat-markdown" sx={{ '& p': { m: '0 0 0.5em' }, '& p:last-child': { mb: 0 }, '& img': { maxWidth: '100%', height: 'auto', borderRadius: 2 }, fontSize: 13, lineHeight: 1.65, wordBreak: 'break-word' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
      </Box>
      <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {msg.retrieval_method && METHOD_LABELS[msg.retrieval_method] && (
          <Chip size="small" label={METHOD_LABELS[msg.retrieval_method]} sx={{ fontSize: 10 }} />
        )}
        {msg.citations?.length > 0 && (
          msg.citations.map((c, i) => (
            <Chip key={i} size="small" label={c.source_type === 'vector' ? `Vector: ${c.filename || ''}` : 'Graph'} color={c.source_type === 'vector' ? 'primary' : 'success'} sx={{ fontSize: 10 }} />
          ))
        )}
      </Box>
      {msg.reasoning_steps?.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Button size="small" onClick={() => setExpanded(!expanded)} sx={{ fontSize: 11, p: 0, minWidth: 'auto' }}>
            {expanded ? '收起推理步骤' : '展开推理步骤'}
          </Button>
          {expanded && (
            <Box sx={{ pl: 1.25, borderLeft: '2px solid', borderColor: 'divider', mt: 0.5 }}>
              {msg.reasoning_steps.map((s, i) => (
                <Typography key={i} variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                  {i + 1}. {s}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      )}
      {(msg.context_chunks?.length > 0 || msg.history_used?.length > 0) && (
        <Box sx={{ mt: 0.75 }}>
          <Button size="small" onClick={() => setContextExpanded(!contextExpanded)} sx={{ fontSize: 11, p: 0, minWidth: 'auto' }}>
            {contextExpanded ? '收起上下文' : '查看上下文'}
          </Button>
          <Collapse in={contextExpanded}>
            {msg.history_used?.length > 0 && (
              <Box sx={{ mt: 0.75, p: 1, bgcolor: 'common.white', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  会话上下文
                </Typography>
                {msg.history_used.map((item, i) => (
                  <Typography key={i} variant="caption" sx={{ display: 'block', mb: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <strong>{item.role === 'user' ? '用户' : '助手'}:</strong> {item.content}
                  </Typography>
                ))}
              </Box>
            )}
            {msg.context_chunks?.length > 0 && (
              <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {msg.context_chunks.map((chunk, i) => (
                  <Box key={i} sx={{ p: 1, bgcolor: 'common.white', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      {chunk.source_type === 'graph'
                        ? '图谱上下文'
                        : `${chunk.doc_type || 'unknown'} / ${chunk.filename || 'unknown'} / chunk ${chunk.chunk_index ?? '?'}`}
                    </Typography>
                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {chunk.content}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Collapse>
        </Box>
      )}
      <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
        <Button size="small" variant="outlined" onClick={() => onPush && onPush(msg.content)}>
          推送到企微
        </Button>
      </Box>
    </Box>
  );
}
