import { Box, Chip, Stack, Typography, alpha } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

export default function EffectivePreview({ preview }) {
  if (!preview?.main_llm) return null;
  const main = preview.main_llm;
  const rows = [
    ['Provider', `${main.provider_label || main.provider}${main.known_provider ? '' : '（兼容回退）'}`],
    ['Base URL', `${main.base_url || '未配置'}`],
    ['Chat Model', `${main.chat_model || '未配置'}`],
    ['Embedding', `${main.embedding_model || '未配置'}`],
  ];

  return (
    <Box sx={{ 
      borderRadius: 3, 
      p: 2.5, 
      bgcolor: alpha('#f8fafc', 0.8),
      border: '1px solid',
      borderColor: 'divider',
      mb: 3
    }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <InfoOutlined color="info" fontSize="small" />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>变更后生效预览</Typography>
        <Chip 
          label={main.restart_required ? '保存后需重启' : '保存后即时生效'} 
          color={main.restart_required ? 'warning' : 'success'} 
          size="small" 
          variant="soft"
          sx={{ ml: 'auto', height: 20, fontSize: '0.7rem' }}
        />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {rows.map(([label, value]) => (
          <Box key={label}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{label}</Typography>
            <Typography variant="body2" sx={{ 
              fontWeight: 500, 
              wordBreak: 'break-all',
              bgcolor: 'white',
              p: 1,
              borderRadius: 1,
              border: '1px solid rgba(0,0,0,0.05)'
            }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
