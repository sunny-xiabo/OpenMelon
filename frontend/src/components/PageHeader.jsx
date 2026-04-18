import { Typography, Box } from '@mui/material';

export default function PageHeader({ title, subtitle = '', children }) {
  return (
    <Box
      sx={{
        px: 2.5,
        py: 2.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'rgba(26,115,232,0.04)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={600} color="text.primary">
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {children && <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{children}</Box>}
    </Box>
  );
}
