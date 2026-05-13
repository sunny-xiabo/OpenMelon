import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import EmptyState from './EmptyState';

export default function LoadingOverlay({ message = '加载中...' }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: (theme) => alpha(theme.palette.common.white, 0.85),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        gap: 2,
      }}
    >
      <EmptyState variant="loading" title={message} compact />
    </Box>
  );
}
