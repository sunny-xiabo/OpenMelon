import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useTheme,
  Grid,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Collapse,
  Snackbar,
} from '@mui/material';
import { useState, useEffect, useRef, useMemo } from 'react';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import HubOutlined from '@mui/icons-material/HubOutlined';
import MemoryOutlined from '@mui/icons-material/MemoryOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import PsychologyOutlined from '@mui/icons-material/PsychologyOutlined';
import RefreshOutlined from '@mui/icons-material/RefreshOutlined';
import SettingsEthernetOutlined from '@mui/icons-material/SettingsEthernetOutlined';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import ComputerOutlined from '@mui/icons-material/ComputerOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined';
import TerminalOutlined from '@mui/icons-material/TerminalOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';

import { useSystemHealth } from '../hooks/useSystemHealth';
import { logsAPI } from '../../../api/system';

const STATUS_META = {
  ok: { label: '正常', color: 'success', tone: '#16a34a', icon: CheckCircleOutlineOutlined },
  disabled: { label: '未启用', color: 'default', tone: '#64748b', icon: HelpOutlineOutlined },
  not_loaded: { label: '未加载', color: 'info', tone: '#0284c7', icon: HelpOutlineOutlined },
  missing_config: { label: '缺少配置', color: 'warning', tone: '#d97706', icon: WarningAmberOutlined },
  degraded: { label: '降级', color: 'warning', tone: '#d97706', icon: WarningAmberOutlined },
  down: { label: '不可用', color: 'error', tone: '#dc2626', icon: ErrorOutlineOutlined },
  unknown: { label: '未知', color: 'default', tone: '#64748b', icon: HelpOutlineOutlined },
};

const COMPONENTS = [
  { key: 'api', label: 'API 服务', icon: MonitorHeartOutlined },
  { key: 'postgres', label: 'PostgreSQL', icon: TableChartOutlined },
  { key: 'llm', label: 'LLM Provider', icon: PsychologyOutlined },
  { key: 'neo4j', label: 'Neo4j', icon: HubOutlined },
  { key: 'qdrant', label: 'Qdrant', icon: SettingsEthernetOutlined },
  { key: 'reranker', label: 'Reranker', icon: MemoryOutlined },
];

const TOPOLOGY_NODES = {
  ui: { x: 70, y: 140, label: '前端 (UI)', icon: ComputerOutlined, componentKey: 'ui' },
  api: { x: 230, y: 140, label: 'API 服务', icon: MonitorHeartOutlined, componentKey: 'api' },
  llm: { x: 470, y: 50, label: 'LLM Provider', icon: PsychologyOutlined, componentKey: 'llm' },
  postgres: { x: 470, y: 140, label: 'PostgreSQL', icon: TableChartOutlined, componentKey: 'postgres' },
  neo4j: { x: 470, y: 230, label: 'Neo4j', icon: HubOutlined, componentKey: 'neo4j' },
  reranker: { x: 690, y: 50, label: 'Reranker', icon: MemoryOutlined, componentKey: 'reranker' },
  qdrant: { x: 690, y: 230, label: 'Qdrant', icon: SettingsEthernetOutlined, componentKey: 'qdrant' },
};

const getStatusMeta = (status) => STATUS_META[status] || STATUS_META.unknown;

function formatCheckedAt(value) {
  if (!value) return '尚未检查';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatDetailValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '空';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (value === null || value === undefined || value === '') return '空';
  return String(value);
}

function detailEntries(component) {
  return Object.entries(component || {})
    .filter(([key]) => !['status', 'message'].includes(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 4);
}

function StatusChip({ status }) {
  const meta = getStatusMeta(status);
  const Icon = meta.icon;
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: '1rem !important' }} />}
      label={meta.label}
      color={meta.color}
      variant={meta.color === 'default' ? 'outlined' : 'filled'}
      sx={{ borderRadius: 1.5, fontWeight: 700 }}
    />
  );
}

function ComponentHealthCard({ item, component, isHovered, onMouseEnter, onMouseLeave, onShowLog }) {
  const status = component?.status || 'unknown';
  const meta = getStatusMeta(status);
  const Icon = item.icon;
  const entries = detailEntries(component);

  return (
    <Box
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="magnetic-card"
      sx={{
        minWidth: 0,
        p: 2.2,
        borderRadius: 3,
        border: '1px solid',
        borderColor: isHovered ? meta.tone : alpha(meta.tone, 0.15),
        bgcolor: isHovered ? alpha(meta.tone, 0.08) : alpha(meta.tone, 0.04),
        boxShadow: isHovered 
          ? `0 8px 24px ${alpha(meta.tone, 0.12)}, inset 0 1px 0 rgba(255,255,255,0.6)`
          : '0 4px 12px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.8)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'default',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: '15%',
          height: '70%',
          width: '4px',
          borderRadius: '0 4px 4px 0',
          backgroundColor: meta.tone,
          opacity: 0.8,
        }
      }}
    >
      <Box>
        <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2.5,
                display: 'grid',
                placeItems: 'center',
                color: meta.tone,
                bgcolor: alpha(meta.tone, 0.12),
                flexShrink: 0,
                boxShadow: `0 0 12px ${alpha(meta.tone, 0.2)}`,
              }}
            >
              <Icon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.25, color: 'text.primary' }}>
                {item.label}
              </Typography>
              <Tooltip title={component?.message || '暂无检查结果'} arrow enterDelay={300} disableHoverListener={!component?.message}>
                <Typography 
                  variant="caption" 
                  color="text.secondary" 
                  style={{ WebkitBoxOrient: 'vertical' }}
                  sx={{ 
                    display: '-webkit-box', 
                    WebkitLineClamp: 2, 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    mt: 0.35,
                    minHeight: '2.5em',
                    lineHeight: 1.25,
                    cursor: component?.message ? 'help' : 'default',
                  }}
                >
                  {component?.message || '暂无检查结果'}
                </Typography>
              </Tooltip>
            </Box>
          </Stack>
          <StatusChip status={status} />
        </Stack>

        {entries.length > 0 && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
            {entries.map(([key, value]) => (
              <Tooltip key={key} title={`${key}: ${formatDetailValue(value)}`}>
                <Chip
                  size="small"
                  label={`${key}: ${formatDetailValue(value)}`}
                  variant="outlined"
                  sx={{
                    maxWidth: '100%',
                    borderRadius: 1.5,
                    fontSize: '11px',
                    borderColor: alpha(meta.tone, 0.25),
                    color: 'text.secondary',
                    bgcolor: 'rgba(255, 255, 255, 0.4)',
                    backdropFilter: 'blur(4px)',
                    '& .MuiChip-label': {
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    },
                  }}
                />
              </Tooltip>
            ))}
          </Stack>
        )}
      </Box>

      {status !== 'ok' && status !== 'disabled' && (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed', borderColor: 'rgba(0, 0, 0, 0.06)', display: 'flex', justifyContent: 'flex-end' }}>
          <Button 
            size="small" 
            variant="text" 
            color="primary"
            startIcon={<TerminalOutlined sx={{ fontSize: '14px !important' }} />}
            onClick={onShowLog}
            sx={{ 
              fontSize: '11px', 
              fontWeight: 700, 
              py: 0.2, 
              px: 1, 
              borderRadius: 1.5,
              textTransform: 'none',
            }}
          >
            排查日志
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default function SystemHealthPanel() {
  const theme = useTheme();
  const { data, error, isLoading, isFetching, refetch } = useSystemHealth();
  const components = data?.components || {};

  // Interactive states
  const [hoveredComponent, setHoveredComponent] = useState(null);
  
  // Storage and Logs Terminal states
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  
  const [selectedLogFile, setSelectedLogFile] = useState('openmelon.log');
  const [logLinesCount, setLogLinesCount] = useState(200);
  const [logData, setLogData] = useState(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);

  const terminalBodyRef = useRef(null);

  // Components mapping
  const orderedComponents = COMPONENTS.map((item) => ({ item, component: components[item.key] || {} }));
  const extraComponents = Object.entries(components)
    .filter(([key]) => !COMPONENTS.some((item) => item.key === key))
    .map(([key, component]) => ({
      item: { key, label: key, icon: MonitorHeartOutlined },
      component,
    }));
  const allComponents = [...orderedComponents, ...extraComponents];

  // Overall counts
  const overallStatus = error ? 'down' : (data?.status || 'unknown');
  const overallMeta = getStatusMeta(overallStatus);
  const OverallIcon = overallMeta.icon;
  const degradedCount = allComponents.filter(({ component }) => ['degraded', 'missing_config', 'not_loaded'].includes(component?.status)).length;
  const downCount = allComponents.filter(({ component }) => component?.status === 'down').length;

  // Fetch logs implementation
  const fetchLogs = async (filename, lines) => {
    setIsLoadingLogs(true);
    setLogsError(null);
    try {
      const res = await logsAPI.get(filename, lines);
      setLogData(res);
    } catch (err) {
      setLogsError(err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isTerminalExpanded) {
      fetchLogs(selectedLogFile, logLinesCount);
    }
  }, [isTerminalExpanded, selectedLogFile, logLinesCount]);

  // Autoscroll logs to bottom when updated
  useEffect(() => {
    if (terminalBodyRef.current && isTerminalExpanded) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [logData, isTerminalExpanded]);

  // Clipboard copy helper
  const handleCopyPath = (path, name) => {
    if (!path) return;
    navigator.clipboard.writeText(path).then(() => {
      setSnackbarMessage(`已复制 ${name} 路径到剪贴板！`);
      setSnackbarOpen(true);
    });
  };

  // Quick action: Show log for component
  const handleShowLogForComponent = () => {
    setIsTerminalExpanded(true);
    setSelectedLogFile('openmelon_error.log');
    // Scroll smoothly to terminal
    setTimeout(() => {
      terminalBodyRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Colorize log text based on keywords (INFO, WARNING, ERROR, SUCCESS)
  const highlightLogLine = (line) => {
    if (!line) return '';
    
    let color = '#e2e8f0'; // light gray default
    let label = '';
    
    if (line.includes('ERROR') || line.includes('CRITICAL') || line.includes('Exception') || line.includes('Traceback')) {
      color = '#f87171'; // red
    } else if (line.includes('WARN')) {
      color = '#fbbf24'; // amber
    } else if (line.includes('INFO')) {
      color = '#60a5fa'; // blue
    } else if (line.includes('SUCCESS') || line.includes('SUCCESSFUL')) {
      color = '#34d399'; // green
    }

    return (
      <Box 
        component="span" 
        sx={{ 
          color, 
          display: 'block', 
          py: 0.25, 
          fontFamily: 'Consolas, SFMono-Regular, Courier New, monospace', 
          fontSize: '12px',
          whiteSpace: 'pre-wrap',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
        }}
      >
        {line}
      </Box>
    );
  };

  // Client side filtering for logs
  const filteredLogLines = useMemo(() => {
    const lines = logData?.lines || [];
    if (!filterText) return lines;
    return lines.filter(line => line.toLowerCase().includes(filterText.toLowerCase()));
  }, [logData, filterText]);

  // Topology drawing paths
  const topologyPaths = [
    { from: 'ui', to: 'api', type: 'straight' },
    { from: 'api', to: 'llm', type: 'curve-up' },
    { from: 'api', to: 'postgres', type: 'straight' },
    { from: 'api', to: 'neo4j', type: 'curve-down' },
    { from: 'llm', to: 'reranker', type: 'straight' },
    { from: 'neo4j', to: 'qdrant', type: 'straight' },
  ];

  return (
    <Box 
      sx={{ 
        p: { xs: 2, md: 3.5 }, 
        height: '100%', 
        overflow: 'auto',
        position: 'relative',
        background: 'radial-gradient(ellipse at 50% -20%, rgba(99, 102, 241, 0.05) 0%, transparent 80%)',
      }}
      className={isFetching ? 'scanning-effect' : ''}
    >
      {/* Self-contained custom CSS styles */}
      <style>
        {`
          @keyframes dash-flow {
            to {
              stroke-dashoffset: -20;
            }
          }
          @keyframes glow-pulse {
            0% { filter: drop-shadow(0 0 2px var(--glow-color)); }
            50% { filter: drop-shadow(0 0 10px var(--glow-color)); }
            100% { filter: drop-shadow(0 0 2px var(--glow-color)); }
          }
          .topo-pulse-path {
            animation: dash-flow 1.2s linear infinite;
          }
          .topo-pulse-path-slow {
            animation: dash-flow 3s linear infinite;
          }
          .node-glow {
            animation: glow-pulse 2.5s infinite ease-in-out;
            transition: all 0.3s ease;
          }
          .node-glow:hover {
            transform: scale(1.1);
            transform-origin: center;
          }
        `}
      </style>

      {/* Header and Toolbar */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, mb: 0.5, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            NOC 运行态依赖检查
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            图形化展示系统底层拓扑连通度，实现数据库、AI 服务及存储卷一站式排障。
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={isFetching ? <CircularProgress size={16} color="inherit" /> : <RefreshOutlined />}
          onClick={() => refetch()}
          disabled={isFetching}
          sx={{ 
            alignSelf: { xs: 'flex-start', md: 'auto' }, 
            borderRadius: 2.5, 
            boxShadow: '0 4px 14px rgba(26, 115, 232, 0.2)',
            textTransform: 'none',
            fontWeight: 700,
            px: 2.5,
          }}
        >
          {isFetching ? '诊断中...' : '深度检查'}
        </Button>
      </Stack>

      {isLoading && <LinearProgress sx={{ mb: 3, borderRadius: 99, height: 4 }} />}

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 3, fontWeight: 600 }}>
          {error.message || '健康检查接口拉取失败，请检查后端 API 服务是否在线。'}
        </Alert>
      )}

      {/* Grid containing Overall Health Panel AND Interactive SVG Topology */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Overall Status Card */}
        <Grid item xs={12} lg={4}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              height: '100%',
              borderRadius: 4,
              border: '1px solid',
              borderColor: alpha(overallMeta.tone, 0.2),
              bgcolor: alpha(overallMeta.tone, 0.04),
              backdropFilter: 'blur(20px)',
              boxShadow: `0 10px 30px ${alpha(overallMeta.tone, 0.03)}, inset 0 1px 0 rgba(255, 255, 255, 0.7)`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <Stack spacing={3}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  className="pulse-animation"
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: 3,
                    display: 'grid',
                    placeItems: 'center',
                    color: overallMeta.tone,
                    bgcolor: alpha(overallMeta.tone, 0.12),
                    boxShadow: `0 0 20px ${alpha(overallMeta.tone, 0.25)}`,
                  }}
                >
                  <OverallIcon sx={{ fontSize: 28 }} />
                </Box>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6" sx={{ fontWeight: 900, color: 'text.primary' }}>系统健康状况</Typography>
                    <StatusChip status={overallStatus} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontWeight: 500 }}>
                    检查时刻 {formatCheckedAt(data?.checked_at)}
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ borderColor: 'rgba(0,0,0,0.06)' }} />

              <Stack direction="row" spacing={3} divider={<Divider orientation="vertical" flexItem sx={{ height: 28, my: 'auto', opacity: 0.6 }} />}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>降级模块</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: degradedCount ? 'warning.main' : 'text.primary', mt: 0.5 }}>
                    {degradedCount}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>断开模块</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, color: downCount ? 'error.main' : 'text.primary', mt: 0.5 }}>
                    {downCount}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>系统版本</Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', mt: 1 }}>
                    v{data?.version || '0.1.0'}
                  </Typography>
                </Box>
              </Stack>
            </Stack>

            <Box sx={{ mt: { xs: 4, lg: 2 } }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4, bgcolor: 'rgba(255,255,255,0.4)', p: 1.5, borderRadius: 2, border: '1px solid rgba(0,0,0,0.03)' }}>
                💡 拓扑节点与下方卡片支持交互！悬停节点可自动定位并高亮对应模块。若模块处于非正常状态，可点击下方“排查日志”直接审查系统输出。
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* SVG Topology Dashboard */}
        <Grid item xs={12} lg={8}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 4,
              border: '1px solid rgba(255, 255, 255, 0.4)',
              bgcolor: 'rgba(255, 255, 255, 0.45)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(15, 23, 42, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: 280,
            }}
          >
            <Box sx={{ width: '100%', maxWidth: 800, position: 'relative', userSelect: 'none' }}>
              <svg viewBox="0 0 800 280" width="100%" height="100%">
                {/* SVG Definitions for Gradients & Glow Filters */}
                <defs>
                  <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <linearGradient id="gradient-line-green" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
                  </linearGradient>
                </defs>

                {/* Render Topology Paths */}
                {topologyPaths.map((path, idx) => {
                  const fromNode = TOPOLOGY_NODES[path.from];
                  const toNode = TOPOLOGY_NODES[path.to];
                  if (!fromNode || !toNode) return null;

                  const targetStatus = toNode.componentKey === 'ui' ? 'ok' : (components[toNode.componentKey]?.status || 'unknown');
                  const meta = getStatusMeta(targetStatus);
                  const isHighlighted = hoveredComponent === toNode.componentKey || hoveredComponent === fromNode.componentKey;

                  // Path logic
                  let d = `M ${fromNode.x} ${fromNode.y} L ${toNode.x} ${toNode.y}`;
                  if (path.type === 'curve-up') {
                    d = `M ${fromNode.x} ${fromNode.y} Q ${(fromNode.x + toNode.x) / 2} ${toNode.y + 10}, ${toNode.x} ${toNode.y}`;
                  } else if (path.type === 'curve-down') {
                    d = `M ${fromNode.x} ${fromNode.y} Q ${(fromNode.x + toNode.x) / 2} ${toNode.y - 10}, ${toNode.x} ${toNode.y}`;
                  }

                  // Dash styling based on status
                  let dashArray = 'none';
                  let className = '';
                  let strokeWidth = isHighlighted ? 2.5 : 1.5;
                  let strokeColor = meta.tone;

                  if (targetStatus === 'ok') {
                    dashArray = '6 4';
                    className = 'topo-pulse-path';
                  } else if (targetStatus === 'degraded' || targetStatus === 'missing_config' || targetStatus === 'not_loaded') {
                    dashArray = '5 5';
                    className = 'topo-pulse-path-slow';
                  } else if (targetStatus === 'down') {
                    dashArray = 'none';
                    strokeColor = '#dc2626';
                    strokeWidth = isHighlighted ? 3 : 2;
                  } else {
                    dashArray = '4 4';
                    strokeColor = '#94a3b8';
                    strokeWidth = 1;
                  }

                  return (
                    <g key={idx}>
                      {/* Highlight underlay */}
                      {isHighlighted && (
                        <path
                          d={d}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={strokeWidth + 4}
                          opacity={0.15}
                          style={{ transition: 'all 0.3s ease' }}
                        />
                      )}
                      {/* Real Path */}
                      <path
                        d={d}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={dashArray}
                        className={className}
                        opacity={isHighlighted ? 1 : 0.6}
                        style={{
                          transition: 'all 0.3s ease',
                          strokeDashoffset: 0,
                        }}
                      />
                    </g>
                  );
                })}

                {/* Render Nodes */}
                {Object.entries(TOPOLOGY_NODES).map(([key, node]) => {
                  const nodeStatus = node.componentKey === 'ui' ? 'ok' : (components[node.componentKey]?.status || 'unknown');
                  const meta = getStatusMeta(nodeStatus);
                  const isHighlighted = hoveredComponent === node.componentKey;
                  const NodeIcon = node.icon;

                  return (
                    <g
                      key={key}
                      className="node-glow"
                      style={{ 
                        '--glow-color': meta.tone, 
                        cursor: 'pointer',
                      }}
                      onMouseEnter={() => setHoveredComponent(node.componentKey)}
                      onMouseLeave={() => setHoveredComponent(null)}
                    >
                      {/* Glowing Ring */}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isHighlighted ? 22 : 18}
                        fill="rgba(255, 255, 255, 0.95)"
                        stroke={meta.tone}
                        strokeWidth={isHighlighted ? 3 : 2}
                        style={{
                          boxShadow: `0 0 10px ${meta.tone}`,
                          transition: 'all 0.3s ease',
                        }}
                      />
                      
                      {/* Embed MUI Icon inside node using foreignObject */}
                      <foreignObject 
                        x={node.x - 11} 
                        y={node.y - 11} 
                        width={22} 
                        height={22}
                        style={{ pointerEvents: 'none' }}
                      >
                        <Box sx={{ color: meta.tone, display: 'grid', placeItems: 'center', width: 22, height: 22 }}>
                          <NodeIcon sx={{ fontSize: 16 }} />
                        </Box>
                      </foreignObject>

                      {/* Node Text Label */}
                      <text
                        x={node.x}
                        y={node.y + 34}
                        textAnchor="middle"
                        fill={theme.palette.text.primary}
                        style={{ 
                          fontSize: 11, 
                          fontWeight: isHighlighted ? 900 : 700, 
                          transition: 'all 0.3s ease',
                          fill: isHighlighted ? '#1a73e8' : '#334155'
                        }}
                      >
                        {node.label}
                      </text>

                      {/* Node Status Text */}
                      <text
                        x={node.x}
                        y={node.y + 46}
                        textAnchor="middle"
                        fill={meta.tone}
                        style={{ 
                          fontSize: 9, 
                          fontWeight: 700, 
                          letterSpacing: '0.05em',
                          opacity: 0.85
                        }}
                      >
                        {meta.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Grid of Component Detailed Cards */}
      <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.12em', display: 'block', mb: 1.5 }}>
        详细组件状态清单
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
          gap: 2,
          mb: 4,
        }}
      >
        {allComponents.map(({ item, component }) => (
          <ComponentHealthCard 
            key={item.key} 
            item={item} 
            component={component} 
            isHovered={hoveredComponent === item.key}
            onMouseEnter={() => setHoveredComponent(item.key)}
            onMouseLeave={() => setHoveredComponent(null)}
            onShowLog={handleShowLogForComponent}
          />
        ))}
      </Box>

      {/* Storage Volumes Inspector Card */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 4,
          borderRadius: 4,
          border: '1px solid rgba(255, 255, 255, 0.4)',
          bgcolor: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.02)',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <FolderOpenOutlined color="primary" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>存储目录卷审查 (Volumes)</Typography>
        </Stack>

        <Grid container spacing={2}>
          {[
            { label: '项目根路径 (Root)', value: data?.runtime?.root, icon: ComputerOutlined },
            { label: '持久数据库 (DB Dir)', value: data?.runtime?.data_dir, icon: TableChartOutlined },
            { label: '日志输出目录 (Logs Dir)', value: data?.runtime?.log_dir, icon: ReceiptLongOutlined },
            { label: '缓存与临时文件 (Upload Dir)', value: data?.runtime?.upload_dir, icon: FolderOpenOutlined },
          ].map((item, index) => (
            <Grid item xs={12} md={6} key={index}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2.5,
                  border: '1px solid rgba(0,0,0,0.04)',
                  bgcolor: 'rgba(255,255,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.8)',
                    borderColor: 'rgba(26, 115, 232, 0.15)',
                  },
                  transition: 'all 0.2s',
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 2,
                      bgcolor: 'rgba(26, 115, 232, 0.08)',
                      color: 'primary.main',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <item.icon sx={{ fontSize: 16 }} />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', display: 'block', lineHeight: 1.2 }}>
                      {item.label}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      color="text.secondary" 
                      sx={{ 
                        display: 'block', 
                        fontFamily: 'Consolas, monospace',
                        fontSize: '10.5px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mt: 0.25,
                      }}
                    >
                      {item.value || '未知路径'}
                    </Typography>
                  </Box>
                </Stack>
                <Tooltip title="复制路径">
                  <IconButton 
                    size="small" 
                    onClick={() => handleCopyPath(item.value, item.label)}
                    disabled={!item.value}
                    sx={{ flexShrink: 0, '&:hover': { color: 'primary.main' } }}
                  >
                    <ContentCopyOutlined sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Live Logs Terminal Section */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid rgba(255, 255, 255, 0.4)',
          bgcolor: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 6px 24px rgba(15, 23, 42, 0.03)',
          overflow: 'hidden',
        }}
      >
        {/* Terminal Header Toggle */}
        <Box
          onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
          sx={{
            p: 2.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            bgcolor: 'rgba(255,255,255,0.2)',
            '&:hover': {
              bgcolor: 'rgba(255,255,255,0.4)',
            },
            transition: 'all 0.2s',
          }}
        >
          <Stack direction="row" spacing={1.25} alignItems="center">
            <TerminalOutlined color="primary" fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>日志中心控制台 (Integrated Log Center)</Typography>
            <Chip 
              size="small" 
              label="排障" 
              color="primary" 
              variant="outlined" 
              sx={{ height: 18, fontSize: '10px', fontWeight: 700, borderRadius: 1 }} 
            />
          </Stack>
          {isTerminalExpanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
        </Box>

        {/* Terminal Content (Collapsible) */}
        <Collapse in={isTerminalExpanded} timeout="auto" unmountOnExit>
          <Box sx={{ p: 2.5, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            {/* Control Bar */}
            <Stack 
              direction={{ xs: 'column', sm: 'row' }} 
              spacing={2} 
              justifyContent="space-between" 
              alignItems={{ xs: 'stretch', sm: 'center' }}
              sx={{ mb: 2 }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                {/* File Dropdown */}
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="log-file-label">日志文件</InputLabel>
                  <Select
                    labelId="log-file-label"
                    value={selectedLogFile}
                    label="日志文件"
                    onChange={(e) => setSelectedLogFile(e.target.value)}
                    sx={{ borderRadius: 2, fontSize: '12px', fontWeight: 600 }}
                  >
                    <MenuItem value="openmelon.log" sx={{ fontSize: '12px', fontWeight: 600 }}>openmelon.log (常规)</MenuItem>
                    <MenuItem value="openmelon_error.log" sx={{ fontSize: '12px', fontWeight: 600 }}>openmelon_error.log (报错)</MenuItem>
                  </Select>
                </FormControl>

                {/* Lines Select */}
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel id="log-lines-label">读取行数</InputLabel>
                  <Select
                    labelId="log-lines-label"
                    value={logLinesCount}
                    label="读取行数"
                    onChange={(e) => setLogLinesCount(e.target.value)}
                    sx={{ borderRadius: 2, fontSize: '12px', fontWeight: 600 }}
                  >
                    <MenuItem value={100} sx={{ fontSize: '12px' }}>100 行</MenuItem>
                    <MenuItem value={200} sx={{ fontSize: '12px' }}>200 行</MenuItem>
                    <MenuItem value={500} sx={{ fontSize: '12px' }}>500 行</MenuItem>
                    <MenuItem value={1000} sx={{ fontSize: '12px' }}>1000 行</MenuItem>
                  </Select>
                </FormControl>

                {/* Local Search Input */}
                <TextField
                  size="small"
                  label="过滤词..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Regex/文本过滤..."
                  sx={{ 
                    minWidth: 180,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      fontSize: '12px',
                    }
                  }}
                />
              </Stack>

              <Button
                variant="outlined"
                size="small"
                startIcon={isLoadingLogs ? <CircularProgress size={12} color="inherit" /> : <RefreshOutlined />}
                onClick={() => fetchLogs(selectedLogFile, logLinesCount)}
                disabled={isLoadingLogs}
                sx={{ borderRadius: 2, fontWeight: 700, px: 2, textTransform: 'none' }}
              >
                刷新日志
              </Button>
            </Stack>

            {/* macOS styled Terminal Box */}
            <Box
              sx={{
                borderRadius: 3.5,
                bgcolor: '#0f172a', // deep slate/dark theme
                border: '1px solid rgba(255,255,255,0.06)',
                overflow: 'hidden',
                boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
              }}
            >
              {/* macOS Window Controls Top Bar */}
              <Box 
                sx={{ 
                  px: 2, 
                  py: 1, 
                  bgcolor: '#1e293b', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                <Stack direction="row" spacing={1}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10b981' }} />
                </Stack>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: 'rgba(255,255,255,0.4)', 
                    fontFamily: 'Consolas, monospace',
                    fontWeight: 700,
                  }}
                >
                  melon@engine:~/{selectedLogFile} ({logData?.total_lines || 0} lines)
                </Typography>
                <Box sx={{ width: 36 }} /> {/* spacers */}
              </Box>

              {/* Terminal Body */}
              <Box
                ref={terminalBodyRef}
                sx={{
                  p: 2.5,
                  height: 320,
                  overflow: 'auto',
                  bgcolor: '#090d16',
                  '&::-webkit-scrollbar': {
                    width: '6px',
                  },
                  '&::-webkit-scrollbar-track': {
                    background: '#090d16',
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: '#334155',
                    borderRadius: '3px',
                  },
                  '&::-webkit-scrollbar-thumb:hover': {
                    background: '#475569',
                  },
                }}
              >
                {isLoadingLogs ? (
                  <Stack height="100%" justifyContent="center" alignItems="center" spacing={1.5}>
                    <CircularProgress size={24} sx={{ color: 'primary.light' }} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>
                      Streaming logs...
                    </Typography>
                  </Stack>
                ) : logsError ? (
                  <Typography variant="body2" sx={{ color: '#f87171', fontFamily: 'monospace', p: 1 }}>
                    Error fetching logs: {logsError.message || 'Log file not found.'}
                  </Typography>
                ) : filteredLogLines.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', p: 1, textAlign: 'center', mt: 4 }}>
                    {filterText ? '未匹配到任何日志项' : '终端没有新的日志记录'}
                  </Typography>
                ) : (
                  filteredLogLines.map((line, idx) => (
                    <Box key={idx} sx={{ display: 'flex', gap: 2 }}>
                      {/* Line Number */}
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: 'rgba(255,255,255,0.18)', 
                          fontFamily: 'Consolas, monospace',
                          userSelect: 'none',
                          minWidth: '2.5em',
                          textAlign: 'right',
                          display: 'block',
                          py: 0.25,
                        }}
                      >
                        {idx + 1}
                      </Typography>
                      {/* Line Value */}
                      {highlightLogLine(line)}
                    </Box>
                  ))
                )}
              </Box>
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Snackbar notification */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          '& .MuiPaper-root': {
            bgcolor: '#1e293b',
            color: '#fff',
            borderRadius: 3,
            fontWeight: 700,
            fontSize: '13px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          }
        }}
      />
    </Box>
  );
}
