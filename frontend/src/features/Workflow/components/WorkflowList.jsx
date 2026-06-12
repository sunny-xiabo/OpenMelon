import React, { useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, CardActions,
  Chip, IconButton, TextField, InputAdornment, Dialog,
  DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Pagination, Tooltip
} from '@mui/material';
import { Add, Search, Delete, GridView, List, Edit } from '@mui/icons-material';
import { useWorkflowList, useDeleteWorkflow } from '../hooks/useWorkflow';
import { useSnackbar } from '../../../components/SnackbarProvider';
import ConfirmDialog from '../../../components/ConfirmDialog';

/**
 * Workflow list page -- browse, create, and manage workflows.
 */
export default function WorkflowList({ onSelectWorkflow, onCreateWorkflow }) {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('openmelon_workflow_view_mode') || 'grid');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, name: '' });

  const showSnackbar = useSnackbar();
  const { data, isLoading } = useWorkflowList();
  const { deleteWorkflow } = useDeleteWorkflow();
  const workflows = data?.workflows || [];

  const filtered = workflows.filter(wf =>
    wf.name.toLowerCase().includes(search.toLowerCase()) ||
    (wf.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const PAGE_SIZE = viewMode === 'grid' ? 9 : 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedWorkflows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateWorkflow?.({
      name: newName.trim(),
      description: newDesc.trim(),
    });
    setCreateOpen(false);
    setNewName('');
    setNewDesc('');
  };

  const handleDeleteClick = (event, id, name) => {
    event.stopPropagation();
    setDeleteDialog({ open: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id } = deleteDialog;
    setDeleteDialog({ open: false, id: null, name: '' });
    try {
      await deleteWorkflow(id);
      showSnackbar('工作流已成功删除', { severity: 'success' });
      // Adjust page if deletion left current page empty
      if (paginatedWorkflows.length === 1 && page > 1) {
        setPage(prev => prev - 1);
      }
    } catch (err) {
      showSnackbar(`删除失败: ${err.message}`, { severity: 'error' });
    }
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    setPage(1);
    localStorage.setItem('openmelon_workflow_view_mode', mode);
  };

  return (
    <Box 
      sx={{ 
        p: { xs: 3, md: 4 }, 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: 0, 
        height: '100%', 
        overflow: 'auto',
        // High-tech radial neon spotlight + dot-matrix grid background
        backgroundImage: (theme) => theme.palette.mode === 'dark'
          ? 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 55%), radial-gradient(rgba(255, 255, 255, 0.02) 1.5px, transparent 1.5px)'
          : 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.05) 0%, transparent 55%), radial-gradient(rgba(15, 23, 42, 0.025) 1.5px, transparent 1.5px)',
        backgroundSize: '100% 100%, 32px 32px',
        transition: 'background var(--transition-normal)',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.025em', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            工作流中心
            <Chip 
              label="BETA" 
              size="small" 
              sx={{ 
                fontSize: '9px', 
                height: '16px', 
                bgcolor: 'rgba(99, 102, 241, 0.12)', 
                color: '#6366f1', 
                borderColor: 'rgba(99, 102, 241, 0.2)',
                fontWeight: 700 
              }} 
              variant="outlined" 
            />
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            可视化设计和控制全链路的自动测试工作流节点与分支。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="搜索工作流..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ 
              width: 220,
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.4)' : 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(4px)',
            }}
          />

          {/* View Mode Toggle Switcher */}
          <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.4)' : 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(4px)' }}>
            <Tooltip title="网格视图">
              <IconButton
                size="small"
                onClick={() => handleViewModeChange('grid')}
                sx={{
                  borderRadius: 0,
                  bgcolor: viewMode === 'grid' ? 'action.selected' : 'transparent',
                  color: viewMode === 'grid' ? 'primary.main' : 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover' },
                  px: 1.5,
                  py: 0.75,
                }}
              >
                <GridView fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="列表视图">
              <IconButton
                size="small"
                onClick={() => handleViewModeChange('list')}
                sx={{
                  borderRadius: 0,
                  bgcolor: viewMode === 'list' ? 'action.selected' : 'transparent',
                  color: viewMode === 'list' ? 'primary.main' : 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover' },
                  px: 1.5,
                  py: 0.75,
                }}
              >
                <List fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateOpen(true)}
            sx={{
              boxShadow: (theme) => theme.palette.mode === 'dark' ? '0 4px 20px rgba(99, 102, 241, 0.25)' : '0 4px 12px rgba(99, 102, 241, 0.12)'
            }}
          >
            新建工作流
          </Button>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {isLoading ? (
          <Typography color="text.secondary">加载中...</Typography>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {search ? '没有匹配的工作流' : '还没有工作流'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              点击"新建工作流"开始创建
            </Typography>
          </Box>
        ) : viewMode === 'grid' ? (
          /* Grid View Layout (High-Tech cards) */
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 3 }}>
            {paginatedWorkflows.map((wf) => (
              <Card
                key={wf.id}
                onClick={() => onSelectWorkflow?.(wf.id)}
                className="tech-card"
                sx={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  borderRadius: 3,
                  bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.35)' : 'rgba(255, 255, 255, 0.45)',
                  border: (theme) => theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(15, 23, 42, 0.05)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: (theme) => theme.palette.mode === 'dark' ? '0 4px 24px rgba(0, 0, 0, 0.3)' : '0 4px 20px rgba(15, 23, 42, 0.02)',
                }}
              >
                <CardContent sx={{ flex: 1, pb: 1, pt: 2.5, px: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, lineHeight: 1.3, pr: 1, letterSpacing: '-0.01em' }}>
                      {wf.name}
                    </Typography>
                    <Chip
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <span className={wf.status === 'published' ? 'pulse-dot-success' : 'pulse-dot-default'} />
                          {wf.status === 'published' ? '已发布' : '草稿'}
                        </Box>
                      }
                      size="small"
                      color={wf.status === 'published' ? 'success' : 'default'}
                      variant="outlined"
                      sx={{ 
                        flexShrink: 0,
                        border: '1px solid',
                        borderColor: wf.status === 'published' ? 'rgba(16, 185, 129, 0.2)' : 'divider',
                        bgcolor: wf.status === 'published' ? 'rgba(16, 185, 129, 0.03)' : 'transparent',
                        height: '22px',
                        '& .MuiChip-label': { px: 1 }
                      }}
                    />
                  </Box>
                  {wf.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '36px' }}>
                      {wf.description}
                    </Typography>
                  )}
                  {!wf.description && <Box sx={{ mb: 2, minHeight: '36px' }} />}
                  
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip 
                      label={`${wf.nodes?.length || 0} 个节点`} 
                      size="small" 
                      variant="filled" 
                      sx={{ 
                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.03)',
                        fontSize: '11px',
                        fontWeight: 600
                      }} 
                    />
                    <Chip 
                      label={`${wf.edges?.length || 0} 条连线`} 
                      size="small" 
                      variant="filled" 
                      sx={{ 
                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.03)',
                        fontSize: '11px',
                        fontWeight: 600
                      }} 
                    />
                  </Box>
                </CardContent>
                <CardActions sx={{ px: 2.5, pb: 2.5, pt: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '11px' }}>
                    更新时间: {wf.updated_at ? new Date(wf.updated_at).toLocaleString('zh-CN', { hour12: false }) : ''}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={(e) => handleDeleteClick(e, wf.id, wf.name)}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': {
                        color: 'error.main',
                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                      },
                      transition: 'all 0.2s',
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            ))}
          </Box>
        ) : (
          /* List View Layout (Compact High-Tech Table) */
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(17, 24, 39, 0.3)' : 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(20px)',
              border: (theme) => theme.palette.mode === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(15, 23, 42, 0.05)',
              borderRadius: 3,
            }}
          >
            <Table size="medium">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>工作流名称</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>状态</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">节点数</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">连线数</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>描述</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>更新时间</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedWorkflows.map((wf) => (
                  <TableRow
                    key={wf.id}
                    hover
                    onClick={() => onSelectWorkflow?.(wf.id)}
                    sx={{ 
                      cursor: 'pointer', 
                      transition: 'background-color 0.2s ease',
                      '&:hover': { bgcolor: 'action.hover' } 
                    }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: 'text.primary' }}>{wf.name}</TableCell>
                    <TableCell>
                      <Chip
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <span className={wf.status === 'published' ? 'pulse-dot-success' : 'pulse-dot-default'} />
                            {wf.status === 'published' ? '已发布' : '草稿'}
                          </Box>
                        }
                        size="small"
                        color={wf.status === 'published' ? 'success' : 'default'}
                        variant="outlined"
                        sx={{ height: '22px' }}
                      />
                    </TableCell>
                    <TableCell align="center">{wf.nodes?.length || 0}</TableCell>
                    <TableCell align="center">{wf.edges?.length || 0}</TableCell>
                    <TableCell sx={{ color: 'text.secondary', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.description || '--'}
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {wf.updated_at ? new Date(wf.updated_at).toLocaleString('zh-CN', { hour12: false }) : ''}
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="编辑工作流">
                        <IconButton
                          size="small"
                          onClick={() => onSelectWorkflow?.(wf.id)}
                          sx={{ mr: 1, '&:hover': { color: 'primary.main', bgcolor: 'primary.light' } }}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          onClick={(e) => handleDeleteClick(e, wf.id, wf.name)}
                          sx={{
                            color: 'text.secondary',
                            '&:hover': {
                              color: 'error.main',
                              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
                            },
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, p) => setPage(p)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* Unified Confirm Dialog for Delete Action */}
      <ConfirmDialog
        open={deleteDialog.open}
        title="确认删除工作流"
        message={`您确定要彻底删除工作流「${deleteDialog.name}」吗？此操作无法撤销，与其关联的文件和连线关系将被一并清除。`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteDialog({ open: false, id: null, name: '' })}
        confirmText="彻底删除"
        danger
      />

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>新建工作流</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 3 }}>
          <TextField
            label="工作流名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            label="描述 (可选)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            multiline
            rows={3}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setCreateOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>
            创建
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
