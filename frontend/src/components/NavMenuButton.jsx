import React from 'react';
import { Button, Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export default function NavMenuButton({
  active,
  icon,
  label,
  description,
  onClick,
}) {
  return (
    <Button
      variant="text"
      color="inherit"
      className={!active ? "magnetic-card" : ""}
      onClick={onClick}
      sx={{
        justifyContent: 'flex-start',
        textAlign: 'left',
        px: 1.5,
        py: 1.25,
        minHeight: 52,
        borderRadius: 2,
        bgcolor: active ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
        color: active ? 'primary.main' : 'text.primary',
        border: '1px solid transparent',
        '&:hover': {
          bgcolor: active ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.5)',
        }
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.9 }}>
        {icon}
        <Box>
          <Typography variant="body2" fontWeight={600}>{label}</Typography>
          {description && (
            <Typography variant="caption" sx={{ color: active ? 'primary.main' : 'text.secondary', opacity: active ? 0.8 : 1 }}>
              {description}
            </Typography>
          )}
        </Box>
      </Box>
    </Button>
  );
}
