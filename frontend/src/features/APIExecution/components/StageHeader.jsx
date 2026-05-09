import React from 'react';
import { Box, Typography } from '@mui/material';

export default function StageHeader({ title, action }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: { xs: 'flex-start', sm: 'center' },
        justifyContent: 'space-between',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.5,
        mx: { xs: -0.5, md: -1 },
        mb: 2.5,
        px: { xs: 1.5, md: 2 },
        py: { xs: 1.25, md: 1.5 },
        bgcolor: 'rgba(244, 247, 251, 0.94)',
        border: '1px solid',
        borderColor: 'rgba(148, 163, 184, 0.2)',
        borderRadius: 1,
        boxShadow: '0 1px 0 rgba(255, 255, 255, 0.7) inset',
      }}
    >
      <Typography variant="h5" fontWeight={800}>
        {title}
      </Typography>
      {action && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            width: { xs: '100%', sm: 'auto' },
          }}
        >
          {action}
        </Box>
      )}
    </Box>
  );
}
