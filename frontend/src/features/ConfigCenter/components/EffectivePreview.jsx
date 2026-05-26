import { Box, Chip, Stack, Typography, alpha } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

export default function EffectivePreview({ preview }) {
  if (!preview?.main_llm) return null;
  const main = preview.main_llm;
  const rows = [
    ['LLM Provider 供应商', `${main.provider_label || main.provider}${main.known_provider ? '' : ' (兼容协议回退)'}`],
    ['Base URL 默认接口地址', `${main.base_url || '未配置'}`],
    ['默认 Chat 对话模型', `${main.chat_model || '未配置'}`],
    ['默认 Embedding 向量模型', `${main.embedding_model || '未配置'}`],
  ];

  return (
    <Box sx={{ 
      borderRadius: 4, 
      p: 2.5, 
      bgcolor: 'rgba(255, 255, 255, 0.4)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(26, 115, 232, 0.12)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
      mb: 3
    }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2 }}>
        <InfoOutlined color="info" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontSize: '12px' }}>
          待应用配置生效预览 (Effective Value Preview)
        </Typography>
        <Chip 
          label={main.restart_required ? '应用后需重启服务' : '应用后即时热生效'} 
          color={main.restart_required ? 'warning' : 'success'} 
          size="small" 
          variant="soft"
          sx={{ ml: 'auto', height: 18, fontSize: '9px', fontWeight: 800, borderRadius: 1 }}
        />
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {rows.map(([label, value]) => (
          <Box key={label}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
              {label}
            </Typography>
            <Typography variant="body2" sx={{ 
              fontWeight: 700, 
              fontSize: '11px',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              bgcolor: 'white',
              p: 1.25,
              borderRadius: 2.2,
              border: '1px solid rgba(0,0,0,0.03)',
              color: 'text.primary',
            }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
