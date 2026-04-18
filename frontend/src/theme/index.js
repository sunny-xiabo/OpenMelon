import { createTheme } from '@mui/material/styles';
import { NODE_TYPE_META } from './nodeTypes';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#1a73e8',
      light: '#e8f0fe',
      dark: '#2c3e50',
    },
    secondary: {
      main: '#3651d4',
    },
    error: {
      main: '#d93025',
    },
    warning: {
      main: '#e37400',
    },
    success: {
      main: '#1e8e3e',
    },
    background: {
      default: '#f5f6fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#202124',
      secondary: '#5f6368',
      disabled: '#9aa0a6',
    },
    divider: '#e8eaed',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h1: { fontSize: '24px', fontWeight: 600 },
    h2: { fontSize: '20px', fontWeight: 600 },
    h3: { fontSize: '18px', fontWeight: 600 },
    h4: { fontSize: '16px', fontWeight: 600 },
    h5: { fontSize: '14px', fontWeight: 600 },
    h6: { fontSize: '13px', fontWeight: 600 },
    subtitle1: { fontSize: '14px', fontWeight: 600 },
    body1: { fontSize: '13px' },
    body2: { fontSize: '12px' },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 6,
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: 13,
        },
        head: {
          fontWeight: 600,
          backgroundColor: '#f8f9fa',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            borderBottom: '2px solid #e8eaed',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            fontSize: 13,
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: 16,
          fontWeight: 600,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
  },
});

export const NODE_COLORS = {
  ...Object.fromEntries(Object.entries(NODE_TYPE_META).map(([type, meta]) => [type, meta.color])),
};

export const NODE_SIZES = {
  ...Object.fromEntries(Object.entries(NODE_TYPE_META).map(([type, meta]) => [type, meta.size])),
};
