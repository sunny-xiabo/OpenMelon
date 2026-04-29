import { Box, Button, Typography } from '@mui/material';

export default function NodeTypeEmbeddedHeader({ loadNodeTypes, openCreateDialog, resetAllNodeTypeOverrides }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b' }}>节点类型配置</Typography>
        <Typography variant="caption" color="text.secondary">
          统一管理图谱节点类型的服务端配置和当前浏览器下的前端展示样式。
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="contained" size="small" onClick={openCreateDialog} sx={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', boxShadow: '0 2px 8px rgba(99,102,241,0.25)', fontWeight: 600 }}>新增类型</Button>
        <Button variant="outlined" size="small" onClick={resetAllNodeTypeOverrides}>重置前端样式</Button>
        <Button variant="outlined" size="small" onClick={loadNodeTypes}>刷新配置</Button>
      </Box>
    </Box>
  );
}
