import React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

const Header = ({ serverStatus = 'checking' }) => {
  return (
    <AppBar position="static" color="primary" elevation={0}>
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <AutoAwesomeIcon sx={{ mr: 1 }} />
            <Typography variant="h6" component="div" sx={{ fontWeight: 500 }}>
              多模型驱动 · 测试用例生成平台
            </Typography>
          </Box>

          <Chip
            icon={
              serverStatus === 'connected' ? <CheckCircleIcon /> :
              serverStatus === 'error' ? <ErrorIcon /> :
              <HourglassEmptyIcon />
            }
            label={
              serverStatus === 'connected' ? '后端已连接' :
              serverStatus === 'error' ? '连接失败' :
              '检查连接中...'
            }
            color={
              serverStatus === 'connected' ? 'success' :
              serverStatus === 'error' ? 'error' :
              'default'
            }
            variant="outlined"
            size="small"
          />
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
