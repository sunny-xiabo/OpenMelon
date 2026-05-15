import { useMemo, useState } from 'react';
import { Alert, Box, Button, Paper } from '@mui/material';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import { DEFAULT_NODE_TYPE_FORM } from '../features/NodeType/constants';
import { filterNodeTypes } from '../features/NodeType/utils';
import NodeTypeCardGrid from '../features/NodeType/components/NodeTypeCardGrid';
import NodeTypeEditorDialog from '../features/NodeType/components/NodeTypeEditorDialog';
import NodeTypeEmbeddedHeader from '../features/NodeType/components/NodeTypeEmbeddedHeader';
import NodeTypeTable from '../features/NodeType/components/NodeTypeTable';
import NodeTypeToolbar from '../features/NodeType/components/NodeTypeToolbar';

// Hooks
import {
  useNodeTypes,
  useNodeTypeOverrides,
  useNodeTypeLegend,
  useSaveNodeType,
  useDeleteNodeType,
} from '../features/NodeType/hooks/useNodeTypes';

export default function NodeTypeConfigPage({ embedded = false }) {
  // UI 交互状态
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [viewMode, setViewMode] = useState('card');
  const [editorDialog, setEditorDialog] = useState({ open: false, mode: 'create', originalType: '', form: DEFAULT_NODE_TYPE_FORM });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, message: '', onConfirm: null });

  // 使用 TanStack Query
  const { refetch: refetchNodeTypes } = useNodeTypes();
  const { data: overrides = {}, updateOverride, resetOverride, resetAll: resetAllOverrides } = useNodeTypeOverrides();
  const { data: legend = [], isLoading } = useNodeTypeLegend();

  const saveMutation = useSaveNodeType(editorDialog.mode, editorDialog.originalType);
  const deleteMutation = useDeleteNodeType();

  const visibleItems = useMemo(
    () => filterNodeTypes(legend, categoryFilter, keyword),
    [categoryFilter, keyword, legend]
  );

  const openCreateDialog = () => {
    setEditorDialog({ open: true, mode: 'create', originalType: '', form: DEFAULT_NODE_TYPE_FORM });
  };

  const openEditDialog = (item) => {
    setEditorDialog({
      open: true, mode: 'edit', originalType: item.type,
      form: { type: item.type, category: item.category, color: { ...item.color }, size: item.size },
    });
  };

  const saveNodeTypeConfig = async () => {
    try {
      const payload = { ...editorDialog.form, size: Number(editorDialog.form.size) };
      await saveMutation.mutateAsync(payload);
      setEditorDialog({ ...editorDialog, open: false });
    } catch (e) { /* Hook handles snackbar */ }
  };

  const requestDeleteNodeType = (item) => {
    setConfirmDialog({
      open: true,
      message: `确认删除节点类型「${item.type}」？`,
      onConfirm: async () => {
        setConfirmDialog({ open: false });
        await deleteMutation.mutateAsync(item.type);
        resetOverride(item.type);
      },
    });
  };

  const sharedListProps = {
    items: visibleItems,
    nodeTypeOverrides: overrides,
    onDelete: requestDeleteNodeType,
    onEdit: openEditDialog,
    onResetOverride: resetOverride,
    onUpdateOverride: updateOverride,
  };

  return (
    <Box sx={{ flex: 1, p: embedded ? 0 : 1.5, overflow: embedded ? 'visible' : 'auto', bgcolor: 'transparent' }}>
      <Paper elevation={0} sx={{ border: embedded ? 'none' : '1px solid', borderColor: 'divider', borderRadius: embedded ? 0 : 3, overflow: 'hidden', bgcolor: 'transparent' }}>
        {!embedded && (
          <PageHeader title="节点类型配置" subtitle="管理图谱节点类型的配置与前端样式。">
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" onClick={openCreateDialog}>新增类型</Button>
              <Button variant="outlined" onClick={resetAllOverrides}>重置前端样式</Button>
              <Button variant="outlined" onClick={() => refetchNodeTypes()}>刷新</Button>
            </Box>
          </PageHeader>
        )}

        <Box sx={{ p: embedded ? 2 : 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {embedded && (
            <NodeTypeEmbeddedHeader
              loadNodeTypes={refetchNodeTypes}
              openCreateDialog={openCreateDialog}
              resetAllNodeTypeOverrides={resetAllOverrides}
            />
          )}

          <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
            系统保留类型不可删除。新增类型后可能需要重启服务以生效 Neo4j 唯一约束。
          </Alert>

          <NodeTypeToolbar
            categoryFilter={categoryFilter} keyword={keyword} legendCount={legend.length}
            setCategoryFilter={setCategoryFilter} setKeyword={setKeyword}
            setViewMode={setViewMode} viewMode={viewMode} visibleCount={visibleItems.length}
          />

          {isLoading ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>正在同步配置...</Box>
          ) : viewMode === 'card' ? (
            <NodeTypeCardGrid {...sharedListProps} />
          ) : (
            <NodeTypeTable {...sharedListProps} />
          )}
        </Box>
      </Paper>

      <NodeTypeEditorDialog
        editorDialog={editorDialog} legend={legend}
        onClose={() => setEditorDialog({ ...editorDialog, open: false })}
        onSave={saveNodeTypeConfig}
        updateEditorForm={(patch) => setEditorDialog(prev => ({ ...prev, form: { ...prev.form, ...patch } }))}
      />
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} danger title="删除节点类型" confirmText="删除" />
    </Box>
  );
}
