import { Alert, Box, Stack, Typography, alpha } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LightbulbOutlined from '@mui/icons-material/LightbulbOutlined';

export default function ConfigGuide({ activeTitle, isProviderPanel }) {
  // 1. 基础运行指南
  const renderRuntimeGuide = () => (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <InfoOutlined color="primary" sx={{ fontSize: 18 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>生效机制说明</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ pl: 3.25 }}>
        • <b>热更新</b>: 保存后立即对后续新请求生效，不影响执行中的任务。<br />
        • <b>需重启</b>: 配置已写入 .env，但需重启服务以初始化数据库或向量库连接。
      </Typography>
    </Box>
  );

  // 2. 章节特定引导
  const renderSectionSpecific = () => {
    if (activeTitle?.includes('OpenMelon 主模块 LLM')) {
      return (
        <Alert severity="info" icon={<LightbulbOutlined />} sx={{ borderRadius: 2, bgcolor: alpha('#eff6ff', 0.8) }}>
          <Typography variant="caption" sx={{ fontWeight: 500 }}>
            此处配置系统默认的 LLM、Embedding 和生成参数。若 Testcase 模块未独立配置，将回退使用此处的设置。
          </Typography>
        </Alert>
      );
    }
    if (activeTitle?.includes('testcase_gen 独立 LLM')) {
      return (
        <Alert severity="warning" icon={<LightbulbOutlined />} sx={{ borderRadius: 2, bgcolor: alpha('#fffbeb', 0.8) }}>
          <Typography variant="caption" sx={{ fontWeight: 500 }}>
              优先级逻辑：<b>CUSTOM &gt; QWEN/DEEPSEEK &gt; 主模块</b>。配置独立 Key 后将优先调用专项模型。
          </Typography>
        </Alert>
      );
    }
    if (isProviderPanel) {
      return (
        <Alert severity="info" icon={<LightbulbOutlined />} sx={{ borderRadius: 2, bgcolor: alpha('#f0fdf4', 0.8) }}>
          <Typography variant="caption" sx={{ fontWeight: 500 }}>
            此处管理的是 <b>Provider 模板库</b>，保存后会出现在主模块的下拉选项中，不会直接修改当前运行环境。
          </Typography>
        </Alert>
      );
    }
    return null;
  };

  return (
    <Box sx={{ 
      p: 2, 
      borderRadius: 3, 
      bgcolor: alpha('#f8fafc', 0.5), 
      border: '1px dashed', 
      borderColor: 'divider',
      mb: 3
    }}>
      {renderRuntimeGuide()}
      {renderSectionSpecific()}
    </Box>
  );
}
