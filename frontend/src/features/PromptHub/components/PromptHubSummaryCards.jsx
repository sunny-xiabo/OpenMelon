import { Box, Paper, Stack, Typography } from '@mui/material';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import BoltOutlined from '@mui/icons-material/BoltOutlined';

export default function PromptHubSummaryCards({ summary }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
      <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(255,255,255,0.9) 100%)' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AutoAwesomeOutlined fontSize="small" color="primary" />
          <Typography variant="body2" fontWeight={700}>启用模板</Typography>
        </Stack>
        <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{summary.enabledTemplates}</Typography>
      </Paper>
      <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(255,255,255,0.9) 100%)' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <BoltOutlined fontSize="small" sx={{ color: '#059669' }} />
          <Typography variant="body2" fontWeight={700}>启用技能</Typography>
        </Stack>
        <Typography sx={{ mt: 1.5, fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{summary.enabledSkills}</Typography>
      </Paper>
      <Paper elevation={0} sx={{ p: 2, border: '1px solid rgba(226,232,240,0.8)', borderRadius: 3, background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(255,255,255,0.9) 100%)' }}>
        <Typography variant="body2" fontWeight={700}>默认模板</Typography>
        <Typography sx={{ mt: 1.5, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{summary.defaultTemplate}</Typography>
      </Paper>
    </Box>
  );
}

export function PromptHubWritingGuide() {
  return (
    <Paper elevation={0} sx={{ p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: '#fbfcff' }}>
      <Typography variant="subtitle1" fontWeight={700}>填写建议</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        模板负责控制“怎么写”，技能负责补“多覆盖什么”。两者都不能改变标准 Markdown 用例协议。
      </Typography>
    </Paper>
  );
}
