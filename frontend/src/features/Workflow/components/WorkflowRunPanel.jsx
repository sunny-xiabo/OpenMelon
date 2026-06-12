import React from 'react';
import {
  Box, Typography, Chip, IconButton, Tooltip, Collapse,
  Table, TableBody, TableRow, TableCell, LinearProgress,
} from '@mui/material';
import {
  ExpandMore, ExpandLess, CheckCircle, Error, HourglassEmpty,
  SkipNext, Cancel,
} from '@mui/icons-material';

/**
 * Bottom panel showing workflow run status, node results, and event log.
 */
export default function WorkflowRunPanel({
  runStatus = 'idle',
  nodeStates = {},
  events = [],
  error = null,
  onReset,
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [tab, setTab] = React.useState('nodes'); // nodes | log

  const isRunning = runStatus === 'running';
  const hasResults = Object.keys(nodeStates).length > 0 || events.length > 0;

  if (runStatus === 'idle' && !hasResults) return null;

  const statusConfig = {
    running: { color: 'info', icon: <HourglassEmpty fontSize="small" />, label: '运行中' },
    succeeded: { color: 'success', icon: <CheckCircle fontSize="small" />, label: '成功' },
    failed: { color: 'error', icon: <Error fontSize="small" />, label: '失败' },
    cancelled: { color: 'warning', icon: <Cancel fontSize="small" />, label: '已取消' },
  };
  const st = statusConfig[runStatus] || statusConfig.running;

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(20px)',
        maxHeight: expanded ? 300 : 40,
        transition: 'max-height 0.2s',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 0.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {isRunning && <LinearProgress sx={{ flex: 1, height: 2 }} />}
        <Chip
          icon={st.icon}
          label={st.label}
          size="small"
          color={st.color}
          variant="outlined"
        />
        <Typography variant="caption" color="text.secondary">
          {Object.keys(nodeStates).length} 个节点
        </Typography>
        <Box sx={{ flex: 1 }} />
        {runStatus !== 'idle' && !isRunning && (
          <Tooltip title="重置">
            <Chip label="重置" size="small" onClick={(e) => { e.stopPropagation(); onReset?.(); }} />
          </Tooltip>
        )}
        <IconButton size="small">
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        {/* Tab switcher */}
        <Box sx={{ display: 'flex', gap: 1, px: 2, mb: 0.5 }}>
          <Chip
            label="节点状态"
            size="small"
            variant={tab === 'nodes' ? 'filled' : 'outlined'}
            onClick={() => setTab('nodes')}
          />
          <Chip
            label="事件日志"
            size="small"
            variant={tab === 'log' ? 'filled' : 'outlined'}
            onClick={() => setTab('log')}
          />
        </Box>

        <Box sx={{ px: 2, pb: 1, maxHeight: 200, overflow: 'auto' }}>
          {tab === 'nodes' && (
            <Table size="small">
              <TableBody>
                {Object.entries(nodeStates).map(([nodeId, state]) => (
                  <TableRow key={nodeId}>
                    <TableCell sx={{ py: 0.5, width: 120 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {nodeId}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.5, width: 80 }}>
                      <StatusChip status={state.status} />
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {state.elapsed_ms != null ? `${state.elapsed_ms}ms` : ''}
                        {state.error ? ` - ${state.error}` : ''}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {tab === 'log' && (
            <Box sx={{ fontFamily: 'monospace', fontSize: 12 }}>
              {events.map((evt, i) => (
                <Box key={i} sx={{ py: 0.25, display: 'flex', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60 }}>
                    {evt.type}
                  </Typography>
                  <Typography variant="caption">
                    {evt.node_id || ''}
                  </Typography>
                  {evt.data?.error && (
                    <Typography variant="caption" color="error.main">
                      {evt.data.error}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}

          {error && (
            <Typography variant="caption" color="error.main" sx={{ mt: 1, display: 'block' }}>
              错误: {error}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

function StatusChip({ status }) {
  const map = {
    running: { color: 'info', label: '运行中' },
    succeeded: { color: 'success', label: '成功' },
    failed: { color: 'error', label: '失败' },
    skipped: { color: 'default', label: '跳过' },
    pending: { color: 'default', label: '等待' },
  };
  const cfg = map[status] || map.pending;
  return <Chip label={cfg.label} size="small" color={cfg.color} variant="outlined" sx={{ height: 20, fontSize: 10 }} />;
}
