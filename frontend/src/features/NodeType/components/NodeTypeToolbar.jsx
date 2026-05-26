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
    <Paper 
      elevation={0} 
      sx={{ 
        p: 2, 
        border: '1px solid rgba(0,0,0,0.05)', 
        borderRadius: 4, 
        bgcolor: 'white',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)'
      }}
    >
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          label="搜索类型"
          placeholder="输入类型名称检索..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          sx={{ 
            minWidth: 240,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2.2,
              fontSize: '12px',
              fontWeight: 700,
              bgcolor: 'white',
            }
          }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <Select 
            value={categoryFilter} 
            onChange={(e) => setCategoryFilter(e.target.value)}
            sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 700 }}
          >
            <MenuItem value="all" sx={{ fontSize: '12px', fontWeight: 700 }}>全部分类</MenuItem>
            {NODE_TYPE_CATEGORIES.map((category) => (
              <MenuItem key={category} value={category} sx={{ fontSize: '12px', fontWeight: 700 }}>
                {category}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Tactile Segmented Button group for view mode toggling */}
        <Box sx={{ display: 'flex', gap: 0.5, bgcolor: 'rgba(0, 0, 0, 0.04)', borderRadius: 2.5, p: 0.5, border: '1px solid rgba(0,0,0,0.02)' }}>
          <Button 
            size="small" 
            variant="text" 
            onClick={() => setViewMode('card')}
            sx={{ 
              borderRadius: 1.8, 
              fontSize: '11px', 
              fontWeight: 800, 
              px: 2,
              py: 0.5,
              bgcolor: viewMode === 'card' ? 'white' : 'transparent',
              color: viewMode === 'card' ? 'primary.main' : 'text.secondary',
              boxShadow: viewMode === 'card' ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
              '&:hover': { bgcolor: viewMode === 'card' ? 'white' : 'rgba(0,0,0,0.03)' }
            }}
          >
            卡片视图
          </Button>
          <Button 
            size="small" 
            variant="text" 
            onClick={() => setViewMode('table')}
            sx={{ 
              borderRadius: 1.8, 
              fontSize: '11px', 
              fontWeight: 800, 
              px: 2,
              py: 0.5,
              bgcolor: viewMode === 'table' ? 'white' : 'transparent',
              color: viewMode === 'table' ? 'primary.main' : 'text.secondary',
              boxShadow: viewMode === 'table' ? '0 2px 8px rgba(0,0,0,0.04)' : 'none',
              '&:hover': { bgcolor: viewMode === 'table' ? 'white' : 'rgba(0,0,0,0.03)' }
            }}
          >
            表格视图
          </Button>
        </Box>

        {/* Status text floated to the right */}
        <Typography 
          variant="caption" 
          sx={{ 
            color: 'text.secondary', 
            fontWeight: 700, 
            ml: { xs: 0, lg: 'auto' }, 
            letterSpacing: '0.02em',
            fontFamily: 'monospace'
          }}
        >
          全域共 {legendCount} 个节点类型 / 筛选后 {visibleCount} 个
        </Typography>
      </Box>
    </Paper>
  );
}
