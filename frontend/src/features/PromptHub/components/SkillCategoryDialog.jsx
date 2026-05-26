import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
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
    <Dialog 
      open={open} 
      onClose={onClose} 
      fullWidth 
      maxWidth="sm"
      PaperProps={{
        sx: { borderRadius: 4.5, overflow: 'hidden' }
      }}
    >
      <DialogTitle sx={{ px: 3.5, pt: 2.5, pb: 1.5, fontWeight: 950, fontSize: '15px' }}>
        新增技能业务分类
      </DialogTitle>
      <DialogContent dividers sx={{ p: 3.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <TextField
          size="small"
          label="分类中文名称"
          value={form.name || ''}
          onChange={(event) => onChange({ name: event.target.value })}
          fullWidth
          helperText="尽量使用简短中文短语，例如“性能效率”“防爆防刷”“数据质量”"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
        />
        <TextField
          size="small"
          label="英文唯一分类标识 (可选)"
          value={form.id || ''}
          onChange={(event) => onChange({ id: event.target.value })}
          fullWidth
          helperText="推荐英文短横线命名，如果不填系统会自动转译拼音"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3.5, py: 2.5, bgcolor: 'rgba(0,0,0,0.01)' }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, fontSize: '12px' }}>
          取消
        </Button>
        <Button 
          variant="contained" 
          onClick={onSubmit} 
          disabled={saving}
          sx={{ borderRadius: 2, px: 3, fontWeight: 800, fontSize: '12px' }}
        >
          {saving ? '保存中...' : '确认创建'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
