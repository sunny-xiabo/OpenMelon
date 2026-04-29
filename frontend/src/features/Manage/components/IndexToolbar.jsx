import {
  Box,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

export default function IndexToolbar({
  dateFilter,
  loadFiles,
  searchText,
  setDateFilter,
  setSearchText,
  setStatusFilter,
  statusFilter,
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.25, bgcolor: '#f8fafc', borderBottom: '1px solid rgba(226,232,240,0.8)', gap: 1.25, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} sx={{ borderRadius: 2, bgcolor: '#ffffff', fontSize: 13 }}>
            <MenuItem value="all">全部时间</MenuItem>
            <MenuItem value="today">今日导入</MenuItem>
            <MenuItem value="week">本周导入</MenuItem>
            <MenuItem value="month">本月导入</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} sx={{ borderRadius: 2, bgcolor: '#ffffff', fontSize: 13 }}>
            <MenuItem value="all">全部状态</MenuItem>
            <MenuItem value="indexed">已索引</MenuItem>
            <MenuItem value="failed">失败</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          placeholder="搜索文件名..."
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && loadFiles()}
          sx={{ width: 220, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#ffffff' }, '& .MuiInputBase-input': { fontSize: 13 } }}
        />
      </Box>
      <Tooltip title="刷新列表">
        <IconButton size="small" onClick={loadFiles}>
          <RefreshIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
