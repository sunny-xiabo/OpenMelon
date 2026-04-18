import { Chip } from '@mui/material';

const STATUS_CONFIG = {
  indexed: { label: '已索引', color: 'success' },
  failed: { label: '失败', color: 'error' },
  reindexing: { label: '重新索引中', color: 'warning' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'default' };
  return (
    <Chip
      label={config.label}
      color={config.color}
      size="small"
      sx={{ fontSize: 11, height: 20 }}
    />
  );
}
