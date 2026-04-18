import { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Box, Typography, Slide } from '@mui/material';
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
  success: { color: '#10b981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.3)' },
  error: { color: '#ef4444', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.3)' },
  info: { color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.3)' },
  warning: { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.3)' },
};

function SlideTransition(props) {
  return <Slide {...props} direction="down" />;
}

export function SnackbarProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('info');

  const showSnackbar = useCallback((msg, sev = 'info') => {
    setMessage(msg);
    setSeverity(sev);
    setOpen(true);
  }, []);

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
            bgcolor: 'rgba(255, 255, 255, 0.95)',
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
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', zIndex: 1, letterSpacing: '0.2px' }}>
            {message}
          </Typography>
        </Box>
      </Snackbar>
    </SnackbarContext.Provider>
  );
}
