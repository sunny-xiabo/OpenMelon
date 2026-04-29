import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Checkbox,
  FormControlLabel,
  Divider,
  useMediaQuery,
  Stack,
} from '@mui/material';
import { AutoAwesome, AccountTree, Forum } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { chatAPI, graphAPI, webhookAPI } from '../services/api';
import { useSession } from '../hooks/useSession';
import { useSnackbar } from '../components/SnackbarProvider';
import {
  buildNodeTypeHelpers,
  loadNodeTypeOverrides,
  mergeNodeTypeConfigs,
  NODE_TYPE_OVERRIDES_UPDATED_EVENT,
} from '../theme/nodeTypes';
import EmptyState from '../components/EmptyState';
import { GRAPH_DATA_UPDATED_EVENT } from '../features/QA/constants';
import SessionHistoryPanel from '../features/QA/components/SessionHistoryPanel';
import MessageBubble from '../features/QA/components/MessageBubble';
import GraphInsightPanel from '../features/QA/components/GraphInsightPanel';

export default function QAPage() {
  const { sessions, currentSession, createSession, switchSession, deleteSession, renameSession, updateSessionTitle, loadHistory, loadSessions } = useSession();
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
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, sessionId: null, title: '' });
  const [editingSession, setEditingSession] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [sessionListExpanded, setSessionListExpanded] = useState(true);
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
    const q = input.trim();
    // Auto-create session if none
    let sid = currentSession;
    if (!sid) {
      sid = createSession();
    }
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    // Optimistically update session title from first message
    updateSessionTitle(sid, q.slice(0, 50));
    setInput(''); setLoading(true);
    try {
      const r = await chatAPI.query(q, sid, includeHistory);
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
  const handleDeleteSession = (sid, title) => {
    setDeleteConfirm({ open: true, sessionId: sid, title: title || sid.slice(0, 8) });
  };
  const confirmDeleteSession = async () => {
    const { sessionId } = deleteConfirm;
    setDeleteConfirm({ open: false, sessionId: null, title: '' });
    await deleteSession(sessionId);
    if (currentSession === sessionId) setMessages([]);
    showSnackbar('会话已删除', 'success');
  };
  const handleStartRename = (sid, currentTitle) => {
    setEditingSession(sid);
    setEditTitle(currentTitle);
  };
  const handleSaveRename = async () => {
    if (editingSession && editTitle.trim()) {
      await renameSession(editingSession, editTitle.trim());
    }
    setEditingSession(null);
    setEditTitle('');
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

        <SessionHistoryPanel
          currentSession={currentSession}
          deleteConfirm={deleteConfirm}
          editTitle={editTitle}
          editingSession={editingSession}
          handleDeleteSession={handleDeleteSession}
          handleNewSession={handleNewSession}
          handleSaveRename={handleSaveRename}
          handleStartRename={handleStartRename}
          handleSwitchSession={handleSwitchSession}
          sessions={sessions}
          sessionListExpanded={sessionListExpanded}
          setDeleteConfirm={setDeleteConfirm}
          setEditTitle={setEditTitle}
          setEditingSession={setEditingSession}
          setSessionListExpanded={setSessionListExpanded}
          confirmDeleteSession={confirmDeleteSession}
        />

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: { xs: 1.25, md: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5, bgcolor: '#f8fafc' }}>
          {messages.length === 0 ? (
            <EmptyState
              title="开始提问吧"
              description="可以直接问模块功能、设计思路、覆盖关系或上下文追问。"
              compact
            />
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} onPush={handlePushToWecom} />
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
        <GraphInsightPanel
          checkGraphStatus={checkGraphStatus}
          containerRef={containerRef}
          docType={docType}
          filters={filters}
          graphLoading={graphLoading}
          graphReady={graphReady}
          isNarrow={isNarrow}
          legend={legend}
          loadFullGraph={loadFullGraph}
          moduleFilter={moduleFilter}
          searchEntity={searchEntity}
          searchText={searchText}
          setDocType={setDocType}
          setModuleFilter={setModuleFilter}
          setSearchText={setSearchText}
          setShowChunks={setShowChunks}
          showChunks={showChunks}
        />
      )}
    </Box>
  );
}
