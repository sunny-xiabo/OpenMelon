import { Box, Button, Menu, MenuItem, Switch, Tooltip, Typography } from '@mui/material';
import { SaveAlt, Schema } from '@mui/icons-material';
import PageHeader from '../../../components/PageHeader';

const viewButtonSx = (active) => ({
  borderRadius: 1,
  py: 0.5,
  px: 1.5,
  minWidth: 60,
  whiteSpace: 'nowrap',
  color: active ? '#fff' : 'text.secondary',
  bgcolor: active ? 'primary.main' : 'transparent',
  fontWeight: active ? 600 : 500,
  boxShadow: 'none',
  transition: 'all 0.2s',
  '&:hover': { bgcolor: active ? 'primary.dark' : 'rgba(0,0,0,0.04)' },
});

export default function ResultHeader({
  checkVectorStatus,
  exportAnchorEl,
  exportExcel,
  exportXMind,
  generating,
  hasResult,
  parsedTestCases,
  setExportAnchorEl,
  setUseVector,
  setViewMode,
  storeToVector,
  storingVector,
  useVector,
  vectorStatus,
  viewMode,
}) {
  return (
    <PageHeader title="生成结果" subtitle="支持列表、导图和向量库存储。">
      <Tooltip title={!vectorStatus?.available ? '向量库未就绪，无法使用该功能' : '开启后，生成用例时将进行全库语义搜索参考'}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            whiteSpace: 'nowrap',
            bgcolor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.05)' : '#ffffff',
            border: '1px solid',
            borderColor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.4)' : 'divider',
            borderRadius: 2.5,
            p: 0.5,
            boxShadow: (vectorStatus?.available && useVector) ? '0 0 0 3px rgba(59,130,246,0.1)' : '0 1px 3px rgba(15,23,42,0.05)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              bgcolor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.08)' : '#f8fafc',
              borderColor: (vectorStatus?.available && useVector) ? 'rgba(59,130,246,0.6)' : 'rgba(99,102,241,0.3)',
            },
          }}
        >
          <Box
            onClick={checkVectorStatus}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              cursor: 'pointer',
              py: 0.5,
              px: 1.25,
              borderRadius: 2,
              bgcolor: vectorStatus?.available ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
              transition: 'background 0.2s',
              '&:hover': { bgcolor: vectorStatus?.available ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)' },
            }}
            title="点击刷新连接状态"
          >
            <Box sx={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, bgcolor: vectorStatus?.available ? '#10b981' : '#94a3b8', boxShadow: vectorStatus?.available ? '0 0 6px rgba(16,185,129,0.5)' : 'none' }} />
            <Typography variant="caption" sx={{ color: vectorStatus?.available ? '#059669' : '#64748b', fontWeight: 800, whiteSpace: 'nowrap' }}>
              {vectorStatus?.available ? '向量库就绪' : '向量库异常'}
            </Typography>
          </Box>

          <Box sx={{ width: '1px', height: '18px', bgcolor: 'divider', mx: 1.25, flexShrink: 0 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5, pl: 0.25 }}>
            <Switch
              checked={Boolean(vectorStatus?.available && useVector)}
              onChange={(e) => setUseVector(e.target.checked)}
              disabled={!vectorStatus?.available || generating}
              disableRipple
              sx={{
                width: 38,
                height: 22,
                padding: 0,
                margin: 0,
                display: 'flex',
                flexShrink: 0,
                '&:active': {
                  '& .MuiSwitch-thumb': { width: 18 },
                  '& .MuiSwitch-switchBase.Mui-checked': { transform: 'translateX(9px)' },
                },
                '& .MuiSwitch-switchBase': {
                  padding: 2,
                  '&.Mui-checked': {
                    transform: 'translateX(16px)',
                    color: '#fff',
                    '& + .MuiSwitch-track': {
                      opacity: 1,
                      backgroundColor: '#3b82f6',
                      backgroundImage: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                    },
                  },
                },
                '& .MuiSwitch-thumb': {
                  boxShadow: '0 2px 4px 0 rgb(0 0 0 / 20%)',
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  transition: 'width 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, transform 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
                },
                '& .MuiSwitch-track': {
                  borderRadius: 11,
                  opacity: 1,
                  backgroundColor: 'rgba(0,0,0,.15)',
                  boxSizing: 'border-box',
                },
              }}
            />
            <Typography variant="body2" sx={{ fontWeight: 700, color: (vectorStatus?.available && useVector) ? '#1e40af' : (vectorStatus?.available ? '#475569' : 'text.disabled'), userSelect: 'none', whiteSpace: 'nowrap' }}>
              参考检索
            </Typography>
          </Box>
        </Box>
      </Tooltip>
    </PageHeader>
  );
}

export function ResultActionBar({
  exportAnchorEl,
  exportExcel,
  exportXMind,
  generating,
  hasResult,
  parsedTestCases,
  setExportAnchorEl,
  setViewMode,
  storeToVector,
  storingVector,
  vectorStatus,
  viewMode,
}) {
  if (!hasResult && !generating) return null;

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, gap: 1.25, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" fontWeight={600}>
          {generating ? 'AI正在生成测试用例...' : '当前结果看板'}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {!generating && hasResult && (
          <Box sx={{ display: 'flex', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1.5, p: 0.5 }}>
            <Button disableElevation size="small" variant={viewMode === 'stages' ? 'contained' : 'text'} onClick={() => setViewMode('stages')} sx={viewButtonSx(viewMode === 'stages')}>阶段</Button>
            {parsedTestCases.length > 0 && (
              <>
                <Button disableElevation size="small" variant={viewMode === 'list' ? 'contained' : 'text'} onClick={() => setViewMode('list')} sx={viewButtonSx(viewMode === 'list')}>列表</Button>
                <Button disableElevation size="small" variant={viewMode === 'mindmap' ? 'contained' : 'text'} onClick={() => setViewMode('mindmap')} sx={viewButtonSx(viewMode === 'mindmap')}>导图</Button>
              </>
            )}
          </Box>
        )}
        <Tooltip title={generating ? '正在生成中，请稍候...' : !hasResult ? '请先生成测试用例' : !vectorStatus?.available ? '向量库连接异常，暂时无法入库' : '将用例存储至向量库，供后续 RAG 时作为相似案例检索提取'}>
          <span>
            <Button
              variant="outlined"
              size="small"
              onClick={storeToVector}
              disabled={storingVector || !hasResult || generating || !vectorStatus?.available}
              startIcon={<Schema fontSize="small" />}
              sx={{ borderColor: 'rgba(226,232,240,0.8)', '&:hover': { background: 'rgba(59,130,246,0.04)' } }}
            >
              {storingVector ? '存储中...' : '存入向量库'}
            </Button>
          </span>
        </Tooltip>
        {hasResult && !generating && (
          <>
            <Button variant="outlined" size="small" onClick={(e) => setExportAnchorEl(e.currentTarget)} startIcon={<SaveAlt fontSize="small" />}>用例导出</Button>
            <Menu anchorEl={exportAnchorEl} open={Boolean(exportAnchorEl)} onClose={() => setExportAnchorEl(null)}>
              <MenuItem onClick={exportExcel} sx={{ minWidth: 150 }}>导出为 Excel</MenuItem>
              <MenuItem onClick={exportXMind} sx={{ minWidth: 150 }}>导出为 XMind</MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </Box>
  );
}
