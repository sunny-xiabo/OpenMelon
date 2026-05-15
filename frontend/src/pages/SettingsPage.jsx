import { useEffect, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SettingsSuggestOutlined from '@mui/icons-material/SettingsSuggestOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import ManageSearchOutlined from '@mui/icons-material/ManageSearchOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import QueryStatsOutlined from '@mui/icons-material/QueryStatsOutlined';
import DisplaySettingsOutlined from '@mui/icons-material/DisplaySettingsOutlined';
import PageHeader from '../components/PageHeader';
import NavMenuButton from '../components/NavMenuButton';
import { SETTINGS_SECTION_EVENT } from '../constants/events';
import NodeTypeConfigPage from './NodeTypeConfigPage';
import PromptHubConfigPage from './PromptHubConfigPage';
import ProjectEnvConfigPage from './ProjectEnvConfigPage';
import GovernanceCenter from '../features/GovernanceCenter';
import LogCenter from '../features/LogCenter';
import AIObservabilityPanel from '../features/AIObservability';
import ConfigCenter from '../features/ConfigCenter';

const SECTIONS = [
  {
    key: 'node-types',
    label: '节点类型配置',
    description: '管理服务端节点类型与前端展示样式',
    icon: <TuneOutlined fontSize="small" />,
  },
  {
    key: 'prompt-hub',
    label: 'Prompt Hub',
    description: '管理测试用例模板、技能与默认策略',
    icon: <AutoAwesomeOutlined fontSize="small" />,
  },
  {
    key: 'project-env',
    label: '项目与环境',
    description: '管理 API 自动化的项目和测试环境配置',
    icon: <FolderOpenOutlined fontSize="small" />,
  },
  {
    key: 'governance',
    label: '治理中心',
    description: '统一管理知识、任务、模板和数据资产状态',
    icon: <ManageSearchOutlined fontSize="small" />,
  },
  {
    key: 'logs',
    label: '日志中心',
    description: '查看执行、策略、任务和知识写入事件',
    icon: <ReceiptLongOutlined fontSize="small" />,
  },
  {
    key: 'ai-observability',
    label: 'AI/RAG 观测',
    description: '查看模型调用、耗时、token 和降级失败',
    icon: <QueryStatsOutlined fontSize="small" />,
  },
  {
    key: 'runtime-config',
    label: '运行配置',
    description: '初始化和管理当前 .env 运行配置',
    icon: <DisplaySettingsOutlined fontSize="small" />,
  },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState(() => sessionStorage.getItem('openmelon_settings_section') || 'node-types');

  const selectSection = (section) => {
    setActiveSection(section);
    sessionStorage.setItem('openmelon_settings_section', section);
  };

  useEffect(() => {
    const handleSettingsSection = (event) => {
      const section = event.detail?.section;
      if (section && SECTIONS.some((item) => item.key === section)) {
        selectSection(section);
      }
    };
    window.addEventListener(SETTINGS_SECTION_EVENT, handleSettingsSection);
    return () => window.removeEventListener(SETTINGS_SECTION_EVENT, handleSettingsSection);
  }, []);

  return (
    <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, overflow: 'auto', background: 'transparent' }}>
      <Paper 
        elevation={0} 
        sx={{ 
          minHeight: '100%',
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
        <PageHeader
          title="设置中心"
          subtitle="统一维护图谱节点、Prompt 模板、环境变量及系统运行状态。"
        />

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: { xs: 'column', lg: 'row' } }}>
          <Box
            sx={{
              width: { xs: '100%', lg: 240 },
              minWidth: 0,
              borderRight: { xs: 'none', lg: '1px solid' },
              borderBottom: { xs: '1px solid', lg: 'none' },
              borderColor: 'rgba(255, 255, 255, 0.4)',
              background: 'rgba(255, 255, 255, 0.2)',
            }}
          >
            <Box sx={{ p: 1.5, position: 'sticky', top: 0 }}>
              <Box sx={{ px: 1.5, mb: 2 }}>
                <Typography variant="overline" sx={{ fontWeight: 800, color: 'text.secondary', letterSpacing: '0.1em' }}>配置目录</Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, gap: 0.5, flexWrap: 'wrap' }}>
                {SECTIONS.map((section) => (
                  <NavMenuButton
                    key={section.key}
                    active={activeSection === section.key}
                    icon={section.icon}
                    label={section.label}
                    description={section.description}
                    onClick={() => selectSection(section.key)}
                    sx={{
                      borderRadius: 2.5,
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.5)',
                      }
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto', p: 3 }}>
            <Box sx={{ 
              height: '100%',
              borderRadius: 3, 
              bgcolor: 'rgba(255, 255, 255, 0.4)', 
              border: '1px solid rgba(255, 255, 255, 0.5)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {activeSection === 'node-types' && <NodeTypeConfigPage embedded />}
              {activeSection === 'prompt-hub' && <PromptHubConfigPage embedded />}
              {activeSection === 'project-env' && <ProjectEnvConfigPage embedded />}
              {activeSection === 'governance' && <GovernanceCenter />}
              {activeSection === 'logs' && <LogCenter />}
              {activeSection === 'ai-observability' && <AIObservabilityPanel />}
              {activeSection === 'runtime-config' && <ConfigCenter />}
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
