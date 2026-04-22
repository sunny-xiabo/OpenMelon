import React from 'react';
import { AppBar, Toolbar, Typography, Box, Tabs, Tab, IconButton, Tooltip } from '@mui/material';
import { AutoGraphRounded, AccountCircle } from '@mui/icons-material';

export default function TopNav({ tabs, currentTab, onTabChange }) {
  const handleChange = (event, newValue) => {
    onTabChange(newValue);
  };

  return (
    <AppBar
      position="static"
      elevation={4}
      sx={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: '56px !important', px: '24px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 3, flexShrink: 0 }}>
          <AutoGraphRounded sx={{ mr: 1.25, fontSize: 26, color: '#818cf8', filter: 'drop-shadow(0 0 8px rgba(129, 140, 248, 0.4))' }} />
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{
              fontWeight: 800,
              letterSpacing: 0.8,
              background: 'linear-gradient(90deg, #e0e7ff 0%, #a5b4fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              userSelect: 'none',
            }}
          >
            OpenMelon
          </Typography>
        </Box>

        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%', alignItems: 'flex-end' }}>
          <Tabs
            value={currentTab}
            onChange={handleChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 56,
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
                background: 'linear-gradient(90deg, #6366f1, #a855f7)',
              },
              '& .MuiTabs-scrollButtons': {
                color: 'rgba(255,255,255,0.6)',
                '&.Mui-disabled': {
                  opacity: 0.2,
                },
                '&:hover': {
                  color: '#fff',
                },
              },
            }}
          >
            {tabs.map((t, i) => (
              <Tab
                key={t.label}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    {t.icon}
                    {t.label}
                  </Box>
                }
                disableRipple
                sx={{
                  minHeight: 56,
                  px: 2.5,
                  py: 1.5,
                  color: currentTab === i ? 'primary.main' : 'rgba(255,255,255,0.65)',
                  fontWeight: currentTab === i ? 700 : 500,
                  textTransform: 'none',
                  letterSpacing: 0.5,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: '8px 8px 0 0',
                  margin: '0 4px',
                  '&:hover': {
                    color: currentTab === i ? 'primary.main' : '#fff',
                    bgcolor: 'rgba(255,255,255,0.05)',
                  },
                  '&.Mui-selected': {
                    color: '#a5b4fc',
                    bgcolor: 'rgba(255,255,255,0.08)',
                  },
                }}
              />
            ))}
          </Tabs>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 1 }}>
          <Tooltip title="用户设置 (User)">
             <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
               <AccountCircle fontSize="small" />
             </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
