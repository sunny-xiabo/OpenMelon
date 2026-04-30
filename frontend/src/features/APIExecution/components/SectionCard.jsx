import React from 'react';
import { Paper, Box, Stack, Typography } from '@mui/material';

const cardSx = {
  border: '1px solid',
  borderColor: 'rgba(148, 163, 184, 0.18)',
  borderRadius: 4,
  bgcolor: 'rgba(255,255,255,0.96)',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)',
};

export default function SectionCard({ eyebrow, title, description, action, children, sx }) {
  return (
    <Paper elevation={0} sx={{ ...cardSx, ...sx }}>
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between" flexWrap="wrap">
          <Box sx={{ minWidth: 0 }}>
            {eyebrow && (
              <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 0.6 }}>
                {eyebrow}
              </Typography>
            )}
            <Typography variant="h6" sx={{ mt: 0.5 }}>
              {title}
            </Typography>
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.7 }}>
                {description}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
      </Box>
      {children}
    </Paper>
  );
}
