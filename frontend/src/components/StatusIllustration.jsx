import React from 'react';
import { Box, Typography, Stack, keyframes } from '@mui/material';

const rotate = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { r: 30; opacity: 0.15; }
  50% { r: 45; opacity: 0.25; }
`;

const dash = keyframes`
  to { stroke-dashoffset: -20; }
`;

/**
 * Premium Status Illustration component inspired by system_healthy.svg
 */
export default function StatusIllustration({ 
  title, 
  description, 
  size = 200, 
  color = '#10B981',
  secondaryColor = '#059669'
}) {
  return (
    <Stack alignItems="center" spacing={2} sx={{ py: 2 }}>
      <Box 
        component="svg" 
        width={size} 
        height={size} 
        viewBox="0 0 240 240" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="paint0_linear_status" x1="120" y1="40" x2="120" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor={color} />
            <stop offset="1" stopColor={secondaryColor} />
          </linearGradient>
          <filter id="filter0_f_status" x="80" y="80" width="80" height="80" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feFlood floodOpacity="0" result="BackgroundImageFix"/>
            <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
            <feGaussianBlur stdDeviation="12" result="effect1_foregroundBlur"/>
          </filter>
        </defs>
        
        {/* Connections */}
        <path d="M120 120L180 80" stroke={color} strokeWidth="2" strokeDasharray="4 4" style={{ animation: `${dash} 2s linear infinite` }} />
        <path d="M120 120L60 80" stroke={color} strokeWidth="2" strokeDasharray="4 4" style={{ animation: `${dash} 2s linear infinite` }} />
        <path d="M120 120L120 180" stroke={color} strokeWidth="2" strokeDasharray="4 4" style={{ animation: `${dash} 2s linear infinite` }} />

        {/* Glowing background */}
        <circle cx="120" cy="120" r="40" fill={color} filter="url(#filter0_f_status)" style={{ animation: `${pulse} 3s ease-in-out infinite` }} />

        {/* Central Core */}
        <path 
          d="M120 100L137.321 110V130L120 140L102.679 130V110L120 100Z" 
          fill="url(#paint0_linear_status)" 
          stroke="#fff" 
          strokeWidth="2"
          style={{ transformOrigin: '120px 120px', animation: `${rotate} 10s linear infinite` }}
        />
        
        {/* Outer Nodes */}
        <circle cx="180" cy="80" r="8" fill={color} stroke="#fff" strokeWidth="2" />
        <circle cx="60" cy="80" r="8" fill={color} stroke="#fff" strokeWidth="2" />
        <circle cx="120" cy="180" r="8" fill={color} stroke="#fff" strokeWidth="2" />

        {/* Checks */}
        <path d="M115 120L118 123L125 117" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </Box>
      
      {title && (
        <Typography variant="h6" fontWeight={800} sx={{ color: 'text.primary', textAlign: 'center' }}>
          {title}
        </Typography>
      )}
      
      {description && (
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          {description}
        </Typography>
      )}
    </Stack>
  );
}
