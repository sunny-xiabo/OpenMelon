import { Box, Button, Stack, Typography, alpha, useTheme, InputBase } from '@mui/material';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

export default function ConfigSidebar({ groups, activeGroup, onSelect, onSearch, searchQuery }) {
  const theme = useTheme();

  return (
    <Box sx={{ width: '100%', position: 'sticky', top: 0 }}>
      <Stack spacing={2.5}>
        <Box sx={{ 
          px: 2, py: 1, borderRadius: 3, 
          bgcolor: 'rgba(255, 255, 255, 0.4)', 
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          display: 'flex', alignItems: 'center', gap: 1
        }}>
          <SearchOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
          <InputBase
            placeholder="搜索配置项..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            sx={{ fontSize: '0.85rem', width: '100%' }}
          />
        </Box>

        <Stack spacing={0.5}>
          <Box sx={{ px: 2, mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              配置模块
            </Typography>
          </Box>
          {groups.map((group) => {
            const isActive = group.title === activeGroup;
            return (
              <Button
                key={group.title}
                onClick={() => onSelect(group.title)}
                sx={{
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  textTransform: 'none',
                  minHeight: 46,
                  borderRadius: '12px',
                  px: 2,
                  py: 1.25,
                  bgcolor: isActive ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                  color: isActive ? 'primary.main' : 'text.secondary',
                  fontWeight: isActive ? 800 : 500,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: '1px solid',
                  borderColor: isActive ? alpha(theme.palette.primary.main, 0.15) : 'transparent',
                  '&:hover': {
                    bgcolor: isActive ? alpha(theme.palette.primary.main, 0.1) : alpha(theme.palette.action.hover, 0.04),
                    borderColor: isActive ? alpha(theme.palette.primary.main, 0.25) : alpha(theme.palette.divider, 0.1),
                    color: isActive ? 'primary.main' : 'text.primary',
                    transform: isActive ? 'none' : 'translateX(4px)'
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  {group.display_title || group.title}
                </Typography>
                {isActive && <ChevronRightOutlined sx={{ fontSize: 18 }} />}
              </Button>
            );
          })}
        </Stack>
      </Stack>
    </Box>
  );
}
