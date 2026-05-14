import { Box, Typography, Fade } from '@mui/material';
import { alpha } from '@mui/material/styles';

export default function LoadingOverlay({ message = 'AI 正在思考中...' }) {
  // 定义高级动效
  const animations = {
    '@keyframes orbit': {
      '0%': { transform: 'rotate(0deg)' },
      '100%': { transform: 'rotate(360deg)' },
    },
    '@keyframes breath': {
      '0%, 100%': { transform: 'scale(1)', opacity: 0.8, filter: 'blur(8px)' },
      '50%': { transform: 'scale(1.2)', opacity: 1, filter: 'blur(12px)' },
    },
    '@keyframes textFlow': {
      '0%, 100%': { opacity: 0.5 },
      '50%': { opacity: 1 },
    }
  };

  return (
    <Fade in timeout={500}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: (theme) => alpha(theme.palette.common.white, 0.4),
          backdropFilter: 'blur(16px)', // 极强的模糊感，营造高级通透感
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          gap: 4,
          ...animations,
        }}
      >
        {/* 高级脉冲加载器 */}
        <Box sx={{ position: 'relative', width: 80, height: 80 }}>
          {/* 核心球体 */}
          <Box
            sx={{
              position: 'absolute',
              inset: 15,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              boxShadow: '0 0 30px rgba(99, 102, 241, 0.6), inset 0 0 10px rgba(255,255,255,0.5)',
              animation: 'breath 2s infinite ease-in-out',
            }}
          />
          
          {/* 外层轨道 1 */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              border: '2px solid transparent',
              borderTopColor: '#6366f1',
              borderBottomColor: '#a855f7',
              borderRadius: '50%',
              animation: 'orbit 1.5s linear infinite',
            }}
          />

          {/* 外层轨道 2 */}
          <Box
            sx={{
              position: 'absolute',
              inset: -8,
              border: '1px solid transparent',
              borderLeftColor: '#38bdf8',
              borderRightColor: '#818cf8',
              borderRadius: '50%',
              opacity: 0.5,
              animation: 'orbit 3s linear infinite reverse',
            }}
          />
        </Box>

        {/* 呼吸文字 */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'slate.800',
              textTransform: 'uppercase',
              animation: 'textFlow 2s infinite ease-in-out',
            }}
          >
            {message}
          </Typography>
        </Box>
      </Box>
    </Fade>
  );
}
