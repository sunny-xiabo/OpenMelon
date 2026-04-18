import { useState } from 'react';
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
import QAPage from './pages/QAPage';
import GraphPage from './pages/GraphPage';
import ManagePage from './pages/ManagePage';
import CoveragePage from './pages/CoveragePage';
import MarkMapPage from './pages/MarkMapPage';
import TestCasePage from './pages/TestCasePage';
import SettingsPage from './pages/SettingsPage';

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

  return (
    <SnackbarProvider>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar
          position="static"
          elevation={4}
          sx={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <Toolbar sx={{ gap: 2, minHeight: '56px !important', px: '24px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mr: 3 }}>
              <AutoGraphRounded sx={{ mr: 1.25, fontSize: 26, color: '#818cf8', filter: 'drop-shadow(0 0 8px rgba(129, 140, 248, 0.4))' }} />
              <Typography
                variant="h6"
                noWrap
                component="div"
                sx={{
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  background: 'linear-gradient(90deg, #e0e7ff 0%, #a5b4fc 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  userSelect: 'none',
                }}
              >
                OpenMelon
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, height: '100%', alignItems: 'flex-end' }}>
              {TABS.map((t, i) => (
                <Button
                  key={t.label}
                  disableRipple
                  onClick={() => setTab(i)}
                  sx={{
                    borderRadius: '10px 10px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    bgcolor: tab === i ? 'background.default' : 'transparent',
                    color: tab === i ? 'primary.main' : 'rgba(255,255,255,0.65)',
                    fontWeight: tab === i ? 700 : 500,
                    minWidth: 'auto',
                    px: 2.5,
                    py: 1.25,
                    pb: tab === i ? 1.5 : 1.25,
                    textTransform: 'none',
                    letterSpacing: 0.5,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 3,
                      background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                      opacity: tab === i ? 1 : 0,
                      transition: 'opacity 0.3s',
                    },
                    '&:hover': {
                      bgcolor: tab === i ? 'background.default' : 'rgba(255,255,255,0.1)',
                      color: tab === i ? 'primary.main' : '#fff',
                    },
                  }}
                >
                  {t.icon}
                  {t.label}
                </Button>
              ))}
            </Box>
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ErrorBoundary>
            {TABS.map((t, i) => {
              const Page = t.component;
              return (
                <Box
                  key={t.label}
                  sx={{
                    display: tab === i ? 'flex' : 'none',
                    flex: 1,
                    overflow: 'hidden',
                    flexDirection: 'column',
                  }}
                >
                  <Page isActive={tab === i} />
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
