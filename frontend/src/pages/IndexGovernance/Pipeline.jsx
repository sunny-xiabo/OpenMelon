import React from 'react';
import { alpha } from '@mui/material/styles';
import { Box, Paper, Stack, Tooltip, Typography, useTheme } from '@mui/material';
import { PIPELINE_STEPS } from './constants.jsx';

export default function Pipeline() {
  const theme = useTheme();
  return (
    <Box 
      sx={{ 
        p: 3, 
        borderRadius: 4.5, 
        bgcolor: 'rgba(14, 165, 233, 0.015)', 
        border: '1px solid rgba(14, 165, 233, 0.08)', 
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6)' 
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems="center" justifyContent="space-between">
        {PIPELINE_STEPS.map((step, index) => (
          <React.Fragment key={step.label}>
            <Tooltip title={step.caption} arrow>
              <Paper 
                elevation={0}
                sx={{ 
                  p: 1.75, 
                  borderRadius: 3.5,
                  flex: 1, 
                  minWidth: 180, 
                  cursor: 'default',
                  border: '1px solid rgba(0,0,0,0.05)',
                  bgcolor: 'white',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    borderColor: alpha(step.color, 0.25),
                    boxShadow: `0 8px 16px ${alpha(step.color, 0.05)}`
                  }
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box 
                    sx={{ 
                      width: 36, 
                      height: 36, 
                      borderRadius: 2.2, 
                      display: 'grid', 
                      placeItems: 'center', 
                      bgcolor: 'white', 
                      color: step.color,
                      boxShadow: `0 4px 12px ${alpha(step.color, 0.12)}`,
                      border: '1px solid', 
                      borderColor: alpha(step.color, 0.08)
                    }}
                  >
                    {step.icon}
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 900, display: 'block', color: 'slate.900', letterSpacing: 0.2 }}>
                      {step.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em' }}>
                      ACTIVE SYNC
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Tooltip>
            {index < PIPELINE_STEPS.length - 1 && (
              <Box 
                sx={{ 
                  width: { xs: 2, md: 45 }, 
                  height: { xs: 15, md: 2 }, 
                  bgcolor: alpha(theme.palette.divider, 0.5), 
                  display: { xs: 'none', md: 'block' },
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 1
                }} 
              >
                <Box className="flow-animation" sx={{ position: 'absolute', inset: 0 }} />
              </Box>
            )}
          </React.Fragment>
        ))}
      </Stack>
    </Box>
  );
}
