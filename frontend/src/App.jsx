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

// Lazy loaded page components
const QAPage = lazy(() => import('./pages/QAPage'));
const GraphPage = lazy(() => import('./pages/GraphPage'));
const ManagePage = lazy(() => import('./pages/ManagePage'));
const CoveragePage = lazy(() => import('./pages/CoveragePage'));
const TestCasePage = lazy(() => import('./pages/TestCasePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

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
