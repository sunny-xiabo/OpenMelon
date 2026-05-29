import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Snackbar, Box, Typography, Slide } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { CheckCircleOutline, ErrorOutline, InfoOutlined, WarningAmberOutlined } from '@mui/icons-material';

const SnackbarContext = createContext();

export function useSnackbar() {
  return useContext(SnackbarContext);
}

const ICONS = {
  success: <CheckCircleOutline fontSize="small" />,
  error: <ErrorOutline fontSize="small" />,
  info: <InfoOutlined fontSize="small" />,
  warning: <WarningAmberOutlined fontSize="small" />,
};

const STYLES = {
  success: { color: 'accent.emerald', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.3)' },
  error: { color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.3)' },
  info: { color: 'accent.blue', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.3)' },
  warning: { color: 'accent.amber', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.3)' },
};

function SlideTransition(props) {
  return <Slide {...props} direction="down" />;
}

export function SnackbarProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('info');

  const showSnackbar = useCallback((msg, sev = 'info') => {
    const nextSeverity = typeof sev === 'string' ? sev : sev?.severity || 'info';
    setMessage(msg);
    setSeverity(nextSeverity);
    setOpen(true);
  }, []);

  // 全局 API 错误事件消费：client.js 分发的事件统一在这里弹出提示
  const recentErrorsRef = useRef(new Map());
  useEffect(() => {
    const DEDUP_WINDOW_MS = 5000;

    const handleAPIError = (event) => {
      const error = event.detail;
      if (!error) return;

      // 去重：相同 code + status 的错误在短时间内只弹一次
      const dedupKey = `${error.code || 'UNKNOWN'}_${error.status || 0}`;
      const now = Date.now();
      const lastSeen = recentErrorsRef.current.get(dedupKey);
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return;
      recentErrorsRef.current.set(dedupKey, now);

      // 定期清理过期的去重记录
      if (recentErrorsRef.current.size > 50) {
        for (const [key, ts] of recentErrorsRef.current) {
          if (now - ts > DEDUP_WINDOW_MS) recentErrorsRef.current.delete(key);
        }
      }

      showSnackbar(error.message || '请求失败，请稍后重试', 'error');
    };

    const handleAuthExpired = (event) => {
      const error = event.detail;
      if (!error) return;
      showSnackbar(error.message || '认证已过期，请重新登录', 'warning');
    };

    window.addEventListener('openmelon:api-error', handleAPIError);
    window.addEventListener('openmelon:auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('openmelon:api-error', handleAPIError);
      window.removeEventListener('openmelon:auth-expired', handleAuthExpired);
    };
  }, [showSnackbar]);

  const handleClose = useCallback((event, reason) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  }, []);

  const currentStyle = STYLES[severity] || STYLES.info;

  return (
    <SnackbarContext.Provider value={showSnackbar}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={severity === 'error' ? 4000 : 1500}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        TransitionComponent={SlideTransition}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 2,
            py: 1,
            mt: 2,
            bgcolor: (theme) => alpha(theme.palette.common.white, 0.95),
            backdropFilter: 'blur(12px)',
            border: '1px solid',
            borderColor: currentStyle.border,
            borderRadius: 8,
            boxShadow: '0 8px 32px rgba(15,23,42,0.08), 0 2px 8px rgba(15,23,42,0.04)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: 48,
              background: `linear-gradient(90deg, ${currentStyle.bg} 0%, transparent 100%)`,
              pointerEvents: 'none',
            }}
          />
          <Box sx={{ color: currentStyle.color, display: 'flex', alignItems: 'center', zIndex: 1 }}>
            {ICONS[severity] || ICONS.info}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'slate.800', zIndex: 1, letterSpacing: '0.2px' }}>
            {message}
          </Typography>
        </Box>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
