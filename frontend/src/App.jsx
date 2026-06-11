import { memo, useCallback, useEffect, useState, useMemo } from 'react';
import { Box, ThemeProvider, CssBaseline } from '@mui/material';
import { getTheme } from './theme';
import {
  QuestionAnswerRounded,
  HubRounded,
  CloudUploadRounded,
  AssignmentTurnedInRounded,
  PieChartRounded,
  SettingsRounded,
  AutoGraphRounded,
  AccountTreeRounded,
} from '@mui/icons-material';
import IndexGovernanceIcon from './components/icons/IndexGovernanceIcon';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from './components/SnackbarProvider';
import ErrorBoundary from './components/ErrorBoundary';
import TopNav from './components/TopNav';
import { SWITCH_TAB_EVENT } from './constants/events';
import ManagePage from './pages/ManagePage';
import GraphPage from './pages/GraphPage';
import QAPage from './pages/QAPage';
import TestCasePage from './pages/TestCasePage';
import APIExecutionPage from './pages/APIExecutionPage';
import DashboardPage from './pages/DashboardPage';
import IndexGovernancePage from './pages/IndexGovernance';
import SettingsPage from './pages/SettingsPage';
import WorkflowPage from './features/Workflow/WorkflowPage';

// 初始化 TanStack Query 客户端
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 默认不根据窗口焦点重新获取数据，避免过于频繁的请求
      refetchOnWindowFocus: false,
      // 失败后默认只重试一次
      retry: 1,
      // 缓存有效时间设定为 5 分钟
      staleTime: 5 * 60 * 1000,
    },
  },
});

// 顶部导航栏配置
const TABS = [
  { key: 'manage', label: '导入管理', component: ManagePage, icon: <CloudUploadRounded fontSize="small" /> },
  { key: 'graph', label: '图谱总览', component: GraphPage, icon: <HubRounded fontSize="small" /> },
  { key: 'qa', label: '问答', component: QAPage, icon: <QuestionAnswerRounded fontSize="small" /> },
  { key: 'testCase', label: '测试用例生成', component: TestCasePage, icon: <AssignmentTurnedInRounded fontSize="small" /> },
  { key: 'apiExecution', label: 'API 自动化', component: APIExecutionPage, icon: <AutoGraphRounded fontSize="small" /> },
  { key: 'dashboard', label: '数据仪表盘', component: DashboardPage, icon: <PieChartRounded fontSize="small" /> },
  { key: 'indexGovernance', label: '索引治理', component: IndexGovernancePage, icon: <IndexGovernanceIcon fontSize="small" /> },
  { key: 'workflow', label: '工作流', component: WorkflowPage, icon: <AccountTreeRounded fontSize="small" /> },
  { key: 'settings', label: '设置', component: SettingsPage, icon: <SettingsRounded fontSize="small" /> },
];

const getInitialTab = () => {
  const saved = sessionStorage.getItem('openmelon_active_tab');
  const savedTab = saved !== null ? Number.parseInt(saved, 10) : 0;
  return Number.isInteger(savedTab) && savedTab >= 0 && savedTab < TABS.length ? savedTab : 0;
};

const PageSlot = memo(function PageSlot({ tabConfig, active }) {
  const Page = tabConfig.component;
  return (
    <Box
      sx={{
        display: active ? 'flex' : 'none',
        flex: 1,
        overflow: 'hidden',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <ErrorBoundary>
        <Page isActive={active} />
      </ErrorBoundary>
    </Box>
  );
});

function App() {
  const [tab, setTab] = useState(getInitialTab);
  const [mountedTabs, setMountedTabs] = useState(() => [getInitialTab()]);

  // Load initial theme mode from localStorage, defaulting to system scheme
  const [themeMode, setThemeMode] = useState(() => {
    const saved = localStorage.getItem('openmelon_theme_mode');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Memoize theme object based on mode
  const activeTheme = useMemo(() => getTheme(themeMode), [themeMode]);

  // Sync theme mode with body class
  useEffect(() => {
    if (themeMode === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    localStorage.setItem('openmelon_theme_mode', themeMode);
  }, [themeMode]);

  const handleTabChange = useCallback((newIndex) => {
    setTab(newIndex);
    sessionStorage.setItem('openmelon_active_tab', newIndex.toString());
    setMountedTabs((prev) => (prev.includes(newIndex) ? prev : [...prev, newIndex]));
  }, []);

  useEffect(() => {
    const handleSwitchTab = (event) => {
      const nextIndex = Number(event.detail?.tabIndex);
      if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < TABS.length) {
        handleTabChange(nextIndex);
      }
    };
    window.addEventListener(SWITCH_TAB_EVENT, handleSwitchTab);
    return () => window.removeEventListener(SWITCH_TAB_EVENT, handleSwitchTab);
  }, [handleTabChange]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={activeTheme}>
        <CssBaseline />
        <SnackbarProvider>
          <Box 
            sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100vh', 
              background: themeMode === 'dark'
                ? 'linear-gradient(135deg, #090d16 0%, #030712 50%, #090d16 100%)'
                : 'linear-gradient(135deg, #f6f8fb 0%, #eef1f6 50%, #f6f8fb 100%)',
              backgroundSize: '200% 200%',
              animation: 'bgGradient 15s ease infinite',
              transition: 'background var(--transition-normal)',
              '@keyframes bgGradient': {
                '0%': { backgroundPosition: '0% 50%' },
                '50%': { backgroundPosition: '100% 50%' },
                '100%': { backgroundPosition: '0% 50%' },
              },
            }}
          >
            <TopNav 
              tabs={TABS} 
              currentTab={tab} 
              onTabChange={handleTabChange} 
              themeMode={themeMode}
              onThemeModeChange={setThemeMode}
            />

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {TABS.map((t, i) => {
                if (!mountedTabs.includes(i)) return null;
                return (
                  <PageSlot
                    key={t.label}
                    tabConfig={t}
                    active={tab === i}
                  />
                );
              })}
            </Box>
          </Box>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
