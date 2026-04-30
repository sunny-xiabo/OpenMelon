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
import { AccountTree } from '@mui/icons-material';
import LoadingOverlay from '../../../components/LoadingOverlay';
import EmptyState from '../../../components/EmptyState';

export default function GraphInsightPanel({
  checkGraphStatus,
  containerRef,
  docType,
  filters,
  graphLoading,
  graphReady,
  isNarrow,
  legend,
  loadFullGraph,
  moduleFilter,
  searchEntity,
  searchText,
  setDocType,
  setModuleFilter,
  setSearchText,
  setShowChunks,
  showChunks,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: isNarrow ? '100%' : '42%',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        overflow: 'hidden',
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(226,232,240,0.8)', background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, background: 'linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.7), 0 4px 8px rgba(6,182,212,0.1)' }}>
            <AccountTree fontSize="small" />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b' }}>图谱线索</Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>辅助定位模块、节点关系和检索命中文档</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ p: 1.25, borderBottom: '1px solid rgba(226,232,240,0.8)', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 1, zIndex: 2 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="搜索实体..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && searchEntity()}
            sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: 13 } }}
          />
          <Button size="small" variant="contained" onClick={searchEntity} disabled={!graphReady || !searchText.trim()} sx={{ borderRadius: 2, boxShadow: 'none' }}>
            搜索
          </Button>
          <Button size="small" variant="outlined" onClick={loadFullGraph} disabled={!graphReady} sx={{ borderRadius: 2 }}>全图</Button>
          {!graphReady && (
            <Button size="small" variant="outlined" onClick={checkGraphStatus} sx={{ borderRadius: 2 }}>刷新数据</Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 110, flex: '0 0 auto' }}>
            <Select value={docType} onChange={(event) => setDocType(event.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
              <MenuItem value="">全部类型</MenuItem>
              {filters.doc_types?.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 110, flex: '0 0 auto' }}>
            <Select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} displayEmpty sx={{ borderRadius: 2, bgcolor: '#f8fafc', fontSize: 13 }}>
              <MenuItem value="">全部模块</MenuItem>
              {filters.modules?.map((module) => <MenuItem key={module} value={module}>{module}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Checkbox size="small" checked={showChunks} onChange={(event) => setShowChunks(event.target.checked)} color="info" />}
            label={<Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>显示分块</Typography>}
            sx={{ ml: 0.25 }}
          />
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minHeight: 0, overflow: 'hidden' }}>
        {graphLoading && <LoadingOverlay message="图谱数据加载中..." />}
        {graphReady === false ? (
          <Box sx={{ m: 1, flex: 1, minHeight: 0, display: 'flex' }}>
            <EmptyState
              title="暂无数据"
              description="Neo4j 为空，上传完成后会自动恢复，也可以手动刷新数据。"
              actionLabel="刷新数据"
              onAction={checkGraphStatus}
            />
          </Box>
        ) : (
          <Box ref={containerRef} sx={{ flex: 1, minHeight: 0, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', outline: 'none', bgcolor: '#f8fafc', backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        )}
        <Box sx={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexWrap: 'wrap', gap: 1.25, p: 1.25, bgcolor: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', border: '1px solid', borderColor: 'rgba(255,255,255,0.4)', borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.04)', zIndex: 10, maxWidth: 'calc(100% - 32px)' }}>
          {legend.map(({ type, color }) => (
            <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: 'rgba(255,255,255,0.6)', px: 1, py: 0.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color.bg, boxShadow: `0 0 0 1px ${color.border}` }} />
              <Typography variant="caption" sx={{ color: '#475569', fontWeight: 500 }}>{type}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Paper>
  );
}
