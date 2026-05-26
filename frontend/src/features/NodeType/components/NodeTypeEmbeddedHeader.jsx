import { Box, Button, Typography } from '@mui/material';
import { 
  GrainOutlined, 
  Add as AddIcon, 
  Refresh as RefreshIcon, 
  SettingsBackupRestore as RestoreIcon 
} from '@mui/icons-material';

export default function NodeTypeEmbeddedHeader({ loadNodeTypes, openCreateDialog, resetAllNodeTypeOverrides }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1, pb: 1.5, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 1.5, bgcolor: 'rgba(14, 165, 233, 0.08)', color: 'primary.main' }}>
          <GrainOutlined fontSize="small" />
        </Box>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 900, color: 'text.primary' }}>节点类型配置</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', fontWeight: 500 }}>
            管理全域图谱节点类型的服务端元数据配置与当前浏览器下的前端渲染样式展示。
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button 
          variant="contained" 
          color="primary" 
          size="small" 
          startIcon={<AddIcon />}
          onClick={openCreateDialog}
          sx={{ borderRadius: 1.8, fontSize: '10px', fontWeight: 800 }}
        >
          新增类型
        </Button>
        <Button 
          variant="outlined" 
          size="small" 
          startIcon={<RestoreIcon />}
          onClick={resetAllNodeTypeOverrides}
          sx={{ 
            borderRadius: 1.8, fontSize: '10px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' }
          }}
        >
          重置前端样式
        </Button>
        <Button 
          variant="outlined" 
          size="small" 
          startIcon={<RefreshIcon />}
          onClick={loadNodeTypes}
          sx={{ 
            borderRadius: 1.8, fontSize: '10px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' }
          }}
        >
          刷新配置
        </Button>
      </Box>
    </Box>
  );
}
