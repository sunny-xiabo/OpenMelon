import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import React from 'react';

export default function FlowTemplateDialog({
  open,
  mode,
  templates,
  loading,
  form,
  setForm,
  selectedProjectId,
  onClose,
  onSave,
  onSaveAs,
  onLoad,
  onEdit,
  onDuplicate,
  onDelete,
}) {
  const isSaveMode = mode === 'save';
  const [keyword, setKeyword] = React.useState('');
  const [tagFilter, setTagFilter] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setKeyword('');
      setTagFilter('');
    }
  }, [open]);

  const allTags = React.useMemo(() => (
    Array.from(new Set(templates.flatMap((template) => template.tags || []))).sort()
  ), [templates]);

  const filteredTemplates = React.useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return templates.filter((template) => {
      const tags = template.tags || [];
      const text = [
        template.name,
        template.description,
        template.script?.name,
        ...tags,
      ].join(' ').toLowerCase();
      if (kw && !text.includes(kw)) return false;
      if (tagFilter && !tags.includes(tagFilter)) return false;
      return true;
    });
  }, [keyword, tagFilter, templates]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{isSaveMode ? (form.template_id ? '编辑/覆盖测试任务' : '保存测试任务') : '载入测试任务'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {isSaveMode && (
            <Stack spacing={1.5}>
              <TextField
                size="small"
                label="任务名称"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <TextField
                size="small"
                label="任务说明"
                multiline
                minRows={2}
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
              <TextField
                size="small"
                label="标签"
                value={form.tags}
                onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
                helperText="多个标签用英文逗号分隔"
              />
              <Alert severity="info">
                {form.template_id ? '保存后会用当前 DSL 覆盖该任务脚本，并更新任务信息。' : '测试任务会保存当前 DSL 脚本，后续可在同项目中快速载入复用。'}
              </Alert>
            </Stack>
          )}

          <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={800}>
                {selectedProjectId ? '当前项目测试任务' : '通用测试任务'}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  label="搜索任务"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <TextField
                  size="small"
                  select
                  label="标签"
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value)}
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="">全部标签</MenuItem>
                  {allTags.map((tag) => <MenuItem key={tag} value={tag}>{tag}</MenuItem>)}
                </TextField>
              </Stack>
            </Stack>
            {loading ? (
              <Typography variant="body2" color="text.secondary">测试任务加载中...</Typography>
            ) : filteredTemplates.length ? (
              <Stack spacing={1}>
                {filteredTemplates.map((template) => (
                  <Paper key={template.template_id} variant="outlined" sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.68)' }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" fontWeight={800} noWrap>{template.name}</Typography>
                          <Chip size="small" label={`${template.script?.steps?.length || 0} 步`} variant="outlined" />
                          {!template.project_id && <Chip size="small" label="通用" color="default" variant="outlined" />}
                        </Stack>
                        {template.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                            {template.description}
                          </Typography>
                        )}
                        {!!template.tags?.length && (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                            {template.tags.map((tag) => <Chip key={tag} size="small" label={tag} variant="outlined" />)}
                          </Stack>
                        )}
                      </Box>
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" variant="contained" onClick={() => onLoad(template)}>载入</Button>
                        <Button size="small" variant="outlined" onClick={() => onEdit(template)}>编辑/覆盖</Button>
                        <Button size="small" variant="outlined" onClick={() => onDuplicate(template)}>复制</Button>
                        <Button size="small" color="error" onClick={() => onDelete(template)}>删除</Button>
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">{templates.length ? '没有匹配的测试任务。' : '暂无测试任务。'}</Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
        {isSaveMode && form.template_id && <Button variant="outlined" onClick={onSaveAs}>另存为新任务</Button>}
        {isSaveMode && <Button variant="contained" onClick={onSave}>{form.template_id ? '覆盖任务' : '保存任务'}</Button>}
      </DialogActions>
    </Dialog>
  );
}
