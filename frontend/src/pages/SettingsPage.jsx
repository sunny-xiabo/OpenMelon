import { useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import SettingsSuggestOutlined from '@mui/icons-material/SettingsSuggestOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import PageHeader from '../components/PageHeader';
import NodeTypeConfigPage from './NodeTypeConfigPage';

const SECTIONS = [
  {
    key: 'node-types',
    label: '节点类型配置',
    description: '管理服务端节点类型与前端展示样式',
    icon: <TuneOutlined fontSize="small" />,
  },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('node-types');

  return (
    <Box sx={{ flex: 1, p: 1.5, overflow: 'auto', bgcolor: 'background.default' }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
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
              borderColor: 'divider',
              background: 'linear-gradient(180deg, rgba(26,115,232,0.04) 0%, rgba(99,102,241,0.02) 100%)',
            }}
          >
            <Box sx={{ p: 1.5, position: 'sticky', top: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: '10px', background: 'linear-gradient(135deg, #eff6ff 0%, #e0e7ff 100%)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.7), 0 4px 8px rgba(99,102,241,0.1)' }}>
                  <SettingsSuggestOutlined fontSize="small" />
                </Box>
              <Box>
                <Typography variant="subtitle2">配置目录</Typography>
                <Typography variant="caption" color="text.secondary">选择要维护的设置项</Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, gap: 0.75, flexWrap: 'wrap' }}>
              {SECTIONS.map((section) => (
                <Button
                  key={section.key}
                  variant={activeSection === section.key ? 'contained' : 'outlined'}
                  color={activeSection === section.key ? 'primary' : 'inherit'}
                  onClick={() => setActiveSection(section.key)}
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    px: 1.25,
                    py: 1,
                    minHeight: 52,
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.9 }}>
                    {section.icon}
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{section.label}</Typography>
                      <Typography variant="caption" color={activeSection === section.key ? 'rgba(255,255,255,0.8)' : 'text.secondary'}>
                        {section.description}
                      </Typography>
                    </Box>
                  </Box>
                </Button>
              ))}
            </Box>
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, bgcolor: 'background.paper' }}>
            {activeSection === 'node-types' && <NodeTypeConfigPage embedded />}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
