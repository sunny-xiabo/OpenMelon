import { Box, Button, CircularProgress, Typography } from '@mui/material';
import {
  ErrorOutlineOutlined,
  InboxOutlined,
  RefreshOutlined,
} from '@mui/icons-material';

export default function EmptyState({
  title = '暂无数据',
  description = '',
  actionLabel = '',
  onAction,
  compact = false,
  variant = 'empty',
  loading = false,
}) {
  const isLoading = loading || variant === 'loading';
  const isError = variant === 'error';
  const fallbackTitle = isLoading ? '加载中' : isError ? '加载失败' : title;
  const fallbackDescription = isLoading ? description || '正在获取最新数据，请稍候。' : description;
  const icon = isLoading
    ? <CircularProgress size={24} />
    : isError
      ? <ErrorOutlineOutlined color="error" />
      : <InboxOutlined color="disabled" />;
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: compact ? 220 : 260,
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2.5,
        bgcolor: 'slate.50',
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 28 }}>
        {icon}
      </Box>
      <Typography variant="body2" fontWeight={600} color="text.primary">
        {fallbackTitle}
      </Typography>
      {fallbackDescription && (
        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360, lineHeight: 1.6 }}>
          {fallbackDescription}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button
          size="small"
          variant="outlined"
          onClick={onAction}
          startIcon={isError ? <RefreshOutlined /> : null}
          sx={{ borderRadius: 2, minWidth: 96 }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
