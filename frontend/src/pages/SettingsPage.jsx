import { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SettingsSuggestOutlined from '@mui/icons-material/SettingsSuggestOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import ManageSearchOutlined from '@mui/icons-material/ManageSearchOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PageHeader from '../components/PageHeader';
import NavMenuButton from '../components/NavMenuButton';
import NodeTypeConfigPage from './NodeTypeConfigPage';
import PromptHubConfigPage from './PromptHubConfigPage';
import ProjectEnvConfigPage from './ProjectEnvConfigPage';
import GovernanceCenter from '../features/GovernanceCenter/components/GovernanceCenter';
import LogCenter from '../features/LogCenter/components/LogCenter';
import { SETTINGS_SECTION_EVENT } from '../constants/events';

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
          border: '1px solid rgba(255, 255, 255, 0.4)', 
          borderRadius: 4, 
          overflow: 'hidden',
          background: 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 1)'
        }}
      >
        <PageHeader
          title="设置"
          subtitle="统一管理系统配置项。当前已接入节点类型配置，后续可继续扩展更多设置模块。"
        />

        <Box sx={{ display: 'flex', minHeight: 0, flexDirection: { xs: 'column', lg: 'row' } }}>
          <Box
            sx={{
              width: { xs: '100%', lg: 260 },
              minWidth: 0,
              borderRight: { xs: 'none', lg: '1px solid' },
              borderBottom: { xs: '1px solid', lg: 'none' },
              borderColor: 'rgba(255, 255, 255, 0.5)',
              background: 'transparent',
            }}
          >
            <Box sx={{ p: 1.5, position: 'sticky', top: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: '10px', background: 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)', color: 'accent.indigoDark', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: (theme) => `inset 0 2px 4px ${alpha(theme.palette.common.white, 0.7)}, 0 4px 8px ${alpha(theme.palette.accent.indigo, 0.1)}` }}>
                  <SettingsSuggestOutlined fontSize="small" />
                </Box>
              <Box>
                <Typography variant="subtitle2">配置目录</Typography>
                <Typography variant="caption" color="text.secondary">选择要维护的设置项</Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, gap: 0.75, flexWrap: 'wrap' }}>
              {SECTIONS.map((section) => (
                <NavMenuButton
                  key={section.key}
                  active={activeSection === section.key}
                  icon={section.icon}
                  label={section.label}
                  description={section.description}
                  onClick={() => selectSection(section.key)}
                />
              ))}
            </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, background: 'transparent' }}>
            {activeSection === 'node-types' && <NodeTypeConfigPage embedded />}
            {activeSection === 'prompt-hub' && <PromptHubConfigPage embedded />}
            {activeSection === 'project-env' && <ProjectEnvConfigPage embedded />}
            {activeSection === 'governance' && <GovernanceCenter />}
            {activeSection === 'logs' && <LogCenter />}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
