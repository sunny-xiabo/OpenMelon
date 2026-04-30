import { Box, Button, Chip, Paper, TextField, Typography } from '@mui/material';
import { getCategoryChipColor } from '../utils';

export default function NodeTypeCardGrid({
  items,
  nodeTypeOverrides,
  onDelete,
  onEdit,
  onResetOverride,
  onUpdateOverride,
}) {
  return (
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
      {items.map(({ type, category, color, size, locked, constraints }) => (
        <Paper
          key={type}
          elevation={0}
          sx={{
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2.5,
            background: `linear-gradient(180deg, ${color.bg}12 0%, #ffffff 100%)`,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color.bg, border: '1px solid', borderColor: color.border, flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{type}</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {locked && <Chip size="small" label="保留" variant="outlined" />}
              <Chip
                size="small"
                label={category}
                color={getCategoryChipColor(category)}
                variant={category === 'fixed' ? 'filled' : 'outlined'}
              />
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            服务端默认: {color.bg} / {color.border} / 尺寸 {size}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, minHeight: 48 }}>
            {constraints?.join(' ')}
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75, mt: 1.25 }}>
            <TextField
              size="small"
              type="color"
              label="填充色"
              value={nodeTypeOverrides[type]?.bg || color.bg}
              onChange={(e) => onUpdateOverride(type, { bg: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              type="color"
              label="边框色"
              value={nodeTypeOverrides[type]?.border || color.border}
              onChange={(e) => onUpdateOverride(type, { border: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              type="number"
              label="尺寸"
              value={nodeTypeOverrides[type]?.size ?? size}
              onChange={(e) => onUpdateOverride(type, { size: e.target.value })}
              inputProps={{ min: 8, max: 60 }}
              InputLabelProps={{ shrink: true }}
            />
            <Button size="small" variant="text" onClick={() => onResetOverride(type)}>
              恢复默认
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25 }}>
            <Button size="small" variant="outlined" fullWidth onClick={() => onEdit({ type, category, color, size, locked, constraints })}>
              编辑配置
            </Button>
            <Button size="small" variant="outlined" color="error" fullWidth disabled={locked} onClick={() => onDelete({ type })}>
              删除类型
            </Button>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}
