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


function ChatWelcomeArea({ onStarterClick }) {
  const starters = [
    {
      title: '🔍 系统架构与核心逻辑',
      desc: '介绍一下 OpenMelon 的整体技术架构与核心业务流',
      prompt: '介绍一下 OpenMelon 的整体技术架构与核心业务流，它是如何通过知识图谱与向量数据库配合提供高精准答案的？',
      color: '#1a73e8'
    },
    {
      title: '🚀 三槽位用例引擎运作',
      desc: '新版用例生成三槽位配置如何运作，三者如何相互独立与回退？',
      prompt: '系统最近新增的用例生成 LLM 三槽位配置（文本、视觉、嵌入）如何运作？各自独立配置时又是如何实现优雅回退的？',
      color: '#9334e6'
    },
    {
      title: '🔗 索引与图谱一致性',
      desc: '说明系统在 Qdrant 索引重建与垃圾清理（防呆）上有哪些关键机制',
      prompt: '详细解释一下 OpenMelon 在索引治理模块中，关于 Qdrant 索引重建任务的触发逻辑，以及孤儿向量垃圾清理（防呆）的保障机制有哪些？',
      color: '#10b981'
    },
    {
      title: '📈 日志详情与可读性优化',
      desc: '最近日志中心视察抽屉进行了哪些可读性方面的优化与调整？',
      prompt: '能给我讲解下最近日志中心详情视察抽屉（Inspect Drawer）所做的可读性与文字对比度优化改动吗？',
      color: '#f59e0b'
    }
  ];

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 3, textAlign: 'center', maxWidth: 800, mx: 'auto', my: 'auto', gap: 3 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 900, mb: 1, background: 'linear-gradient(135deg, #1a73e8 0%, #6366f1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '24px', letterSpacing: -0.5 }}>
          您好！我是 OpenMelon 智能助理
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: '13px', maxWidth: 500, mx: 'auto', lineHeight: 1.6 }}>
          基于 RAG + 图谱增强的双引擎大脑，随时解答您的项目架构、自动化用例生成及健康治理等各种专业疑问。
        </Typography>
      </Box>

      <Box sx={{ width: '100%', mt: 1 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', textAlign: 'left', mb: 1.5, fontWeight: 800, fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: 1.5 }}>
          探索常见话题 (Quick Explorers)
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {starters.map((item) => (
            <Paper
              key={item.title}
              elevation={0}
              onClick={() => onStarterClick(item.prompt)}
              sx={{
                p: 2,
                textAlign: 'left',
                borderRadius: 3.5,
                border: '1px solid rgba(0,0,0,0.06)',
                bgcolor: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  borderColor: item.color,
                  bgcolor: 'white',
                  boxShadow: `0 8px 24px ${item.color}0d`
                }
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '12.5px', color: 'text.primary', mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {item.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.45, fontWeight: 500 }}>
                {item.desc}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

export default function QAPage({ isActive = true }) {
  const theme = useTheme();
  const showSnackbar = useSnackbar();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));
  const queryClient = useQueryClient();
  
  // 1. UI 交互状态
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

  // 引用点击 - 高亮图谱节点并聚焦到对应位置
  const handleCitationClick = useCallback((citationIndex) => {
    if (!networkRef.current?.body) return;

    // 获取当前可见的所有节点索引
    const nodeIds = networkRef.current.body.nodeIndices;
    if (!nodeIds || nodeIds.length === 0) return;

    // 清除之前的选中状态
    networkRef.current.unselectAll();

    // 将引用索引映射到图谱节点，citationIndex 从 1 开始
    const targetIndex = Math.min(citationIndex - 1, nodeIds.length - 1);
    if (targetIndex >= 0 && targetIndex < nodeIds.length) {
      const targetId = nodeIds[targetIndex];
      networkRef.current.selectNodes([targetId]);
      networkRef.current.focus(targetId, {
        scale: 1.5,
        animation: { duration: 500, easingFunction: 'easeInOutQuad' },
      });
    }
  }, []);

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

  const handleSendMessage = async (overrideText) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : inputText;
    if (!textToSend.trim() || isStreaming) return;
    
    setInputText('');
    const sid = currentSessionId || `new_${Date.now()}`;

    // 乐观更新 UI
    setMessages(prev => [...prev, { role: 'user', content: textToSend }]);
    setStreamingContent('');
    setIsStreaming(true);
    scrollDown();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = (attachedFiles.length > 0 && !overrideText)
        ? await chatAPI.queryStreamWithFiles(textToSend, attachedFiles, sid, includeHistory)
        : await chatAPI.queryStream(textToSend, sid, includeHistory);

      if (!overrideText) {
        setAttachedFiles([]);
      }
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

  const handleExportGraph = useCallback(() => {
    if (!networkRef.current?.body) return;
    try {
      const canvas = containerRef.current?.querySelector('canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `openmelon-graph-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      showSnackbar('导出图谱失败: ' + (e.message || '未知错误'), { severity: 'error' });
    }
  }, [showSnackbar]);

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
              <ChatWelcomeArea onStarterClick={(prompt) => handleSendMessage(prompt)} />
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
            
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1, 
              border: '1px solid', 
              borderColor: 'divider', 
              borderRadius: 3.5, 
              p: 0.5, 
              px: 1.5, 
              bgcolor: '#f8fafc',
              boxShadow: '0 4px 12px rgba(15,23,42,0.02)',
              transition: 'all 0.2s',
              '&:focus-within': {
                borderColor: 'primary.main',
                bgcolor: 'white',
                boxShadow: '0 6px 20px rgba(26,115,232,0.08)'
              }
            }}>
              <IconButton onClick={() => fileInputRef.current?.click()} disabled={isStreaming}
                sx={{ borderRadius: 2.5, color: 'text.secondary', p: 1 }}>
                <AttachFileOutlined sx={{ fontSize: 20 }} />
              </IconButton>
              <TextField
                fullWidth size="small" placeholder="输入您的问题..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isStreaming}
                sx={{ 
                  '& .MuiOutlinedInput-root': { 
                    border: 'none',
                    '& fieldset': { border: 'none' },
                    fontSize: '13px',
                    p: 0
                  }
                }}
              />
              <Button 
                variant="contained" 
                onClick={() => handleSendMessage()} 
                disabled={isStreaming || !inputText.trim()} 
                sx={{ 
                  borderRadius: 2.5, 
                  px: 3, 
                  fontWeight: 700, 
                  fontSize: '12px',
                  background: (theme) => theme.palette.gradients?.primary || '#1a73e8',
                  '&:hover': { background: (theme) => theme.palette.gradients?.primaryHover || '#1557b0' }
                }}
              >
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
          onExport={handleExportGraph}
        />
      </Box>
    </Box>
  );
}
