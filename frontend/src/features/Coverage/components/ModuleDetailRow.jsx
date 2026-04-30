import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Paper,
  Typography,
} from '@mui/material';
import { graphAPI } from '../../../services/api';

export default function ModuleDetailRow({ moduleName }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await graphAPI.getCoverageDetail(moduleName);
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setDetail({ features: [], test_cases: [], coverage_percentage: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moduleName]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>加载模块详情...</Typography>
      </Box>
    );
  }

  if (!detail) return null;

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', py: 1, maxHeight: 200 }}>
      <Paper elevation={0} sx={{ flex: '1 1 280px', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f8fafc', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 200 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1, flexShrink: 0 }}>
          功能列表 ({detail.features?.length || 0})
        </Typography>
        {(detail.features?.length || 0) === 0 ? (
          <Typography variant="caption" color="text.disabled">暂无功能节点</Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', overflowY: 'auto', flex: 1, minHeight: 0, alignContent: 'flex-start' }}>
            {detail.features.map((feature, index) => (
              <Chip key={index} label={feature} size="small" variant="outlined"
                sx={{ borderRadius: 1.5, borderColor: 'rgba(59,130,246,0.3)', color: '#3b82f6', bgcolor: 'rgba(59,130,246,0.05)', fontSize: 12, maxWidth: 200, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
              />
            ))}
          </Box>
        )}
      </Paper>
      <Paper elevation={0} sx={{ flex: '1 1 280px', p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f8fafc', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 200 }}>
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1, flexShrink: 0 }}>
          关联用例 ({detail.test_cases?.length || 0})
        </Typography>
        {(detail.test_cases?.length || 0) === 0 ? (
          <Typography variant="caption" color="text.disabled">暂无关联用例</Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', overflowY: 'auto', flex: 1, minHeight: 0, alignContent: 'flex-start' }}>
            {detail.test_cases.map((testCase, index) => (
              <Chip key={index} label={testCase} size="small" variant="outlined"
                sx={{ borderRadius: 1.5, borderColor: 'rgba(16,185,129,0.3)', color: '#10b981', bgcolor: 'rgba(16,185,129,0.05)', fontSize: 12, maxWidth: 200, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
              />
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
