import { createTheme } from '@mui/material/styles';
import { NODE_TYPE_META } from './nodeTypes';

// Tailwind Slate scale -- primary text/bg/border system
const slate = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
};

// Accent colors used across the UI
const accent = {
  indigo: '#6366f1',
  indigoDark: '#4f46e5',
  blue: '#3b82f6',
  blueDark: '#2563eb',
  emerald: '#10b981',
  emeraldDark: '#059669',
  amber: '#f59e0b',
  amberDark: '#d97706',
  orange: '#f57c00',
  orangeDark: '#e65100',
  cyan: '#0891b2',
  purple: '#9334e6',
};

// Reusable gradient presets
const gradients = {
  primary: `linear-gradient(135deg, ${accent.blue} 0%, ${accent.indigo} 100%)`,
  primaryHover: `linear-gradient(135deg, ${accent.blueDark} 0%, ${accent.indigoDark} 100%)`,
  success: `linear-gradient(135deg, ${accent.emerald} 0%, ${accent.emeraldDark} 100%)`,
  nav: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
  headerBlue: 'linear-gradient(90deg, rgba(59,130,246,0.06) 0%, rgba(99,102,241,0.04) 100%)',
  headerGreen: 'linear-gradient(90deg, rgba(16,185,129,0.06) 0%, rgba(52,211,153,0.03) 100%)',
};

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
      primary: slate[800],
      secondary: '#5f6368',
      disabled: '#9aa0a6',
    },
    divider: '#e8eaed',
    slate,
    accent,
    gradients,
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
          borderRadius: 8,
          fontWeight: 600,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        contained: {
          boxShadow: '0 4px 12px rgba(26, 115, 232, 0.15)',
          position: 'relative',
          overflow: 'hidden',
          '&:hover': {
            boxShadow: '0 6px 16px rgba(26, 115, 232, 0.25)',
            transform: 'translateY(-1px)',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '50%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
            transform: 'skewX(-20deg)',
            transition: 'none',
          },
          '&:hover::after': {
            left: '200%',
            transition: 'left 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
          }
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
          backgroundColor: slate[50],
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            borderBottom: `2px solid ${slate[200]}`,
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
