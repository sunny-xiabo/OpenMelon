import { useMemo, useState } from 'react';
import { Alert, Box, Button, Paper, Typography, Stack } from '@mui/material';
import ConfirmDialog from '../components/ConfirmDialog';
import { DEFAULT_NODE_TYPE_FORM } from '../features/NodeType/constants';
import { filterNodeTypes } from '../features/NodeType/utils';
import NodeTypeCardGrid from '../features/NodeType/components/NodeTypeCardGrid';
import NodeTypeEditorDialog from '../features/NodeType/components/NodeTypeEditorDialog';
import NodeTypeEmbeddedHeader from '../features/NodeType/components/NodeTypeEmbeddedHeader';
import NodeTypeTable from '../features/NodeType/components/NodeTypeTable';
import NodeTypeToolbar from '../features/NodeType/components/NodeTypeToolbar';
import { 
  GrainOutlined, 
  Add as AddIcon, 
  Refresh as RefreshIcon, 
  SettingsBackupRestore as RestoreIcon 
} from '@mui/icons-material';

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
      message: `确认要永久删除节点类型「${item.type}」吗？此操作会导致关联的所有图谱节点配置同步发生级联变更，不可撤销。`,
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
    <Box sx={{ flex: 1, p: embedded ? 0 : 2, overflow: embedded ? 'visible' : 'auto', bgcolor: 'transparent', background: 'radial-gradient(ellipse at 50% -20%, rgba(14, 165, 233, 0.015) 0%, transparent 85%)' }}>
      <Paper 
        elevation={0} 
        sx={{ 
          border: embedded ? 'none' : '1px solid rgba(255, 255, 255, 0.45)', 
          borderRadius: embedded ? 0 : 4.5, 
          overflow: 'hidden', 
          bgcolor: 'transparent' 
        }}
      >
        {/* Glassmorphic Header Deck */}
        {!embedded && (
          <Box 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              px: 3, 
              py: 2, 
              borderBottom: '1px solid rgba(255, 255, 255, 0.4)', 
              bgcolor: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <GrainOutlined sx={{ fontSize: 20, color: 'primary.main' }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: 'text.primary', letterSpacing: '-0.01em' }}>
                  节点类型配置中心
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  统一管理图谱拓扑节点类型的元数据定义、系统限制约束与全域前端渲染样式
                </Typography>
              </Box>
            </Box>
            <Stack direction="row" spacing={1.5}>
              <Button 
                size="small" 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={openCreateDialog}
                sx={{ borderRadius: 2.2, fontSize: '11px', fontWeight: 800 }}
              >
                新增类型
              </Button>
              <Button 
                size="small" 
                variant="outlined" 
                startIcon={<RestoreIcon />} 
                onClick={resetAllOverrides}
                sx={{
                  borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
                  '&:hover': { bgcolor: 'rgba(14, 165, 233, 0.05)', borderColor: 'primary.main' }
                }}
              >
                重置前端样式
              </Button>
              <Button 
                size="small" 
                variant="outlined" 
                startIcon={<RefreshIcon />} 
                onClick={() => refetchNodeTypes()} 
                sx={{
                  borderRadius: 2.2, fontSize: '11px', fontWeight: 800, bgcolor: 'white', borderColor: 'rgba(0,0,0,0.06)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }
                }}
              >
                同步刷新
              </Button>
            </Stack>
          </Box>
        )}

        <Box sx={{ p: embedded ? 2 : 3.5, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          {embedded && (
            <NodeTypeEmbeddedHeader
              loadNodeTypes={refetchNodeTypes}
              openCreateDialog={openCreateDialog}
              resetAllNodeTypeOverrides={resetAllOverrides}
            />
          )}

          {/* Polished Soft-color warning alert */}
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
            系统保留核心节点类型不可删除。新增类型后可能需要重启服务端引擎以激活 Neo4j Label 唯一值索引约束。
          </Alert>

          {/* Filters and Toolbar */}
          <NodeTypeToolbar
            categoryFilter={categoryFilter} keyword={keyword} legendCount={legend.length}
            setCategoryFilter={setCategoryFilter} setKeyword={setKeyword}
            setViewMode={setViewMode} viewMode={viewMode} visibleCount={visibleItems.length}
          />

          {isLoading ? (
            <Box sx={{ p: 6, textAlign: 'center', fontWeight: 700, color: 'text.secondary', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
              正在同步 Neo4j 拓扑配置，请稍候...
            </Box>
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
      <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog({ open: false })} danger title="永久删除节点类型" confirmText="确认删除" />
    </Box>
  );
}
