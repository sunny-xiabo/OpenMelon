import React from 'react';
import { AppBar, Toolbar, Typography, Box, Tabs, Tab } from '@mui/material';
import { alpha } from '@mui/material/styles';

function OpenMelonBrandIcon() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 34,
        height: 34,
        mr: 1.25,
        borderRadius: '10px',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(220,252,231,0.9))',
        boxShadow: '0 10px 24px rgba(15, 118, 64, 0.22), inset 0 0 0 1px rgba(255,255,255,0.7)',
        flexShrink: 0,
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 64 64"
        sx={{ width: 27, height: 27, display: 'block' }}
      >
        <defs>
          <linearGradient id="nav-rind" x1="12" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2bd96f" />
            <stop offset="0.58" stopColor="#15b85f" />
            <stop offset="1" stopColor="#07833f" />
          </linearGradient>
          <linearGradient id="nav-flesh" x1="18" y1="27" x2="42" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff7f8f" />
            <stop offset="1" stopColor="#f0445e" />
          </linearGradient>
        </defs>
        <circle cx="30" cy="34" r="23" fill="url(#nav-rind)" />
        <path d="M12.5 38.6 47.8 20.4c3.9 11.9-2.7 26.1-14.8 30.1-8.3 2.8-16.7-1.1-20.5-11.9Z" fill="#fff" />
        <path d="M18.4 40.7 43.1 28.1c1.4 7.7-3.3 16.2-11.1 18.9-5.6 1.9-10.7-.5-13.6-6.3Z" fill="url(#nav-flesh)" />
        <path d="M12.4 31.2c1.6-5.4 5.5-10 10.7-12.2" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <path d="M27.2 15.8c1.4-.4 2.8-.6 4.3-.7" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="24.8" cy="41.5" rx="2.1" ry="3.4" fill="#102033" transform="rotate(18 24.8 41.5)" />
        <ellipse cx="33.7" cy="37.2" rx="2.1" ry="3.4" fill="#102033" transform="rotate(-63 33.7 37.2)" />
        <ellipse cx="31.4" cy="46.1" rx="2" ry="3.2" fill="#102033" transform="rotate(-9 31.4 46.1)" />
        <rect x="45" y="13" width="7" height="7" rx="1.6" fill="#0aa657" />
        <rect x="53" y="22" width="5" height="5" rx="1.2" fill="#16b864" />
      </Box>
    </Box>
  );
}

export default function TopNav({ tabs, currentTab, onTabChange }) {
  // 切换标签页时的统一处理函数，把事件和新选中的索引传回给父组件(App.jsx)
  const handleChange = (event, newValue) => {
    onTabChange(newValue);
  };

  return (
    <AppBar
      position="static"
      elevation={4}
      sx={{
        // 极客风深色渐变背景，与 OpenMelon 的整体调性保持一致
        background: (theme) => theme.palette.gradients.nav,
        borderBottom: (theme) => '1px solid ' + alpha(theme.palette.common.white, 0.05),
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: '56px !important', px: '24px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 3, flexShrink: 0 }}>
          <OpenMelonBrandIcon />
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
          {/* 使用 Tabs 替代普通的 Button 列表，最重要的是开启 variant="scrollable" 
              这样以后如果增加了新的模块（比如自动化测试等），顶部空间不够时会自动出现横向滚动条，
              保证页面布局不会被挤压换行，拥有非常好的扩展性 */}
          <Tabs
            value={currentTab}
            onChange={handleChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 56,
              // 定制底部指示条（高亮条）的样式，使其带有圆角和渐变色
              '& .MuiTabs-indicator': {
                height: 3,
                borderRadius: '3px 3px 0 0',
                background: 'linear-gradient(90deg, #6366f1, #a855f7)',
              },
              // 滚动箭头的样式
              '& .MuiTabs-scrollButtons': {
                color: (theme) => alpha(theme.palette.common.white, 0.6),
                '&.Mui-disabled': {
                  opacity: 0.2,
                },
                '&:hover': {
                  color: 'common.white',
                },
              },
            }}
          >
            {tabs.map((t, i) => (
              <Tab
                key={t.label}
                onMouseEnter={() => {
                  if (t.preload) {
                    t.preload().catch(() => {}); // 忽略预加载可能出现的错误
                  }
                }}
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
                  color: currentTab === i ? 'primary.main' : (theme) => alpha(theme.palette.common.white, 0.65),
                  fontWeight: currentTab === i ? 700 : 500,
                  textTransform: 'none',
                  letterSpacing: 0.5,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  borderRadius: '8px 8px 0 0',
                  margin: '0 4px',
                  '&:hover': {
                    color: currentTab === i ? 'primary.main' : 'common.white',
                    bgcolor: (theme) => alpha(theme.palette.common.white, 0.05),
                  },
                  '&.Mui-selected': {
                    color: '#a5b4fc',
                    bgcolor: (theme) => alpha(theme.palette.common.white, 0.08),
                  },
                }}
              />
            ))}
          </Tabs>
        </Box>
        
        {/* Temporarily hidden until user management is implemented 
        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0, ml: 1 }}>
          <Tooltip title="用户设置 (User)">
             <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
               <AccountCircle fontSize="small" />
             </IconButton>
          </Tooltip>
        </Box>
        */}
      </Toolbar>
    </AppBar>
  );
}
