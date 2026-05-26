import { Box, Button, Typography, Fade } from '@mui/material';
import { RefreshOutlined, ArrowForwardRounded } from '@mui/icons-material';
import defaultEmptyStateImg from '../assets/empty-state-default.svg';
import searchEmptyStateImg from '../assets/empty-state-search.svg';
import loadingEmptyStateImg from '../assets/empty-state-loading.svg';
import errorEmptyStateImg from '../assets/empty-state-error.svg';
import chatEmptyStateImg from '../assets/chat-empty-state.svg';
import healthyStateImg from '../assets/system_healthy.svg';

/**
 * 极致空状态组件 (Sprite 版)
 * 使用 AI 生成的高清等轴测插画
 */
export default function EmptyState({
  title = '暂无数据',
  description = '',
  actionLabel = '',
  onAction,
  compact = false,
  variant = 'empty', // 'empty' | 'search' | 'loading' | 'error' | 'process' | 'chat' | 'success'
  loading = false,
}) {
  const isLoading = loading || variant === 'loading' || variant === 'process';
  const isError = variant === 'error';
  const isSearch = variant === 'search';
  const isChat = variant === 'chat';
  const isSuccess = variant === 'success';

  // 映射文案
  const displayTitle = isLoading 
    ? (variant === 'process' ? '正在执行智能任务' : '正在同步数据') 
    : (isError ? '发生了点小意外' : (isSearch ? '未找到相关线索' : (isSuccess ? '系统运行稳健' : title)));
    
  const displayDesc = description || (
    isLoading 
      ? 'AI 正在全力以赴，请耐心等待结果产生。' 
      : (isSearch ? '试着精简关键词，或者更换筛选维度再试试。' : (isSuccess ? '当前资产配置与自动化流程均处于健康状态，未发现显著风险。' : '这里目前还是一片处女地，点击下方按钮开启新旅程。'))
  );

  const getIllustrationStyle = () => {
    let bgImg = defaultEmptyStateImg;
    if (isChat) bgImg = chatEmptyStateImg;
    else if (isSearch) bgImg = searchEmptyStateImg;
    else if (isLoading) bgImg = loadingEmptyStateImg;
    else if (isError) bgImg = errorEmptyStateImg;
    else if (isSuccess) bgImg = healthyStateImg;

    return {
      backgroundImage: `url(${bgImg})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    };
  };

  return (
    <Fade in timeout={1000}>
      <Box
        sx={{
          flex: 1,
          minHeight: compact ? 300 : 460,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(16px)',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.05)',
        }}
      >
        {/* 插画区域 */}
        <Box
          sx={{
            width: compact ? 160 : 220,
            height: compact ? 160 : 220,
            mb: 2,
            ...getIllustrationStyle(),
            // 关键：正片叠底过滤掉白色背景，使其与毛玻璃完美融合
            mixBlendMode: isSuccess ? 'normal' : 'multiply', 
            filter: isSuccess ? 'none' : 'drop-shadow(0 8px 16px rgba(99, 102, 241, 0.1))',
            animation: isLoading ? 'pulse 2.5s infinite ease-in-out' : (isSuccess ? 'none' : 'float 5s infinite ease-in-out'),
            '@keyframes float': {
              '0%, 100%': { transform: 'translateY(0px)' },
              '50%': { transform: 'translateY(-15px)' },
            },
            '@keyframes pulse': {
              '0%, 100%': { transform: 'scale(1)', opacity: 0.9 },
              '50%': { transform: 'scale(1.03)', opacity: 0.7 },
            }
          }}
        />

        <Typography variant="h6" fontWeight={800} sx={{ color: 'slate.800', mb: 1, letterSpacing: '-0.02em' }}>
          {displayTitle}
        </Typography>
        
        <Typography variant="body2" sx={{ color: 'slate.500', maxWidth: 460, mb: 4, lineHeight: 1.7 }}>
          {displayDesc}
        </Typography>

        {actionLabel && onAction && (
          <Button
            variant="contained"
            onClick={onAction}
            endIcon={isError ? <RefreshOutlined /> : <ArrowForwardRounded />}
            sx={{
              borderRadius: 4,
              px: 5,
              py: 1.25,
              fontSize: '0.95rem',
              background: (theme) => isError ? theme.palette.error.main : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              boxShadow: (theme) => `0 10px 25px ${isError ? theme.palette.error.main : '#6366f1'}44`,
              textTransform: 'none',
              fontWeight: 700,
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                transform: 'translateY(-3px)',
                boxShadow: (theme) => `0 15px 30px ${isError ? theme.palette.error.main : '#6366f1'}66`,
              },
              '&:active': {
                transform: 'translateY(-1px)',
              }
            }}
          >
            {actionLabel}
          </Button>
        )}
      </Box>
    </Fade>
  );
}
