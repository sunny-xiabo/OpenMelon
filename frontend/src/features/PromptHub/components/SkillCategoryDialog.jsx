import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';

export default function SkillCategoryDialog({
  open,
  form,
  onChange,
  onClose,
  onSubmit,
  saving,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>新增技能分类</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          label="分类名称"
          value={form.name}
          onChange={(event) => onChange({ name: event.target.value })}
          fullWidth
          helperText="尽量用中文短语，例如“性能效率”“数据质量”。"
        />
        <TextField
          label="分类 ID（可选）"
          value={form.id}
          onChange={(event) => onChange({ id: event.target.value })}
          fullWidth
          helperText="建议英文短横线命名；不填时后端会自动生成。"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">取消</Button>
        <Button onClick={onSubmit} variant="contained" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
