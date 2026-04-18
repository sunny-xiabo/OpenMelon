import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { graphAPI } from '../services/api';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { useSnackbar } from '../components/SnackbarProvider';
import {
  buildNodeTypeHelpers,
  loadNodeTypeOverrides,
  saveNodeTypeOverrides,
  mergeNodeTypeConfigs,
  NODE_TYPE_OVERRIDES_UPDATED_EVENT,
} from '../theme/nodeTypes';

const DEFAULT_NODE_TYPE_FORM = {
  type: '',
  category: 'extendable',
  color: { bg: '#1A73E8', border: '#2563EB' },
  size: 18,
};

export default function NodeTypeConfigPage({ embedded = false }) {
  const [nodeTypeConfigs, setNodeTypeConfigs] = useState([]);
  const [nodeTypeOverrides, setNodeTypeOverrides] = useState({});
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [viewMode, setViewMode] = useState('card');
  const [editorDialog, setEditorDialog] = useState({ open: false, mode: 'create', originalType: '', form: DEFAULT_NODE_TYPE_FORM });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });
  const showSnackbar = useSnackbar();

  const { legend } = useMemo(
    () => buildNodeTypeHelpers(mergeNodeTypeConfigs(nodeTypeConfigs, nodeTypeOverrides)),
    [nodeTypeConfigs, nodeTypeOverrides],
  );

  const visibleItems = useMemo(() => (
    legend.filter((item) => {
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const q = keyword.trim().toLowerCase();
      const matchesKeyword = !q || item.type.toLowerCase().includes(q);
      return matchesCategory && matchesKeyword;
    })
  ), [categoryFilter, keyword, legend]);

  const loadNodeTypes = async () => {
    try {
      const data = await graphAPI.getNodeTypes();
      setNodeTypeConfigs(data.node_types || []);
    } catch (err) {
      showSnackbar(err.message || '加载节点类型失败', 'error');
    }
  };

  useEffect(() => {
    setNodeTypeOverrides(loadNodeTypeOverrides());
    loadNodeTypes();
  }, []);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === 'graph-node-type-overrides') {
        setNodeTypeOverrides(loadNodeTypeOverrides());
      }
    };
    const handleNodeTypeOverridesUpdated = () => {
      setNodeTypeOverrides(loadNodeTypeOverrides());
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(NODE_TYPE_OVERRIDES_UPDATED_EVENT, handleNodeTypeOverridesUpdated);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(NODE_TYPE_OVERRIDES_UPDATED_EVENT, handleNodeTypeOverridesUpdated);
    };
  }, []);

  const updateNodeTypeOverride = (type, patch) => {
    setNodeTypeOverrides((prev) => {
      const next = {
        ...prev,
        [type]: {
          ...(prev[type] || {}),
          ...patch,
        },
      };
      saveNodeTypeOverrides(next);
      return next;
    });
  };

  const resetNodeTypeOverride = (type) => {
    setNodeTypeOverrides((prev) => {
      const next = { ...prev };
      delete next[type];
      saveNodeTypeOverrides(next);
      return next;
    });
  };

  const resetAllNodeTypeOverrides = () => {
    setNodeTypeOverrides({});
    saveNodeTypeOverrides({});
  };

  const openCreateDialog = () => {
    setEditorDialog({
      open: true,
      mode: 'create',
      originalType: '',
      form: DEFAULT_NODE_TYPE_FORM,
    });
  };

  const openEditDialog = (item) => {
    setEditorDialog({
      open: true,
      mode: 'edit',
      originalType: item.type,
      form: {
        type: item.type,
        category: item.category,
        color: { ...item.color },
        size: item.size,
      },
    });
  };

  const closeEditorDialog = () => {
    setEditorDialog({ open: false, mode: 'create', originalType: '', form: DEFAULT_NODE_TYPE_FORM });
  };

  const updateEditorForm = (patch) => {
    setEditorDialog((prev) => ({
      ...prev,
      form: {
        ...prev.form,
        ...patch,
      },
    }));
  };

  const saveNodeTypeConfig = async () => {
    try {
      if (editorDialog.mode === 'create') {
        await graphAPI.createNodeType({
          ...editorDialog.form,
          size: Number(editorDialog.form.size),
        });
        showSnackbar(`已创建节点类型 ${editorDialog.form.type}`, 'success');
      } else {
        await graphAPI.updateNodeType(editorDialog.originalType, {
          category: editorDialog.form.category,
          color: editorDialog.form.color,
          size: Number(editorDialog.form.size),
        });
        showSnackbar(`已更新节点类型 ${editorDialog.originalType}`, 'success');
      }
      closeEditorDialog();
      await loadNodeTypes();
    } catch (err) {
      showSnackbar(err.message || '保存节点类型失败', 'error');
    }
  };

  const requestDeleteNodeType = (item) => {
    setConfirmDialog({
      open: true,
      message: `确认删除节点类型「${item.type}」？\n删除后将从统一配置中移除，图例和默认样式会同步更新。`,
      onConfirm: async () => {
        setConfirmDialog({ open: false, message: '', onConfirm: null });
        try {
          await graphAPI.deleteNodeType(item.type);
          resetNodeTypeOverride(item.type);
          await loadNodeTypes();
          showSnackbar(`已删除节点类型 ${item.type}`, 'success');
        } catch (err) {
          showSnackbar(err.message || '删除节点类型失败', 'error');
        }
      },
    });
  };

  const content = (
    <>
      {!embedded && (
        <PageHeader
          title="节点类型配置"
          subtitle="统一管理图谱节点类型的服务端配置和当前浏览器下的前端展示样式。"
        >
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={openCreateDialog}>新增类型</Button>
            <Button variant="outlined" onClick={resetAllNodeTypeOverrides}>重置前端样式</Button>
            <Button variant="outlined" onClick={loadNodeTypes}>刷新配置</Button>
          </Box>
        </PageHeader>
      )}

      <Box sx={{ p: embedded ? 2 : 2.5, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {embedded && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#1e293b' }}>节点类型配置</Typography>
              <Typography variant="caption" color="text.secondary">
                统一管理图谱节点类型的服务端配置和当前浏览器下的前端展示样式。
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="contained" size="small" onClick={openCreateDialog} sx={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', boxShadow: '0 2px 8px rgba(99,102,241,0.25)', fontWeight: 600 }}>新增类型</Button>
              <Button variant="outlined" size="small" onClick={resetAllNodeTypeOverrides}>重置前端样式</Button>
              <Button variant="outlined" size="small" onClick={loadNodeTypes}>刷新配置</Button>
            </Box>
          </Box>
        )}

          <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
            系统保留类型不可删除。新增 `fixed` 类型后，如需让 Neo4j 唯一约束生效，需要重启服务，且节点默认应包含 `name` 属性。
          </Alert>

          <Paper elevation={0} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                size="small"
                label="搜索类型"
                placeholder="输入类型名"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                sx={{ minWidth: 220 }}
              />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <MenuItem value="all">全部分类</MenuItem>
                  <MenuItem value="fixed">fixed</MenuItem>
                  <MenuItem value="extendable">extendable</MenuItem>
                  <MenuItem value="fallback">fallback</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ display: 'flex', gap: 0.5, bgcolor: 'grey.100', borderRadius: 1, p: 0.375 }}>
                <Button size="small" variant={viewMode === 'card' ? 'contained' : 'text'} onClick={() => setViewMode('card')}>
                  卡片视图
                </Button>
                <Button size="small" variant={viewMode === 'table' ? 'contained' : 'text'} onClick={() => setViewMode('table')}>
                  表格视图
                </Button>
              </Box>
              <Typography variant="caption" color="text.secondary">
                当前共 {legend.length} 个类型，筛选后 {visibleItems.length} 个
              </Typography>
            </Box>
          </Paper>

          {viewMode === 'card' ? (
            <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {visibleItems.map(({ type, category, color, size, locked, constraints }) => (
                <Paper
                  key={type}
                  elevation={0}
                  sx={{
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2.5,
                    background: `linear-gradient(180deg, ${color.bg}12 0%, #ffffff 100%)`,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color.bg, border: '1px solid', borderColor: color.border, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{type}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {locked && <Chip size="small" label="保留" variant="outlined" />}
                      <Chip
                        size="small"
                        label={category}
                        color={category === 'fixed' ? 'primary' : category === 'fallback' ? 'default' : 'warning'}
                        variant={category === 'fixed' ? 'filled' : 'outlined'}
                      />
                    </Box>
                  </Box>

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    服务端默认: {color.bg} / {color.border} / 尺寸 {size}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, minHeight: 48 }}>
                    {constraints?.join(' ')}
                  </Typography>

                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75, mt: 1.25 }}>
                    <TextField
                      size="small"
                      type="color"
                      label="填充色"
                      value={nodeTypeOverrides[type]?.bg || color.bg}
                      onChange={(e) => updateNodeTypeOverride(type, { bg: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      size="small"
                      type="color"
                      label="边框色"
                      value={nodeTypeOverrides[type]?.border || color.border}
                      onChange={(e) => updateNodeTypeOverride(type, { border: e.target.value })}
                      InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="尺寸"
                      value={nodeTypeOverrides[type]?.size ?? size}
                      onChange={(e) => updateNodeTypeOverride(type, { size: e.target.value })}
                      inputProps={{ min: 8, max: 60 }}
                      InputLabelProps={{ shrink: true }}
                    />
                    <Button size="small" variant="text" onClick={() => resetNodeTypeOverride(type)}>
                      恢复默认
                    </Button>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 0.75, mt: 1.25 }}>
                    <Button size="small" variant="outlined" fullWidth onClick={() => openEditDialog({ type, category, color, size, locked, constraints })}>
                      编辑配置
                    </Button>
                    <Button size="small" variant="outlined" color="error" fullWidth disabled={locked} onClick={() => requestDeleteNodeType({ type })}>
                      删除类型
                    </Button>
                  </Box>
                </Paper>
              ))}
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>类型</TableCell>
                    <TableCell>分类</TableCell>
                    <TableCell>默认样式</TableCell>
                    <TableCell>前端覆盖</TableCell>
                    <TableCell>限制说明</TableCell>
                    <TableCell align="right">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleItems.map(({ type, category, color, size, locked, constraints }) => (
                    <TableRow key={type} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color.bg, border: '1px solid', borderColor: color.border }} />
                          <Typography variant="body2" fontWeight={600}>{type}</Typography>
                          {locked && <Chip size="small" label="保留" variant="outlined" />}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={category}
                          color={category === 'fixed' ? 'primary' : category === 'fallback' ? 'default' : 'warning'}
                          variant={category === 'fixed' ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {color.bg} / {color.border} / {size}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ minWidth: 220 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75 }}>
                          <TextField
                            size="small"
                            type="color"
                            value={nodeTypeOverrides[type]?.bg || color.bg}
                            onChange={(e) => updateNodeTypeOverride(type, { bg: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                          />
                          <TextField
                            size="small"
                            type="color"
                            value={nodeTypeOverrides[type]?.border || color.border}
                            onChange={(e) => updateNodeTypeOverride(type, { border: e.target.value })}
                            InputLabelProps={{ shrink: true }}
                          />
                          <TextField
                            size="small"
                            type="number"
                            value={nodeTypeOverrides[type]?.size ?? size}
                            onChange={(e) => updateNodeTypeOverride(type, { size: e.target.value })}
                            inputProps={{ min: 8, max: 60 }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320 }}>
                        <Typography variant="caption" color="text.secondary">
                          {constraints?.join(' ')}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <Button size="small" variant="text" onClick={() => resetNodeTypeOverride(type)}>
                            恢复默认
                          </Button>
                          <Button size="small" variant="outlined" onClick={() => openEditDialog({ type, category, color, size, locked, constraints })}>
                            编辑
                          </Button>
                          <Button size="small" variant="outlined" color="error" disabled={locked} onClick={() => requestDeleteNodeType({ type })}>
                            删除
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
      </Box>
    </>
  );

  return (
    <Box sx={{ flex: 1, p: embedded ? 0 : 1.5, overflow: embedded ? 'visible' : 'auto', bgcolor: embedded ? 'transparent' : 'background.default' }}>
      <Paper elevation={0} sx={{ border: embedded ? 'none' : '1px solid', borderColor: 'divider', borderRadius: embedded ? 0 : 3, overflow: 'hidden', bgcolor: 'background.paper', boxShadow: 'none' }}>
        {content}
      </Paper>

      <Dialog open={editorDialog.open} onClose={closeEditorDialog} fullWidth maxWidth="sm">
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
              disabled={editorDialog.mode === 'edit' && legend.find((item) => item.type === editorDialog.originalType)?.locked}
            >
              <MenuItem value="fixed">fixed</MenuItem>
              <MenuItem value="extendable">extendable</MenuItem>
              <MenuItem value="fallback">fallback</MenuItem>
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
          <Button onClick={closeEditorDialog}>取消</Button>
          <Button variant="contained" onClick={saveNodeTypeConfig}>
            {editorDialog.mode === 'create' ? '创建类型' : '保存配置'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmDialog.open}
        title="删除节点类型"
        message={confirmDialog.message}
        onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: null })}
        onConfirm={confirmDialog.onConfirm || (() => {})}
        danger
      />
    </Box>
  );
}
