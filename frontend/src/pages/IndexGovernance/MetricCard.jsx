import React from 'react';
import { alpha } from '@mui/material/styles';
import { Box, Paper, Stack, Typography, useTheme } from '@mui/material';

export default function MetricCard({ label, value, tone = 'info', helper, icon }) {
  const theme = useTheme();

  const gradientMap = {
    info: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
    success: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
    warning: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
    error: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(255, 255, 255, 0.75) 100%)',
  };

  const currentBg = theme.palette[tone].main;

  return (
    <Paper 
      elevation={0}
      sx={{ 
        p: 2.5, 
        borderRadius: 4.5, 
        border: '1px solid',
        borderColor: alpha(currentBg, 0.15),
        background: gradientMap[tone] || gradientMap.info,
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.01), inset 0 1px 0 rgba(255,255,255,0.6)',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: alpha(currentBg, 0.45),
          boxShadow: `0 12px 36px ${alpha(currentBg, 0.08)}, inset 0 1px 0 rgba(255,255,255,0.8)`
        }
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box 
          sx={{ 
            width: 32, 
            height: 32, 
            borderRadius: 2, 
            bgcolor: alpha(currentBg, 0.1), 
            color: currentBg, 
            display: 'grid', 
            placeItems: 'center',
            boxShadow: `0 0 8px ${alpha(currentBg, 0.15)}`
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, letterSpacing: '0.02em', display: 'block' }}>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 950, color: 'slate.900', lineHeight: 1.1, fontFamily: 'monospace' }}>
            {value}
          </Typography>
        </Box>
      </Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '10px', fontWeight: 600 }}>{helper}</Typography>
    </Paper>
  );
}
