import React from 'react';
import {
  Box, Typography, Paper, Chip, Divider
} from '@mui/material';
import {
  PlayArrow, Stop, SmartToy, Http, Code, CallSplit,
  Search, Description, Merge, Loop, Build, Tune, Category
} from '@mui/icons-material';
import { NODE_CATEGORIES, NODE_DEFINITIONS } from '../utils/nodeDefinitions';

const ICON_MAP = {
  PlayArrow, Stop, SmartToy, Http, Code, CallSplit,
  Search, Description, Merge, Loop, Build, Tune, Category,
};

/**
 * Left sidebar panel showing available node types.
 * Nodes can be dragged onto the canvas.
 */
export default function NodePalette() {
  const handleDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <Paper
      elevation={0}
      sx={{
        width: 200,
        height: '100%',
        overflow: 'auto',
        borderRight: 1,
        borderRadius: 0,
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.45)' : 'rgba(255, 255, 255, 0.45)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <Box sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          节点面板
        </Typography>

        {NODE_CATEGORIES.map((cat) => (
          <Box key={cat.id} sx={{ mb: 1.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              {cat.label}
            </Typography>
            <Divider sx={{ my: 0.5 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {cat.types.map((type) => {
                const def = NODE_DEFINITIONS[type];
                if (!def) return null;
                const IconComponent = ICON_MAP[def.icon] || PlayArrow;

                return (
                  <Box
                    key={type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, type)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      cursor: 'grab',
                      border: 1,
                      borderColor: 'transparent',
                      bgcolor: 'background.paper',
                      transition: 'all 0.15s',
                      '&:hover': {
                        borderColor: def.color,
                        bgcolor: `${def.color}08`,
                      },
                      '&:active': {
                        cursor: 'grabbing',
                        opacity: 0.8,
                      },
                    }}
                  >
                    <IconComponent sx={{ fontSize: 16, color: def.color }} />
                    <Typography variant="caption" sx={{ fontWeight: 500 }}>
                      {def.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
