import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  IconButton,
  TextField,
  Typography,
  Paper,
  Checkbox,
  FormControlLabel,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { AttachFileOutlined } from '@mui/icons-material';
import { graphAPI, chatAPI } from '../services/api';
import { useSnackbar } from '../components/SnackbarProvider';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

// Hooks
import {
  useSessions,
  useChatHistory,
  useGraphStatus,
  useChatQuery,
  useSessionActions,
  useFeedbacks,
  QA_KEYS,
} from '../features/QA/hooks/useQA';
import { useGraphFilters } from '../features/Graph/hooks/useGraph';
import { useNodeTypeLegend } from '../features/NodeType/hooks/useNodeTypes';

// Components
import SessionHistoryPanel from '../features/QA/components/SessionHistoryPanel';
import MessageBubble from '../features/QA/components/MessageBubble';
import GraphInsightPanel from '../features/QA/components/GraphInsightPanel';
import {
  buildGraphRenderState,
} from '../features/Graph/utils/graphRendering';

export default function QAPage({ isActive = true }) {
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  const queryClient = useQueryClient();
  
  // 1. UI 交互状态 (找回被遗漏的状态)
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [sessionListExpanded, setSessionListExpanded] = useState(true);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);
  
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
  const graphStateRef = useRef(null);
  const graphDataRef = useRef(null);
  const expandedClusterKeysRef = useRef(new Set());
  const renderGraphRef = useRef(null);
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

  // 反馈状态
  const { data: feedbackData } = useFeedbacks(currentSessionId);
  const feedbackMap = useMemo(() => {
    const map = {};
    (feedbackData?.feedbacks || []).forEach(f => { map[f.message_index] = f.feedback; });
    return map;
  }, [feedbackData]);

  const graphReady = !!status?.has_data;

  // 3. 核心逻辑处理
  const scrollDown = () => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 100);
  };

  // 反馈处理
  const handleFeedback = async (messageIndex, feedback) => {
    try {
      await chatAPI.setFeedback(currentSessionId, messageIndex, feedback);
      queryClient.invalidateQueries({ queryKey: QA_KEYS.feedbacks(currentSessionId) });
    } catch (e) {
      showSnackbar('反馈失败: ' + (e.message || '未知错误'), { severity: 'error' });
    }
  };

  // 重试处理
  const handleRetry = async (messageIndex) => {
    const userMsg = messages[messageIndex - 1];
    if (!userMsg || userMsg.role !== 'user') return;
    const question = userMsg.content;

    setMessages(prev => {
      const next = [...prev];
      next[messageIndex] = { role: 'assistant', content: '' };
      return next;
    });
    setStreamingContent('');
    setIsStreaming(true);
    scrollDown();

    try {
      const resp = await chatAPI.queryStream(question, currentSessionId, includeHistory);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += dec.decode(value, { stream: true });
        setMessages(prev => {
          const next = [...prev];
          next[messageIndex] = { role: 'assistant', content: fullText };
          return next;
        });
        scrollDown();
      }

      queryClient.invalidateQueries({ queryKey: QA_KEYS.sessions });
      if (currentSessionId) queryClient.invalidateQueries({ queryKey: QA_KEYS.history(currentSessionId) });
    } catch (e) {
      if (e.name !== 'AbortError') {
        showSnackbar('重试失败: ' + (e.message || '未知错误'), { severity: 'error' });
      }
    } finally {
      setIsStreaming(false);
      scrollDown();
    }
  };

  // 引用点击（Task 8 将实现图谱节点高亮）
  const handleCitationClick = (citationIndex) => {
    console.log('Citation clicked:', citationIndex);
  };

  // 文件选择
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    setAttachedFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
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

  const renderGraph = useCallback((data, focusLabel) => {
    const DataSet = graphLibRef.current?.DataSet;
    if (!networkRef.current?.body || !DataSet || !data) return false;
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
      setTimeout(() => {
        networkRef.current?.redraw();
        if (focusLabel) {
          const target = graphState.nodes.find((node) => node.label === focusLabel || node.id === focusLabel || node.properties?.name === focusLabel);
          if (target) {
            networkRef.current?.focus(target.id, { scale: 1.2, animation: true });
          }
        } else {
          networkRef.current?.fit({ animation: graphState.mode === 'full' });
        }
      }, graphState.mode === 'full' ? 80 : 40);
      return true;
    } catch (e) {
      console.error('Graph render error:', e);
      setGraphError(e);
      return false;
    }
  }, [legend]);

  useEffect(() => {
    renderGraphRef.current = renderGraph;
  }, [renderGraph]);

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

  // 1. 初始化图谱。只有页面激活且图谱有数据时才下载 vis 引擎。
  useEffect(() => {
    let cancelled = false;
    async function initNetwork() {
      if (!isActive || !graphReady || !containerRef.current || networkRef.current) return;
      const [{ Network }, { DataSet }] = await Promise.all([
        import('vis-network'),
        import('vis-data'),
      ]);
      if (cancelled || !containerRef.current || networkRef.current) return;
      graphLibRef.current = { DataSet };
      networkRef.current = new Network(containerRef.current, { nodes: new DataSet([]), edges: new DataSet([]) }, {
        autoResize: true,
        physics: { enabled: false },
        interaction: { hover: false, tooltipDelay: 0, zoomView: true, dragView: true, hideEdgesOnDrag: true },
        edges: { smooth: false, color: '#cbd5e1' },
      });
      networkRef.current.on('click', (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          const clusterKey = graphStateRef.current?.collapsedClusterLookup?.get(nodeId);
          if (clusterKey) {
            expandedClusterKeysRef.current = new Set([...expandedClusterKeysRef.current, clusterKey]);
            renderGraphRef.current?.(graphDataRef.current);
          }
        }
      });
      setGraphEngineReady(true);
    }
    initNetwork().catch((error) => {
      console.error('Failed to load QA graph engine:', error);
      setGraphEngineReady(false);
      setGraphError(error);
    });
    return () => {
      cancelled = true;
    };
  }, [graphReady, isActive]);

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
    if (!inputText.trim() || isStreaming) return;
    const q = inputText;
    setInputText('');
    const sid = currentSessionId || `new_${Date.now()}`;

    // 乐观更新 UI
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setStreamingContent('');
    setIsStreaming(true);
    scrollDown();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = attachedFiles.length > 0
        ? await chatAPI.queryStreamWithFiles(q, attachedFiles, sid, includeHistory)
        : await chatAPI.queryStream(q, sid, includeHistory);

      setAttachedFiles([]);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += dec.decode(value, { stream: true });
        setStreamingContent(fullText);
        scrollDown();
      }

      // 流结束，将完整回答加入消息列表
      if (fullText) {
        setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
      }
      setStreamingContent('');

      if (!currentSessionId) setCurrentSessionId(sid);
      queryClient.invalidateQueries({ queryKey: QA_KEYS.sessions });
      queryClient.invalidateQueries({ queryKey: QA_KEYS.history(sid) });
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('Chat stream failed:', e);
        showSnackbar('查询失败: ' + (e.message || '未知错误'), { severity: 'error' });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      scrollDown();
    }
  };

  const handleNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    const DataSet = graphLibRef.current?.DataSet;
    if (networkRef.current && DataSet) networkRef.current.setData({ nodes: new DataSet([]), edges: new DataSet([]) });
    graphDataRef.current = null;
    graphStateRef.current = null;
    expandedClusterKeysRef.current = new Set();
  };

  // 监听会话切换，自动清空或尝试恢复图谱
  useEffect(() => {
    if (!currentSessionId) return;
    // 如果切换了会话，先清空当前图谱，避免看到上个会话的残留
    const DataSet = graphLibRef.current?.DataSet;
    if (networkRef.current && DataSet) {
      networkRef.current.setData({ nodes: new DataSet([]), edges: new DataSet([]) });
    }
    graphDataRef.current = null;
    graphStateRef.current = null;
    expandedClusterKeysRef.current = new Set();
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
      renderGraph(d, searchText);
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
              messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  message={m}
                  feedback={feedbackMap[i]}
                  onRetry={() => handleRetry(i)}
                  onFeedback={(fb) => handleFeedback(i, fb)}
                  onCitationClick={handleCitationClick}
                />
              ))
            )}
            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                feedback={feedbackMap[i]}
                onRetry={() => handleRetry(i)}
                onFeedback={(fb) => handleFeedback(i, fb)}
                onCitationClick={handleCitationClick}
              />
            ))}
            {isStreaming && streamingContent && <MessageBubble message={{ role: 'assistant', content: streamingContent }} />}
            {isStreaming && !streamingContent && <MessageBubble message={{ role: 'assistant', content: 'AI 正在思考中...', loading: true }} />}
          </Box>

          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            {attachedFiles.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                {attachedFiles.map((f, i) => (
                  <Chip key={i} label={`${f.name} (${(f.size / 1024).toFixed(0)} KB)`}
                    onDelete={() => removeFile(i)} size="small"
                    sx={{ bgcolor: '#eff6ff' }} />
                ))}
              </Box>
            )}
            <input type="file" ref={fileInputRef} accept="image/*" multiple
              style={{ display: 'none' }} onChange={handleFileSelect} />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton onClick={() => fileInputRef.current?.click()} disabled={isStreaming}
                sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <AttachFileOutlined fontSize="small" />
              </IconButton>
              <TextField
                fullWidth size="small" placeholder="输入您的问题..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isStreaming}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.5 } }}
              />
              <Button variant="contained" onClick={handleSendMessage} disabled={isStreaming || !inputText.trim()} sx={{ borderRadius: 2.5, px: 3 }}>
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
