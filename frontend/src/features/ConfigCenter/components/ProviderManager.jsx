import { Box, Button, Chip, Stack, TextField, Typography, alpha, Switch, Alert, Paper, Tooltip } from '@mui/material';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import LanguageOutlined from '@mui/icons-material/LanguageOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';

export default function ProviderManager({ providers, draft, onDraftChange, onEdit, onSave, onDelete, onApplyTemplate, saving, emptyProviderDraft }) {
  const items = Object.values(providers || {});

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 380px' }, gap: 4 }}>
      {/* Templates Grid List on Left */}
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              模型供应商 (Provider) 模板库
            </Typography>
            <Typography variant="caption" color="text.secondary">
              在下方模块配置完成并保存后，会出现在主 LLM 选择下拉项中
            </Typography>
          </Box>
          <Button 
            variant="outlined"
            startIcon={<AddOutlined />} 
            size="small" 
            onClick={() => onDraftChange(emptyProviderDraft)}
            sx={{ borderRadius: 2, fontWeight: 700, textTransform: 'none' }}
          >
            添加新模板
          </Button>
        </Stack>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          {items.map((provider) => (
            <Box
              key={provider.key}
              className="magnetic-card"
              sx={{
                border: '1px solid rgba(0,0,0,0.05)',
                borderRadius: 4,
                p: 2.5,
                bgcolor: 'white',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.015), inset 0 1px 0 rgba(255,255,255,0.8)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 160,
                '&:hover': { 
                  boxShadow: '0 12px 28px rgba(26,115,232,0.06)', 
                  borderColor: 'primary.light' 
                }
              }}
            >
              <Stack spacing={1.5} sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'text.primary', fontSize: '13px' }}>
                    {provider.label || provider.key}
                  </Typography>
                  <Chip 
                    label={provider.scope === 'builtin' ? '系统内置' : '自定义'} 
                    size="small" 
                    variant="soft" 
                    color={provider.scope === 'builtin' ? 'info' : 'success'} 
                    sx={{ height: 16, fontSize: '9px', fontWeight: 800, borderRadius: 0.75 }}
                  />
                </Stack>
                <Box>
                  <Tooltip title={provider.template_description || '暂无详细描述模板。'} arrow enterDelay={300}>
                    <Typography 
                      variant="caption" 
                      color="text.secondary" 
                      style={{ WebkitBoxOrient: 'vertical' }}
                      sx={{ 
                        display: '-webkit-box', 
                        WebkitLineClamp: 2, 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        height: 32, 
                        lineHeight: 1.35, 
                        mb: 0.75, 
                        fontWeight: 500,
                        cursor: 'help'
                      }}
                    >
                      {provider.template_description || '暂无详细描述模板。'}
                    </Typography>
                  </Tooltip>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.disabled', fontSize: '9.5px', fontWeight: 700 }}>
                    标识: {provider.key}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1} borderTop="1px solid rgba(0,0,0,0.04)" pt={1.5} justifyContent="flex-end">
                <Button 
                  size="small" 
                  variant="contained" 
                  color="primary"
                  onClick={() => onApplyTemplate(provider.template || {})} 
                  sx={{ 
                    borderRadius: 1.5, 
                    fontSize: '11px', 
                    fontWeight: 700,
                    px: 2,
                    textTransform: 'none',
                    boxShadow: 'none',
                    '&:hover': { boxShadow: '0 2px 8px rgba(26,115,232,0.2)' }
                  }}
                >
                  应用
                </Button>
                {provider.editable && (
                  <>
                    <Button 
                      size="small" 
                      variant="text"
                      startIcon={<EditOutlined sx={{ fontSize: '14px !important' }} />} 
                      onClick={() => onEdit(provider)}
                      sx={{ fontSize: '11px', fontWeight: 700, textTransform: 'none' }}
                    >
                      编辑
                    </Button>
                    <Button 
                      size="small" 
                      variant="text"
                      color="error" 
                      startIcon={<DeleteOutlineOutlined sx={{ fontSize: '14px !important' }} />} 
                      onClick={() => onDelete(provider)}
                      sx={{ fontSize: '11px', fontWeight: 700, textTransform: 'none' }}
                    >
                      删除
                    </Button>
                  </>
                )}
              </Stack>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Editor sticky Sidebar Panel on Right */}
      <Paper
        elevation={0}
        sx={{ 
          border: '1px solid rgba(255,255,255,0.45)', 
          borderRadius: 4.5, 
          p: 3, 
          bgcolor: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(15, 23, 42, 0.02), inset 0 1px 0 rgba(255,255,255,0.7)',
          height: 'fit-content',
          position: 'sticky',
          top: 20
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 900, color: 'text.primary', mb: 2.25, fontSize: '13px', display: 'flex', alignItems: 'center', gap: 1 }}>
          <LanguageOutlined color="primary" sx={{ fontSize: 18 }} />
          {draft.key ? `编辑 Provider 模板` : '新增模型 Provider'}
        </Typography>
        
        <Stack spacing={2.5}>
          <TextField 
            size="small" 
            fullWidth 
            label="唯一 Key (英文标识)" 
            value={draft.key} 
            disabled={!!providers[draft.key] && draft.key !== ''} // lock key if editing existing
            onChange={(e) => onDraftChange({ ...draft, key: e.target.value })} 
            helperText="唯一全局 Key，保存后无法更改，如 system_deepseek" 
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
          />
          <TextField 
            size="small" 
            fullWidth 
            label="展示中文名称" 
            value={draft.label} 
            onChange={(e) => onDraftChange({ ...draft, label: e.target.value })} 
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
          />
          <TextField 
            size="small" 
            fullWidth 
            label="API 默认 Base URL" 
            value={draft.api_base_url} 
            onChange={(e) => onDraftChange({ ...draft, api_base_url: e.target.value })} 
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
          />
          <TextField 
            size="small" 
            fullWidth 
            label="默认聊天模型 (CHAT_MODEL)" 
            value={draft.chat_model} 
            onChange={(e) => onDraftChange({ ...draft, chat_model: e.target.value })} 
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
          />
          
          <Box 
            sx={{ 
              py: 1, 
              px: 1.5,
              borderRadius: 2.2,
              bgcolor: 'rgba(0,0,0,0.02)',
              border: '1px solid rgba(0,0,0,0.03)',
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
              <Typography variant="caption" sx={{ fontWeight: 800 }}>支持内置文本向量 (Embedding)</Typography>
              <Switch 
                size="small" 
                checked={draft.supports_embedding} 
                onChange={(e) => onDraftChange({ ...draft, supports_embedding: e.target.checked })} 
              />
            </Stack>
          </Box>

          {draft.supports_embedding && (
            <Stack spacing={2}>
              <TextField 
                size="small" 
                fullWidth 
                label="默认向量模型 (EMBEDDING_MODEL)" 
                value={draft.embedding_model} 
                onChange={(e) => onDraftChange({ ...draft, embedding_model: e.target.value })} 
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
              />
              <TextField 
                size="small" 
                fullWidth 
                label="向量维度 (embedding_dim)" 
                type="number" 
                value={draft.embedding_dim} 
                onChange={(e) => onDraftChange({ ...draft, embedding_dim: e.target.value })} 
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 600 } }}
              />
            </Stack>
          )}

          <Button 
            variant="contained" 
            startIcon={<SaveOutlined />} 
            disabled={saving || !draft.key} 
            onClick={onSave} 
            sx={{ 
              mt: 1, 
              borderRadius: 2.5,
              fontWeight: 800,
              textTransform: 'none',
              boxShadow: '0 4px 14px rgba(26,115,232,0.2)',
              py: 1.25,
            }}
          >
            保存并同步至模板库
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
