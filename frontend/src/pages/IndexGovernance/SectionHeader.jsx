import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

export default function SectionHeader({ title, caption, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1.5} sx={{ p: 2.25 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.primary' }}>{title}</Typography>
        {caption && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontWeight: 500 }}>{caption}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}
