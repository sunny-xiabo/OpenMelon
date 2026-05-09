import { Box, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { PROPERTY_LABELS } from '../constants';

export default function NodeDetailPanel({ collapsed, selectedNode, setCollapsed }) {
  if (collapsed) {
    return (
      <Tooltip title="展开节点详情" placement="left">
        <Box
          onClick={() => setCollapsed(false)}
          sx={{
            position: 'absolute',
            top: 24,
            right: 24,
            width: 44,
            height: 44,
            bgcolor: (theme) => alpha(theme.palette.common.white, 0.9),
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
    );
  }

  return (
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
        bgcolor: (theme) => alpha(theme.palette.common.white, 0.85),
        backdropFilter: 'blur(16px)',
        border: '1px solid',
        borderColor: (theme) => alpha(theme.palette.common.white, 0.5),
        borderRadius: 4,
        boxShadow: '0 12px 40px rgba(15,23,42,0.08)',
        zIndex: 20,
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.75, borderBottom: '1px solid', borderBottomColor: (theme) => alpha(theme.palette.slate[200], 0.6) }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'slate.800' }}>节点详情</Typography>
        <IconButton size="small" onClick={() => setCollapsed(true)} sx={{ bgcolor: (theme) => alpha(theme.palette.slate[100], 0.8), '&:hover': { bgcolor: 'slate.200' } }}>
          <ChevronRight fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, p: 2.5, overflow: 'auto' }}>
        {selectedNode?.labels && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>类型</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 500, color: 'slate.700' }}>{selectedNode.labels.join(', ')}</Typography>
          </Box>
        )}
        {selectedNode?.properties && Object.entries(selectedNode.properties).map(([key, value]) => {
          if (key === 'embedding') return null;
          const isLong = key === 'content' || key === 'title';
          return (
            <Box key={key} sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                {PROPERTY_LABELS[key] || key}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.5,
                  wordBreak: 'break-word',
                  color: 'slate.800',
                  ...(isLong && {
                    whiteSpace: 'pre-wrap',
                    bgcolor: (theme) => alpha(theme.palette.slate[50], 0.6),
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: (theme) => alpha(theme.palette.slate[200], 0.5),
                    fontSize: 13,
                    lineHeight: 1.6,
                  }),
                }}
              >
                {typeof value === 'string' ? value : String(value)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
