import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import {
  QuestionAnswerRounded,
  HubRounded,
  CloudUploadRounded,
  AssignmentTurnedInRounded,
  PieChartRounded,
  SettingsRounded,
  AutoGraphRounded,
  StorageRounded,
} from '@mui/icons-material';
import IndexGovernanceIcon from './components/icons/IndexGovernanceIcon';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from './components/SnackbarProvider';
import ErrorBoundary from './components/ErrorBoundary';
import TopNav from './components/TopNav';
import { SWITCH_TAB_EVENT } from './constants/events';
import QAPage from './pages/QAPage';
import GraphPage from './pages/GraphPage';
import ManagePage from './pages/ManagePage';
import DashboardPage from './pages/DashboardPage';
import TestCasePage from './pages/TestCasePage';
import SettingsPage from './pages/SettingsPage';
import APIExecutionPage from './pages/APIExecutionPage';
import IndexGovernancePage from './pages/IndexGovernancePage';

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
  { label: '导入管理', component: ManagePage, icon: <CloudUploadRounded fontSize="small" /> },
  { label: '图谱总览', component: GraphPage, icon: <HubRounded fontSize="small" /> },
  { label: '问答', component: QAPage, icon: <QuestionAnswerRounded fontSize="small" /> },
  { label: '测试用例生成', component: TestCasePage, icon: <AssignmentTurnedInRounded fontSize="small" /> },
  { label: 'API 自动化', component: APIExecutionPage, icon: <AutoGraphRounded fontSize="small" /> },
  { label: '数据仪表盘', component: DashboardPage, icon: <PieChartRounded fontSize="small" /> },
  { label: '索引治理', component: IndexGovernancePage, icon: <IndexGovernanceIcon fontSize="small" /> },
  { label: '设置', component: SettingsPage, icon: <SettingsRounded fontSize="small" /> },
];

function App() {
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem('openmelon_active_tab');
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  
  const [mountedTabs, setMountedTabs] = useState(() => {
    const saved = sessionStorage.getItem('openmelon_active_tab');
    const initialTab = saved !== null ? parseInt(saved, 10) : 0;
    return [initialTab];
  });

  const handleTabChange = (newIndex) => {
    setTab(newIndex);
    sessionStorage.setItem('openmelon_active_tab', newIndex.toString());
    if (!mountedTabs.includes(newIndex)) {
      setMountedTabs((prev) => [...prev, newIndex]);
    }
  };

  useEffect(() => {
    const handleSwitchTab = (event) => {
      const nextIndex = Number(event.detail?.tabIndex);
      if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < TABS.length) {
        handleTabChange(nextIndex);
      }
    };
    window.addEventListener(SWITCH_TAB_EVENT, handleSwitchTab);
    return () => window.removeEventListener(SWITCH_TAB_EVENT, handleSwitchTab);
  }, [mountedTabs]);

  useEffect(() => {
    const mountAllTabs = () => {
      setMountedTabs(TABS.map((_, index) => index));
    };

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(mountAllTabs, { timeout: 1600 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timer = window.setTimeout(mountAllTabs, 900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <Box 
          sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100vh', 
            background: 'linear-gradient(135deg, #f6f8fb 0%, #eef1f6 50%, #f6f8fb 100%)',
            backgroundSize: '200% 200%',
            animation: 'bgGradient 15s ease infinite',
            '@keyframes bgGradient': {
              '0%': { backgroundPosition: '0% 50%' },
              '50%': { backgroundPosition: '100% 50%' },
              '100%': { backgroundPosition: '0% 50%' },
            },
          }}
        >
          <TopNav tabs={TABS} currentTab={tab} onTabChange={handleTabChange} />

          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {TABS.map((t, i) => {
              if (!mountedTabs.includes(i)) return null;
              
              const Page = t.component;
              return (
                <Box
                  key={t.label}
                  sx={{
                    display: tab === i ? 'flex' : 'none',
                    flex: 1,
                    overflow: 'hidden',
                    flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  <ErrorBoundary>
                    <Page isActive={tab === i} />
                  </ErrorBoundary>
                </Box>
              );
            })}
          </Box>
        </Box>
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

export default App;
