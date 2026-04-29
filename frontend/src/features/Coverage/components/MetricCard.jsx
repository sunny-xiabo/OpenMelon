import { Box, Paper, Typography } from '@mui/material';

export default function MetricCard({ label, value, helper, accent, icon, trend }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        minWidth: 0,
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        background: `linear-gradient(180deg, ${accent} 0%, #ffffff 100%)`,
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        {icon && <Box sx={{ opacity: 0.5, fontSize: 18 }}>{icon}</Box>}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.75 }}>
        <Typography variant="h4" sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {trend && (
          <Typography variant="caption" sx={{ color: trend.color, fontWeight: 600 }}>
            {trend.text}
          </Typography>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
        {helper}
      </Typography>
    </Paper>
  );
}
