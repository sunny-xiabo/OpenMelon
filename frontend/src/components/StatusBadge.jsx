import { Chip, CircularProgress, Box } from '@mui/material';

const STATUS_CONFIG = {
  indexed: { label: '已索引', color: 'success' },
  failed: { label: '失败', color: 'error' },
  reindexing: { label: '重新索引中...', color: 'warning' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'default' };
  
  const icon = status === 'reindexing' ? (
    <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
      <CircularProgress size={12} color="inherit" thickness={5} />
    </Box>
  ) : undefined;

  return (
    <Chip
      label={config.label}
      color={config.color}
      size="small"
      icon={icon}
      sx={{ fontSize: 11, height: 22, pl: icon ? 0.5 : 0 }}
    />
  );
}
