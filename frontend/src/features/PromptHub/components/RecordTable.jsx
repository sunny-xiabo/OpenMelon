import {
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

export default function RecordTable({ rows, type, onEdit, onDelete, skillCategories = [] }) {
  const categoryMap = new Map(skillCategories.map((item) => [item.id, item.name]));

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>名称</TableCell>
            <TableCell>ID</TableCell>
            {type === 'skill' && <TableCell>分类</TableCell>}
            <TableCell>说明</TableCell>
            <TableCell>状态</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((item) => (
            <TableRow key={item.id} hover>
              <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                  {item.is_default && <Chip size="small" color="primary" label="默认" />}
                </Stack>
              </TableCell>
              <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{item.id}</TableCell>
              {type === 'skill' && (
                <TableCell>
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={categoryMap.get(item.category) || item.category || '未分类'}
                  />
                </TableCell>
              )}
              <TableCell sx={{ color: 'text.secondary' }}>{item.description || '-'}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={item.enabled ? 'success' : 'default'}
                  variant={item.enabled ? 'filled' : 'outlined'}
                  label={item.enabled ? '启用中' : '已停用'}
                />
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" onClick={() => onEdit(item)}>编辑</Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() => onDelete(item)}
                    disabled={type === 'template' && item.is_default}
                  >
                    删除
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={type === 'skill' ? 6 : 5}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                  暂无配置数据
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
