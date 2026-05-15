import { Box, Chip, Stack, Typography, alpha, Button } from '@mui/material';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';

export default function LLMProviderPanel({ fieldMap, draft, providers, onChange, onApplyTemplate }) {
  const providerKey = draft.LLM_PROVIDER ?? fieldMap.LLM_PROVIDER?.value ?? fieldMap.LLM_PROVIDER?.default_value ?? 'openai_compat';
  const provider = providers?.[providerKey] || providers?.openai_compat;
  
  if (!provider) return null;

  const chatValue = draft.CHAT_MODEL ?? fieldMap.CHAT_MODEL?.value ?? '';
  const embeddingValue = draft.EMBEDDING_MODEL ?? fieldMap.EMBEDDING_MODEL?.value ?? '';
  const providerList = Object.values(providers || {});

  return (
    <Box sx={{ 
      borderRadius: 3, 
      overflow: 'hidden', 
      border: '1px solid',
      borderColor: provider.supports_embedding ? 'primary.light' : 'warning.light',
      bgcolor: provider.supports_embedding ? alpha('#eff6ff', 0.6) : alpha('#fffbeb', 0.6),
      mb: 3
    }}>
      <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ 
            width: 48, height: 48, borderRadius: 2, 
            bgcolor: 'primary.main', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
          }}>
            <AutoAwesomeOutlined />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{provider.label || provider.key}</Typography>
              <Chip label={provider.is_openai_compatible ? 'OpenAI-Compatible' : 'Native'} size="small" variant="soft" color="primary" />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              默认地址: {provider.api_base_url}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: 2.5 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>快速应用模板</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {providerList.map((item) => (
                <Chip
                  key={item.key}
                  label={item.label || item.key}
                  onClick={() => onApplyTemplate(item.template || {})}
                  color={providerKey === item.key ? 'primary' : 'default'}
                  variant={providerKey === item.key ? 'filled' : 'outlined'}
                  sx={{ 
                    cursor: 'pointer',
                    borderRadius: 1.5,
                    px: 0.5,
                    transition: 'all 0.2s',
                    '&:hover': { transform: 'translateY(-1px)' }
                  }}
                  icon={providerKey === item.key ? <CheckCircleOutlined /> : undefined}
                />
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>推荐 Chat 模型</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(provider.recommended_chat_models || []).map((model) => (
                <Chip
                  key={model}
                  label={model}
                  size="small"
                  onClick={() => onChange('CHAT_MODEL', model)}
                  color={chatValue === model ? 'primary' : 'default'}
                  variant={chatValue === model ? 'soft' : 'outlined'}
                  sx={{ borderRadius: 1.5 }}
                />
              ))}
            </Stack>
          </Box>

          {provider.supports_embedding && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>推荐 Embedding 模型</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(provider.recommended_embedding_models || []).map((model) => (
                  <Chip
                    key={model}
                    label={model}
                    size="small"
                    onClick={() => onChange('EMBEDDING_MODEL', model)}
                    color={embeddingValue === model ? 'primary' : 'default'}
                    variant={embeddingValue === model ? 'soft' : 'outlined'}
                    sx={{ borderRadius: 1.5 }}
                  />
                ))}
              </Stack>
            </Box>
          )}
          
          {!provider.supports_embedding && (
            <Typography variant="caption" sx={{ color: 'warning.dark', fontStyle: 'italic' }}>
              * 该 Provider 不提供默认 Embedding，知识库功能可能需要单独配置。
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
