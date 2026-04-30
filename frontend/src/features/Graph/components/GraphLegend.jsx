import { Box, Typography } from '@mui/material';

export default function GraphLegend({ legend }) {
  return (
    <Box sx={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 1.25, p: 1.25, bgcolor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', border: '1px solid', borderColor: 'rgba(255,255,255,0.4)', borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.04)', zIndex: 10, maxWidth: 'calc(100% - 32px)' }}>
      {legend.map(({ type, color }) => (
        <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'rgba(255,255,255,0.6)', px: 1, py: 0.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color.bg, boxShadow: `0 0 0 1px ${color.border}` }} />
          <Typography variant="caption" sx={{ color: '#475569', fontWeight: 500 }}>{type}</Typography>
        </Box>
      ))}
    </Box>
  );
}
