import { Box, Paper, Typography } from '@mui/material';
import {
  DescriptionOutlined,
  FolderOpenOutlined,
  LayersOutlined,
} from '@mui/icons-material';

const buildStatCards = (stats) => [
  {
    label: '索引文件',
    value: stats.total,
    helper: '当前已纳入索引的文档数量',
    accent: 'rgba(26,115,232,0.08)',
    icon: <DescriptionOutlined fontSize="small" />,
  },
  {
    label: '文档分块',
    value: stats.chunks,
    helper: '写入向量索引的 chunk 总数',
    accent: 'rgba(16,185,129,0.08)',
    icon: <LayersOutlined fontSize="small" />,
  },
  {
    label: '覆盖模块',
    value: stats.modules,
    helper: '已识别并归档的模块数量',
    accent: 'rgba(245,158,11,0.08)',
    icon: <FolderOpenOutlined fontSize="small" />,
  },
];

export default function IndexStats({ stats }) {
  return (
    <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
        {buildStatCards(stats).map((item) => (
          <Paper
            key={item.label}
            elevation={0}
            sx={{
              flex: '1 1 180px',
              minWidth: 0,
              p: 2,
              border: '1px solid',
              borderColor: 'rgba(226,232,240,0.8)',
              borderRadius: 3,
              background: `linear-gradient(135deg, ${item.accent.replace('0.08', '0.12')} 0%, rgba(255,255,255,0.8) 100%)`,
              boxShadow: '0 4px 16px rgba(15,23,42,0.03)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ position: 'absolute', top: -10, right: -10, p: 2, color: item.accent.replace('rgba', 'rgb').replace(',0.08)', ')'), opacity: 0.15, transform: 'scale(1.5)' }}>
              {item.icon}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, position: 'relative', zIndex: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.accent.replace('0.08', '0.8') }} />
              <Typography variant="body2" sx={{ color: '#475569', fontWeight: 600 }}>{item.label}</Typography>
            </Box>
            <Typography sx={{ mt: 1.25, fontSize: 32, fontWeight: 800, lineHeight: 1, color: '#0f172a', position: 'relative', zIndex: 1, letterSpacing: '-0.5px' }}>{item.value}</Typography>
            <Typography variant="caption" sx={{ color: '#64748b', mt: 1, display: 'block', position: 'relative', zIndex: 1 }}>
              {item.helper}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}
