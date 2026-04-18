import { Box, Button, Typography } from '@mui/material';

export default function EmptyState({
  title = '暂无数据',
  description = '',
  actionLabel = '',
  onAction,
  compact = false,
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: compact ? 220 : 260,
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2.5,
        bgcolor: '#fbfcff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 1.25,
        color: 'text.secondary',
        textAlign: 'center',
        px: 3,
      }}
    >
      <Typography variant="body2" fontWeight={600} color="text.primary">
        {title}
      </Typography>
      {description && (
        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.6 }}>
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button size="small" variant="outlined" onClick={onAction} sx={{ borderRadius: 2, minWidth: 96 }}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
