import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Checkbox,
  FormControlLabel,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { graphAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

// Hooks
import { 
  useSessions, 
  useChatHistory, 
  useGraphStatus, 
  useChatQuery, 
  useSessionActions 
} from '../features/QA/hooks/useQA';
import { useGraphFilters } from '../features/Graph/hooks/useGraph';
import { useNodeTypeLegend } from '../features/NodeType/hooks/useNodeTypes';

// Components
import SessionHistoryPanel from '../features/QA/components/SessionHistoryPanel';
import MessageBubble from '../features/QA/components/MessageBubble';
import GraphInsightPanel from '../features/QA/components/GraphInsightPanel';

export default function QAPage({ isActive = true }) {
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  
  // 1. UI 交互状态 (找回被遗漏的状态)
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [sessionListExpanded, setSessionListExpanded] = useState(true);
  
  // 对话框/编辑状态
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, sessionId: null, title: '' });
  const [editingSession, setEditingSession] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  // 图谱筛选状态
  const [searchText, setSearchText] = useState('');
  const [docType, setDocType] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showChunks, setShowChunks] = useState(false);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState(null);
  const [graphEngineReady, setGraphEngineReady] = useState(false);

  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const graphLibRef = useRef(null);
  const initialGraphLoadedRef = useRef(false);
  const scrollRef = useRef(null);

  // 2. 使用 TanStack Query Hooks
  const { data: sessions = [] } = useSessions();
  const { data: history = [] } = useChatHistory(currentSessionId);
  const { data: status, refetch: refetchGraphStatus } = useGraphStatus();
  const { data: filters = { doc_types: [], modules: [] } } = useGraphFilters();
  const { data: legend = [] } = useNodeTypeLegend();
  
  const chatMutation = useChatQuery();
  const { deleteSession, renameSession } = useSessionActions();

  const graphReady = !!status?.has_data;

  // 3. 核心逻辑处理
  const scrollDown = () => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  // 同步历史记录到消息列表
  useEffect(() => {
    if (history.length > 0) {
      setMessages(history.map(m => ({ 
        role: m.role, 
        content: m.content, 
        citations: m.citations || [] 
      })));
      scrollDown();
    } else {
      setMessages([]);
    }
  }, [history]);

  const renderGraph = useCallback((data) => {
    const DataSet = graphLibRef.current?.DataSet;
    if (!networkRef.current?.body || !DataSet || !data) return false;
    try {
      const nodes = (data.nodes || []).map(n => {
        const g = n.group || n.labels?.[0] || 'Entity';
        const visual = legend.find(l => l.type === g) || { color: { bg: '#94a3b8', border: '#64748b' }, size: 20 };
        return { 
          id: n.id, label: n.label || n.id, group: g, 
          color: { background: visual.color.bg, border: visual.color.border }, 
          size: visual.size, font: { color: '#fff', size: 11 } 
        };
      });
      const edges = (data.relationships || []).map((r, i) => ({ 
        id: i, from: r.source || r.from, to: r.target || r.to, label: r.label || r.type 
      }));
      networkRef.current.setData({ nodes: new DataSet(nodes), edges: new DataSet(edges) });
      networkRef.current.setOptions({ physics: { enabled: true, stabilization: { iterations: 100 } } });
      setTimeout(() => {
        networkRef.current?.redraw();
        networkRef.current?.fit({ animation: true });
      }, 80);
      return true;
    } catch (e) {
      console.error('Graph render error:', e);
      setGraphError(e);
      return false;
    }
  }, [legend]);

  const loadFullGraph = useCallback(async () => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const d = await graphAPI.getFullGraph({ doc_type: docType, module: moduleFilter, include_chunks: showChunks });
      if (!d || !d.nodes?.length) {
        const DataSet = graphLibRef.current?.DataSet;
        if (networkRef.current && DataSet) networkRef.current.setData({ nodes: new DataSet([]), edges: new DataSet([]) });
        showSnackbar('图谱中暂无符合条件的数据', { severity: 'info' });
        return;
      }
      if (renderGraph(d)) {
        initialGraphLoadedRef.current = true;
      } else {
        setTimeout(() => {
          initialGraphLoadedRef.current = renderGraph(d);
        }, 250);
      }
    } catch (e) {
      setGraphError(e);
      showSnackbar('加载全图失败: ' + (e.message || '未知错误'), { severity: 'error' });
    } finally {
      setGraphLoading(false);
    }
  }, [docType, moduleFilter, renderGraph, showChunks, showSnackbar]);

  // 1. 初始化图谱。graphReady 可能异步变化，容器出现后再创建实例。
  useEffect(() => {
    let cancelled = false;
    async function initNetwork() {
      if (!containerRef.current || networkRef.current) return;
      const [{ Network }, { DataSet }] = await Promise.all([
        import('vis-network'),
        import('vis-data'),
      ]);
      if (cancelled || !containerRef.current || networkRef.current) return;
      graphLibRef.current = { DataSet };
      networkRef.current = new Network(containerRef.current, { nodes: new DataSet([]), edges: new DataSet([]) }, {
        physics: { enabled: true, stabilization: { iterations: 100 } },
        interaction: { hover: true, zoomView: true, dragView: true },
        edges: { smooth: { type: 'curvedCW', roundness: 0.2 }, color: '#cbd5e1' },
      });
      networkRef.current.on('stabilizationIterationsDone', () => {
        networkRef.current?.setOptions({ physics: { enabled: false } });
        networkRef.current?.fit();
      });
      setGraphEngineReady(true);
    }
    initNetwork().catch((error) => {
      console.error('Failed to load QA graph engine:', error);
      setGraphError(error);
    });
    return () => {
      cancelled = true;
    };
  }, [graphError, graphReady]);

  useEffect(() => {
    return () => {
      networkRef.current?.destroy();
      networkRef.current = null;
      graphLibRef.current = null;
      setGraphEngineReady(false);
      initialGraphLoadedRef.current = false;
    };
  }, []);

  // 2. 状态就绪后再加载全图，避免 status 或容器尺寸还没准备好时喂数据
  useEffect(() => {
    if (!isActive || !graphReady || !graphEngineReady || !networkRef.current || initialGraphLoadedRef.current) return;
    const timer = setTimeout(() => {
      loadFullGraph();
    }, 150);
    return () => clearTimeout(timer);
  }, [graphEngineReady, graphReady, isActive, loadFullGraph]);

  // 3. 当页面重新激活时，仅触发布局刷新，不销毁实例
  useEffect(() => {
    if (isActive && networkRef.current) {
      // 给一点延迟，确保 display: flex 已经生效
      const timer = setTimeout(() => {
        networkRef.current?.redraw();
        networkRef.current?.fit();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || chatMutation.isPending) return;
    const q = inputText;
    setInputText('');
    const sid = currentSessionId || `new_${Date.now()}`;
    
    // 乐观更新 UI
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    scrollDown();

    try {
      const r = await chatMutation.mutateAsync({ question: q, sessionId: sid, includeHistory });
      if (!currentSessionId) setCurrentSessionId(r.session_id);
      if (r.graph_data?.nodes?.length > 0) renderGraph(r.graph_data);
    } catch (e) {}
  };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    const DataSet = graphLibRef.current?.DataSet;
    if (networkRef.current && DataSet) networkRef.current.setData({ nodes: new DataSet([]), edges: new DataSet([]) });
  };

  // 监听会话切换，自动清空或尝试恢复图谱
  useEffect(() => {
    if (!currentSessionId) return;
    // 如果切换了会话，先清空当前图谱，避免看到上个会话的残留
    const DataSet = graphLibRef.current?.DataSet;
    if (networkRef.current && DataSet) {
      networkRef.current.setData({ nodes: new DataSet([]), edges: new DataSet([]) });
    }
  }, [currentSessionId]);

  const handleStartRename = (id, title) => {
    setEditingSession(id);
    setEditTitle(title);
  };

  const handleSaveRename = async () => {
    if (!editingSession || !editTitle.trim()) return;
    await renameSession.mutateAsync({ sid: editingSession, title: editTitle });
    setEditingSession(null);
  };

  const handleDeleteClick = (id, title) => {
    setDeleteConfirm({ open: true, sessionId: id, title });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.sessionId) {
      await deleteSession.mutateAsync(deleteConfirm.sessionId);
      if (currentSessionId === deleteConfirm.sessionId) handleNewSession();
      setDeleteConfirm({ open: false, sessionId: null, title: '' });
    }
  };

  const searchEntity = async () => {
    if (!searchText.trim()) return;
    try {
      const d = await graphAPI.searchEntity(searchText);
      if (!d || !d.nodes?.length) {
        showSnackbar('未找到相关实体', { severity: 'info' });
        return;
      }
      renderGraph(d);
    } catch (e) {
      showSnackbar('搜索失败: ' + (e.message || '未知错误'), { severity: 'error' });
    }
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader title="智能问答" subtitle="基于 RAG 架构的图谱增强问答系统，支持多维线索回溯。" />
      
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, flexDirection: isNarrow ? 'column' : 'row', gap: 2, p: 2, overflow: isNarrow ? 'auto' : 'hidden' }}>
        {/* 左侧：会话历史 */}
        <Paper elevation={0} sx={{ width: isNarrow ? '100%' : 280, flex: isNarrow ? '0 0 auto' : '0 0 280px', display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <SessionHistoryPanel
            sessions={sessions}
            currentSession={currentSessionId}
            sessionListExpanded={sessionListExpanded}
            setSessionListExpanded={setSessionListExpanded}
            handleNewSession={handleNewSession}
            handleSwitchSession={setCurrentSessionId}
            handleStartRename={handleStartRename}
            handleDeleteSession={handleDeleteClick}
            editingSession={editingSession}
            editTitle={editTitle}
            setEditTitle={setEditTitle}
            handleSaveRename={handleSaveRename}
            setEditingSession={setEditingSession}
            deleteConfirm={deleteConfirm}
            setDeleteConfirm={setDeleteConfirm}
            confirmDeleteSession={confirmDelete}
          />
        </Paper>

        {/* 中间：聊天窗口 */}
        <Paper elevation={0} sx={{ flex: isNarrow ? '0 0 420px' : 1, minHeight: isNarrow ? 420 : 0, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
          <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {messages.length === 0 ? (
              <EmptyState variant="chat" title="开始新的对话" description="您可以询问关于项目架构、API 定义或业务逻辑的问题。" />
            ) : (
              messages.map((m, i) => <MessageBubble key={i} message={m} />)
            )}
            {chatMutation.isPending && <MessageBubble message={{ role: 'assistant', content: 'AI 正在思考中...', loading: true }} />}
          </Box>

          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                fullWidth size="small" placeholder="输入您的问题..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={chatMutation.isPending}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.5 } }}
              />
              <Button variant="contained" onClick={handleSendMessage} disabled={chatMutation.isPending || !inputText.trim()} sx={{ borderRadius: 2.5, px: 3 }}>
                发送
              </Button>
            </Box>
            <FormControlLabel
              control={<Checkbox size="small" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} />}
              label={<Typography variant="caption" color="text.secondary">携带历史上下文</Typography>}
              sx={{ mt: 1, ml: 0 }}
            />
          </Box>
        </Paper>

        {/* 右侧：图谱 */}
        <GraphInsightPanel
          containerRef={containerRef}
          graphReady={graphReady}
          graphLoading={graphLoading}
          graphError={graphError}
          legend={legend}
          filters={filters}
          docType={docType}
          setDocType={setDocType}
          moduleFilter={moduleFilter}
          setModuleFilter={setModuleFilter}
          showChunks={showChunks}
          setShowChunks={setShowChunks}
          searchText={searchText}
          setSearchText={setSearchText}
          searchEntity={searchEntity}
          loadFullGraph={loadFullGraph}
          checkGraphStatus={refetchGraphStatus}
          isNarrow={isNarrow}
        />
      </Box>
    </Box>
  );
}
