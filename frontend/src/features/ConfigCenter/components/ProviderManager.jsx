import { Box, Button, Chip, Stack, TextField, Typography, alpha, Switch, Alert } from '@mui/material';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';

export default function ProviderManager({ providers, draft, onDraftChange, onEdit, onSave, onDelete, onApplyTemplate, saving, emptyProviderDraft }) {
  const items = Object.values(providers || {});
  const embeddingRequired = draft.supports_embedding;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 380px' }, gap: 3 }}>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Provider 模板库</Typography>
          <Button startIcon={<AddOutlined />} size="small" onClick={() => onDraftChange(emptyProviderDraft)}>
            新增模板
          </Button>
        </Stack>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {items.map((provider) => (
            <Box
              key={provider.key}
              sx={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 2,
                p: 2,
                bgcolor: 'white',
                transition: 'all 0.2s',
                '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderColor: 'primary.light' }
              }}
            >
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{provider.label || provider.key}</Typography>
                  <Chip label={provider.scope === 'builtin' ? '内置' : '自定义'} size="small" variant="soft" color={provider.scope === 'builtin' ? 'info' : 'success'} />
                </Stack>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {provider.template_description || '无模板说明'}
                  </Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>Key: {provider.key}</Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" onClick={() => onApplyTemplate(provider.template || {})} sx={{ borderRadius: 1.5 }}>应用</Button>
                  {provider.editable && (
                    <>
                      <Button size="small" startIcon={<EditOutlined />} onClick={() => onEdit(provider)}>编辑</Button>
                      <Button size="small" color="error" startIcon={<DeleteOutlineOutlined />} onClick={() => onDelete(provider)}>删除</Button>
                    </>
                  )}
                </Stack>
              </Stack>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ 
        border: '1px solid', 
        borderColor: 'divider', 
        borderRadius: 3, 
        p: 2.5, 
        bgcolor: alpha('#f8fafc', 0.5),
        height: 'fit-content',
        position: 'sticky',
        top: 20
      }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          {draft.key ? `编辑 Provider` : '创建 Provider'}
        </Typography>
        
        <Stack spacing={2}>
          <TextField size="small" fullWidth label="Provider Key" value={draft.key} onChange={(e) => onDraftChange({ ...draft, key: e.target.value })} helperText="唯一标识符，如 claude_v3" />
          <TextField size="small" fullWidth label="展示名称" value={draft.label} onChange={(e) => onDraftChange({ ...draft, label: e.target.value })} />
          <TextField size="small" fullWidth label="Base URL" value={draft.api_base_url} onChange={(e) => onDraftChange({ ...draft, api_base_url: e.target.value })} />
          <TextField size="small" fullWidth label="Chat 模型" value={draft.chat_model} onChange={(e) => onDraftChange({ ...draft, chat_model: e.target.value })} />
          
          <Stack direction="row" spacing={2} sx={{ py: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Switch size="small" checked={draft.supports_embedding} onChange={(e) => onDraftChange({ ...draft, supports_embedding: e.target.checked })} />
              <Typography variant="caption">支持 Embedding</Typography>
            </Stack>
          </Stack>

          {draft.supports_embedding && (
            <Stack spacing={2}>
              <TextField size="small" fullWidth label="Embedding 模型" value={draft.embedding_model} onChange={(e) => onDraftChange({ ...draft, embedding_model: e.target.value })} />
              <TextField size="small" fullWidth label="Embedding 维度" type="number" value={draft.embedding_dim} onChange={(e) => onDraftChange({ ...draft, embedding_dim: e.target.value })} />
            </Stack>
          )}

          <Button variant="contained" startIcon={<SaveOutlined />} disabled={saving || !draft.key} onClick={onSave} sx={{ mt: 1, borderRadius: 2 }}>
            保存 Provider
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
