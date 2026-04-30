import { Box, Typography } from '@mui/material';

export default function DonutChart({ value }) {
  const radius = 56;
  const stroke = 12;
  const normalized = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * radius;
  const dash = (normalized / 100) * circumference;

  const getGradientColors = (pct) => {
    if (pct >= 80) return { start: '#22c55e', end: '#16a34a' };
    if (pct >= 50) return { start: '#f59e0b', end: '#d97706' };
    return { start: '#ef4444', end: '#dc2626' };
  };
  const gradient = getGradientColors(normalized);

  return (
    <Box sx={{ position: 'relative', width: 148, height: 148, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="148" height="148" viewBox="0 0 148 148">
        <defs>
          <linearGradient id="coverageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradient.start} />
            <stop offset="100%" stopColor={gradient.end} />
          </linearGradient>
          <filter id="coverageGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="74" cy="74" r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx="74" cy="74" r={radius}
          fill="none"
          stroke="url(#coverageGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 74 74)"
          filter="url(#coverageGlow)"
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <Box sx={{ position: 'absolute', textAlign: 'center' }}>
        <Typography variant="h4" sx={{ fontSize: 30, fontWeight: 700, color: gradient.start }}>
          {normalized.toFixed(0)}%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          平均覆盖率
        </Typography>
      </Box>
    </Box>
  );
}
