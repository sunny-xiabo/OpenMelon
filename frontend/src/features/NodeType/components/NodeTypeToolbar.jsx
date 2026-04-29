import { Box, Button, FormControl, MenuItem, Paper, Select, TextField, Typography } from '@mui/material';
import { NODE_TYPE_CATEGORIES } from '../constants';

export default function NodeTypeToolbar({
  categoryFilter,
  keyword,
  legendCount,
  setCategoryFilter,
  setKeyword,
  setViewMode,
  viewMode,
  visibleCount,
}) {
  return (
    <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          label="搜索类型"
          placeholder="输入类型名"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <MenuItem value="all">全部分类</MenuItem>
            {NODE_TYPE_CATEGORIES.map((category) => (
              <MenuItem key={category} value={category}>{category}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 0.5, bgcolor: 'grey.100', borderRadius: 1, p: 0.375 }}>
          <Button size="small" variant={viewMode === 'card' ? 'contained' : 'text'} onClick={() => setViewMode('card')}>
            卡片视图
          </Button>
          <Button size="small" variant={viewMode === 'table' ? 'contained' : 'text'} onClick={() => setViewMode('table')}>
            表格视图
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary">
          当前共 {legendCount} 个类型，筛选后 {visibleCount} 个
        </Typography>
      </Box>
    </Paper>
  );
}
