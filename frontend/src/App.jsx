import { useEffect, useState, Suspense } from 'react';
import { Box } from '@mui/material';
import {
  QuestionAnswerRounded,
  HubRounded,
  CloudUploadRounded,
  AssignmentTurnedInRounded,
  PieChartRounded,
  SettingsRounded,
  AutoGraphRounded,
} from '@mui/icons-material';
import { SnackbarProvider } from './components/SnackbarProvider';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingOverlay from './components/LoadingOverlay';
import TopNav from './components/TopNav';
import lazyWithRetry from './utils/lazyWithRetry';
import { SWITCH_TAB_EVENT } from './constants/events';

// 懒加载页面组件：只有用户点击到对应的 Tab 时才会去加载 JS 资源，极大地提升首屏加载速度
const QAPage = lazyWithRetry(() => import('./pages/QAPage'));
const GraphPage = lazyWithRetry(() => import('./pages/GraphPage'));
const ManagePage = lazyWithRetry(() => import('./pages/ManagePage'));
const DashboardPage = lazyWithRetry(() => import('./pages/DashboardPage'));
const TestCasePage = lazyWithRetry(() => import('./pages/TestCasePage'));
const SettingsPage = lazyWithRetry(() => import('./pages/SettingsPage'));
const APIExecutionPage = lazyWithRetry(() => import('./pages/APIExecutionPage'));

// 顶部导航栏配置，定义每个模块对应的图标和组件
const TABS = [
  { label: '导入管理', component: ManagePage, icon: <CloudUploadRounded fontSize="small" /> },
  { label: '图谱总览', component: GraphPage, icon: <HubRounded fontSize="small" /> },
  { label: '问答', component: QAPage, icon: <QuestionAnswerRounded fontSize="small" /> },
  { label: '测试用例生成', component: TestCasePage, icon: <AssignmentTurnedInRounded fontSize="small" /> },
  { label: 'API 自动化', component: APIExecutionPage, icon: <AutoGraphRounded fontSize="small" /> },
  { label: '数据仪表盘', component: DashboardPage, icon: <PieChartRounded fontSize="small" /> },
  { label: '设置', component: SettingsPage, icon: <SettingsRounded fontSize="small" /> },
];

function App() {
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem('openmelon_active_tab');
    return saved !== null ? parseInt(saved, 10) : 0;
  });
  
  // mountedTabs 用于实现“按需挂载” + “保持状态” (Keep-Alive)。
  // 也就是说，首次点击 Tab 时会挂载对应的组件，切换走时不会卸载它（只用 display: none 隐藏），
  // 这样当用户切回这个页面时，它的状态（比如输入的文字、滚动位置）都还在。
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

  return (
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
                  animation: tab === i ? 'fadeSlideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' : 'none',
                  '@keyframes fadeSlideUp': {
                    '0%': { opacity: 0, transform: 'translateY(12px)' },
                    '100%': { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                <ErrorBoundary>
                  <Suspense fallback={<LoadingOverlay message={`正在加载 ${t.label} 模块...`} />}>
                    <Page isActive={tab === i} />
                  </Suspense>
                </ErrorBoundary>
              </Box>
            );
          })}
        </Box>
      </Box>
    </SnackbarProvider>
  );
}

export default App;
