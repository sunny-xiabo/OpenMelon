import { Box, Button, Stack, Typography, alpha, useTheme, InputBase, Badge } from '@mui/material';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

export default function ConfigSidebar({ groups, activeGroup, onSelect, onSearch, searchQuery, status }) {
  const theme = useTheme();

  return (
    <Box sx={{ width: '100%', position: 'sticky', top: 20 }}>
      <Stack spacing={3}>
        {/* Search input with premium focus outline */}
        <Box 
          sx={{ 
            px: 2, 
            py: 1, 
            borderRadius: 3.5, 
            bgcolor: 'rgba(255, 255, 255, 0.45)', 
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            display: 'flex', 
            alignItems: 'center', 
            gap: 1.25,
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.01), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
            transition: 'all 0.3s',
            '&:focus-within': {
              borderColor: 'primary.main',
              bgcolor: 'rgba(255, 255, 255, 0.85)',
              boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}, 0 4px 12px rgba(15, 23, 42, 0.03)`
            }
          }}
        >
          <SearchOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
          <InputBase
            placeholder="搜索配置项 (Key/描述)..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            sx={{ 
              fontSize: '12px', 
              width: '100%',
              fontWeight: 600,
              color: 'text.primary',
              '& input::placeholder': {
                color: 'text.secondary',
                opacity: 0.7
              }
            }}
          />
        </Box>

        {/* Sidebar Sections */}
        <Stack spacing={1}>
          <Box sx={{ px: 2, mb: 0.5 }}>
            <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.1em' }}>
              配置子模块
            </Typography>
          </Box>
          <Stack spacing={0.75}>
            {groups.map((group) => {
              const isActive = group.title === activeGroup;
              
              // Smart count calculation
              let itemCount = 0;
              if (group.title === 'Provider 管理') {
                itemCount = Object.keys(status?.llm_providers || {}).length;
              } else if (group.fields) {
                itemCount = group.fields.length;
              }

              return (
                <Button
                  key={group.title}
                  onClick={() => onSelect(group.title)}
                  sx={{
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    textTransform: 'none',
                    minHeight: 48,
                    borderRadius: 3,
                    px: 2.2,
                    py: 1.5,
                    bgcolor: isActive ? alpha(theme.palette.primary.main, 0.05) : 'transparent',
                    color: isActive ? 'primary.main' : 'text.secondary',
                    fontWeight: isActive ? 800 : 600,
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    border: '1px solid',
                    borderColor: isActive ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
                    position: 'relative',
                    overflow: 'hidden',
                    // Active indicator bar
                    '&::before': isActive ? {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      top: '25%',
                      height: '50%',
                      width: '3.5px',
                      borderRadius: '0 3px 3px 0',
                      bgcolor: 'primary.main',
                    } : null,
                    '&:hover': {
                      bgcolor: isActive ? alpha(theme.palette.primary.main, 0.08) : 'rgba(255,255,255,0.4)',
                      borderColor: isActive ? alpha(theme.palette.primary.main, 0.2) : 'rgba(0,0,0,0.03)',
                      color: isActive ? 'primary.main' : 'text.primary',
                      transform: isActive ? 'none' : 'translateX(4px)',
                      '& .chevron-icon': {
                        opacity: 1,
                        transform: 'translateX(0)'
                      }
                    },
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0, mr: 1 }}>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontSize: '13px', 
                        fontWeight: isActive ? 800 : 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {group.display_title || group.title}
                    </Typography>
                    
                    {/* Compact Item Count Badge */}
                    {itemCount > 0 && (
                      <Box
                        sx={{
                          fontSize: '10px',
                          fontWeight: 800,
                          px: 0.8,
                          py: 0.1,
                          borderRadius: 99,
                          bgcolor: isActive ? 'primary.main' : 'rgba(0,0,0,0.05)',
                          color: isActive ? 'white' : 'text.secondary',
                          transition: 'all 0.25s',
                        }}
                      >
                        {itemCount}
                      </Box>
                    )}
                  </Stack>

                  {/* Sleek icon indicator */}
                  <ChevronRightOutlined 
                    className="chevron-icon"
                    sx={{ 
                      fontSize: 16, 
                      opacity: isActive ? 0.8 : 0, 
                      transform: isActive ? 'translateX(0)' : 'translateX(-4px)',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }} 
                  />
                </Button>
              );
            })}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
}
