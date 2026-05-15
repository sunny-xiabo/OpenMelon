import React from 'react';
import { Box, keyframes } from '@mui/material';

const pulse = keyframes`
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
`;

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export default function IndexGovernanceIcon(props) {
  const color = '#10B981';
  
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      sx={{
        width: props.fontSize === 'small' ? 20 : 24,
        height: props.fontSize === 'small' ? 20 : 24,
        ...props.sx
      }}
    >
      {/* Background layers - representing database or storage rows */}
      <rect x="2" y="5" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <rect x="2" y="14" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      
      {/* Active indicators */}
      <circle cx="13" cy="7.5" r="1" fill="currentColor" opacity="0.4" />
      <circle cx="13" cy="16.5" r="1" fill="currentColor" opacity="0.4" />
      
      {/* Premium Governance Core - Positioned to the right as an overlay */}
      <g style={{ transformOrigin: '18px 12px', animation: `${pulse} 2s ease-in-out infinite` }}>
        {/* Outer glow */}
        <circle cx="18" cy="12" r="5.5" fill={color} fillOpacity="0.15" />
        
        {/* Hexagon core (mini version of the one in system_healthy.svg) */}
        <path 
          d="M18 8L21.4641 10V14L18 16L14.5359 14V10L18 8Z" 
          fill={color} 
          stroke="white" 
          strokeWidth="1"
          style={{ transformOrigin: '18px 12px', animation: `${rotate} 8s linear infinite` }}
        />
        
        {/* Tiny checkmark */}
        <path d="M16.5 12L17.5 13L19.5 11" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Box>
  );
}
