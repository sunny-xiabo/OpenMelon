import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { NODE_TYPE_CATEGORIES } from '../constants';

export default function NodeTypeEditorDialog({
  editorDialog,
  legend,
  onClose,
  onSave,
  updateEditorForm,
}) {
  const lockedEditing = editorDialog.mode === 'edit' && legend.find((item) => item.type === editorDialog.originalType)?.locked;

  return (
    <Dialog open={editorDialog.open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editorDialog.mode === 'create' ? '新增节点类型' : `编辑节点类型 ${editorDialog.originalType}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          类型名称会直接映射为 Neo4j Label。建议使用英文字母开头，仅包含字母、数字和下划线。
        </Alert>
        <TextField
          label="类型名称"
          value={editorDialog.form.type}
          onChange={(e) => updateEditorForm({ type: e.target.value })}
          disabled={editorDialog.mode === 'edit'}
          helperText={editorDialog.mode === 'edit' ? '已有类型名称暂不支持直接重命名' : '例如 Requirement、Service、DatabaseTable'}
        />
        <FormControl fullWidth>
          <Select
            value={editorDialog.form.category}
            onChange={(e) => updateEditorForm({ category: e.target.value })}
            disabled={lockedEditing}
          >
            {NODE_TYPE_CATEGORIES.map((category) => (
              <MenuItem key={category} value={category}>{category}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
          <TextField
            type="color"
            label="填充色"
            value={editorDialog.form.color.bg}
            onChange={(e) => updateEditorForm({ color: { ...editorDialog.form.color, bg: e.target.value } })}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="color"
            label="边框色"
            value={editorDialog.form.color.border}
            onChange={(e) => updateEditorForm({ color: { ...editorDialog.form.color, border: e.target.value } })}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <TextField
          type="number"
          label="尺寸"
          value={editorDialog.form.size}
          onChange={(e) => updateEditorForm({ size: e.target.value })}
          inputProps={{ min: 8, max: 60 }}
          helperText="允许范围 8 - 60"
        />
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          约束限制：
          系统保留类型不可删除；
          `fallback` 类型只能保留一个；
          新增 `fixed` 类型后若需要唯一约束生效，需要重启服务，并确保节点使用 `name` 属性。
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={onSave}>
          {editorDialog.mode === 'create' ? '创建类型' : '保存配置'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
