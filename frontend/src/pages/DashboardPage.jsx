import React, { useState } from 'react';
import { Box, Paper, useTheme, useMediaQuery } from '@mui/material';
import { PieChartRounded, AutoGraphRounded, AssignmentTurnedInRounded } from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import NavMenuButton from '../components/NavMenuButton';
import CoveragePage from './CoveragePage';
import APIExecutionDashboard from '../features/APIExecutionDashboard/components/APIExecutionDashboard';

const SECTIONS = [
  {
    key: 'coverage',
    label: '覆盖率视图',
    description: '图谱模块与用例的覆盖情况',
    icon: <PieChartRounded fontSize="small" />,
  },
  {
    key: 'api-results',
    label: 'API 执行概览',
    description: 'API 自动化执行的多维度统计',
    icon: <AutoGraphRounded fontSize="small" />,
  },
  {
    key: 'ui-results',
    label: 'UI 自动化概览',
    description: 'UI 测试执行的多维度统计',
    icon: <AssignmentTurnedInRounded fontSize="small" />,
  },
];

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState('coverage');
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'));

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: { xs: 2, md: 3 }, gap: 3, background: 'transparent' }}>
      <PageHeader 
        title="数据仪表盘" 
        subtitle="多维度聚合与分析全链路的执行结果与资产覆盖情况。" 
      />

      <Paper 
        elevation={0} 
        sx={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255, 255, 255, 0.4)', 
          borderRadius: 4, 
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
        }}
      >
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: { xs: 'column', lg: 'row' } }}>
          <Box
            sx={{
              width: { xs: '100%', lg: 280 },
              minWidth: { lg: 280 },
              bgcolor: 'rgba(255, 255, 255, 0.3)',
              borderRight: { xs: 'none', lg: '1px solid' },
              borderBottom: { xs: '1px solid', lg: 'none' },
              borderColor: 'rgba(255, 255, 255, 0.5)',
              background: 'transparent',
              p: 2,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, gap: 0.75, flexWrap: 'wrap' }}>
              {SECTIONS.map((section) => (
                <NavMenuButton
                  key={section.key}
                  active={activeSection === section.key}
                  icon={section.icon}
                  label={section.label}
                  description={section.description}
                  onClick={() => setActiveSection(section.key)}
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, background: 'transparent', display: 'flex', flexDirection: 'column', p: { xs: 2, md: 3 }, overflow: 'auto' }}>
            {activeSection === 'coverage' && <CoveragePage embedded />}
            {activeSection === 'api-results' && <APIExecutionDashboard />}
            {activeSection === 'ui-results' && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                UI 自动化概览功能开发中...
              </Box>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
