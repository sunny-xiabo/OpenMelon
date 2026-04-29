import {
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { getCategoryChipColor } from '../utils';

export default function NodeTypeTable({
  items,
  nodeTypeOverrides,
  onDelete,
  onEdit,
  onResetOverride,
  onUpdateOverride,
}) {
  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>类型</TableCell>
            <TableCell>分类</TableCell>
            <TableCell>默认样式</TableCell>
            <TableCell>前端覆盖</TableCell>
            <TableCell>限制说明</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map(({ type, category, color, size, locked, constraints }) => (
            <TableRow key={type} hover>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color.bg, border: '1px solid', borderColor: color.border }} />
                  <Typography variant="body2" fontWeight={600}>{type}</Typography>
                  {locked && <Chip size="small" label="保留" variant="outlined" />}
                </Box>
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={category}
                  color={getCategoryChipColor(category)}
                  variant={category === 'fixed' ? 'filled' : 'outlined'}
                />
              </TableCell>
              <TableCell>
                <Typography variant="caption" color="text.secondary">
                  {color.bg} / {color.border} / {size}
                </Typography>
              </TableCell>
              <TableCell sx={{ minWidth: 220 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
                  <TextField
                    size="small"
                    type="color"
                    value={nodeTypeOverrides[type]?.bg || color.bg}
                    onChange={(e) => onUpdateOverride(type, { bg: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    type="color"
                    value={nodeTypeOverrides[type]?.border || color.border}
                    onChange={(e) => onUpdateOverride(type, { border: e.target.value })}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    type="number"
                    value={nodeTypeOverrides[type]?.size ?? size}
                    onChange={(e) => onUpdateOverride(type, { size: e.target.value })}
                    inputProps={{ min: 8, max: 60 }}
                  />
                </Box>
              </TableCell>
              <TableCell sx={{ maxWidth: 320 }}>
                <Typography variant="caption" color="text.secondary">
                  {constraints?.join(' ')}
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Button size="small" variant="text" onClick={() => onResetOverride(type)}>
                    恢复默认
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => onEdit({ type, category, color, size, locked, constraints })}>
                    编辑
                  </Button>
                  <Button size="small" variant="outlined" color="error" disabled={locked} onClick={() => onDelete({ type })}>
                    删除
                  </Button>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
