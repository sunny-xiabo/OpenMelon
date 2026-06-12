import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Box, Typography, Chip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { NODE_DEFINITIONS } from '../../utils/nodeDefinitions';

/**
 * Base wrapper for all custom node types in the workflow canvas.
 * Renders handles, title bar with color, and summary content.
 */
export default function BaseNodeWrapper({ data, selected, children }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const nodeType = data.nodeType || data.type;
  const def = NODE_DEFINITIONS[nodeType] || {};
  const color = def.color || '#9e9e9e';
  const label = data.label || def.label || nodeType;
  const icon = def.icon || 'Circle';
  const inputs = def.inputs || [];
  const outputs = def.outputs || [];

  const statusColor = {
    running: '#2196f3',
    succeeded: '#4caf50',
    failed: '#f44336',
    skipped: '#9e9e9e',
  }[data.runStatus] || null;

  return (
    <Box
      sx={{
        minWidth: def.defaultWidth || 244,
        minHeight: def.defaultHeight || 90,
        bgcolor: 'background.paper',
        border: 2,
        borderColor: selected ? color : 'divider',
        borderRadius: 2,
        boxShadow: selected ? 4 : 1,
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover': {
          boxShadow: 3,
        },
        // Pulse animation when running
        ...(data.runStatus === 'running' && {
          animation: 'nodePulse 1.5s ease-in-out infinite',
          '@keyframes nodePulse': {
            '0%': { borderColor: color },
            '50%': { borderColor: '#90caf9' },
            '100%': { borderColor: color },
          },
        }),
      }}
    >
      {/* Input handles */}
      {inputs.map((inp, i) => (
        <Handle
          key={inp.id}
          type="target"
          position={Position.Left}
          id={inp.id}
          style={{
            background: color,
            width: 10,
            height: 10,
            border: isDark ? '2px solid #111827' : '2px solid #fff',
            top: inputs.length === 1 ? '50%' : `${((i + 1) / (inputs.length + 1)) * 100}%`,
          }}
        />
      ))}

      {/* Title bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          bgcolor: `${color}15`,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: statusColor || color,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: color,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Typography>
        {data.elapsed_ms != null && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            {data.elapsed_ms}ms
          </Typography>
        )}
      </Box>

      {/* Content area */}
      <Box sx={{ px: 1.5, py: 1, fontSize: 12, color: 'text.secondary' }}>
        {children || (
          <Typography variant="caption" color="text.secondary">
            {data.description || def.description || ''}
          </Typography>
        )}
      </Box>

      {/* Output handles */}
      {outputs.map((out, i) => (
        <Handle
          key={out.id}
          type="source"
          position={Position.Right}
          id={out.id}
          style={{
            background: out.id === 'true' ? '#4caf50' : out.id === 'false' ? '#f44336' : color,
            width: 10,
            height: 10,
            border: isDark ? '2px solid #111827' : '2px solid #fff',
            top: outputs.length === 1 ? '50%' : `${((i + 1) / (outputs.length + 1)) * 100}%`,
          }}
        />
      ))}
    </Box>
  );
}
