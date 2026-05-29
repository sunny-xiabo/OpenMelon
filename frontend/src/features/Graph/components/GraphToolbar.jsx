import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';

export default function GraphToolbar({
  checkGraphStatus,
  docType,
  filters,
  graphReady,
  loadFullGraph,
  moduleFilter,
  onExport,
  onTogglePathMode,
  pathMode,
  resetGraph,
  searchEntity,
  searchText,
  setDocType,
  setModuleFilter,
  setSearchText,
  setShowChunks,
  showChunks,
}) {
  return (
    <Paper square elevation={0} sx={{ display: 'flex', gap: 1, px: 2, py: 1.5, borderBottom: '1px solid rgba(226,232,240,0.8)', alignItems: 'center', flexWrap: 'wrap', background: '#ffffff', zIndex: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 2, borderRight: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small"
          placeholder="搜实体名称..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchEntity()}
          sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: 13 } }}
        />
        <Button size="small" variant="contained" onClick={searchEntity} sx={{ borderRadius: 2, boxShadow: 'none' }}>检索</Button>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select value={docType} onChange={(e) => setDocType(e.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
            <MenuItem value="">全部类型</MenuItem>
            {filters.doc_types?.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
            <MenuItem value="">全部模块</MenuItem>
            {filters.modules?.map((moduleName) => <MenuItem key={moduleName} value={moduleName}>{moduleName}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControlLabel
          sx={{ mx: 1 }}
          control={<Checkbox size="small" checked={showChunks} onChange={(e) => setShowChunks(e.target.checked)} color="primary" />}
          label={<Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>显示分块</Typography>}
        />
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box sx={{ display: 'flex', gap: 1 }}>
        {onTogglePathMode && (
          <Button size="small" variant={pathMode ? 'contained' : 'outlined'} onClick={onTogglePathMode} disabled={!graphReady} sx={{ borderRadius: 2, fontSize: 12 }}>
            {pathMode ? '取消路径查询' : '路径查询'}
          </Button>
        )}
        {onExport && (
          <Button size="small" variant="outlined" onClick={onExport} disabled={!graphReady} sx={{ borderRadius: 2, fontSize: 12 }}>
            导出图片
          </Button>
        )}
        {!graphReady && (
          <Button size="small" variant="outlined" onClick={checkGraphStatus} sx={{ borderRadius: 2 }}>刷新数据</Button>
        )}
        <Button size="small" variant="outlined" onClick={resetGraph} sx={{ borderRadius: 2, color: 'text.secondary', borderColor: 'divider' }}>重置</Button>
        <Button size="small" variant="contained" onClick={loadFullGraph} disabled={!graphReady} sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}>全图</Button>
      </Box>
    </Paper>
  );
}
