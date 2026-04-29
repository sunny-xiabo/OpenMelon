import { Box, Tooltip, Typography } from '@mui/material';
import { getCoverageTone } from '../utils';

export default function HorizontalBars({ modules }) {
  const maxCoverage = Math.max(...modules.map((item) => item.coverage_percentage), 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {modules.map((item, idx) => {
        const tone = getCoverageTone(item.coverage_percentage);
        return (
          <Tooltip
            key={item.module_name}
            title={`功能 ${item.feature_count} · 用例 ${item.test_case_count}`}
            placement="right"
            arrow
          >
            <Box sx={{ '&:hover .bar-fill': { filter: 'brightness(1.1)' }, cursor: 'default' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5, gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700, fontSize: 10, minWidth: 16 }}>
                    #{idx + 1}
                  </Typography>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {item.module_name}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 600, color: tone.color === 'success' ? '#22c55e' : tone.color === 'warning' ? '#f59e0b' : '#ef4444' }}>
                  {item.coverage_percentage.toFixed(1)}%
                </Typography>
              </Box>
              <Box sx={{ height: 10, borderRadius: 999, bgcolor: '#f1f5f9', overflow: 'hidden' }}>
                <Box
                  className="bar-fill"
                  sx={{
                    width: `${(item.coverage_percentage / maxCoverage) * 100}%`,
                    height: '100%',
                    borderRadius: 999,
                    transition: 'width 0.5s ease, filter 0.2s',
                    background:
                      tone.color === 'success'
                        ? 'linear-gradient(90deg, #34d399 0%, #22c55e 100%)'
                        : tone.color === 'warning'
                          ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)'
                          : 'linear-gradient(90deg, #fb7185 0%, #ef4444 100%)',
                  }}
                />
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
