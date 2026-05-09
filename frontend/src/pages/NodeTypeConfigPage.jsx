import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Paper } from '@mui/material';
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
import { on } from '../utils/eventBus';
import { DEFAULT_NODE_TYPE_FORM } from '../features/NodeType/constants';
import { filterNodeTypes } from '../features/NodeType/utils';
import NodeTypeCardGrid from '../features/NodeType/components/NodeTypeCardGrid';
import NodeTypeEditorDialog from '../features/NodeType/components/NodeTypeEditorDialog';
import NodeTypeEmbeddedHeader from '../features/NodeType/components/NodeTypeEmbeddedHeader';
import NodeTypeTable from '../features/NodeType/components/NodeTypeTable';
import NodeTypeToolbar from '../features/NodeType/components/NodeTypeToolbar';

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
  const visibleItems = useMemo(
    () => filterNodeTypes(legend, categoryFilter, keyword),
    [categoryFilter, keyword, legend],
  );

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
    const syncOverrides = () => setNodeTypeOverrides(loadNodeTypeOverrides());
    const handleStorage = (event) => {
      if (event.key === 'graph-node-type-overrides') syncOverrides();
    };
    const offOverrides = on(NODE_TYPE_OVERRIDES_UPDATED_EVENT, syncOverrides);
    window.addEventListener('storage', handleStorage);
    return () => {
      offOverrides();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updateNodeTypeOverride = (type, patch) => {
    setNodeTypeOverrides((prev) => {
      const next = { ...prev, [type]: { ...(prev[type] || {}), ...patch } };
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
    setEditorDialog({ open: true, mode: 'create', originalType: '', form: DEFAULT_NODE_TYPE_FORM });
  };

  const openEditDialog = (item) => {
    setEditorDialog({
      open: true,
      mode: 'edit',
      originalType: item.type,
      form: { type: item.type, category: item.category, color: { ...item.color }, size: item.size },
    });
  };

  const closeEditorDialog = () => {
    setEditorDialog({ open: false, mode: 'create', originalType: '', form: DEFAULT_NODE_TYPE_FORM });
  };

  const updateEditorForm = (patch) => {
    setEditorDialog((prev) => ({ ...prev, form: { ...prev.form, ...patch } }));
  };

  const saveNodeTypeConfig = async () => {
    try {
      if (editorDialog.mode === 'create') {
        await graphAPI.createNodeType({ ...editorDialog.form, size: Number(editorDialog.form.size) });
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

  const sharedListProps = {
    items: visibleItems,
    nodeTypeOverrides,
    onDelete: requestDeleteNodeType,
    onEdit: openEditDialog,
    onResetOverride: resetNodeTypeOverride,
    onUpdateOverride: updateNodeTypeOverride,
  };

  return (
    <Box sx={{ flex: 1, p: embedded ? 0 : 1.5, overflow: embedded ? 'visible' : 'auto', bgcolor: embedded ? 'transparent' : 'background.default' }}>
      <Paper elevation={0} sx={{ border: embedded ? 'none' : '1px solid', borderColor: 'divider', borderRadius: embedded ? 0 : 3, overflow: 'hidden', bgcolor: 'background.paper', boxShadow: 'none' }}>
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
            <NodeTypeEmbeddedHeader
              loadNodeTypes={loadNodeTypes}
              openCreateDialog={openCreateDialog}
              resetAllNodeTypeOverrides={resetAllNodeTypeOverrides}
            />
          )}

          <Alert severity="warning" sx={{ borderRadius: 2.5 }}>
            系统保留类型不可删除。新增 `fixed` 类型后，如需让 Neo4j 唯一约束生效，需要重启服务，且节点默认应包含 `name` 属性。
          </Alert>

          <NodeTypeToolbar
            categoryFilter={categoryFilter}
            keyword={keyword}
            legendCount={legend.length}
            setCategoryFilter={setCategoryFilter}
            setKeyword={setKeyword}
            setViewMode={setViewMode}
            viewMode={viewMode}
            visibleCount={visibleItems.length}
          />

          {viewMode === 'card' ? <NodeTypeCardGrid {...sharedListProps} /> : <NodeTypeTable {...sharedListProps} />}
        </Box>
      </Paper>

      <NodeTypeEditorDialog
        editorDialog={editorDialog}
        legend={legend}
        onClose={closeEditorDialog}
        onSave={saveNodeTypeConfig}
        updateEditorForm={updateEditorForm}
      />
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
