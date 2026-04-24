import { useState, lazy, Suspense } from 'react';
import { Box, AppBar, Toolbar, Typography, Button } from '@mui/material';
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

// 懒加载页面组件：只有用户点击到对应的 Tab 时才会去加载 JS 资源，极大地提升首屏加载速度
const QAPage = lazy(() => import('./pages/QAPage'));
const GraphPage = lazy(() => import('./pages/GraphPage'));
const ManagePage = lazy(() => import('./pages/ManagePage'));
const CoveragePage = lazy(() => import('./pages/CoveragePage'));
const TestCasePage = lazy(() => import('./pages/TestCasePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

// 顶部导航栏配置，定义每个模块对应的图标和组件
const TABS = [
  { label: '问答', component: QAPage, icon: <QuestionAnswerRounded fontSize="small" /> },
  { label: '图谱总览', component: GraphPage, icon: <HubRounded fontSize="small" /> },
  { label: '导入管理', component: ManagePage, icon: <CloudUploadRounded fontSize="small" /> },
  { label: '测试用例生成', component: TestCasePage, icon: <AssignmentTurnedInRounded fontSize="small" /> },
  { label: '覆盖率视图', component: CoveragePage, icon: <PieChartRounded fontSize="small" /> },
  { label: '设置', component: SettingsPage, icon: <SettingsRounded fontSize="small" /> },
];

function App() {
  const [tab, setTab] = useState(0);
  
  // mountedTabs 用于实现“按需挂载” + “保持状态” (Keep-Alive)。
  // 也就是说，首次点击 Tab 时会挂载对应的组件，切换走时不会卸载它（只用 display: none 隐藏），
  // 这样当用户切回这个页面时，它的状态（比如输入的文字、滚动位置）都还在。
  const [mountedTabs, setMountedTabs] = useState([0]);

  const handleTabChange = (newIndex) => {
    setTab(newIndex);
    if (!mountedTabs.includes(newIndex)) {
      setMountedTabs((prev) => [...prev, newIndex]);
    }
  };

  return (
    <SnackbarProvider>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <TopNav tabs={TABS} currentTab={tab} onTabChange={handleTabChange} />

        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ErrorBoundary>
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
                  <Suspense fallback={<LoadingOverlay message={`正在加载 ${t.label} 模块...`} />}>
                    <Page isActive={tab === i} />
                  </Suspense>
                </Box>
              );
            })}
          </ErrorBoundary>
        </Box>
      </Box>
    </SnackbarProvider>
  );
}

export default App;
