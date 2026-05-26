import React from 'react';
import { Box, keyframes } from '@mui/material';

const pulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
`;

export default function HealthyPulseIcon({ color = '#10B981', size = 20 }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      sx={{ animation: `${pulse} 2s ease-in-out infinite` }}
    >
      <circle cx="12" cy="12" r="10" fill={color} fillOpacity="0.15" />
      <circle cx="12" cy="12" r="6" fill={color} stroke="white" strokeWidth="1.5" />
      <path d="M10 12L11.5 13.5L14.5 10.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}
