import { Box, Chip, Stack, Typography, alpha, Divider } from '@mui/material';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';

export default function ConfigDashboard({ status, changedCount }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>运行配置</Typography>
          <Typography variant="body2" color="text.secondary">
            管理当前系统的核心运行参数，所有变更将自动备份至本地。
          </Typography>
        </Box>
        
        <Stack direction="row" spacing={1.5}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>备份版本</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{status.backup_count || 0} 个历史</Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>待保存变更</Typography>
            <Typography variant="body2" color={changedCount > 0 ? "primary.main" : "text.secondary"} sx={{ fontWeight: 600 }}>
              {changedCount} 项修改
            </Typography>
          </Box>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip 
          icon={<CheckCircleOutlineOutlined sx={{ fontSize: '1rem !important' }} />} 
          label=".env 已激活" 
          color="success" 
          variant="soft"
          size="small" 
          sx={{ borderRadius: 1.5, px: 0.5 }}
        />
        <Chip 
          icon={<HistoryOutlined sx={{ fontSize: '1rem !important' }} />}
          label={`模板: ${status.example_exists ? '.env.example' : '缺失'}`} 
          variant="outlined"
          size="small" 
          sx={{ borderRadius: 1.5, px: 0.5, borderColor: 'rgba(0,0,0,0.1)' }}
        />
        <Chip 
          icon={<RestartAltOutlined sx={{ fontSize: '1rem !important' }} />} 
          label="部分修改需重启" 
          color="warning" 
          variant="soft"
          size="small" 
          sx={{ borderRadius: 1.5, px: 0.5 }}
        />
        {changedCount > 0 && (
          <Chip 
            label="未保存" 
            color="primary" 
            size="small" 
            sx={{ borderRadius: 1.5, px: 0.5, fontWeight: 600 }}
          />
        )}
      </Stack>
    </Box>
  );
}
