import { Box, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';

export default function ResultSummaryCards({
  filteredTestCases,
  parsedTestCases,
  totalStepCount,
  vectorStatus,
  viewMode,
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
      <Paper elevation={0} sx={{ flex: '1 1 180px', p: 2, border: '1px solid', borderColor: (theme) => alpha(theme.palette.slate[200], 0.8), borderRadius: 3, background: (theme) => `linear-gradient(135deg, ${alpha(theme.palette.accent.blue, 0.12)} 0%, ${alpha(theme.palette.common.white, 0.8)} 100%)`, boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
        <Typography variant="body2" sx={{ color: 'slate.600', fontWeight: 600 }}>当前显示用例</Typography>
        <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: 'slate.900', lineHeight: 1 }}>
          {parsedTestCases.length > 0 ? `${filteredTestCases.length} / ${parsedTestCases.length}` : '-'}
        </Typography>
      </Paper>
      <Paper elevation={0} sx={{ flex: '1 1 180px', p: 2, border: '1px solid', borderColor: (theme) => alpha(theme.palette.slate[200], 0.8), borderRadius: 3, background: (theme) => `linear-gradient(135deg, ${alpha(theme.palette.accent.emerald, 0.12)} 0%, ${alpha(theme.palette.common.white, 0.8)} 100%)`, boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
        <Typography variant="body2" sx={{ color: 'slate.600', fontWeight: 600 }}>输出视图</Typography>
        <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: 'slate.900', lineHeight: 1 }}>{viewMode === 'stages' ? '阶段' : parsedTestCases.length > 0 ? (viewMode === 'list' ? '列表' : '导图') : 'Markdown'}</Typography>
      </Paper>
      <Paper elevation={0} sx={{ flex: '1 1 220px', p: 2, border: '1px solid', borderColor: (theme) => alpha(theme.palette.slate[200], 0.8), borderRadius: 3, background: (theme) => `linear-gradient(135deg, ${alpha(theme.palette.accent.amber, 0.12)} 0%, ${alpha(theme.palette.common.white, 0.8)} 100%)`, boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
        <Typography variant="body2" sx={{ color: 'slate.600', fontWeight: 600 }}>步骤总数</Typography>
        <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: 'slate.900', lineHeight: 1 }}>{parsedTestCases.length > 0 ? totalStepCount : '-'}</Typography>
      </Paper>
      <Paper elevation={0} sx={{ flex: '1 1 220px', p: 2, border: '1px solid', borderColor: (theme) => alpha(theme.palette.slate[200], 0.8), borderRadius: 3, background: (theme) => `linear-gradient(135deg, rgba(139,92,246,0.12) 0%, ${alpha(theme.palette.common.white, 0.8)} 100%)`, boxShadow: '0 4px 16px rgba(15,23,42,0.03)' }}>
        <Typography variant="body2" sx={{ color: 'slate.600', fontWeight: 600 }}>向量库状态</Typography>
        <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: 'slate.900', lineHeight: 1 }}>{vectorStatus?.available ? '可存储' : '不可用'}</Typography>
      </Paper>
    </Box>
  );
}
