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
  InputLabel,
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
    <Dialog 
      open={editorDialog.open} 
      onClose={onClose} 
      fullWidth 
      maxWidth="sm"
      PaperProps={{
        sx: { borderRadius: 4.5, overflow: 'hidden' }
      }}
    >
      <DialogTitle sx={{ px: 3.5, pt: 2.5, pb: 1.5, fontWeight: 950, fontSize: '16px' }}>
        {editorDialog.mode === 'create' ? '新增图谱节点类型' : `编辑节点类型样式：${editorDialog.originalType}`}
      </DialogTitle>
      
      <DialogContent dividers sx={{ p: 3.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        
        {/* Polished Soft-color Info Alert */}
        <Alert 
          severity="info" 
          sx={{ 
            borderRadius: 3.5,
            fontWeight: 700, 
            border: '1px solid rgba(14, 165, 233, 0.12)', 
            bgcolor: 'rgba(14, 165, 233, 0.02)',
            color: '#0369a1'
          }}
        >
          类型名称将直接映射为 Neo4j 拓扑 Label 标签名。建议以大写英文字母开头，且仅包含字母、数字与下划线。
        </Alert>

        <TextField
          size="small"
          label="类型唯一名称 (Label)"
          value={editorDialog.form.type || ''}
          onChange={(e) => updateEditorForm({ type: e.target.value })}
          disabled={editorDialog.mode === 'edit'}
          helperText={editorDialog.mode === 'edit' ? '已有节点类型名称暂不支持直接重命名' : '例如 Requirement, Service, API, DatabaseTable'}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
        />

        <FormControl fullWidth size="small">
          <InputLabel id="node-type-category-label" sx={{ fontSize: '12px', fontWeight: 600 }}>业务分类</InputLabel>
          <Select
            labelId="node-type-category-label"
            label="业务分类"
            value={editorDialog.form.category || 'fixed'}
            onChange={(e) => updateEditorForm({ category: e.target.value })}
            disabled={lockedEditing}
            sx={{ borderRadius: 2.2, fontSize: '12px', fontWeight: 700 }}
          >
            {NODE_TYPE_CATEGORIES.map((category) => (
              <MenuItem key={category} value={category} sx={{ fontSize: '12px', fontWeight: 700 }}>
                {category}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Dynamic Inline Color Pickers */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
          <TextField
            size="small"
            type="color"
            label="图例填充颜色"
            value={editorDialog.form.color?.bg || '#ffffff'}
            onChange={(e) => updateEditorForm({ color: { ...editorDialog.form.color, bg: e.target.value } })}
            InputLabelProps={{ shrink: true }}
            sx={{ 
              '& .MuiOutlinedInput-root': { 
                borderRadius: 1.8, 
                fontSize: '12px', 
                bgcolor: 'white', 
                '& input': { p: 0.5, height: 28 } 
              } 
            }}
          />
          <TextField
            size="small"
            type="color"
            label="图例边框颜色"
            value={editorDialog.form.color?.border || '#000000'}
            onChange={(e) => updateEditorForm({ color: { ...editorDialog.form.color, border: e.target.value } })}
            InputLabelProps={{ shrink: true }}
            sx={{ 
              '& .MuiOutlinedInput-root': { 
                borderRadius: 1.8, 
                fontSize: '12px', 
                bgcolor: 'white', 
                '& input': { p: 0.5, height: 28 } 
              } 
            }}
          />
        </Box>

        <TextField
          size="small"
          type="number"
          label="节点渲染直径尺寸"
          value={editorDialog.form.size || 20}
          onChange={(e) => updateEditorForm({ size: parseInt(e.target.value, 10) || 20 })}
          inputProps={{ min: 8, max: 60 }}
          helperText="允许设定的渲染尺寸范围限制为 8 - 60 px"
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.2, fontSize: '12px', fontWeight: 700 } }}
        />

        {/* Polished Soft-color Warning Alert */}
        <Alert 
          severity="warning" 
          sx={{ 
            borderRadius: 3.5,
            fontWeight: 700, 
            border: '1px solid rgba(245, 158, 11, 0.12)', 
            bgcolor: 'rgba(245, 158, 11, 0.02)',
            color: '#b45309'
          }}
        >
          系统安全限制：保留类型不可删除；兜底 fallback 规则必须唯一；若使新增 fixed 节点规则强制约束生效，请确认节点关联 name 唯一键。
        </Alert>

      </DialogContent>
      
      <DialogActions sx={{ px: 3.5, py: 2.5, bgcolor: 'rgba(0,0,0,0.01)' }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, fontSize: '12px' }}>
          取消
        </Button>
        <Button 
          variant="contained" 
          onClick={onSave}
          sx={{ borderRadius: 2, px: 3.5, fontWeight: 800, fontSize: '12px' }}
        >
          {editorDialog.mode === 'create' ? '确认创建类型' : '提交保存修改'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
