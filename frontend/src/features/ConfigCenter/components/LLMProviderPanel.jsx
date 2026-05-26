import { Box, Chip, Stack, Typography, alpha, Button, Grid } from '@mui/material';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import MemoryOutlined from '@mui/icons-material/MemoryOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';

export default function LLMProviderPanel({ fieldMap, draft, providers, onChange, onApplyTemplate }) {
  const providerKey = draft.LLM_PROVIDER ?? fieldMap.LLM_PROVIDER?.value ?? fieldMap.LLM_PROVIDER?.default_value ?? 'openai_compat';
  const provider = providers?.[providerKey] || providers?.openai_compat;
  
  if (!provider) return null;

  const chatValue = draft.CHAT_MODEL ?? fieldMap.CHAT_MODEL?.value ?? '';
  const embeddingValue = draft.EMBEDDING_MODEL ?? fieldMap.EMBEDDING_MODEL?.value ?? '';
  const providerList = Object.values(providers || {});

  const hasEmbedding = provider.supports_embedding !== false;

  return (
    <Box 
      sx={{ 
        borderRadius: 4.5, 
        overflow: 'hidden', 
        border: '1px solid',
        borderColor: hasEmbedding ? 'rgba(26, 115, 232, 0.2)' : 'rgba(245, 158, 11, 0.2)',
        bgcolor: hasEmbedding ? 'rgba(240, 249, 255, 0.45)' : 'rgba(255, 251, 235, 0.45)',
        backdropFilter: 'blur(20px)',
        boxShadow: `0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)`,
        mb: 4.5,
        position: 'relative'
      }}
    >
      {/* Visual background gradient glow for AI theme */}
      <Box sx={{ 
        position: 'absolute', top: -50, left: -50, width: 160, height: 160, 
        background: `radial-gradient(circle, ${alpha(hasEmbedding ? '#0ea5e9' : '#f59e0b', 0.1)} 0%, transparent 75%)`,
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      {/* Header section with breathing AI icon */}
      <Box sx={{ p: 3, borderBottom: '1px solid rgba(0,0,0,0.04)', position: 'relative', zIndex: 1 }}>
        <Stack direction="row" spacing={2.2} alignItems="center">
          <Box 
            className="pulse-animation"
            sx={{ 
              width: 50, height: 50, borderRadius: 3, 
              bgcolor: hasEmbedding ? 'primary.main' : 'warning.main', 
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 6px 20px ${alpha(hasEmbedding ? '#1a73e8' : '#f59e0b', 0.35)}`,
              inset: '0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            <AutoAwesomeOutlined sx={{ fontSize: 24 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.01em' }}>
                {provider.label || provider.key}
              </Typography>
              <Chip 
                label={provider.is_openai_compatible ? 'OpenAI 协议兼容' : '原生内置接口'} 
                size="small" 
                sx={{ 
                  height: 18, 
                  fontSize: '9.5px', 
                  fontWeight: 800,
                  bgcolor: provider.is_openai_compatible ? 'rgba(26, 115, 232, 0.08)' : 'rgba(0,0,0,0.06)',
                  color: provider.is_openai_compatible ? 'primary.main' : 'text.secondary',
                  border: 'none',
                }} 
              />
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
              <LanguageOutlined sx={{ fontSize: 13, color: 'text.secondary' }} />
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ 
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                默认接口端点: {provider.api_base_url || '内置默认'}
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </Box>

      {/* Body content with beautiful bubble flows */}
      <Box sx={{ p: 3, position: 'relative', zIndex: 1 }}>
        <Stack spacing={3.5}>
          {/* Quick Apply Templates */}
          <Box>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.5 }}>
              <MemoryOutlined sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                选择供应商大模型模板
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {providerList.map((item) => {
                const isActive = providerKey === item.key;
                return (
                  <Chip
                    key={item.key}
                    label={item.label || item.key}
                    onClick={() => onApplyTemplate(item.template || {})}
                    color={isActive ? 'primary' : 'default'}
                    variant={isActive ? 'filled' : 'outlined'}
                    sx={{ 
                      cursor: 'pointer',
                      borderRadius: 2,
                      px: 0.8,
                      fontWeight: isActive ? 800 : 600,
                      fontSize: '11px',
                      bgcolor: isActive ? 'primary.main' : 'rgba(255,255,255,0.4)',
                      borderColor: isActive ? 'primary.main' : 'rgba(0,0,0,0.08)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isActive ? '0 4px 12px rgba(26,115,232,0.2)' : 'none',
                      '&:hover': { 
                        transform: 'translateY(-1.5px)',
                        bgcolor: isActive ? 'primary.main' : 'white',
                        borderColor: isActive ? 'primary.main' : 'rgba(26,115,232,0.2)',
                      }
                    }}
                    icon={isActive ? <CheckCircleOutlined sx={{ color: 'white !important', fontSize: '14px !important' }} /> : undefined}
                  />
                );
              })}
            </Stack>
          </Box>

          {/* Recommended Chat Models */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1.5, letterSpacing: '0.05em' }}>
              推荐 Chat 模型型号 (CHAT_MODEL)
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {(provider.recommended_chat_models || []).map((model) => {
                const isActive = chatValue === model;
                return (
                  <Chip
                    key={model}
                    label={model}
                    size="small"
                    onClick={() => onChange('CHAT_MODEL', model)}
                    color={isActive ? 'primary' : 'default'}
                    variant={isActive ? 'soft' : 'outlined'}
                    sx={{ 
                      borderRadius: 1.5,
                      fontWeight: isActive ? 800 : 500,
                      fontSize: '10.5px',
                      cursor: 'pointer',
                      bgcolor: isActive ? 'rgba(26,115,232,0.08)' : 'rgba(255,255,255,0.4)',
                      borderColor: isActive ? 'rgba(26,115,232,0.15)' : 'rgba(0,0,0,0.06)',
                      transition: 'all 0.2s',
                      '&:hover': {
                        transform: 'translateY(-1px)',
                        bgcolor: isActive ? 'rgba(26,115,232,0.12)' : 'white',
                        borderColor: 'rgba(26,115,232,0.2)'
                      }
                    }}
                  />
                );
              })}
            </Stack>
          </Box>

          {/* Recommended Embedding Models */}
          {hasEmbedding ? (
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1.5, letterSpacing: '0.05em' }}>
                推荐 Embedding 向量模型 (EMBEDDING_MODEL)
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {(provider.recommended_embedding_models || []).map((model) => {
                  const isActive = embeddingValue === model;
                  return (
                    <Chip
                      key={model}
                      label={model}
                      size="small"
                      onClick={() => onChange('EMBEDDING_MODEL', model)}
                      color={isActive ? 'primary' : 'default'}
                      variant={isActive ? 'soft' : 'outlined'}
                      sx={{ 
                        borderRadius: 1.5,
                        fontWeight: isActive ? 800 : 500,
                        fontSize: '10.5px',
                        cursor: 'pointer',
                        bgcolor: isActive ? 'rgba(26,115,232,0.08)' : 'rgba(255,255,255,0.4)',
                        borderColor: isActive ? 'rgba(26,115,232,0.15)' : 'rgba(0,0,0,0.06)',
                        transition: 'all 0.2s',
                        '&:hover': {
                          transform: 'translateY(-1px)',
                          bgcolor: isActive ? 'rgba(26,115,232,0.12)' : 'white',
                          borderColor: 'rgba(26,115,232,0.2)'
                        }
                      }}
                    />
                  );
                })}
              </Stack>
            </Box>
          ) : (
            <Box 
              sx={{ 
                p: 1.5, 
                borderRadius: 2, 
                bgcolor: 'rgba(245,158,11,0.06)', 
                border: '1px dashed rgba(245,158,11,0.18)',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <Typography variant="caption" sx={{ color: 'warning.dark', fontWeight: 600, fontStyle: 'italic' }}>
                ⚠️ 当前 Provider 不提供内置 Embedding 服务。知识图谱检索所需的文本向量建议在左侧“系统大模型主参数”中独立配置。
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
